"use client";
// Keeping a record whole. Every clip the browser stores is offered to the account's vault, and
// every clip a record names but this browser lacks is fetched back. What cannot be found is said
// out loud rather than played as silence, because a record that is quietly missing its vocal is
// worse than one that tells you so.
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { Song } from "@/lib/song/types";
import { supabaseBrowser } from "@/lib/account/supabase";
import { findClips, fetchClip, mirrorClip, registerClip, vaultKeysOf, needsVault, type ClipMetaIn } from "@/lib/account/clips";

type Deps = { user: User | null; projectId: string | null; flash: (t: string) => void };

export function useVault(d: Deps) {
  const [missing, setMissing] = useState<string[]>([]);
  const [saving, setSaving] = useState(0);
  const dRef = useRef(d); dRef.current = d;
  const mirrored = useRef(new Set<string>());
  const busy = useRef(false);
  const uid = d.user?.id ?? null;

  // Anything the browser stores from now on goes to the vault too.
  useEffect(() => {
    let live = true;
    void import("@/lib/engine").then(({ setClipSink }) => {
      if (!live) return;
      if (!uid) { setClipSink(null); return; }
      setClipSink((c) => {
        if (!needsVault(c.id) || mirrored.current.has(c.id) || !c.bytes.byteLength) return;
        mirrored.current.add(c.id);
        const sb = supabaseBrowser(); if (!sb) return;
        setSaving((n) => n + 1);
        void mirrorClip(sb, uid, dRef.current.projectId, c.id, c.name, c.bytes, { durationSec: c.durationSec, bpm: c.bpm, key: c.key, mime: c.type })
          .catch(() => mirrored.current.delete(c.id))
          .finally(() => setSaving((n) => Math.max(0, n - 1)));
      });
    });
    return () => { live = false; void import("@/lib/engine").then(({ setClipSink }) => setClipSink(null)); };
  }, [uid]);

  /** A clip whose bytes already sit in storage (a stem, a one shot): recorded, never re-uploaded. */
  const note = useCallback(async (key: string, name: string, path: string, meta: ClipMetaIn = {}) => {
    const sb = supabaseBrowser(); if (!sb || !uid || !needsVault(key)) return;
    mirrored.current.add(key);
    try { await registerClip(sb, uid, dRef.current.projectId, key, name, path, meta); } catch { mirrored.current.delete(key); }
  }, [uid]);

  // A new list only when it differs: a fresh empty array on every check re-rendered the page, which
  // ran the check again, 183 times a second.
  const settle = useCallback((next: string[]) => setMissing((prev) => (prev.length === next.length && prev.every((k, i) => k === next[i]) ? prev : next)), []);

  /** Everything this record names that this browser does not have, fetched back from the account. */
  const restore = useCallback(async (song: Song): Promise<string[]> => {
    const want = vaultKeysOf(song);
    if (!want.length) { settle([]); return []; }
    const { hasClip, putClip, decodeBytes, cacheDecoded } = await import("@/lib/engine");
    const absent: string[] = [];
    for (const k of want) { try { if (!(await hasClip(k))) absent.push(k); } catch { absent.push(k); } }
    if (!absent.length) { settle([]); return []; }
    const sb = supabaseBrowser();
    if (!sb || !uid) { settle(absent); return absent; }
    if (busy.current) return absent;
    busy.current = true;
    const lost: string[] = [];
    try {
      const rows = await findClips(sb, absent);
      for (const k of absent) {
        const row = rows.get(k);
        if (!row) { lost.push(k); continue; }
        const bytes = await fetchClip(sb, row);
        if (!bytes) { lost.push(k); continue; }
        await putClip({ id: k, name: row.name, type: row.mime ?? "audio/wav", bytes, createdAt: Date.now(), durationSec: row.duration_sec ?? undefined, bpm: row.bpm ?? undefined, key: row.key ?? undefined }, { mirror: false });
        try { cacheDecoded(k, await decodeBytes(bytes)); } catch { /* a clip that will not decode is still kept */ }
        mirrored.current.add(k);
      }
      const back = absent.length - lost.length;
      if (back > 0) dRef.current.flash(back === 1 ? "Brought one sound back into this record" : `Brought ${back} sounds back into this record`);
    } finally { busy.current = false; }
    settle(lost);
    return lost;
  }, [uid, settle]);

  return { restore, note, missing, saving };
}
