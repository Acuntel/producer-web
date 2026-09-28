// The desk probe: the seed played through the offline replica of the room (replica.ts), and the
// numbers that say whether the desk is clean (masterprompt section 8.4 and the Phase 2 gate).
// Loaded only by the harness, through window.__deskModule under ?e2e=1.
import * as Tone from "tone";
import type { Song } from "../song/types";
import { SEED_SONG, SEED_TECH_HOUSE, SEED_HARD_HOUSE } from "../song/seeds";
import { Rig } from "./rig";
import { renderReplica, type ReplicaAction } from "./replica";
import { scheduleEvents, loopBounds } from "./schedule";
import { getKit, kitIdFor } from "./kits";
import { loadClipsFor, clipKeysFor } from "./clips";
import { ensureStudioContext } from "./context";
import * as M from "./deskMetrics";
import { CHOKE_SEC } from "./hits";
import { PRESCALE } from "./ceiling";
import { TrackMeter } from "./meters";
import { LightChorus, Drive } from "./fx";

const SR = 44100;
const START = 0.2;   // Engine.start starts the transport at now(), one lookahead after the press
const OLD_CLAMP = 0.7204;   // where the crackle desk's ceiling flattened every overload (-2.85 dBFS)
const r2 = (x: number) => Math.round(x * 100) / 100;

type Scene = { song: Song; secs: number; startBeat?: number; loop?: boolean; moves?: { at: number; song: Song }[] };

// Four channels come back: the master (0, 1) and what enters the soft ceiling, pre-scaled (2, 3). A
// sample there at 1 or beyond is past the end of the curve, which a WaveShaper holds flat: a clamp.
async function play(sc: Scene): Promise<{ chs: Float32Array[]; tap: Float32Array[]; beatSec: number }> {
  ensureStudioContext();
  const kit = await getKit(sc.song.lane, sc.song.kit, sc.song.bpm);
  const kitId = kitIdFor(sc.song.lane, sc.song.kit, sc.song.bpm);
  const clips = await loadClipsFor(clipKeysFor(sc.song), "desk");
  let rig: Rig | null = null;
  const moves: ReplicaAction[] = (sc.moves ?? []).map((m) => ({ at: m.at, run: () => { rig?.apply(m.song, clips, kit, kitId); } }));
  const buf = await renderReplica(sc.secs, SR, (r) => {
    const native = r.ctx.rawContext as unknown as OfflineAudioContext;
    const merger = native.createChannelMerger(4); merger.connect(native.destination);
    const into = (node: Tone.ToneAudioNode, first: number) => { const sp = native.createChannelSplitter(2); node.connect(sp); sp.connect(merger, 0, first); sp.connect(merger, 1, first + 1); };
    const main = new Tone.Gain(1); into(main, 0);
    rig = new Rig(r.transport, main, false);
    into(rig.board.ceilingIn, 2);
    rig.defer = r.defer;
    rig.apply(sc.song, clips, kit, kitId);
    const tr = r.transport, ppq = tr.PPQ;
    if (sc.loop) {
      const lb = loopBounds(sc.song, rig.schedule.sectionStarts, rig.schedule.totalBeats);
      tr.loop = true; tr.loopStart = `${Math.round(lb.start * ppq)}i`; tr.loopEnd = `${Math.round(lb.end * ppq)}i`;
    }
    tr.start(START, `${Math.round((sc.startBeat ?? 0) * ppq)}i`);
  }, moves, { channels: 4 });
  return { chs: [buf.getChannelData(0), buf.getChannelData(1)], tap: [buf.getChannelData(2), buf.getChannelData(3)], beatSec: 60 / sc.song.bpm };
}

const solo = (song: Song, id: string, sections: string[]): Song => ({ ...song, loop: null, arrangement: sections, tracks: song.tracks.map((t) => ({ ...t, solo: t.id === id, mute: false })) });
const beatsBefore = (song: Song, sectionId: string) => {
  const byId = new Map(song.sections.map((s) => [s.id, s])); let b = 0;
  for (const id of song.arrangement) { if (id === sectionId) return b; b += (byId.get(id)?.bars ?? 0) * 4; }
  return b;
};

