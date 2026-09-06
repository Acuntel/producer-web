"use client";
// Analyze a record: start the job (link or file), follow it, then pull what the
// user wants into the song: a sliced kick onto the kick track, the best eight
// bars of a stem as a loop. Clips are cached in the browser clip store like uploads.
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { Song, Role } from "@/lib/song/types";
import type { ClipMeta } from "@/components/SongsSheet";
import { supabaseBrowser } from "@/lib/account/supabase";

export type StemsFacts = { bpm: number; key: string; keyConfidence?: number; durationSec: number; bars: number; barEnergy?: number[]; blocks?: { bar: number; at: number; energy: number }[]; dropAt: number | null; bestBars: { startBar: number; startSec: number; endSec: number; energy: number }; name?: string };
export type StemOut = { stem: string; path: string; clipId?: string };
export type OneShotOut = { role: string; path: string; clipId?: string; durationSec: number; fundamentalHz: number | null; centroidHz: number; peakDb: number; atSec: number };
export type StemsResult = { facts?: StemsFacts; stems?: StemOut[]; oneshots?: OneShotOut[]; name?: string; stage?: string };
export type StemsJob = { id: string; status: "queued" | "running" | "done" | "error"; progress: number; result: StemsResult | null; error: string | null; source: { url?: string; storage_path?: string; name?: string } };

type Deps = { user: User | null; projectId: string | null; flash: (t: string) => void; edit: (ops: unknown[], label: string) => Promise<boolean>; send: (t: string, o?: { hidden?: boolean }) => Promise<void>; registerClip: (c: ClipMeta) => void; getSong: () => Song };

