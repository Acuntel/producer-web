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
export type Hearing = { report?: string; drumGrids?: Record<string, string>; bass?: { root?: string; notes?: string[]; eighthRhythm?: string }; chords?: string[]; lyrics?: { lines: { at: number; text: string }[] }; clap?: { descriptors?: [string, number][]; genres?: [string, number][] }; blocks?: { at: number; level: number; carries: string; entering: string[]; leaving: string[] }[]; perStem?: Record<string, { share: number; centroidHz: number; crestDb: number; onsetsPerBeat: number }>; error?: string };
export type StemsResult = { facts?: StemsFacts; stems?: StemOut[]; oneshots?: OneShotOut[]; name?: string; stage?: string; hearing?: Hearing };
export type StemsJob = { id: string; status: "queued" | "running" | "done" | "error"; progress: number; result: StemsResult | null; error: string | null; source: { url?: string; storage_path?: string; name?: string } };

type Deps = { user: User | null; projectId: string | null; flash: (t: string) => void; edit: (ops: unknown[], label: string) => Promise<boolean>; send: (t: string, o?: { hidden?: boolean }) => Promise<void>; registerClip: (c: ClipMeta) => void; getSong: () => Song; setReference?: (buf: AudioBuffer, name: string) => Promise<void>; recordSound?: (bpm: number, beats: number) => Promise<{ samples: Float32Array; sampleRate: number; notes: unknown[] } | null>; previewClip?: (clipId: string) => Promise<boolean> };

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
  const ensureClipRef = useRef<(path: string, id: string, name: string, meta: { durationSec?: number; bpm?: number; key?: string }) => Promise<string>>(async () => "");

  const autoPlaceRef = useRef<string | null>(null);   // a stem name to place automatically when the job lands (vocal renders)
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
          announced.current = id;
          const res = r.result as StemsResult | null;
          const f = res?.facts;
          const name = res?.name ?? "the record";
          dRef.current.flash(`Analyzed ${name}`);
          // Bring every stem and one-shot into the browser so the brain can slice them by voice, then tell it the ids.
          void (async () => {
            const ids: string[] = [];
            for (const s of res?.stems ?? []) { try { ids.push(await ensureClipRef.current(s.path, `stem_${id}_${s.stem}`, `${name} · ${s.stem}`, { durationSec: f?.durationSec, bpm: f?.bpm, key: f?.key })); } catch {} }
            for (const o of res?.oneshots ?? []) { try { ids.push(await ensureClipRef.current(o.path, `shot_${id}_${o.role}${o.path.includes("-2") ? "_2" : ""}`, `${name} · ${o.role}`, { durationSec: o.durationSec })); } catch {} }
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
            if (f) void dRef.current.send(`I analyzed "${name}" with the studio: ${Math.round(f.bpm)} BPM, ${f.key}, ${mmss(f.durationSec)} long, drop at ${f.dropAt !== null && f.dropAt !== undefined ? mmss(f.dropAt) : "unclear"}, best 8 bars ${mmss(f.bestBars.startSec)} to ${mmss(f.bestBars.endSec)}. Its stems and one-shots are now clips you can slice from: ${ids.join(", ")} (a stem clip's time axis is the record's own time, so "the snare at 0:32" is slice from the drums stem at 32). It is also loaded as the REFERENCE, so "make it like that" is an emulate rollout.${report}\nGive me the breakdown in one breath: what carries it, what its hook does, and the ONE piece worth taking into our record and how. Do not change the song yet.`, { hidden: true });
          })();
        }
        return;
      }
      if (Date.now() - since > 20 * 60 * 1000) { setError("The analysis is taking too long. Try a shorter file."); return; }
    } catch { /* keep polling */ }
    pollRef.current = window.setTimeout(() => void poll(id, since), 2500);
  }, []);

  const start = useCallback(async (input: { url?: string; file?: File; query?: string; storagePath?: string; name?: string }) => {
    const sb = supabaseBrowser(); const uid = dRef.current.user?.id;
    if (!sb || !uid) { setError("Sign in to analyze a record."); return; }
    setError(null); setStarting(true); setJob(null); stopPolling();
    try {
      let storagePath: string | undefined = input.storagePath, name: string | undefined = input.name;
      if (input.file) {
        const safe = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
        storagePath = `${uid}/uploads/${Date.now()}-${safe}`;
        name = input.file.name.replace(/\.[a-z0-9]+$/i, "");
        const { error: upErr } = await sb.storage.from("clips").upload(storagePath, input.file, { contentType: input.file.type || "audio/mpeg", upsert: true });
        if (upErr) throw new Error(upErr.message);
      }
      const r = await fetch("/api/stems", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: input.url, query: input.query, storagePath, name: name ?? input.query, projectId: dRef.current.projectId }) });
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
      await putClip({ id, name, type: path.endsWith(".mp3") ? "audio/mpeg" : "audio/wav", bytes, createdAt: Date.now(), durationSec: meta.durationSec, bpm: meta.bpm, key: meta.key });
      cacheDecoded(id, await decodeBytes(bytes));
    }
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

  const reset = useCallback(() => { stopPolling(); setJob(null); setError(null); }, []);
  const askBreakdown = useCallback(() => { const n = job?.result?.name ?? "that record"; void dRef.current.send(`Break down "${n}" for me: structure, the engine, the hook, the drum language, the mix picture, and the one trick. Then say which piece we should take.`); }, [job]);

  return { job, error, starting, start, useOneShot, addStemLoop, renderVocal, findSound, hearOurRender, previewUrl, reset, askBreakdown };
}

function friendly(msg: string): string {
  if (/sign in|not signed in|401/i.test(msg)) return "Sign in to analyze a record.";
  if (/youtube blocked/i.test(msg)) return "YouTube does not allow server downloads. Play it in another tab and use Capture what is playing, or upload the file.";
  if (/bot|Sign in to confirm|cookies|403|unavailable|Private/i.test(msg)) return "That source blocked the download. Try the record by name (it searches SoundCloud), capture it from a tab, or upload the file.";
  if (/download failed/i.test(msg)) return "Could not find a downloadable copy of that record on SoundCloud. Capture it from a tab, or upload the file.";
  if (/duration|too long/i.test(msg)) return "That is longer than 15 minutes. Try a shorter file or a single track.";
  if (/worker|502|503|not configured/i.test(msg)) return "The analysis worker is waking up. Try again in a minute.";
  return msg;
}