/** The whole seed: flat tops, the old clamp, peaks, loudness of the song and of its drop. */
async function full(song: Song) {
  const total = scheduleEvents(song).totalBeats; const beatSec = 60 / song.bpm;
  const { chs, tap } = await play({ song: { ...song, loop: null }, secs: START + total * beatSec + 2 });
  const drop = beatsBefore(song, "drop"); const dropBars = song.sections.find((s) => s.id === "drop")?.bars ?? 16;
  // A clamp repeats one value exactly; a smooth low peak bent by the soft ceiling can repeat to within
  // 1e-6 over three samples, so the run is counted at 1e-7 (under two float steps at this level).
  const ft = M.flatTops(chs, 3, 0.25, 1e-7, SR);
  const overs = M.atOrAbove(tap, 1);
  // The gap before each drop: a cut section's last half beat, after the edge ramp, must be silence.
  const gaps = scheduleEvents(song).sectionStarts.filter((s) => s.fill === "cut").map((s) => { const end = START + (s.startBeat + s.beats) * beatSec; return r2(M.rmsDb(chs, SR, end - 0.5 * beatSec + 0.04, end - 0.01)); });   // clear of the edge ramps and the compressors' 12 ms lookahead
  return {
    gapDb: gaps.length ? Math.max(...gaps) : null,
    ceilingOvers: overs, ceilingInPeakDb: r2(M.db(M.samplePeak(tap) / PRESCALE)),
    seconds: r2(chs[0].length / SR), flatTopSamples: ft.samples, flatTopRuns: ft.runs, longestFlatTop: ft.longest, flatTopAt: ft.at,
    atOldClamp: M.atLevel(chs, OLD_CLAMP), samplePeakDb: r2(M.db(M.samplePeak(chs))), truePeakDb: r2(M.db(M.truePeak(chs))),
    lufs: r2(M.lufs(chs, SR)), dropLufs: r2(M.lufs(chs, SR, START + drop * beatSec, START + (drop + dropBars * 4) * beatSec)),
  };
}

type VelRun = { hits: number; r: number | null; rPrev: number | null; latencyMs: number; worst: { beat: number; vel: number; db: number; off: number }[] };
const r3 = (x: number) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

/** One drum soloed through the groove section: every onset's level against its own velocity. The voice is
 *  what is on trial, so the desk's dynamics are kept out of it: the drum sits 24 dB down and the master
 *  compressor's threshold at 0 dBFS, where neither compressor nor ceiling acts (a compressor's gain at a
 *  hit depends on the hits before it, which is not the voice's doing), and its sends are off (a reverb
 *  tail of the last hit is not this hit). Onsets are read after the chain's measured latency. `straight`
 *  plays it on the grid, where every hit starts on a whole sample: a swung hit starts between samples,
 *  and the source's interpolation dulls a noise hat's peak by up to a dB, which is not velocity either. */
async function velocityRun(song: Song, id: string, straight: boolean): Promise<VelRun> {
  const s0 = solo(song, id, ["groove"]);
  const s: Song = {
    ...s0, master: { ...(s0.master ?? {}), compThreshold: 0 },
    humanize: straight ? { ...s0.humanize, clapLateMs: 0, pocketMs: 0 } : s0.humanize,
    tracks: s0.tracks.map((t) => (t.id === id ? { ...t, volume: t.volume - 24, fx: { ...(t.fx ?? {}), reverb: 0, delay: undefined }, ...(straight ? { groove: null } : {}) } : t)),
  };
  const evs = scheduleEvents(s).perTrack.get(id) ?? [];
  const beatSec = 60 / s.bpm;
  const { chs } = await play({ song: s, secs: START + 32 * beatSec + 1 });
  const ppq = 192;
  const due = evs.map((e) => START + (Math.round(e.beat * ppq) / ppq) * beatSec);
  const lat = M.latencyAfter(chs, SR, START - 0.05, due[0] ?? START);
  const times = due.map((t) => t + lat);
  // Read each hit just after the one before it has been choked away (hits.ts CHOKE_SEC), so a tail
  // still fading under the new hit is not counted as the new hit's level.
  const lv = M.onsetPeaks(chs, SR, times, -(CHOKE_SEC + 0.0005), CHOKE_SEC + 0.0065).map(M.db);
  const vel = evs.map((e) => M.db(Math.max(0.03, e.note[3] / 127)));
  // The hits furthest off the line, for a look when r is not 1.
  const n = lv.length, mx = vel.reduce((a, b) => a + b, 0) / n, my = lv.reduce((a, b) => a + b, 0) / n;
  const slope = vel.reduce((a, v, i) => a + (v - mx) * (lv[i] - my), 0) / Math.max(1e-9, vel.reduce((a, v) => a + (v - mx) ** 2, 0));
  const worst = lv.map((y, i) => ({ beat: Math.round(evs[i].beat * 1000) / 1000, vel: evs[i].note[3], db: r2(y), off: r2(y - (my + slope * (vel[i] - mx))) })).sort((x, y) => Math.abs(y.off) - Math.abs(x.off)).slice(0, 3);
  return { hits: evs.length, r: r3(M.pearson(lv, vel)), rPrev: r3(M.pearson(lv.slice(1), vel.slice(0, -1))), latencyMs: Math.round(lat * 10000) / 10, worst };
}

