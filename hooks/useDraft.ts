"use client";
// The first draft in the room: a name becomes a whole record on the next bar (resolve, compile, land), "next one"
// is a new seed on the same DNA on the next phrase, one Hands call refines the draft once it has landed, and a
// record the store does not know starts from the lane and upgrades on the next phrase when the worker has heard it.
// Every one of these is a job in the queue (lib/jobs/queue.ts), so it lands when the audio does.
import { useCallback, useEffect, useRef } from "react";
import type { useStudio } from "./useStudio";
import type { StemsJob } from "./useStems";
import { compileDraft, draftSignature, type DraftDna, type Steer } from "@/lib/song/draft";
import { laneDna, hearingDna, cachedDna, keepDna } from "@/lib/song/drafting/sources";
import { studioJobs } from "@/lib/jobs/queue";
import { LANE_INDEX, laneInfo } from "@/lib/brain/laneNames";
import { hashStr } from "@/lib/song/prng";
import { norm } from "@/lib/brain/norm";
import { economyQuery } from "@/lib/brain/stream";
import { applyOps, type Song } from "@/lib/song";

type Studio = ReturnType<typeof useStudio>;
type Deps = { studio: Studio; speak: (t: string) => Promise<void> | void; findAndAnalyze?: (q: string) => Promise<unknown> | void; job?: StemsJob | null; signedIn: boolean };
export type DraftNow = { key: string; landedAt: number; name: string; take: number } | null;
const REFINE_GOAL = "Review this first draft against the reference facts (or the lane DNA when there is no reference). Return at most four ops that bring it closer to the source: the groove feel, the bass tone, the hook's register, the balance. Keep the form, the key, the tempo and every section.";

