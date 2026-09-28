// The desk probe: the seed played through the offline replica of the room (replica.ts), and the
// numbers that say whether the desk is clean (masterprompt section 8.4 and the Phase 2 gate).
// Loaded only by the harness, through window.__deskModule under ?e2e=1.
import type { Song } from "../song/types";
import { SEED_SONG } from "../song/seeds";
import { Rig } from "./rig";
import { renderReplica, type ReplicaAction } from "./replica";
import { scheduleEvents, loopBounds } from "./schedule";
import { getKit, kitStyleFor } from "./kits";
import { loadClipsFor, clipKeysFor } from "./clips";
import { ensureStudioContext } from "./context";
import * as M from "./deskMetrics";

const SR = 44100;
const START = 0.2;   // Engine.start starts the transport at now(), one lookahead after the press
const OLD_CLAMP = 0.7204;   // where the crackle desk's ceiling flattened every overload (-2.85 dBFS)
const r2 = (x: number) => Math.round(x * 100) / 100;

type Scene = { song: Song; secs: number; startBeat?: number; loop?: boolean; moves?: { at: number; song: Song }[] };

async function play(sc: Scene): Promise<{ chs: Float32Array[]; beatSec: number }> {
  ensureStudioContext();
  const kit = await getKit(sc.song.lane, sc.song.kit, sc.song.bpm);
  const kitId = `${sc.song.kit ?? "synth"}|${kitStyleFor(sc.song.lane, sc.song.bpm)}`;
  const clips = await loadClipsFor(clipKeysFor(sc.song), "desk");
  let rig: Rig | null = null;
  const moves: ReplicaAction[] = (sc.moves ?? []).map((m) => ({ at: m.at, run: () => { rig?.apply(m.song, clips, kit, kitId); } }));
  const buf = await renderReplica(sc.secs, SR, (r) => {
    rig = new Rig(r.transport, undefined, false);
    rig.defer = r.defer;
    rig.apply(sc.song, clips, kit, kitId);
    const tr = r.transport, ppq = tr.PPQ;
    if (sc.loop) {
      const lb = loopBounds(sc.song, rig.schedule.sectionStarts, rig.schedule.totalBeats);
      tr.loop = true; tr.loopStart = `${Math.round(lb.start * ppq)}i`; tr.loopEnd = `${Math.round(lb.end * ppq)}i`;
    }
    tr.start(START, `${Math.round((sc.startBeat ?? 0) * ppq)}i`);
  }, moves);
  return { chs: [buf.getChannelData(0), buf.getChannelData(1)], beatSec: 60 / sc.song.bpm };
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
  const { chs } = await play({ song: { ...song, loop: null }, secs: START + total * beatSec + 2 });
  const drop = beatsBefore(song, "drop"); const dropBars = song.sections.find((s) => s.id === "drop")?.bars ?? 16;
  const ft = M.flatTops(chs);
  return {
    seconds: r2(chs[0].length / SR), flatTopSamples: ft.samples, flatTopRuns: ft.runs, longestFlatTop: ft.longest,
    atOldClamp: M.atLevel(chs, OLD_CLAMP), samplePeakDb: r2(M.db(M.samplePeak(chs))), truePeakDb: r2(M.db(M.truePeak(chs))),
    lufs: r2(M.lufs(chs, SR)), dropLufs: r2(M.lufs(chs, SR, START + drop * beatSec, START + (drop + dropBars * 4) * beatSec)),
  };
}

/** Each drum soloed through the groove: every onset's level against its own velocity. */
async function velocity(song: Song, ids = ["kick", "clap", "hat", "tamb"]) {
  const out: Record<string, { hits: number; r: number | null; rPrev: number | null }> = {};
  for (const id of ids) {
    const s = solo(song, id, ["groove"]);
    const evs = scheduleEvents(s).perTrack.get(id) ?? [];
    const beatSec = 60 / s.bpm;
    const { chs } = await play({ song: s, secs: START + 32 * beatSec + 1 });
    const ppq = 192;
    const times = evs.map((e) => START + (Math.round(e.beat * ppq) / ppq) * beatSec);
    const lv = M.onsetPeaks(chs, SR, times).map(M.db);
    const vel = evs.map((e) => M.db(Math.max(0.03, e.note[3] / 127)));
    const r = M.pearson(lv, vel); const rPrev = M.pearson(lv.slice(1), vel.slice(0, -1));
    out[id] = { hits: evs.length, r: Number.isFinite(r) ? Math.round(r * 1000) / 1000 : null, rPrev: Number.isFinite(rPrev) ? Math.round(rPrev * 1000) / 1000 : null };
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
export async function deskProbe(scenes: string[] = [...DESK_SCENES], song: Song = SEED_SONG) {
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
    noFlatTops: res.full ? res.full.flatTopSamples === 0 : null,
    truePeakUnderMinus1: res.full ? res.full.truePeakDb <= -1 : null,
    lufsInRange: res.full ? res.full.lufs >= -10 && res.full.lufs <= -8 : null,
    velocityFollows: res.velocity ? (res.velocity.minR ?? 0) >= 0.99 : null,
    swapClean: res.swap ? res.swap.ratio <= 1.5 : null,
    wrapAtBase: res.wrap ? Math.abs(res.wrap.deltaDb) <= 0.5 : null,
    noSnapback: res.snap ? Math.abs(res.snap.deltaDb) <= 1 : null,
  };
  return { ...res, gates, ms, totalMs: Math.round(performance.now() - t0), sampleRate: SR };
}