/** Each drum on the grid (the gate) and as it grooves (for the record). */
async function velocity(song: Song, ids = ["kick", "clap", "hat", "tamb"]) {
  const out: Record<string, VelRun & { rGroove: number | null; grooveWorst: VelRun["worst"] }> = {};
  for (const id of ids) {
    const grid = await velocityRun(song, id, true), groove = await velocityRun(song, id, false);
    out[id] = { ...grid, rGroove: groove.r, grooveWorst: groove.worst };
  }
  const rs = Object.values(out).map((x) => x.r).filter((x): x is number => x !== null);
  return { tracks: out, minR: rs.length ? Math.min(...rs) : null };
}

/** The pad, soloed in the intro, swapped for another instrument mid-note. A cut is only as loud as the
 *  signal at the sample it lands on, so the swap is tried at five moments and the worst one counts. */
async function swap(song: Song, times = [1.61, 1.93, 2.27, 2.58, 2.94]) {
  const s = solo(song, "pad", ["intro"]);
  const swapped: Song = { ...s, tracks: s.tracks.map((t) => (t.id === "pad" ? { ...t, synth: { ...t.synth, wave: "sawtooth" } } : t)) };
  const ref = (await play({ song: s, secs: 4.2 })).chs;
  const steady = M.maxJump(ref, SR, 0.9, 4.0);   // the largest step the pad itself ever makes
  const tries: { at: number; jump: number; afterDb: number }[] = [];
  for (const at of times) {
    const { chs } = await play({ song: s, secs: at + 1.1, moves: [{ at, song: swapped }] });
    tries.push({ at, jump: M.maxJump(chs, SR, at, at + 1.0), afterDb: r2(M.rmsDb(chs, SR, at + 0.6, at + 1.0)) });
  }
  const worst = tries.reduce((a, b) => (b.jump > a.jump ? b : a));
  return { steadyJump: steady, worstJump: worst.jump, worstAt: worst.at, ratio: r2(worst.jump / Math.max(steady, 1e-9)), tries: tries.map((t) => ({ at: t.at, ratio: r2(t.jump / Math.max(steady, 1e-9)), afterDb: t.afterDb })), padDb: r2(M.rmsDb(ref, SR, 1.5, 3.5)) };
}

/** The record looped: the outro fades the master, the wrap must bring the intro back at its own level. */
async function wrap(song: Song) {
  const outro = beatsBefore(song, "outro"); const outroBeats = (song.sections.find((x) => x.id === "outro")?.bars ?? 8) * 4;
  const from = outro - 4; const wrapAt = outro + outroBeats - from;   // beats after the start
  const looped = await play({ song, secs: START + (wrapAt + 16) * (60 / song.bpm) + 0.3, startBeat: from, loop: true });
  const fresh = await play({ song: { ...song, loop: null }, secs: START + 16 * (60 / song.bpm) + 0.3 });
  const b = looped.beatSec;
  const afterDb = M.rmsDb(looped.chs, SR, START + (wrapAt + 4) * b, START + (wrapAt + 12) * b);
  const firstDb = M.rmsDb(fresh.chs, SR, START + 4 * b, START + 12 * b);
  return { introFirstPassDb: r2(firstDb), introAfterWrapDb: r2(afterDb), deltaDb: r2(afterDb - firstDb) };
}

/** A move in the middle of the outro's fade: the fade must carry on, not snap back to full. */
async function snap(song: Song) {
  const outro = beatsBefore(song, "outro"); const from = outro - 4; const b = 60 / song.bpm;
  const at = START + (outro + 16 - from) * b;   // bar 5 of the outro, halfway down the fade
  const moved: Song = { ...song, tracks: song.tracks.map((t) => (t.id === "hat" ? { ...t, volume: t.volume - 1 } : t)) };
  const secs = at + 3;
  const a = await play({ song, secs, startBeat: from });
  const m = await play({ song, secs, startBeat: from, moves: [{ at, song: moved }] });
  const still = M.rmsDb(a.chs, SR, at + 0.4, at + 2.4), withMove = M.rmsDb(m.chs, SR, at + 0.4, at + 2.4);
  return { untouchedDb: r2(still), movedDb: r2(withMove), deltaDb: r2(withMove - still) };
}

export type DeskReport = Awaited<ReturnType<typeof deskProbe>>;
export const DESK_SCENES = ["full", "velocity", "swap", "wrap", "snap"] as const;