const spokenKey = (k: string) => k.replace(/^([A-G])b\b/, "$1 flat").replace(/^([A-G])#/, "$1 sharp");
const isE2E = () => typeof window !== "undefined" && /[?&](e2e|typed)=1/.test(window.location.search);
const log = (x: Record<string, unknown>) => { if (isE2E()) ((window as unknown as { __drafts?: unknown[] }).__drafts ??= []).push(x); };

export function useDraft(d: Deps) {
  const dRef = useRef(d); dRef.current = d;
  const nowRef = useRef<DraftNow>(null);
  const upgradeRef = useRef<{ ask: DraftDna; songId: string } | null>(null);
  const surprises = useRef(0);
  const say = useCallback((line: string) => { dRef.current.studio.append("assistant", line); void dRef.current.speak(line); }, []);

  const resolve = useCallback(async (name: string): Promise<DraftDna | null> => {
    const hit = cachedDna(name); if (hit) return hit;
    const r = await fetch("/api/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }).then((x) => x.json()).catch(() => null) as { found?: boolean; dna?: DraftDna } | null;
    if (r?.found && r.dna) { keepDna(name, r.dna); return r.dna; }
    return null;
  }, []);

  // When the draft is in the audio, the questions start counting its bars, and the Hands get one look at it.
  const landedAs = useCallback((song: Song, landed: Promise<boolean> | undefined, refine: boolean) => {
    void (landed ?? Promise.resolve(true)).then((ok) => {
      if (!ok || !song.draft || dRef.current.studio.getSong().id !== song.id) return;
      nowRef.current = { key: `${song.id}|${song.draft.key}|${song.draft.take}`, landedAt: Date.now(), name: song.draft.name, take: song.draft.take };
      if (refine) queueRefine(song);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queueRefine = useCallback((song: Song) => {
    const take = song.draft?.take;
    studioJobs.enqueue({ text: "Refining the draft", origin: "refine", songId: song.id }, async (j, alive) => {
      const s = dRef.current.studio;
      if (s.brainDown) return { detail: "the brain is down" };
      const ears = await import("@/lib/ears");
      const f = s.factsNow(), ref = s.referenceNow();
      const r = await fetch("/api/step" + economyQuery(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        step: { id: "refine", title: "Refine", goal: REFINE_GOAL, scope: "any op", tier: "fast", fullSong: false }, kind: "refine", song: s.getSong(),
        facts: f ? ears.factsForBrain(f) : null, reference: ref ? { name: ref.name, facts: ears.factsForBrain(ref.facts) } : null, deltas: null,
        lane: s.getSong().lane, askedLane: null, ask: `refine the first draft from ${song.draft?.name ?? "the source"}`, prior: [], attempt: 1, failure: null, section: null, taste: null }) }).then((x) => x.json()).catch(() => null) as { ops?: unknown[] | null; say?: string; model?: string; usage?: unknown } | null;
      const cur = s.getSong();
      if (!alive() || cur.id !== song.id || cur.draft?.take !== take) return { detail: "the draft moved on" };
      if (r?.usage) s.spend(r.model, r.usage);
      if (!r || !Array.isArray(r.ops) || !r.ops.length) return { detail: "nothing to change" };
      const res = applyOps(cur, r.ops);
      if (!res.applied) return { detail: "nothing applied" };
      const landing = await s.land(res.song, { boundary: "phrase", label: "refine", jobId: `refine:${j.id}` });
      if (r.say) say(r.say);
      log({ kind: "refine", applied: res.applied, landsAtBar: landing?.landsAtBar ?? null });
      return { landing };
    });
  }, [say]);

  /** "Make a song like X", "new song", "surprise me": a whole record on the next bar, from the top. */
  const run = useCallback((name: string | null, o?: { surprise?: boolean; heardAt?: number }) => {
    const s0 = dRef.current.studio.getSong();
    const lane = o?.surprise ? LANE_INDEX[hashStr(`${s0.id}|surprise|${surprises.current++}`) % LANE_INDEX.length].id : s0.lane;
    const ask = name ?? laneInfo(lane)?.name ?? lane;
    const heardAt = o?.heardAt ?? performance.now();
    studioJobs.cancelWhere((j) => j.origin === "refine", "a new draft replaces the one it was refining");
    return studioJobs.enqueue({ text: `A first draft from ${ask}`, origin: "draft", songId: s0.id }, async (j, alive) => {
      const s = dRef.current.studio;
      const t0 = performance.now();
      const known = await resolve(ask);
      const resolvedMs = Math.round(performance.now() - t0);
      if (!alive()) return {};
      const dna = known ?? laneDna(name ? s.getSong().lane : lane, ask);
      const base = s.getSong();
      const t1 = performance.now();
      const song = compileDraft(dna, { songId: base.id ?? "rec", take: 0, base });
      const compiledMs = Math.round((performance.now() - t1) * 10) / 10;
      // Over a silent record there is no bar to protect: the draft starts its own bar 1 on the next beat. Over music it waits for the bar line.
      const silent = !base.tracks.some((t) => !t.mute && t.notes.length + (t.clip ? 1 : 0) > 0);
      const landing = await s.land(song, { boundary: silent ? "beat" : "bar", fromTop: true, label: `draft from ${dna.name}`, jobId: `draft:${j.id}` });
      const line = known ? `This is a first pass from ${dna.name}. It is in ${spokenKey(song.key)} at ${song.bpm}.`
        : `I do not know ${ask} yet, so this first pass comes from the ${laneInfo(dna.lane)?.name.toLowerCase() ?? dna.lane} lane.${dRef.current.signedIn && dRef.current.findAndAnalyze ? ` I am pulling ${ask} in to hear it, and the draft moves to it when I have.` : ""}`;
      say(line);
      if (!known && name && dRef.current.signedIn && dRef.current.findAndAnalyze) { upgradeRef.current = { ask: { ...dna, name: ask }, songId: song.id ?? "" }; void dRef.current.findAndAnalyze(ask); }
      log({ kind: "draft", ask, name: dna.name, tier: dna.tier, key: norm(ask), heardAt, resolvedMs, compiledMs, landsAtBar: landing?.landsAtBar ?? null, landsAtTime: landing?.landsAtTime ?? null, sig: draftSignature(song), hash: hashStr(JSON.stringify({ ...song, title: "" })), songId: song.id, job: j.id });
      landedAs(song, landing?.landed, true);
      return { landing, detail: dna.name };
    });
  }, [landedAs, resolve, say]);

  /** "Next one": a new seed on the same DNA, landed on the next phrase. A reason steers it. */
  const next = useCallback((steer: Steer | null, why?: string) => {
    const s0 = dRef.current.studio.getSong();
    if (!s0.draft) return null;
    studioJobs.cancelWhere((j) => j.origin === "refine", "a new take replaces the draft it was refining");
    return studioJobs.enqueue({ text: "The next one", origin: "next", songId: s0.id }, async (j) => {
      const s = dRef.current.studio; const base = s.getSong(); const dr = base.draft;
      if (!dr) return { failed: true, detail: "no draft" };
      const merged: Steer | undefined = steer || dr.steer ? { ...(dr.steer ?? {}), ...(steer ?? {}) } : undefined;
      const song = compileDraft(dr.dna, { songId: base.id ?? "rec", take: dr.take + 1, steer: merged, base, lock: dr.lock });
      const landing = await s.land(song, { boundary: "phrase", label: "next one", jobId: `next:${j.id}` });
      say(`${why ? `${why} ` : ""}Here is the next one, on the same DNA. It lands on the next phrase.`);
      log({ kind: "next", take: dr.take + 1, landsAtBar: landing?.landsAtBar ?? null, landsAtTime: landing?.landsAtTime ?? null, sig: draftSignature(song), job: j.id, steer: merged ?? null });
      landedAs(song, landing?.landed, true);
      return { landing };
    });
  }, [landedAs, say]);

  // The upgrade: the worker heard the record the draft was waiting for, so the draft moves onto its DNA.
  useEffect(() => {
    const up = upgradeRef.current, job = d.job;
    if (!up || !job || job.status !== "done" || !job.result?.hearing) return;
    const s = dRef.current.studio; const cur = s.getSong();
    if (cur.id !== up.songId || !cur.draft) { upgradeRef.current = null; return; }
    const dna = hearingDna(job.result as never, up.ask); upgradeRef.current = null;
    if (!dna) return;
    keepDna(up.ask.name, dna);
    studioJobs.enqueue({ text: `Moving the draft onto ${dna.name}`, origin: "draft", songId: cur.id }, async (j) => {
      const base = s.getSong(); if (!base.draft) return {};
      const song = compileDraft(dna, { songId: base.id ?? "rec", take: base.draft.take, base, lock: base.draft.lock });
      const landing = await s.land(song, { boundary: "phrase", label: `draft from ${dna.name}`, jobId: `upgrade:${j.id}` });
      say(`I have heard ${dna.name} now. The draft moves onto its grid on the next phrase.`);
      landedAs(song, landing?.landed, false);
      return { landing };
    });
  }, [d.job, landedAs, say]);

  /** "Who are we chasing tonight?" answered with a bare name on an empty record: a draft, when the store knows it.
   *  Anything the store does not know goes on to the Voice lane, so "yeah" or "hmm" never becomes a record. */
  const tryName = useCallback(async (text: string, heardAt?: number): Promise<boolean> => {
    const s = dRef.current.studio.getSong();
    const t = text.trim().replace(/[.!]+$/, "");
    if (s.tracks.length || !t || t.split(/\s+/).length > 6 || /\?$/.test(t) || /^(?:what|how|why|who|which|when|where|is|are|do|does|can|could|should|would|yes|yeah|yep|no|nah|nope|hmm+|um+|uh+|ok|okay|hi|hey|hello|thanks|thank you|nice|cool)\b/i.test(t)) return false;
    const dna = await resolve(t);
    if (!dna || dRef.current.studio.getSong().tracks.length) return false;
    dRef.current.studio.append("user", text);
    run(t, { heardAt });
    return true;
  }, [resolve, run]);

  const current = useCallback((): DraftNow => nowRef.current, []);
  return { run, next, current, tryName };
}
