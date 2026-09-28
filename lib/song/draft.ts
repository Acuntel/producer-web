// The first draft: a complete SongDoc from a named source's DNA, in milliseconds, with no model call. Tempo and
// key come from the source; the drums from its grids; the bass from its rhythm on the chord roots; the chords
// from its progression; the hook from its melody contour; the form from its sections; the kit from its palette.
// Every choice is a seeded Thompson draw among the top candidates, seeded from the record's id, the name and the
// take, so the same name on the same record is the same draft after a reload, and "next one" is a new seed on
// the same DNA.
import type { Song, Track } from "./types";
import type { DraftDna, DraftInfo, Steer } from "./drafting/types";
import { hashStr } from "./prng";
import { recipeFor } from "./drafting/recipes";
import { rngFor, thompson, between, type Cand } from "./drafting/choose";
import { keyInfo, keyName, parseProgression, chordsPerBar } from "./drafting/theory";
import { drumTracks, flat } from "./drafting/drums";
import { bassTracks } from "./drafting/bass";
import { harmonyTracks } from "./drafting/parts";
import { hookTrack } from "./drafting/hook";
import { buildForm } from "./drafting/form";

export type { DraftDna, DraftInfo, Steer } from "./drafting/types";

export const draftSeed = (songId: string, key: string, take: number) => hashStr(`${songId}|${key}|${take}`);

const MAJOR = ["I-V-vi-IV", "I-vi-IV-V", "vi-IV-I-V", "I-IV", "IV-I-V-vi"];
const MINOR = ["i-bVI-bIII-bVII", "i-bVII-bVI-bVII", "i-iv-bVI-bVII", "i-bVII", "i-iv", "i"];
/** The mode a progression is written in: its tonic chord's case, else null. */
export function modeOf(p: string): "minor" | "major" | null {
  const t = p.replace(/\(.*?\)/g, " ").split(/[\s\-–,>]+/).find((x) => /^(i|I)(?![iIvV])/.test(x));
  return t ? (t[0] === "i" ? "minor" : "major") : null;
}

const KITS: Record<string, [string, number][]> = {
  "tech-house": [["starter", 3], ["synth", 2], ["starter-hard", 1]], "hard-house": [["starter-hard", 3], ["synth", 2]],
  "deep-house": [["starter", 3], ["starter-acoustic", 2], ["synth", 1]], "afro-house": [["starter", 2], ["starter-acoustic", 2], ["synth", 1]],
  "melodic-house": [["synth", 3], ["starter", 2]], techno: [["synth", 3], ["starter-hard", 2]], trance: [["synth", 3], ["starter-hard", 1]],
  hardstyle: [["starter-hard", 3], ["synth", 2]], "uk-garage": [["starter", 2], ["starter-808", 2], ["synth", 1]], "jersey-club": [["starter-808", 3], ["starter-hard", 1]],
  "trap-club": [["starter-808", 4], ["synth", 1]], pop: [["starter-acoustic", 2], ["starter-808", 2], ["starter", 1]], psychedelic: [["starter-acoustic", 4], ["starter", 1]],
};
function kitFor(dna: DraftDna, rng: () => number): string {
  const base = (KITS[dna.lane] ?? KITS["tech-house"]).map(([v, w]) => ({ v, w })) as Cand<string>[];
  const words = dna.palette.join(" ");
  for (const c of base) {
    if (/punchy|aggressive|raw|dense|hard/.test(words) && c.v === "starter-hard") c.w += 2;
    if (/organic|lo-fi|acoustic|live/.test(words) && c.v === "starter-acoustic") c.w += 2;
    if (/polished|commercial/.test(words) && c.v === "starter") c.w += 1;
  }
  return thompson(base, rng);
}