/** Run the scenes asked for (all by default) on the seed and say which gates pass. */
export async function deskProbe(scenes: string[] = [...DESK_SCENES], which: Song | "tech-house" | "hard-house" = SEED_SONG, master?: Song["master"]) {
  const seed = which === "hard-house" ? SEED_HARD_HOUSE : which === "tech-house" ? SEED_TECH_HOUSE : which;
  const song: Song = master ? { ...seed, master: { ...(seed.master ?? {}), ...master } } : seed;
  const t0 = performance.now(); const ms: Record<string, number> = {};
  const time = async <T>(k: string, f: () => Promise<T>) => { const a = performance.now(); const v = await f(); ms[k] = Math.round(performance.now() - a); return v; };
  const res = {
    full: scenes.includes("full") ? await time("full", () => full(song)) : null,
    velocity: scenes.includes("velocity") ? await time("velocity", () => velocity(song)) : null,
    swap: scenes.includes("swap") ? await time("swap", () => swap(song)) : null,
    wrap: scenes.includes("wrap") ? await time("wrap", () => wrap(song)) : null,
    snap: scenes.includes("snap") ? await time("snap", () => snap(song)) : null,
  };
  const gates = {
    noFlatTops: res.full ? res.full.flatTopSamples === 0 && res.full.ceilingOvers === 0 : null,
    truePeakUnderMinus1: res.full ? res.full.truePeakDb <= -1 : null,
    lufsInRange: res.full ? res.full.lufs >= -10 && res.full.lufs <= -8 : null,
    gapSilent: res.full && res.full.gapDb !== null ? res.full.gapDb <= -60 : null,
    velocityFollows: res.velocity ? (res.velocity.minR ?? 0) >= 0.99 : null,
    swapClean: res.swap ? res.swap.ratio <= 1.5 : null,
    wrapAtBase: res.wrap ? Math.abs(res.wrap.deltaDb) <= 0.5 : null,
    noSnapback: res.snap ? Math.abs(res.snap.deltaDb) <= 1 : null,
  };
  return { ...res, gates, ms, totalMs: Math.round(performance.now() - t0), sampleRate: SR };
}

/** For the node-budget probe: how many native nodes one Tone device or one track's voice builds. Harness only. */
export async function nodeCost(): Promise<Record<string, number>> {
  const { makeVoice } = await import("./voices");
  const { makeBoard } = await import("./board");
  ensureStudioContext();
  const raw = Tone.getContext().rawContext as unknown as Record<string, unknown>;
  const names = ["createGain", "createConstantSource", "createBiquadFilter", "createDelay", "createStereoPanner", "createWaveShaper", "createOscillator", "createAnalyser", "createChannelSplitter", "createChannelMerger", "createConvolver", "createDynamicsCompressor", "createBufferSource"];
  let n = 0;
  const orig = new Map<string, unknown>();
  const proto = Object.getPrototypeOf(raw) as Record<string, unknown>;
  for (const k of names) { const f = proto[k] as (...a: unknown[]) => unknown; if (typeof f !== "function") continue; orig.set(k, f); proto[k] = function (this: unknown, ...a: unknown[]) { n++; return f.apply(this, a); }; }
  const cost = (make: () => { dispose: () => void } | void): number => { const before = n; const x = make(); const c = n - before; try { (x as { dispose?: () => void } | undefined)?.dispose?.(); } catch { /* fine */ } return c; };
  const out: Record<string, number> = {};
  try {
    const board = makeBoard(undefined, true); out.board = n; 
    const kit = await getKit(SEED_SONG.lane, SEED_SONG.kit, SEED_SONG.bpm);
    for (const tr of SEED_SONG.tracks) out[`voice:${tr.id}`] = cost(() => makeVoice(tr, board.buses, undefined, kit));
    out.meter = cost(() => new Tone.Meter({ smoothing: 0.75 })); out.trackMeter = cost(() => new TrackMeter());
    out.lightChorus = cost(() => new LightChorus()); out.drive = cost(() => new Drive(0.3));
    out.filter = cost(() => new Tone.Filter(1000, "lowpass")); out.biquad = cost(() => new Tone.BiquadFilter(1000, "lowpass"));
    out.distortion = cost(() => new Tone.Distortion(0.3)); out.monoSynth = cost(() => new Tone.MonoSynth()); out.polySynth = cost(() => new Tone.PolySynth(Tone.Synth));
    out.chorus = cost(() => new Tone.Chorus(0.6, 3.5, 0.4)); out.signal = cost(() => new Tone.Signal(1)); out.panner = cost(() => new Tone.Panner(0.1));
    board.dispose();
  } finally { for (const [k, f] of orig) proto[k] = f; }
  return out;
}
