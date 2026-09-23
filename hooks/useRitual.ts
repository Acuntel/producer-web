"use client";
// The order of work, in the room (docs/MASTERPROMPT_SMOOTH.md phase 3). Six moves a producer was watched
// making, resolved here in the browser: the grid from a named record (source), a phrase cut off its vocal on
// that grid (chop), the chop looped alone for the sing back (alone), drums and bass brought to it (beat), the
// next ranked candidate (next), and everything but the seed pulled down for a listen (down). The patience
// watch rides along: a verdict prompt inside thirty seconds of a new element, a swap offer after three passes.
import { useCallback, useEffect, useRef } from "react";
import type { useStudio } from "./useStudio";
import { mmss, type useStems, type StemsJob } from "./useStems";
import type { VoiceControl } from "@/lib/brain/voice";
import type { BrainAction } from "@/lib/brain/parse";
import type { Phrase } from "@/lib/song/vocal";
import { seedOf, downLevels, upLevels } from "@/lib/song/ritual";
import { watchFor, step, hearWords, judged, superseded, type Watch, type Judgement } from "@/lib/ritual/patience";
import { sourceLine, earsConfidence, LOW_CONFIDENCE, type SourceHit } from "@/lib/ritual/source";
import { judgeWords, logMove, recordJudgement } from "@/lib/taste";

type Studio = ReturnType<typeof useStudio>;
type Stems = ReturnType<typeof useStems>;
type Passes = typeof import("@/lib/ritual/passes");
type Deps = { studio: Studio; stems: Stems; speak: (t: string) => Promise<void> | void; speaking: boolean; signedIn: boolean };

/** A heard record the chop is cut from: its separated vocal in the clip store, and the grid it was measured on. */
export type Heard = { id: string; name: string; vocals: string; bpm: number; tempoConfidence: number; alt?: number | null; beatOffsetSec: number; key?: string; keyConfidence?: number };
type PhraseCand = { kind: "phrase"; id: string; heard: Heard; startSec: number; endSec: number; score: number };
type RecordCand = { kind: "record"; id: string; url: string; title: string };
type Pending = { source?: string; chop?: boolean; next?: boolean } | null;

const harness = () => typeof window !== "undefined" && /[?&](e2e|typed)=1/.test(window.location.search);

export function heardFromJob(j: StemsJob | null): Heard | null {
  const r = j?.result, f = r?.facts;
  if (!j || j.status !== "done" || !f?.bpm || !r?.stems?.some((s) => s.stem === "vocals")) return null;
  return { id: j.id, name: r.name ?? "the record", vocals: `stem_${j.id}_vocals`, bpm: f.bpm, tempoConfidence: earsConfidence(f.tempoConfidence, f.tempoAlt, f.tempoRefused), alt: f.tempoAlt ?? null, beatOffsetSec: f.beatOffsetSec ?? 0, key: f.key, keyConfidence: f.keyConfidence };
}

