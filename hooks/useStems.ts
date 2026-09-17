"use client";
// Analyze a record: start the job (link or file), follow it, then pull what the
// user wants into the song: a sliced kick onto the kick track, the best eight
// bars of a stem as a loop. Clips are cached in the browser clip store like uploads.
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { Song, Role } from "@/lib/song/types";
import type { ClipMeta } from "@/lib/types/ui";
import { supabaseBrowser } from "@/lib/account/supabase";
import { connectFolder, searchLocal, hasFolder, folderInfo, canPickFolder, type LocalHit } from "@/lib/localSource";
import { startCapture } from "@/lib/capture";

export type StemsFacts = { bpm: number; key: string; keyConfidence?: number; durationSec: number; bars: number; barEnergy?: number[]; blocks?: { bar: number; at: number; energy: number }[]; dropAt: number | null; bestBars: { startBar: number; startSec: number; endSec: number; energy: number }; name?: string };
export type StemOut = { stem: string; path: string; clipId?: string };
export type OneShotOut = { role: string; path: string; clipId?: string; durationSec: number; fundamentalHz: number | null; centroidHz: number; peakDb: number; atSec: number };
export type Hearing = { report?: string; drumGrids?: Record<string, string>; bass?: { root?: string; notes?: string[]; eighthRhythm?: string }; chords?: string[]; lyrics?: { lines: { at: number; text: string }[] }; clap?: { descriptors?: [string, number][]; genres?: [string, number][] }; blocks?: { at: number; level: number; carries: string; entering: string[]; leaving: string[] }[]; perStem?: Record<string, { share: number; centroidHz: number; crestDb: number; onsetsPerBeat: number }>; error?: string };
export type Identity = { key: string; title: string; artist: string | null; isrc?: string | null; album?: string | null; label?: string | null; year?: string | null; genre?: string | null; cover?: string | null; url?: string | null; offsetSec: number; timeSkew: number; pitchPct: number; confident: boolean; atSec?: number };
export type TrackEntry = { key: string; title: string; artist: string | null; isrc?: string | null; album?: string | null; label?: string | null; year?: string | null; cover?: string | null; url?: string | null; start: number; end: number; hits: number; pitchPct: number; offsetSec: number; confident: boolean; query: string };
export type StemsResult = { facts?: StemsFacts; stems?: StemOut[]; oneshots?: OneShotOut[]; name?: string; stage?: string; hearing?: Hearing; cached?: boolean; preview?: { stems: (StemOut & { startSec?: number; bars?: number })[]; oneshots: OneShotOut[] }; identity?: Identity | null; timing?: Record<string, number>; kind?: "stems" | "hear" | "tracklist"; tracklist?: TrackEntry[]; durationSec?: number; sourceUrl?: string | null; cooldownSec?: number; coveredSec?: number; partial?: boolean };
export const identityLine = (i: Identity | null | undefined) => i?.title ? `${i.artist ? `${i.artist} - ` : ""}${i.title}${i.year || i.label ? ` (${[i.label, i.year].filter(Boolean).join(", ")})` : ""}${Math.abs(i.pitchPct) >= 0.5 ? `, played at ${i.pitchPct > 0 ? "+" : ""}${i.pitchPct.toFixed(1)}%` : ""}` : "";
export type FindCandidate = { source: string; title: string; url: string; artist: string | null; duration_sec: number | null; year: number | null; license: string | null; kind: string; score: number };
export type StemsJob = { id: string; kind?: "stems" | "hear" | "tracklist"; status: "queued" | "running" | "done" | "error"; progress: number; result: StemsResult | null; error: string | null; source: { url?: string; storage_path?: string; name?: string; query?: string } };

type Deps = { user: User | null; projectId: string | null; flash: (t: string) => void; edit: (ops: unknown[], label: string) => Promise<boolean>; send: (t: string, o?: { hidden?: boolean }) => Promise<void>; registerClip: (c: ClipMeta) => void; getSong: () => Song; setReference?: (buf: AudioBuffer, name: string) => Promise<void>; recordSound?: (bpm: number, beats: number) => Promise<{ samples: Float32Array; sampleRate: number; notes: unknown[] } | null>; previewClip?: (clipId: string) => Promise<boolean>; noteClip?: (key: string, name: string, path: string, meta: { durationSec?: number; bpm?: number; key?: string; mime?: string }) => Promise<void> };