/** Compile the draft. `songId` and `take` make the seed; `base` is the record it lands on (its id, title and own audio stay). */
export function compileDraft(dna: DraftDna, o: { songId: string; take?: number; steer?: Steer; base?: Song }): Song {
  const take = o.take ?? 0;
  const seed = draftSeed(o.songId, dna.key, take);
  const r = (k: string) => rngFor(seed, k);
  const recipe = recipeFor(dna.lane);
  const steer = o.steer;
  // The key: the source's own candidates first, then the lane's. A darker steer leans minor.
  const keyCands: Cand<string>[] = [...dna.keys.map(([v, w]) => ({ v, w: w * 2 })), ...recipe.keys.map((v) => ({ v, w: 0.5 }))];
  if (steer?.dark) for (const c of keyCands) if (/minor/.test(c.v) === steer.dark > 0) c.w *= 2;
  const key = keyInfo(thompson(keyCands, r("key")));
  // The progression in the key's mode: the source's, then the lane's, then the common ones for that mode.
  const mode = key.minor ? "minor" : "major";
  const progs: Cand<string>[] = [
    ...dna.progressions.filter(([p]) => modeOf(p) === mode).map(([v, w]) => ({ v, w: 2 + w })),
    ...recipe.progressions.filter((p) => modeOf(p) === mode).map((v, i) => ({ v, w: i ? 1 : 1.5 })),
    ...(key.minor ? MINOR : MAJOR).map((v) => ({ v, w: 0.6 })),
  ];
  const progression = thompson(progs, r("progression"), 4);
  let chords = parseProgression(progression, key.pc);
  if (!chords.length) chords = parseProgression(key.minor ? "i" : "I", key.pc);
  const perBar = chordsPerBar(chords, 8);
  const busy = steer?.busy ?? 0;

  const drums = drumTracks(dna, recipe, r, steer);
  const kickSteps = drums[0].notes.filter((n) => n[1] < 4).reduce((s, n) => { const i = Math.round(n[1] * 4); return s.slice(0, i) + "X" + s.slice(i + 1); }, ".".repeat(16));
  const low = bassTracks(dna, recipe, perBar, kickSteps, r, steer);
  const harmony = harmonyTracks(recipe, perBar, r, busy);
  const hook = hookTrack(recipe, key, perBar, dna.contour, r, busy);
  const own = (o.base?.tracks ?? []).filter((t) => t.role === "audio" && t.clip && !t.clip.sampleId && !t.clip.clipId.startsWith("sample:"));
  const tracks: Track[] = [...drums, ...low, ...harmony, hook.track, ...own];
  const form = buildForm(dna, recipe, tracks, r);
  for (const t of own) for (const s of form.sections) if (s.energy === 1 || /drop|chorus/i.test(s.name)) s.active.push(t.id);

  const bpm = Math.max(60, Math.min(200, Math.round(dna.bpm + (steer?.energy ?? 0) * 3)));
  const swing = thompson(recipe.swing.map((v) => ({ v, w: 1 })), r("swing"));
  const draft: DraftInfo = { name: dna.name, key: dna.key, take, seed, tier: dna.tier, lane: dna.lane, ...(steer ? { steer } : {}), dna };
  return {
    version: 3, id: o.songId, title: o.base?.title ?? "Untitled", bpm, key: keyName(key.pc, key.minor), lane: dna.lane, kit: kitFor(dna, r("kit")),
    humanize: { swing, velVar: Math.round(between(0.05, 0.1, r("velVar")) * 100) / 100, clapLateMs: Math.round(between(3, 10, r("clapLate"))), seed: seed % 100000 },
    tracks, sections: form.sections, arrangement: form.arrangement,
    master: { compThreshold: -18, limiter: -1, sidechainDb: recipe.sidechainDb, sidechainReleaseMs: recipe.sidechainReleaseMs },
    loop: null,
    source: { name: dna.name, bpm, key: keyName(key.pc, key.minor), tempoConfidence: dna.tempoConfidence, from: dna.tier === "heard" ? "heard" : "store" },
    notes: `First draft from ${dna.name}: ${progression} in ${keyName(key.pc, key.minor)}, a ${hook.shape} ${hook.motif} hook, form ${form.codes}.`,
    draft,
  };
}

/** The audible features of a draft, for telling two drafts apart the way an ear would. */
export function draftSignature(s: Song): Record<string, string> {
  const t = (id: string) => s.tracks.find((x) => x.id === id);
  const grid = (id: string) => { const tr = t(id); if (!tr) return "-"; const g = Array(16).fill("."); for (const n of tr.notes) if (n[1] < 4) g[Math.round(n[1] * 4) % 16] = "X"; return g.join(""); };
  const hook = t("hook")?.notes ?? [];
  return {
    tempo: String(Math.round(s.bpm / 2) * 2), key: s.key, kit: s.kit ?? "synth",
    kick: grid("kick"), hat: grid("hat"), back: grid("clap") !== "-" ? grid("clap") : grid("snare"),
    bass: flat((t("bass")?.notes ?? []).filter((n) => n[1] < 8).map((n) => `${Math.round(n[1] * 4)}:${n[0] % 12}`).join(",")),
    harmony: (t("pad")?.notes ?? []).filter((n, i, a) => i === 0 || n[1] !== a[i - 1][1]).map((n) => n[0] % 12).join(","),
    hook: hook.slice(0, 10).map((n) => `${n[0]}@${n[1]}`).join(","),
    form: s.arrangement.join(","),
  };
}
/** How many audible features two drafts differ in (of nine). */
export const audibleDistance = (a: Song, b: Song) => { const x = draftSignature(a), y = draftSignature(b); return Object.keys(x).filter((k) => x[k] !== y[k]).length; };