const NOTE = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
export const hzToNote = (hz: number) => { const m = Math.round(69 + 12 * Math.log2(hz / 440)); return `${NOTE[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`; };
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function useStems(d: Deps) {
  const [job, setJob] = useState<StemsJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<number | null>(null);
  const announced = useRef<string | null>(null);
  const dRef = useRef(d); dRef.current = d;

  const stopPolling = () => { if (pollRef.current) { window.clearTimeout(pollRef.current); pollRef.current = null; } };
  useEffect(() => () => stopPolling(), []);

  const poll = useCallback(async (id: string, since: number) => {
    try {
      const r = await fetch(`/api/stems?id=${encodeURIComponent(id)}`).then((x) => x.json());
      if (r?.id) setJob(r as StemsJob);
      if (r?.status === "done" || r?.status === "error") {
        if (r.status === "error") setError(friendly(r.error ?? "The analysis failed."));
        if (r.status === "done" && announced.current !== id) {
          announced.current = id;
          const f = (r.result as StemsResult | null)?.facts;
          const name = (r.result as StemsResult | null)?.name ?? "the record";
          dRef.current.flash(`Analyzed ${name}`);
          if (f) void dRef.current.send(`I analyzed "${name}" with the studio: ${Math.round(f.bpm)} BPM, ${f.key}, ${mmss(f.durationSec)} long, drop at ${f.dropAt !== null && f.dropAt !== undefined ? mmss(f.dropAt) : "unclear"}, best 8 bars ${mmss(f.bestBars.startSec)} to ${mmss(f.bestBars.endSec)}. Its stems (drums, bass, vocals, other) and sliced one-shots (${((r.result as StemsResult).oneshots ?? []).map((o) => o.role).join(", ")}) are in the library as clips. Give me the breakdown in one breath: what carries it, what its hook does, and the ONE piece worth taking into our record and how. Do not change the song yet.`, { hidden: true });
        }
        return;
      }
      if (Date.now() - since > 20 * 60 * 1000) { setError("The analysis is taking too long. Try a shorter file."); return; }
    } catch { /* keep polling */ }
    pollRef.current = window.setTimeout(() => void poll(id, since), 2500);
  }, []);

  const start = useCallback(async (input: { url?: string; file?: File }) => {
    const sb = supabaseBrowser(); const uid = dRef.current.user?.id;
    if (!sb || !uid) { setError("Sign in to analyze a record."); return; }
    setError(null); setStarting(true); setJob(null); stopPolling();
    try {
      let storagePath: string | undefined, name: string | undefined;
      if (input.file) {
        const safe = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
        storagePath = `${uid}/uploads/${Date.now()}-${safe}`;
        name = input.file.name.replace(/\.[a-z0-9]+$/i, "");
        const { error: upErr } = await sb.storage.from("clips").upload(storagePath, input.file, { contentType: input.file.type || "audio/mpeg", upsert: true });
        if (upErr) throw new Error(upErr.message);
      }
      const r = await fetch("/api/stems", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: input.url, storagePath, name, projectId: dRef.current.projectId }) });
      const j = await r.json();
      if (!r.ok || !j.jobId) throw new Error(j.error ?? "could not start");
      setJob({ id: j.jobId, status: "queued", progress: 0, result: null, error: null, source: { url: input.url, storage_path: storagePath, name } });
      void poll(j.jobId, Date.now());
    } catch (e) { setError(friendly(e instanceof Error ? e.message : "could not start")); }
    finally { setStarting(false); }
  }, [poll]);

  /** Bring a result file into the browser clip store (once) and the clip list. Returns the clip id. */
  const ensureClip = useCallback(async (path: string, id: string, name: string, meta: { durationSec?: number; bpm?: number; key?: string }) => {
    const { getClip, putClip, decodeBytes, cacheDecoded } = await import("@/lib/engine");
    const have = await getClip(id);
    if (!have) {
      const sb = supabaseBrowser(); if (!sb) throw new Error("not signed in");
      const { data, error: sErr } = await sb.storage.from("clips").createSignedUrl(path, 600);
      if (sErr || !data?.signedUrl) throw new Error(sErr?.message ?? "no url");
      const bytes = await (await fetch(data.signedUrl)).arrayBuffer();
      await putClip({ id, name, type: path.endsWith(".mp3") ? "audio/mpeg" : "audio/wav", bytes, createdAt: Date.now(), durationSec: meta.durationSec, bpm: meta.bpm, key: meta.key });
      cacheDecoded(id, await decodeBytes(bytes));
    }
    dRef.current.registerClip({ id, name, bpm: meta.bpm, key: meta.key, durationSec: meta.durationSec });
    return id;
  }, []);

  const previewUrl = useCallback(async (path: string): Promise<string | null> => {
    const sb = supabaseBrowser(); if (!sb) return null;
    const { data } = await sb.storage.from("clips").createSignedUrl(path, 600);
    return data?.signedUrl ?? null;
  }, []);

  /** "Use this kick": the first track in that role plays the sliced sample; no track yet, one is made. */
  const useOneShot = useCallback(async (shot: OneShotOut) => {
    if (!job) return;
    const name = `${job.result?.name ?? "record"} · ${shot.role}`;
    const id = await ensureClip(shot.path, `shot_${job.id}_${shot.role}`, name, { durationSec: shot.durationSec });
    const role = (shot.role === "perc" ? "perc" : shot.role) as Role;
    const song = dRef.current.getSong();
    let track = song.tracks.find((t) => t.role === role);
    const ops: unknown[] = [];
    if (!track) {
      const steps = role === "kick" ? "X...X...X...X..." : role === "snare" ? "....X.......X..." : role === "hat" ? "..x...x...x...x." : "......x.......x.";
      ops.push({ op: "grid", track: role, role, name: role[0].toUpperCase() + role.slice(1), steps, midi: role === "kick" ? 36 : role === "snare" ? 38 : role === "hat" ? 42 : 39, volume: role === "kick" ? 0 : -8 });
      for (const s of song.sections) if (!/break/i.test(s.name) || role !== "kick") ops.push({ op: "active", section: s.id, add: [role] });
      track = { id: role } as Song["tracks"][number];
    }
    // A sampled kick is tuned so its fundamental sits on the song's root (within a fourth either way).
    let semitones = 0;
    if (role === "kick" && shot.fundamentalHz) {
      const rootPc = NOTE.indexOf(song.key.split(" ")[0].replace("Db", "C#").replace("Gb", "F#").replace("Ab", "Ab"));
      if (rootPc >= 0) { const shotMidi = 69 + 12 * Math.log2(shot.fundamentalHz / 440); let diff = ((rootPc - Math.round(shotMidi)) % 12 + 12) % 12; if (diff > 6) diff -= 12; semitones = Math.max(-4, Math.min(4, diff)); }
    }
    ops.push({ op: "set", track: track.id, path: "clip", value: { clipId: id, name, oneShot: true, semitones, gainDb: 0, durationSec: shot.durationSec } });
    const ok = await dRef.current.edit(ops, `${shot.role} sound from ${job.result?.name ?? "the record"}${semitones ? ` (tuned ${semitones > 0 ? "+" : ""}${semitones})` : ""}`);
    if (ok) dRef.current.flash(`${shot.role[0].toUpperCase() + shot.role.slice(1)} is now from ${job.result?.name ?? "the record"}`);
  }, [job, ensureClip]);

  /** The best eight bars of a stem, warped to the song, as an audio track in the drops and groove. */
  const addStemLoop = useCallback(async (stem: StemOut) => {
    if (!job?.result?.facts) return;
    const f = job.result.facts;
    const name = `${job.result.name ?? "record"} · ${stem.stem}`;
    const id = await ensureClip(stem.path, `stem_${job.id}_${stem.stem}`, name, { durationSec: f.durationSec, bpm: f.bpm, key: f.key });
    const song = dRef.current.getSong();
    const trackId = `stem_${stem.stem}`;
    const ops: unknown[] = [{ op: "addTrack", track: { id: trackId, name, role: "audio", volume: -6, duck: stem.stem !== "drums", loopBeats: 32, notes: [], clip: { clipId: id, name, bpm: f.bpm, warp: true, startSec: f.bestBars.startSec, lengthBeats: 32, gainDb: 0, durationSec: f.durationSec } } }];
    for (const s of song.sections) if (/drop|groove/i.test(s.name)) ops.push({ op: "active", section: s.id, add: [trackId] });
    const ok = await dRef.current.edit(ops, `looped the best 8 bars of the ${stem.stem} stem from ${job.result.name ?? "the record"}`);
    if (ok) dRef.current.flash(`${stem.stem} loop is in the drops`);
  }, [job, ensureClip]);

  const reset = useCallback(() => { stopPolling(); setJob(null); setError(null); }, []);
  const askBreakdown = useCallback(() => { const n = job?.result?.name ?? "that record"; void dRef.current.send(`Break down "${n}" for me: structure, the engine, the hook, the drum language, the mix picture, and the one trick. Then say which piece we should take.`); }, [job]);

  return { job, error, starting, start, useOneShot, addStemLoop, previewUrl, reset, askBreakdown };
}

function friendly(msg: string): string {
  if (/sign in|not signed in|401/i.test(msg)) return "Sign in to analyze a record.";
  if (/bot|Sign in to confirm|cookies|403|unavailable|Private video/i.test(msg)) return "That site blocked the download from our server. Upload the audio file instead and it will work.";
  if (/duration|too long/i.test(msg)) return "That is longer than 15 minutes. Try a shorter file or a single track.";
  if (/worker|502|503|not configured/i.test(msg)) return "The analysis worker is waking up. Try again in a minute.";
  return msg;
}