export function useRitual(d: Deps) {
  const dRef = useRef(d); dRef.current = d;
  const heardRef = useRef<Heard | null>(null);
  const phrasesRef = useRef<{ id: string; list: PhraseCand[] } | null>(null);
  const playedRef = useRef(new Set<string>());
  const playingRef = useRef<string | null>(null);
  const pendingRef = useRef<Pending>(null);
  const downRef = useRef<{ keep: string | null; levels: Record<string, number> } | null>(null);
  const watchRef = useRef<Watch | null>(null);
  const promptsRef = useRef<{ element: string; kind: "prompt" | "swap" | "close"; landedAt: number; at: number }[]>([]);
  const wordsRef = useRef("");   // the last thing said in the room: what a ritual move was asked with
  const passesRef = useRef<Passes | null>(null);

  const say = useCallback(async (line: string) => { dRef.current.studio.append("assistant", line); await dRef.current.speak(line); return line; }, []);
  const song = () => dRef.current.studio.getSong();
  const passes = useCallback(async () => (passesRef.current ??= await import("@/lib/ritual/passes")), []);

  // What the watch decided goes on the move in the ledger (lib/taste): its verdict window, or that it died.
  const judge = useCallback((j: Judgement | null) => { if (j) recordJudgement(j); }, []);
  // A new element is in the room: the one before it stops being judged, and the watch starts from where the loop is now.
  // A ritual element is a move of its own in the ledger; a brain move arrives with the id the studio logged it under.
  const land = useCallback(async (element: string, move: string | { id: string }) => {
    const id = typeof move === "string" ? logMove({ title: song().title, said: wordsRef.current || element, move }).id : move.id;
    const p = await passes(); p.armPasses();
    judge(superseded(watchRef.current));
    watchRef.current = watchFor(element, id, Date.now(), p.loopCount(), p.loopProgress());
  }, [judge, passes]);

  // The separated vocal, once the clip store has it (a job's stems land in the store a moment after the job does).
  const vocalOf = useCallback(async (h: Heard): Promise<AudioBuffer | null> => {
    const { loadClipsFor } = await import("@/lib/engine");
    for (let i = 0; i < 40; i++) { const b = (await loadClipsFor([h.vocals])).get(h.vocals); if (b) return b; await new Promise((r) => setTimeout(r, 500)); }
    return null;
  }, []);
  // Every line in the vocal, ranked the way a producer picks a hook: the candidates for the chop and for "next".
  const phrasesOf = useCallback(async (h: Heard): Promise<PhraseCand[]> => {
    if (phrasesRef.current?.id === h.id) return phrasesRef.current.list;
    const buf = await vocalOf(h); if (!buf) return [];
    const { findPhrases } = await import("@/lib/song/vocal");
    const list = findPhrases(buf.getChannelData(0), buf.sampleRate).sort((a: Phrase, b: Phrase) => b.score - a.score)
      .map((p): PhraseCand => ({ kind: "phrase", id: `chop_${h.id}_${Math.round(p.startSec * 1000)}`, heard: h, startSec: p.startSec, endSec: p.endSec, score: p.score }));
    phrasesRef.current = { id: h.id, list };
    return list;
  }, [vocalOf]);

  const sourceFromHeard = useCallback(async (h: Heard) => dRef.current.studio.edit([{ op: "source", name: h.name, bpm: Math.round(h.bpm), key: h.key, tempoConfidence: h.tempoConfidence, keyConfidence: h.keyConfidence, from: "ears", alt: h.alt ?? null }], `grid from ${h.name}`), []);

  // Cut a candidate on the source grid and make it the seed. "chop" and "next" are the same cut; "next" keeps the fader.
  const place = useCallback(async (c: PhraseCand, op: "chop" | "next"): Promise<{ bars: number } | null> => {
    const buf = await vocalOf(c.heard); if (!buf) return null;
    const bpm = song().source?.bpm ?? c.heard.bpm;
    const name = `${c.heard.name} at ${mmss(c.startSec)}`;
    const { cutGridPhrase } = await import("@/lib/engine/slice");
    const cut = await cutGridPhrase(buf, c, bpm, c.heard.beatOffsetSec, c.id, name);
    dRef.current.studio.registerClip({ id: c.id, name, durationSec: cut.durationSec, bpm });
    const ok = await dRef.current.studio.edit([{ op, clip: { clipId: c.id, name, bpm, startSec: 0, gainDb: 0, durationSec: cut.durationSec }, beats: cut.beats }], `${op === "chop" ? "chopped" : "swapped to"} ${name}`);
    if (!ok) return null;
    playedRef.current.add(c.id); playingRef.current = c.id;
    await land(op, `${op === "chop" ? "chopped" : "went to the next line"}: ${cut.bars} bars of ${name}`);
    return { bars: cut.bars };
  }, [land, vocalOf]);

  const source = useCallback(async (name: string): Promise<string> => {
    const r = (await fetch("/api/source", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }).then((x) => x.json()).catch(() => null)) as SourceHit | { found: false } | null;
    if (r?.found) {
      await dRef.current.studio.edit([{ op: "source", name: r.name, bpm: r.bpm, key: r.key, tempoConfidence: r.tempoConfidence, keyConfidence: r.keyConfidence, from: r.from, alt: r.alt }], `grid from ${r.name}`);
      void dRef.current.stems.find(name).catch(() => null);   // the finder's ranked copies of it: the record candidates for "next"
      return say(sourceLine(r));
    }
    if (!dRef.current.signedIn) return say(`I do not know ${name} yet, and hearing it needs you signed in. Sign in and I will count it myself.`);
    pendingRef.current = { source: name };
    void dRef.current.stems.findAndAnalyze(name, null);
    return say(`I do not know ${name} yet, so I am pulling it in to count it myself. The grid waits for it, a minute or two.`);
  }, [say]);

  const chop = useCallback(async (at?: number | null): Promise<string> => {
    const h = heardRef.current;
    if (!h) {
      const want = song().source?.name;
      if (want && dRef.current.signedIn) { pendingRef.current = { chop: true }; void dRef.current.stems.findAndAnalyze(want, null); return say(`Pulling ${want} in so I can cut from its vocal. The chop lands the moment it is here.`); }
      return say("I need a record with a vocal to cut from. Name it and I will pull it in.");
    }
    if (!song().source) await sourceFromHeard(h);   // the grid comes from the record the chop is cut from
    const list = await phrasesOf(h);
    if (!list.length) return say(`I could not find a line worth cutting in ${h.name}.`);
    const pick = typeof at === "number" ? list.reduce((b, c) => (Math.abs(c.startSec - at) < Math.abs(b.startSec - at) ? c : b), list[0]) : list[0];
    const cut = await place(pick, "chop");
    return say(cut ? `Chopped ${cut.bars === 1 ? "one bar" : `${cut.bars} bars`} from ${mmss(pick.startSec)}, on its own track, on the record's grid.` : "The chop did not land. Say it again and I will cut another line.");
  }, [phrasesOf, place, say, sourceFromHeard]);

  const alone = useCallback(async (track?: string | null): Promise<string> => {
    if (!seedOf(song(), track)) return say("There is no chop to loop yet. Say chop it and I will cut one.");
    await dRef.current.studio.edit([{ op: "alone", track: track ?? undefined }], "the chop alone, on a loop");
    return say("Just the chop, on a loop. Sing it back to me. If it will not sing, it is the wrong chop.");
  }, [say]);

  const beat = useCallback(async (): Promise<string> => {
    const src = song().source;
    if (!src) return say("Name the record first, so the beat sits on its grid. I will not guess a tempo.");
    const ok = await dRef.current.studio.edit([{ op: "beat" }], `drums and bass at ${src.bpm}`);
    if (!ok) return say("The beat did not land. Say it again.");
    await land("beat", `drums and bass under the chop at ${src.bpm}`);
    return say(`Drums and bass are in at ${src.bpm}, on ${src.name}'s own grid.${src.tempoConfidence < LOW_CONFIDENCE ? " I was not sure of that tempo, so tell me if it drags." : ""}`);
  }, [land, say]);

  // After the records: the sound libraries (lib/sources), the owned starter library first. Instant, and it needs no sign in.
  const fromLanes = useCallback(async (): Promise<string | null> => {
    const [{ laneNext, candidateLine }, { loadManifest }] = await Promise.all([import("@/lib/sources"), import("@/lib/engine")]);
    const m = await loadManifest().catch(() => null); if (!m) return null;
    const s = song(), c = await laneNext(s, playedRef.current, m);
    if (!c || !(await dRef.current.studio.edit([{ op: "next", clip: c.clip, beats: c.beats }], `swapped to ${c.name}`))) return null;
    playedRef.current.add(c.id); playingRef.current = c.id;
    await land("next", `went to the next sound: ${c.name}, from the ${c.lane} library`);
    return say(candidateLine(c, s.source?.bpm ?? s.bpm, s.source?.key ?? s.key));
  }, [land, say]);

  // The stream: this record's other lines first (instant, the loop never stops), then the finder's next record, then the libraries.
  const next = useCallback(async (): Promise<string> => {
    const h = heardRef.current;
    const lines = h ? (await phrasesOf(h)).filter((c) => !playedRef.current.has(c.id)) : [];
    if (lines.length) {
      const cut = await place(lines[0], "next");
      return say(cut ? `Next one, from ${mmss(lines[0].startSec)}. The loop kept running.` : "That one would not cut. Say next one again.");
    }
    const rec: RecordCand | undefined = dRef.current.stems.candidates.map((c) => ({ kind: "record" as const, id: `rec_${c.url}`, url: c.url, title: c.artist ? `${c.artist} - ${c.title}` : c.title }))
      .find((c) => !playedRef.current.has(c.id) && c.title.toLowerCase() !== (h?.name ?? "").toLowerCase());
    if (!rec || !dRef.current.signedIn) return (await fromLanes()) ?? say("That was the last candidate I have. Name another record and I will pull it in.");
    playedRef.current.add(rec.id); pendingRef.current = { next: true };
    void dRef.current.stems.start({ url: rec.url, name: rec.title });
    return say(`Pulling in the next one, ${rec.title}. The loop keeps running until it lands.`);
  }, [fromLanes, phrasesOf, place, say]);

  // Mute to listen, on the graph: fader ramps only, nothing rebuilt and nothing saved. The next word brings it back.
  const applyDown = useCallback(() => {
    const dn = downRef.current, eng = dRef.current.studio.liveEngine(); if (!dn || !eng) return;
    for (const [id, db] of Object.entries(dn.levels)) eng.setTrackVolume(id, db);
  }, []);
  const down = useCallback(async (keep?: string | null): Promise<string> => {
    const s = song();
    if (!s.tracks.length || !dRef.current.studio.liveEngine()) return say("There is nothing playing to pull down yet.");
    downRef.current = downLevels(s, keep);
    applyDown();
    const name = s.tracks.find((t) => t.id === downRef.current?.keep)?.name.toLowerCase() ?? "seed";
    return say(`Everything down but the ${name}.`);
  }, [applyDown, say]);
  const up = useCallback(() => {
    if (!downRef.current) return;
    downRef.current = null;
    const eng = dRef.current.studio.liveEngine(); if (!eng) return;
    for (const [id, db] of Object.entries(upLevels(song()))) eng.setTrackVolume(id, db);
  }, []);
  // A new version of the record re-lays every fader at its written level; a listen that is still down stays down.
  const onLaid = d.studio.onLaid;
  useEffect(() => { onLaid(() => { if (downRef.current) applyDown(); }); return () => onLaid(null); }, [onLaid, applyDown]);

  /** Every word said in the room: the faders come back, and words inside the window judge the newest element. */
  const heard = useCallback((words: string) => {
    up();
    wordsRef.current = words;
    const w = watchRef.current; if (!w) return;
    const after = hearWords(w, words, judgeWords(words), Date.now());
    watchRef.current = after;
    judge(judged(w, after));
  }, [judge, up]);
  // A move the brain landed on the record is judged like any other new element.
  const onMove = d.studio.onMoveLanded;
  useEffect(() => { onMove((id) => { void land("move", { id }); }); return () => onMove(null); }, [onMove, land]);

  const control = useCallback(async (c: VoiceControl): Promise<string | null> => {
    if (c.source?.name) return source(c.source.name);
    if (c.chop) return chop(c.chop.at ?? null);
    if (c.alone) return alone();
    if (c.beat) return beat();
    if (c.next) return next();
    if (c.down) return down(typeof c.down === "object" ? c.down.keep : null);
    return null;
  }, [alone, beat, chop, down, next, source]);
  /** The same six from a local word or the Hands. */
  const act = useCallback(async (a: BrainAction): Promise<string | null> => {
    if (a.type === "source") return a.query ? source(a.query) : null;
    if (a.type === "chop") return chop(a.at ?? null);
    if (a.type === "alone") return alone(a.track);
    if (a.type === "beat") return beat();
    if (a.type === "next") return next();
    if (a.type === "down") return down(a.track);
    return null;
  }, [alone, beat, chop, down, next, source]);

  // A record the studio pulled in: it becomes what the chop is cut from, and whatever was waiting for it runs.
  useEffect(() => {
    const h = heardFromJob(d.stems.job); if (!h || heardRef.current?.id === h.id) return;
    heardRef.current = h;
    const p = pendingRef.current; pendingRef.current = null;
    void (async () => {
      if (p?.source && !song().source) { await sourceFromHeard(h); await say(sourceLine({ found: true, name: h.name, bpm: Math.round(h.bpm), key: h.key, tempoConfidence: h.tempoConfidence, keyConfidence: h.keyConfidence, from: "ears", alt: h.alt ?? null })); }
      if (p?.chop) await chop(null);
      if (p?.next) { const first = (await phrasesOf(h))[0]; if (first && (await place(first, "next"))) await say(`The next one is in, from ${mmss(first.startSec)}.`); }
    })();
  }, [d.stems.job, chop, phrasesOf, place, say, sourceFromHeard]);

  // The patience watch, twice a second while the record runs: a paused record makes no passes and asks nothing.
  useEffect(() => {
    if (!d.studio.started) return;
    void passes().then((p) => p.armPasses());
    const id = window.setInterval(() => {
      const w = watchRef.current, p = passesRef.current;
      if (!w || !p || !p.transportRunning()) return;
      // Never over the producer's own words or a move in flight, except a prompt at its cap: it then joins the voice's
      // queue (which plays in order) and is on screen at once, inside the window.
      const now = Date.now(), r = step(w, now, p.loopCount(), dRef.current.speaking || dRef.current.studio.busy);
      if (!r.what) return;
      watchRef.current = r.watch;
      promptsRef.current.push({ element: w.element, kind: r.what, landedAt: w.landedAt, at: now });
      judge(r.judge);
      if (r.say) void say(r.say);
    }, 500);
    return () => window.clearInterval(id);
  }, [d.studio.started, judge, passes, say]);

  // Harness only: what the ritual holds, read from the page, and a heard record handed in as if the worker made it.
  useEffect(() => {
    if (!harness()) return;
    const w = window as unknown as { __ritual?: () => unknown; __heard?: (h: Heard) => boolean };
    w.__ritual = () => ({ source: song().source ?? null, playing: playingRef.current, played: [...playedRef.current], down: downRef.current, watch: watchRef.current, prompts: promptsRef.current,
      transportBpm: passesRef.current?.transportBpm() ?? null, loops: passesRef.current?.loopCount() ?? null, running: passesRef.current?.transportRunning() ?? null, speaking: dRef.current.speaking, busy: dRef.current.studio.busy });
    w.__heard = (h) => { heardRef.current = h; phrasesRef.current = null; return true; };
  }, []);

  return { control, act, heard, source, chop, alone, beat, next, down };
}