const NOTE = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
export const hzToNote = (hz: number) => { const m = Math.round(69 + 12 * Math.log2(hz / 440)); return `${NOTE[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`; };
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function useStems(d: Deps) {
  const [job, setJob] = useState<StemsJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [candidates, setCandidates] = useState<FindCandidate[]>([]);
  const [localHits, setLocalHits] = useState<LocalHit[]>([]);
  const [finding, setFinding] = useState(false);
  const [identified, setIdentified] = useState<Identity | null>(null);   // the last "what is this" answer
  const [identifying, setIdentifying] = useState(false);
  const findCache = useRef(new Map<string, { at: number; list: FindCandidate[] }>());
  const pollRef = useRef<number | null>(null);
  const announced = useRef<string | null>(null);
  const dRef = useRef(d); dRef.current = d;
  const ensureClipRef = useRef<(path: string, id: string, name: string, meta: { durationSec?: number; bpm?: number; key?: string }) => Promise<string>>(async () => "");

  const autoPlaceRef = useRef<string | null>(null);   // a stem name to place automatically when the job lands (vocal renders)
  // An ask that arrived before the record did: "isolate the voice from X and put it before the drop"
  // starts the analysis and is carried out the moment the stems land.
  const pendingVocalRef = useRef<{ said: string | null; where: string | null } | null>(null);
  const dropVocalRef = useRef<((said?: string | null, where?: string | null, job?: StemsJob) => Promise<string | null>) | null>(null);
  const stopPolling = () => { if (pollRef.current) { window.clearTimeout(pollRef.current); pollRef.current = null; } };
  useEffect(() => () => stopPolling(), []);

  const poll = useCallback(async (id: string, since: number) => {
    try {
      const r = await fetch(`/api/stems?id=${encodeURIComponent(id)}`).then((x) => x.json());
      if (r?.id) setJob(r as StemsJob);
      if (r?.status === "done" || r?.status === "error") {
        if (r.status === "error") {
          const msg = friendly(r.error ?? "The analysis failed.");
          setError(msg);
          void dRef.current.send(`The record could not be pulled in: ${msg} Tell the user in one sentence what to do instead (play it in another tab and use Capture what is playing, or upload the file). Do not change the song.`, { hidden: true });
        }
        if (r.status === "done" && announced.current !== id) {
          // The record joins the store's heard table; a failure here is silent, the job is done either way.
          void fetch("/api/dna/heard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: id }) }).catch(() => {});
          announced.current = id;
          const res = r.result as StemsResult | null;
          if (res?.kind === "tracklist") {
            const tl = res.tracklist ?? [];
            dRef.current.flash(tl.length ? `${tl.length} records in ${res.name ?? "the mix"}` : "Could not name anything in that mix");
            const coverage = res.partial ? ` Named up to ${mmss(res.coveredSec ?? 0)} of ${mmss(res.durationSec ?? 0)}; the naming service asked for a pause${res.cooldownSec ? ` of about ${Math.ceil(res.cooldownSec / 60)} minutes` : ""}, so the rest waits for "keep going".` : "";
            const lines = tl.slice(0, 40).map((e, i) => `${i + 1}. ${mmss(e.start)} ${e.artist ? `${e.artist} - ` : ""}${e.title}${Math.abs(e.pitchPct) >= 0.5 ? ` (played ${e.pitchPct > 0 ? "+" : ""}${e.pitchPct.toFixed(1)}%)` : ""}${e.confident ? "" : " (unsure)"}${e.year ? ` [${e.year}]` : ""} → query "${e.query}"`).join("\n");
            void dRef.current.send(tl.length
              ? `TRACKLIST of "${res.name ?? "the mix"}" (${mmss(res.durationSec ?? 0)}), identified from the sound in cuts:\n${lines}\n${coverage}Tell the user what is in it the way a DJ friend would (the records that matter, who plays what after what, the pitch moves), in a few lines at most. To pull one into the studio, return action {"type":"analyze","query": "<that entry's query>"}. Do not change the song.`
              : res.cooldownSec ? `The mix "${res.name ?? "the mix"}" could not be read: the recognition service is cooling down for about ${Math.ceil(res.cooldownSec / 60)} minutes after too many requests. Say so in one line and offer to try again then. Do not change the song.`
              : `The mix "${res.name ?? "the mix"}" (${mmss(res.durationSec ?? 0)}) came back with no identifiable records (unreleased edits, or too quiet). Say so in one line and offer capture from the tab for the part they care about. Do not change the song.`, { hidden: true });
            return;
          }
          const f = res?.facts;
          const name = res?.name ?? "the record";
          dRef.current.flash(res?.identity?.title ? `That is ${identityLine(res.identity)}` : `Analyzed ${name}`);
          // Bring every stem and one-shot into the browser so the brain can slice them by voice, then tell it the ids.
          void (async () => {
            const ids: string[] = [];
            for (const s of res?.stems ?? []) { try { ids.push(await ensureClipRef.current(s.path, `stem_${id}_${s.stem}`, `${name} · ${s.stem}`, { durationSec: f?.durationSec, bpm: f?.bpm, key: f?.key })); } catch {} }
            for (const o of res?.oneshots ?? []) { try { ids.push(await ensureClipRef.current(o.path, `shot_${id}_${o.role}${o.path.includes("-2") ? "_2" : ""}`, `${name} · ${o.role}`, { durationSec: o.durationSec })); } catch {} }
            if (pendingVocalRef.current) {
              const ask = pendingVocalRef.current; pendingVocalRef.current = null;
              const report = await dropVocalRef.current?.(ask.said, ask.where, { id, status: "done", progress: 100, result: res, error: null, source: {} } as StemsJob);
              if (report) { void dRef.current.send(report, { hidden: true }); return; }
            }
            if (autoPlaceRef.current) {
              const want = autoPlaceRef.current; autoPlaceRef.current = null;
              const st = (res?.stems ?? []).find((x) => x.stem === want);
              if (st && f) { await placeStem({ id, result: res } as StemsJob, st, f, name, "hook"); }
              if (f) void dRef.current.send(`The vocal "${name}" is rendered and its sung part is now an audio track in the drops (${Math.round(f.bpm)} BPM source, warped, key ${f.key}). Tell the user what you hear in one breath, tune it toward the song key with clip.semitones if it is off, and place the phrase where it should sit.`, { hidden: true });
              return;
            }
            // The record itself becomes the reference: the four stems summed are the mix, heard by the studio's own ears.
            if (dRef.current.setReference && res?.stems?.length) {
              try {
                const { loadClipsFor } = await import("@/lib/engine");
                const bufs = await loadClipsFor((res.stems ?? []).map((s) => `stem_${id}_${s.stem}`));
                const list = [...bufs.values()];
                if (list.length) {
                  const sr = list[0].sampleRate, len = Math.max(...list.map((b) => b.length));
                  const ctx = new OfflineAudioContext(2, len, sr); const mix = ctx.createBuffer(2, len, sr);
                  for (const b of list) for (let c = 0; c < 2; c++) { const src = b.getChannelData(Math.min(c, b.numberOfChannels - 1)); const dst = mix.getChannelData(c); for (let i = 0; i < src.length; i++) dst[i] += src[i]; }
                  await dRef.current.setReference(mix, name);
                }
              } catch (e) { console.warn("reference from stems failed", e instanceof Error ? e.message : e); }
            }
            const heard = res?.hearing;
            const report = heard?.report ? `\nLISTENING REPORT (the studio's ears on the record, numbers and words): ${heard.report}${heard.drumGrids ? ` Drum grids: ${JSON.stringify(heard.drumGrids)}.` : ""}${heard.bass?.notes?.length ? ` Bass: root ${heard.bass.root}, ${heard.bass.notes.slice(0, 8).join(" ")}, rhythm ${heard.bass.eighthRhythm}.` : ""}${heard.chords?.length ? ` Chords: ${heard.chords.join(" ")}.` : ""}${heard.lyrics?.lines?.length ? ` Lyrics: ${heard.lyrics.lines.slice(0, 6).map((l) => `[${mmss(l.at)}] ${l.text}`).join(" / ")}.` : ""}${heard.clap?.descriptors?.length ? ` It sounds: ${heard.clap.descriptors.slice(0, 5).map((d) => d[0]).join(", ")}.` : ""}` : "";
            const who = res?.identity?.title ? ` IDENTIFIED from the sound: ${identityLine(res.identity)}${res.identity.isrc ? `, ISRC ${res.identity.isrc}` : ""}${res.identity.genre ? `, ${res.identity.genre}` : ""}.` : "";
            if (f) void dRef.current.send(`I analyzed "${name}" with the studio:${who} ${Math.round(f.bpm)} BPM, ${f.key}, ${mmss(f.durationSec)} long, drop at ${f.dropAt !== null && f.dropAt !== undefined ? mmss(f.dropAt) : "unclear"}, best 8 bars ${mmss(f.bestBars.startSec)} to ${mmss(f.bestBars.endSec)}. Its stems and one-shots are now clips you can slice from: ${ids.join(", ")} (a stem clip's time axis is the record's own time, so "the snare at 0:32" is slice from the drums stem at 32). It is also loaded as the REFERENCE, so "make it like that" is an emulate rollout.${report}\nGive me the breakdown in one breath: what carries it, what its hook does, and the ONE piece worth taking into our record and how. Do not change the song yet.`, { hidden: true });
          })();
        }
        return;
      }
      if (Date.now() - since > 20 * 60 * 1000) { setError("The analysis is taking too long. Try a shorter file."); return; }
    } catch { /* keep polling */ }
    pollRef.current = window.setTimeout(() => void poll(id, since), 2500);
  }, []);

  const start = useCallback(async (input: { url?: string; file?: File; query?: string; storagePath?: string; name?: string; kind?: "stems" | "tracklist"; fromSec?: number }) => {
    const sb = supabaseBrowser(); const uid = dRef.current.user?.id;
    if (!sb || !uid) { setError("Sign in to analyze a record."); return; }
    setError(null); setStarting(true); setJob(null); stopPolling();
    try {
      let storagePath: string | undefined = input.storagePath, name: string | undefined = input.name;
      if (input.file) {
        const safe = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
        storagePath = `${uid}/uploads/${Date.now()}-${safe}`;
        name = input.name ?? input.file.name.replace(/\.[a-z0-9]+$/i, "");
        const { error: upErr } = await sb.storage.from("clips").upload(storagePath, input.file, { contentType: input.file.type || "audio/mpeg", upsert: true });
        if (upErr) throw new Error(upErr.message);
      }
      const r = await fetch("/api/stems", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: input.url, query: input.query, storagePath, name: name ?? input.query, projectId: dRef.current.projectId, kind: input.kind ?? "stems", fromSec: input.fromSec }) });
      const j = await r.json();
      if (!r.ok || !j.jobId) throw new Error(j.error ?? "could not start");
      setJob({ id: j.jobId, status: "queued", progress: 0, result: null, error: null, source: { url: input.url, storage_path: storagePath, name: name ?? input.query } });
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
      // Already in the account's storage: the vault records where, it does not copy it again.
      await putClip({ id, name, type: path.endsWith(".mp3") ? "audio/mpeg" : "audio/wav", bytes, createdAt: Date.now(), durationSec: meta.durationSec, bpm: meta.bpm, key: meta.key }, { mirror: false });
      cacheDecoded(id, await decodeBytes(bytes));
    }
    void dRef.current.noteClip?.(id, name, path, { ...meta, mime: path.endsWith(".mp3") ? "audio/mpeg" : "audio/wav" });
    dRef.current.registerClip({ id, name, bpm: meta.bpm, key: meta.key, durationSec: meta.durationSec });
    return id;
  }, []);
  ensureClipRef.current = ensureClip;

  const previewUrl = useCallback(async (path: string): Promise<string | null> => {
    const sb = supabaseBrowser(); if (!sb) return null;
    const { data } = await sb.storage.from("clips").createSignedUrl(path, 600);
    return data?.signedUrl ?? null;
  }, []);

  /** "Use this kick": the first track in that role plays the sliced sample; no track yet, one is made. */
  const useOneShot = useCallback(async (shot: OneShotOut) => {
    if (!job) return;
    const name = `${job.result?.name ?? job.source?.name ?? "record"} · ${shot.role}`;
    const id = await ensureClip(shot.path, `shot_${job.id}_${shot.role}${shot.path.includes("preview-") ? "_p" : ""}${shot.path.includes("-2") ? "_2" : ""}`, name, { durationSec: shot.durationSec });
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

  /** A stem as an audio track: its best eight bars (or the whole thing for a short vocal render), warped to the song, in the drops and groove. */
  const placeStem = useCallback(async (j: StemsJob, stem: StemOut, f: StemsFacts, recordName: string, mode: "best8" | "hook") => {
    const name = `${recordName} · ${stem.stem}`;
    const id = await ensureClipRef.current(stem.path, `stem_${j.id}_${stem.stem}`, name, { durationSec: f.durationSec, bpm: f.bpm, key: f.key });
    const song = dRef.current.getSong();
    const trackId = mode === "hook" ? `vocal_${j.id.slice(0, 6)}` : `stem_${stem.stem}`;
    const beats = mode === "hook" ? Math.max(4, Math.min(32, Math.round((f.durationSec * song.bpm / 60) / 4) * 4)) : 32;
    const clip = mode === "hook"
      ? { clipId: id, name, bpm: song.bpm, warp: false, startSec: 0, lengthBeats: beats, gainDb: 0, durationSec: f.durationSec }
      : { clipId: id, name, bpm: f.bpm, warp: true, startSec: f.bestBars.startSec, lengthBeats: 32, gainDb: 0, durationSec: f.durationSec };
    const ops: unknown[] = [{ op: "addTrack", track: { id: trackId, name: mode === "hook" ? recordName.slice(0, 24) : name, role: "audio", volume: mode === "hook" ? -4 : -6, duck: stem.stem !== "drums", loopBeats: beats, notes: [], clip, fx: mode === "hook" ? { filter: { type: "highpass", cutoff: 160 }, delay: { time: "8n", feedback: 0.25, wet: 0.2 }, reverb: 0.18 } : undefined } }];
    for (const s of song.sections) if (/drop|groove/i.test(s.name)) ops.push({ op: "active", section: s.id, add: [trackId] });
    const ok = await dRef.current.edit(ops, mode === "hook" ? `placed the rendered vocal ${recordName} in the drops` : `looped the best 8 bars of the ${stem.stem} stem from ${recordName}`);
    if (ok) dRef.current.flash(mode === "hook" ? "Vocal is in the drops" : `${stem.stem} loop is in the drops`);
  }, []);
  // Grab: a part of the heard record ("the synth at 1:32", "the bass", "the kick") into this record, no model.
  // Drums by word with no time take the worker's one-shot (already tuned); anything else is an onset-aligned slice
  // from the matching stem, its root detected in the browser and the clip transposed so the song's root plays it at pitch.
  const grab = useCallback(async (what: string, atSec?: number | null): Promise<string | null> => {
    const res = job?.result; if (!job || job.status !== "done" || !res?.stems?.length) return null;
    const w = what.toLowerCase();
    const drumRole = /kick/.test(w) ? "kick" : /snare|clap/.test(w) ? "snare" : /\bhi-?hats?\b|\bhats?\b|cymbal/.test(w) ? "hat" : /perc/.test(w) ? "perc" : null;
    const stem = drumRole ? "drums" : /bass|sub|808/.test(w) ? "bass" : /vocal|voice|vox|sing|acapella/.test(w) ? "vocals" : (res.stems.find((x) => x.stem === (/guitar/.test(w) ? "guitar" : /piano|keys/.test(w) ? "piano" : ""))?.stem ?? "other");
    if (drumRole && atSec == null) { const shot = (res.oneshots ?? []).find((o) => o.role === drumRole); if (shot) { await useOneShot(shot); return `${drumRole} one-shot from ${res.name ?? "the record"}`; } }
    const song = dRef.current.getSong();
    const from = `stem_${job.id}_${stem}`;
    const at = atSec != null && atSec >= 0 ? atSec : (res.facts?.bestBars?.startSec ?? 0);
    const id = `grab_${Date.now().toString(36)}`;
    const name = `${what} from ${res.name ?? "the record"} at ${mmss(at)}`;
    const { resolveSliceOps } = await import("@/lib/engine/slice");
    const r = await resolveSliceOps([{ op: "slice", from, at, length: drumRole ? 0.7 : 2.0, role: drumRole ?? "audio", name, id, track: drumRole ?? id }], song, dRef.current.registerClip);
    if (!r.ops.length || r.failed.length) return null;
    let ops = r.ops; let tuned = "";
    if (!drumRole) {
      const { loadClipsFor } = await import("@/lib/engine"); const buf = (await loadClipsFor([id])).get(id);
      if (buf) {
        const { detectRootPitch, transposeForRoot } = await import("@/lib/engine/pitch");
        const pitch = detectRootPitch(buf.getChannelData(0), buf.sampleRate);
        if (pitch.midi !== null) {
          const semitones = transposeForRoot(pitch.midi);
          const rootPc = NOTE.indexOf(song.key.split(" ")[0].replace("Db", "C#").replace("Gb", "F#"));
          const note = rootPc >= 0 ? 48 + rootPc : 60;
          ops = ops.map((o) => { const t = (o as { op?: string; track?: { clip?: { semitones?: number }; notes?: unknown } }); if (t.op === "addTrack" && t.track?.clip) { t.track.clip.semitones = semitones; t.track.notes = [[note, 0, 1, 110]]; } return o; });
          tuned = `, root ${pitch.hz} Hz, tuned ${semitones >= 0 ? "+" : ""}${semitones}`;
        }
      }
    }
    const ok = await dRef.current.edit(ops, `grab: ${name}`);
    return ok ? `${name}${tuned}` : null;
  }, [job, useOneShot]);

  /** Isolate a voice from the record the studio pulled in and land it so its last word hits the drop.
   *  The vocals are already separated; what this does is find the phrases inside them, pick the one
   *  asked for, tune it into the key, and place it in the section before the drop with room made for it. */
  const dropVocal = useCallback(async (said?: string | null, where?: string | null, jobIn?: StemsJob): Promise<string | null> => {
    // The finished job, whether it came from state or straight from the poll that just landed it.
    const jb: StemsJob | null = jobIn ?? job;
    const res = jb?.result;
    if (!jb || jb.status !== "done" || !res?.stems?.length) return null;
    const stem = res.stems.find((s) => s.stem === "vocals");
    if (!stem) return "That record came back with no vocal to isolate.";
    const name = res.name ?? "the record";
    const { loadClipsFor } = await import("@/lib/engine");
    const src = (await loadClipsFor([`stem_${jb.id}_${stem.stem}`])).get(`stem_${jb.id}_${stem.stem}`);
    if (!src) return "I could not open the vocal from that record.";

    // Every phrase in the isolated voice, then the one they pointed at.
    const { findPhrases, pickPhrase, tuneFor, leadIn } = await import("@/lib/song/vocal");
    const mono = src.getChannelData(0);
    const phrases = findPhrases(mono, src.sampleRate);
    if (!phrases.length) return `I isolated the voice on ${name} but could not find a phrase in it worth taking.`;
    const pick = pickPhrase(phrases, { said, words: res.hearing?.lyrics?.lines });
    if (!pick) return `I isolated the voice on ${name} but could not find a phrase in it worth taking.`;

    const song = dRef.current.getSong();
    const id = `vox_${jb.id.slice(0, 6)}_${Math.round(pick.startSec)}`;
    const label = `${name} vocal at ${mmss(pick.startSec)}`;
    const { cutPhraseClip } = await import("@/lib/engine/slice");
    const cut = await cutPhraseClip(src, pick.startSec, pick.endSec - pick.startSec, id, label);
    dRef.current.registerClip({ id, name: label, durationSec: cut.durationSec });

    // In the key, if that is a move small enough to leave the voice sounding like a voice.
    const { detectRootPitch } = await import("@/lib/engine/pitch");
    const heard = detectRootPitch(cut.buffer.getChannelData(0), cut.buffer.sampleRate);
    const semitones = tuneFor(heard.midi, song.key);

    // The section before the drop is where a vocal lead in lives, and the drop is the downbeat it aims at.
    const order = song.arrangement.map((sid) => song.sections.find((s) => s.id === sid)).filter((s): s is Song["sections"][number] => !!s);
    const target = where && !/before|drop/i.test(where) ? order.find((s) => s.name.toLowerCase().includes(where.toLowerCase())) : null;
    const dropAt = order.findIndex((s) => /drop|chorus|hook/i.test(s.name));
    const into = target ?? (dropAt > 0 ? order[dropAt - 1] : order[Math.max(0, order.length - 2)]);
    if (!into) return "This record has no section to put a vocal in yet.";
    const secBeats = into.bars * 4;
    const phraseBeats = cut.durationSec * (song.bpm / 60);
    // How long before the drop records of this kind actually leave the last word hanging. Measured from
    // the records the studio has heard; until enough of them exist, the word lands on the downbeat.
    const { dnaLaneFor } = await import("@/lib/brain/laneNames");
    const family = dnaLaneFor(song.lane);
    const measured = await fetch(`/api/dna/vocal?family=${encodeURIComponent(family)}&bpm=${Math.round(song.bpm)}`).then((r) => r.json()).catch(() => null);
    const enough = measured && typeof measured.leadInBeats === "number" && measured.records >= 8;
    const beforeBeats = enough ? Math.max(0, Math.min(8, measured.leadInBeats)) : 0;
    const { startBeat, cut: tooLong } = leadIn(secBeats, phraseBeats, beforeBeats);
    // What this record teaches the store, posted whether or not it was used here.
    void fetch("/api/dna/vocal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: jb.id, family, phrases: phrases.map((p) => ({ start: p.startSec, end: p.endSec, score: p.score })) }) }).catch(() => {});

    const ops: unknown[] = [
    // Room first, then the voice: the gap is measured against what is already playing, and a phrase
    // that arrives before it would duck itself.
    { op: "transition", from: into.id, bars: 4, gap: true, lift: 0 },
    {
      op: "addTrack",
      track: {
        id, name: label.slice(0, 24), role: "audio", volume: -3, duck: false, loopBeats: secBeats,
        notes: [[60, startBeat, Math.min(phraseBeats, secBeats), 112]],
        clip: { clipId: id, name: label, oneShot: true, warp: false, semitones: semitones ?? 0, gainDb: 0, durationSec: cut.durationSec },
        fx: { filter: { type: "highpass", cutoff: 140 }, delay: { time: "8n", feedback: 0.22, wet: 0.16 }, reverb: 0.2 },
      },
    }, { op: "active", section: into.id, add: [id] }];

    const ok = await dRef.current.edit(ops, `isolated the vocal from ${name} into ${into.name}`);
    if (!ok) return "The vocal did not land. Say it again and I will try a different phrase.";
    const tuneLine = semitones === null
      ? (heard.midi === null ? "It is unpitched enough that I left it alone" : `It sits too far from ${song.key} to move without wrecking it, so it plays as it was sung`)
      : semitones === 0 ? `It was already in ${song.key}` : `Tuned ${semitones > 0 ? "up" : "down"} ${Math.abs(semitones)} to sit in ${song.key}`;
    dRef.current.flash(`Vocal from ${name} is in ${into.name}`);
    return `VOCAL ISOLATED from "${name}": the phrase at ${mmss(pick.startSec)}, ${cut.durationSec.toFixed(1)} seconds of it, cut out of the separated vocal stem (${phrases.length} phrases were in there; this one scored ${pick.score} for loudness and length). ${tuneLine}. It is placed in ${into.name} starting at beat ${startBeat.toFixed(1)} of ${secBeats}, so its last word lands ${enough ? `${beforeBeats.toFixed(1)} beats before` : "on"} the downbeat of ${dropAt > 0 ? order[dropAt].name : "the next section"}${enough ? ` (that gap is the median of ${measured.records} ${family} records the studio has heard, not a guess)` : ""}${tooLong ? ", though the phrase is longer than the section so it starts at the top of it" : ""}, and that section now leans out over its final bars to leave room. Tell the user in one breath what you did and what to listen for. Do not change anything else.`;
  }, [job]);

  dropVocalRef.current = dropVocal;
  /** The whole ask in one move: pull the record in if it is not already here, then land the voice. */
  const vocalFrom = useCallback(async (said?: string | null, where?: string | null, from?: string | null): Promise<string | null> => {
    const have = job?.status === "done" && job.result?.stems?.some((s) => s.stem === "vocals");
    const named = from?.trim();
    const isThisOne = have && named ? (job?.result?.name ?? "").toLowerCase().includes(named.toLowerCase().split(/\s+/)[0]) : have;
    if (have && (!named || isThisOne)) return dropVocal(said, where);
    if (!named) return "Tell me which record the voice is from and I will pull it in.";
    pendingVocalRef.current = { said: said ?? null, where: where ?? null };
    await findAndAnalyze(named, null);
    return null;   // the poll carries it out when the stems land
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, dropVocal]);

  const addStemLoop = useCallback(async (stem: StemOut) => { if (!job?.result?.facts) return; await placeStem(job, stem, job.result.facts, job.result.name ?? "record", "best8"); }, [job, placeStem]);

  /** Real sung vocals: compose with the music engine, separate the vocal, place it. */
  const renderVocal = useCallback(async (prompt: string, lyrics?: string, lengthMs?: number) => {
    const song = dRef.current.getSong();
    setError(null); setStarting(true);
    try {
      const r = await fetch("/api/music", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, lyrics, lengthMs: lengthMs ?? 12000, bpm: song.bpm, key: song.key }) });
      const j = await r.json();
      if (!r.ok || !j.storagePath) throw new Error(j.error ?? "could not render");
      dRef.current.flash("Vocal rendered, separating the voice");
      autoPlaceRef.current = "vocals";
      await start({ storagePath: j.storagePath as string, name: j.name as string });
    } catch (e) { setError(friendly(e instanceof Error ? e.message : "could not render")); }
    finally { setStarting(false); }
  }, [start]);

  /** "Ding ding dong": record the user, match tone and pitch against their sounds, audition the closest. */
  const findSound = useCallback(async (beats = 8) => {
    const sb = supabaseBrowser(); const uid = dRef.current.user?.id;
    if (!sb || !uid) { dRef.current.flash("Sign in to search sounds by voice"); return; }
    if (!dRef.current.recordSound) return;
    const song = dRef.current.getSong();
    dRef.current.flash("Sing or beatbox it after the count");
    const rec = await dRef.current.recordSound(song.bpm, beats);
    if (!rec || !rec.samples.length) { dRef.current.flash("Did not catch that, try again"); return; }
    const { audioBufferToWav } = await import("@/lib/engine");
    const ctx = new OfflineAudioContext(1, rec.samples.length, rec.sampleRate);
    const buf = ctx.createBuffer(1, rec.samples.length, rec.sampleRate); buf.copyToChannel(new Float32Array(rec.samples), 0);
    const wav = audioBufferToWav(buf);
    const path = `${uid}/queries/${Date.now()}.wav`;
    const up = await sb.storage.from("clips").upload(path, wav, { contentType: "audio/wav", upsert: true });
    if (up.error) { dRef.current.flash("Could not save the recording"); return; }
    dRef.current.flash("Listening for the closest sound");
    const r = await fetch("/api/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storagePath: path }) }).then((x) => x.json()).catch(() => null);
    if (!r || r.error) { dRef.current.flash(r?.error ?? "Sound search failed"); return; }
    const matches = (r.matches ?? []) as { id: string; name: string; score: number; storagePath?: string; kind?: string; role?: string; durationSec?: number }[];
    const notes = (rec.notes as [number, number, number, number][]).slice(0, 8).map((n) => n[0]);
    if (!matches.length) { void dRef.current.send(`The user sang or beatboxed a sound (pitch contour ${(r.contour ?? []).join(" ")}, ${r.hits} hits, notes ${JSON.stringify(notes)}) but the library has no analyzed sounds to match yet (${r.searched} candidates). Offer to build it as a synth line from those notes, or to analyze a record first.`, { hidden: true }); return; }
    const top = matches[0];
    const clipId = top.storagePath ? await ensureClipRef.current(top.storagePath, `match_${top.id.slice(0, 8)}`, top.name, { durationSec: top.durationSec ?? undefined }) : null;
    if (clipId && dRef.current.previewClip) void dRef.current.previewClip(clipId);
    void dRef.current.send(`The user sang or beatboxed a sound (pitch contour ${(r.contour ?? []).join(" ")}, ${r.hits} hits, hummed notes ${JSON.stringify(notes)}). Closest sounds in their library by tone: ${matches.slice(0, 4).map((m) => `${m.name} (${m.kind ?? "clip"}${m.role ? " " + m.role : ""}, similarity ${m.score}, clip id match_${m.id.slice(0, 8)})`).join("; ")}. The studio just auditioned the first one. Ask in one line if that is it or the next one; if yes, place it (drum role on its track, or a one-shot audio track) on the grid where they meant.`, { hidden: true });
  }, []);

  /** The studio listens to its own record like a human: render the drop as stems, let the ears report. */
  const hearOurRender = useCallback(async (sectionId?: string): Promise<string | null> => {
    const sb = supabaseBrowser(); const uid = dRef.current.user?.id;
    if (!sb || !uid) { dRef.current.flash("Sign in for the deep listen"); return null; }
    const song = dRef.current.getSong();
    if (!song.tracks.length) return null;
    dRef.current.flash("Listening back properly");
    const { renderStemGroups } = await import("@/lib/engine");
    const blobs = await renderStemGroups(song, sectionId, 8);
    if (!blobs.mix) return null;
    const stamp = Date.now();
    const paths: Record<string, string> = {};
    for (const [name, blob] of Object.entries(blobs)) {
      const p = `${uid}/hear/${stamp}/${name}.wav`;
      const up = await sb.storage.from("clips").upload(p, blob, { contentType: "audio/wav", upsert: true });
      if (!up.error) paths[name] = p;
    }
    const r = await fetch("/api/stems", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "hear", stemPaths: paths, name: `${song.title} (our render)`, projectId: dRef.current.projectId }) }).then((x) => x.json()).catch(() => null);
    if (!r?.jobId) { dRef.current.flash(r?.error ?? "Deep listen failed"); return null; }
    const t0 = Date.now();
    while (Date.now() - t0 < 4 * 60 * 1000) {
      await new Promise((res) => setTimeout(res, 2500));
      const st = await fetch(`/api/stems?id=${r.jobId}`).then((x) => x.json()).catch(() => null);
      if (st?.status === "done") {
        const h = (st.result as StemsResult | null)?.hearing;
        const report = h?.report ?? "";
        const extra = `${h?.drumGrids ? ` Drum grids: ${JSON.stringify(h.drumGrids)}.` : ""}${h?.bass?.notes?.length ? ` Bass: root ${h.bass.root}, ${h.bass.notes.slice(0, 6).join(", ")}, rhythm ${h.bass.eighthRhythm}.` : ""}${h?.chords?.length ? ` Chords: ${h.chords.join(" ")}.` : ""}${h?.clap?.descriptors?.length ? ` It sounds: ${h.clap.descriptors.slice(0, 5).map((d) => d[0]).join(", ")}; genre read ${h.clap.genres?.[0]?.[0] ?? "unclear"}.` : ""}`;
        dRef.current.flash("Heard it");
        return report ? `LISTENING REPORT of OUR OWN render (the drop, heard by the studio's ears like a record):${report}${extra}` : null;
      }
      if (st?.status === "error") { dRef.current.flash("Deep listen failed"); return null; }
    }
    return null;
  }, []);

  /** Twelve seconds from the middle of any audio file as a small wav (a capture can be minutes long). */
  const middleCut = useCallback(async (file: Blob, seconds = 12): Promise<Blob> => {
    const { audioBufferToWav } = await import("@/lib/engine");
    const ctx = new AudioContext();
    try {
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
      const sr = buf.sampleRate, want = Math.min(buf.length, Math.round(seconds * sr));
      const from = Math.max(0, Math.floor((buf.length - want) / 2));
      const out = new OfflineAudioContext(1, want, sr).createBuffer(1, want, sr);
      const mono = out.getChannelData(0);
      for (let c = 0; c < buf.numberOfChannels; c++) { const src = buf.getChannelData(c); for (let i = 0; i < want; i++) mono[i] += src[from + i] / buf.numberOfChannels; }
      return audioBufferToWav(out);
    } finally { void ctx.close(); }
  }, []);
  /** What record is this: name it from the sound in about a second. */
  const identifyClip = useCallback(async (file: Blob): Promise<Identity | null> => {
    const sb = supabaseBrowser(); const uid = dRef.current.user?.id;
    if (!sb || !uid) { dRef.current.flash("Sign in to identify records"); return null; }
    setIdentifying(true);
    try {
      const cut = await middleCut(file).catch(() => file);
      const path = `${uid}/queries/ident-${Date.now()}.wav`;
      const up = await sb.storage.from("clips").upload(path, cut, { contentType: "audio/wav", upsert: true });
      if (up.error) { dRef.current.flash("Could not save the clip"); return null; }
      const r = await fetch("/api/identify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storagePath: path }) }).then((x) => x.json()).catch(() => null);
      void sb.storage.from("clips").remove([path]);
      const ident = (r?.identity ?? null) as Identity | null;
      if (!ident && r?.cooldownSec) dRef.current.flash(`Naming is cooling down for ${Math.ceil(r.cooldownSec / 60)} min`);
      setIdentified(ident);
      return ident;
    } finally { setIdentifying(false); }
  }, [middleCut]);
  /** "What is this": capture ten seconds of the tab the user picks, name it, hand the producer the answer. */
  const identifyPlaying = useCallback(async (): Promise<string | null> => {
    let file: File;
    try { const c = await startCapture(10, "what is playing"); dRef.current.flash("Listening to that tab for ten seconds"); file = await c.done; }
    catch (e) { dRef.current.flash(e instanceof Error && /Permission|NotAllowed|denied/i.test(e.message) ? "Sharing was cancelled" : "Could not hear that tab"); return null; }
    const ident = await identifyClip(file);
    if (!ident?.title) { dRef.current.flash("Could not name that"); return `The user asked what is playing; the studio listened to ten seconds of their tab and could not name it. Say so in one line and offer to capture more of it or analyze it anyway. Do not change the song.`; }
    dRef.current.flash(`That is ${identityLine(ident)}`);
    return `IDENTIFIED what is playing in the user's tab: ${identityLine(ident)}${ident.album ? `, from "${ident.album}"` : ""}${ident.isrc ? `, ISRC ${ident.isrc}` : ""}${ident.genre ? `, ${ident.genre}` : ""}; the cut was at ${mmss(ident.offsetSec)} into the record${ident.confident ? "" : " (not fully sure)"}. Tell the user in one line, and offer to pull it in: action {"type":"analyze","query": "${(ident.artist ? `${ident.artist} ${ident.title}` : ident.title).replace(/"/g, "")}"} when they say yes. Do not change the song.`;
  }, [identifyClip]);
  /** A capture from the sheet: name it first (instant), then analyze it under its real name. */
  const startCaptured = useCallback(async (file: File) => {
    const ident = await identifyClip(file).catch(() => null);
    if (ident?.title) dRef.current.flash(`That is ${identityLine(ident)}`);
    await start({ file, name: ident?.title ? `${ident.artist ? `${ident.artist} - ` : ""}${ident.title}`.slice(0, 80) : undefined });
  }, [identifyClip, start]);
  /** What is in this mix: by link, by name (the finder prefers mixes) or a file; the worker identifies it in cuts. */
  const startTracklist = useCallback(async (input: { url?: string; query?: string; file?: File; name?: string; fromSec?: number }) => {
    await start({ ...input, kind: "tracklist" });
  }, [start]);
  /** A read that stopped early (the naming service asked for a pause): carry on from where it got to. */
  const keepGoing = useCallback(async () => {
    const j = job; const res = j?.result;
    if (!j || res?.kind !== "tracklist" || !res.partial) return;
    const src = j.source ?? {};
    const from = res.coveredSec ?? 0;
    if (res.sourceUrl || src.url) await start({ url: res.sourceUrl ?? src.url, name: res.name ?? src.name, kind: "tracklist", fromSec: from });
    else if (src.query) await start({ query: src.query, name: res.name ?? src.name, kind: "tracklist", fromSec: from });
    else if (src.storage_path) await start({ storagePath: src.storage_path, name: res.name ?? src.name, kind: "tracklist", fromSec: from });
  }, [job, start]);
  /** Ranked candidates across every public source (about a second), plus the connected folder if any. */
  const find = useCallback(async (query: string, want?: string): Promise<{ web: FindCandidate[]; local: LocalHit[] }> => {
    const q = query.trim(); if (!q) return { web: [], local: [] };
    const local = hasFolder() ? searchLocal(q) : [];
    setLocalHits(local);
    const hit = findCache.current.get(q.toLowerCase());
    if (hit && Date.now() - hit.at < 60000) { setCandidates(hit.list); return { web: hit.list, local }; }
    setFinding(true);
    try {
      const r = await fetch("/api/find", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q, want }) }).then((x) => x.json()).catch(() => null);
      const list = (r?.candidates ?? []) as FindCandidate[];
      findCache.current.set(q.toLowerCase(), { at: Date.now(), list });
      setCandidates(list);
      return { web: list, local };
    } finally { setFinding(false); }
  }, []);
  /** Speculative: the sentence is still being spoken; start the search so results are ready when it ends. */
  const prefetch = useCallback((interim: string) => {
    const m = interim.match(/\b(?:pull|find|grab|get|analy[sz]e|look up|bring in|load)\s+(?:me\s+)?(?:the\s+|that\s+|a\s+)?(?:song|track|record|tune)?\s*(.{6,80})$/i);
    if (!m) return;
    const q = m[1].replace(/\b(from|off|on)\s+(soundcloud|the internet|online|my (desktop|computer|folder|downloads))\b.*$/i, "").trim();
    if (q.length < 6 || findCache.current.has(q.toLowerCase())) return;
    findCache.current.set(q.toLowerCase(), { at: Date.now(), list: [] });   // mark in flight
    void fetch("/api/find", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) }).then((x) => x.json()).then((r) => { findCache.current.set(q.toLowerCase(), { at: Date.now(), list: (r?.candidates ?? []) as FindCandidate[] }); }).catch(() => findCache.current.delete(q.toLowerCase()));
  }, []);
  /** The connected folder on this computer: pick it once, search it by name, analyze a hit like an upload. */
  const connectLocal = useCallback(async (pickNew = false) => {
    const info = await connectFolder(pickNew);
    if (info) dRef.current.flash(`${info.count} audio files in ${info.name}`);
    else if (!canPickFolder()) dRef.current.flash("This browser cannot open folders. Use Chrome.");
    return info;
  }, []);
  const analyzeLocal = useCallback(async (hit: LocalHit) => { const f = await hit.file(); await start({ file: f, name: hit.name }); }, [start]);
  /** By name, anywhere: the connected folder first if the user said so, else the web finder picks the best downloadable copy. */
  const findAndAnalyze = useCallback(async (query: string, from?: "local" | "web" | null) => {
    if (from === "local" || (from !== "web" && hasFolder())) {
      const hits = searchLocal(query, 3);
      if (hits.length) { dRef.current.flash(`Found ${hits[0].name} in your folder`); await analyzeLocal(hits[0]); return "local"; }
      if (from === "local") { dRef.current.flash(hasFolder() ? "Nothing in your folder matches that" : "Connect a folder first (Analyze a record, Use a folder)"); if (!hasFolder()) return "nofolder"; }
    }
    await start({ query });
    return "web";
  }, [analyzeLocal, start]);

  const reset = useCallback(() => { stopPolling(); setJob(null); setError(null); setCandidates([]); setLocalHits([]); }, []);
  const askBreakdown = useCallback(() => { const n = job?.result?.name ?? "that record"; void dRef.current.send(`Break down "${n}" for me: structure, the engine, the hook, the drum language, the mix picture, and the one trick. Then say which piece we should take.`); }, [job]);

  return { job, error, starting, start, useOneShot, addStemLoop, grab, dropVocal, vocalFrom, renderVocal, findSound, hearOurRender, previewUrl, reset, askBreakdown, find, prefetch, candidates, localHits, finding, connectLocal, analyzeLocal, findAndAnalyze, folder: folderInfo(), canPickFolder: canPickFolder(), identifyClip, identifyPlaying, startCaptured, startTracklist, keepGoing, identified, identifying };
}

function friendly(msg: string): string {
  if (/sign in|not signed in|401/i.test(msg)) return "Sign in to analyze a record.";
  if (/youtube blocked/i.test(msg)) return "YouTube does not allow server downloads. Play it in another tab and use Capture what is playing, or upload the file.";
  if (/bot|Sign in to confirm|cookies|403|unavailable|Private/i.test(msg)) return "That source blocked the download. Try the record by name (it searches SoundCloud), capture it from a tab, or upload the file.";
  if (/download failed/i.test(msg)) return "Could not find a downloadable copy of that on SoundCloud, Mixcloud or the Archive. Capture it from a tab, or upload the file.";
  if (/duration|too long/i.test(msg)) return "That is longer than 15 minutes. Try a shorter file or a single track.";
  if (/worker|502|503|not configured/i.test(msg)) return "The analysis worker is waking up. Try again in a minute.";
  return msg;
}
