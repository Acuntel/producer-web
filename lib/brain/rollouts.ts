// Rollouts: the producer's process written down as deterministic microtasks.
// Each step is its own inference with only its context; the ears grade every
// step before the next one runs; failed checks retry once with the measurement.
import type { Song, Role } from "../song/types";
import type { MusicFacts } from "../ears";
import { parseKey } from "../song/harmony";
import { patternFor } from "../song/pattern";

export type StepTier = "fast" | "deep";
export type RolloutKind = "newSong" | "emulate" | "finish" | "fixSection";
export type StepCtx = { song: Song; facts: MusicFacts | null; reference: MusicFacts | null; lane: string; section?: string };
export type Step = { id: string; title: string; goal: string; scope: Role[] | "arrangement" | "mix" | "all"; tier: StepTier; fullSong?: boolean; check: (ctx: StepCtx) => string | null; maxRetries?: number; group?: string };

const inKey = (song: Song, roles: Role[]): number => {
  const k = parseKey(song.key); if (!k) return 1;
  const scale = k.mode === "minor" ? [0, 2, 3, 5, 7, 8, 10, 11] : [0, 2, 4, 5, 7, 9, 11];
  let inside = 0, total = 0;
  for (const t of song.tracks) {
    if (!roles.includes(t.role)) continue;
    for (const n of t.notes) { total++; if (scale.includes((((n[0] + (t.transpose ?? 0) - k.pc) % 12) + 12) % 12)) inside++; }
  }
  return total ? inside / total : 1;
};
const dropSec = (song: Song) => song.sections.find((s) => /drop/i.test(s.name)) ?? song.sections[song.sections.length - 1];
const dropFacts = (f: MusicFacts | null) => f?.structure.sections.find((s) => s.label === "drop") ?? null;
const hasNotes = (t: Song["tracks"][number]) => t.notes.length > 0 || Object.values(t.patterns ?? {}).some((p) => p.length > 0) || !!t.clip;
const has = (song: Song, roles: Role[], sectionId?: string) => song.tracks.some((t) => roles.includes(t.role) && hasNotes(t) && (!sectionId || song.sections.find((s) => s.id === sectionId)?.active.includes(t.id)));

const blueprint: Step = {
  id: "blueprint", title: "Blueprint", tier: "deep", scope: "arrangement", fullSong: true,
  goal: `Design the record before writing a note. Return a COMPLETE SongDoc skeleton: title, bpm, key, lane, humanize, master, and the full sections + arrangement (bars, energy 0-1, fill, note per section describing what happens there), with "tracks": []. Follow the reference DNA or the lane DNA for tempo, key or its relative, section lengths, drop position and the energy contour. Write production notes in "notes": the hook idea, the bass concept, the arc.`,
  check: ({ song }) => (song.sections.length < 5 ? "fewer than 5 sections" : !song.sections.some((s) => /drop/i.test(s.name)) ? "no drop section" : song.bpm < 100 ? "tempo too low for the lane" : null),
};
const drums: Step = {
  id: "drums", title: "Drums", tier: "fast", scope: ["kick", "clap", "snare", "hat", "openhat", "perc"],
  goal: `Write the full drum kit with "grid" ops in step notation (kick, clap, hat, openhat, perc; snare/ghosts if the lane wants them; midi 36 kick, 39 clap, 38 snare, 42 hat, 46 openhat): velocity ladders, the lane's hat language, a "sparse" pattern variant for intros and breakdowns, then "active" ops so every section has the right drums (kick out of breakdowns). Set humanize swing for the lane. Do not touch anything else.`,
  check: ({ song, facts }) => { const d = dropFacts(facts); if (!has(song, ["kick"])) return "no kick track"; if (!has(song, ["clap", "snare"])) return "no clap or snare on 2 and 4"; if (!has(song, ["hat", "openhat", "perc"])) return "no hats or percussion"; if (song.tracks.filter((t) => ["kick", "clap", "snare", "hat", "openhat", "perc"].includes(t.role) && hasNotes(t)).length < 4) return "fewer than 4 drum tracks (kick, clap, hats, open hat or percussion)"; if (d && d.kickDensity !== undefined && d.kickDensity < 3) return `drop kick density ${d.kickDensity.toFixed(1)} per bar, want 4`; return null; },
};
const bass: Step = {
  id: "bass", title: "Bass and sub", tier: "deep", scope: ["bass", "sub"],
  goal: `Write the bass hook and the sub as ops (addTrack bass + sub): this is the identity of the record. Use the lane recipe (rolling offbeat saw bass for tech-house; warp/reese lead bass for hard-house), shaped velocities, an octave or color note that makes it a hook, sub on the roots under it, duck:true on both. Activate in groove/drop/drop2/outro as the lane dictates. Stay in key.`,
  check: ({ song, facts }) => { if (!has(song, ["bass"])) return "no bass track"; if (inKey(song, ["bass", "sub"]) < 0.8) return "bass notes leave the key"; const d = dropFacts(facts); if (d && d.bands.sub + d.bands.low < 0.5) return `drop sub+low share ${(d.bands.sub + d.bands.low).toFixed(2)}, want 0.55-0.8`; return null; },
};
const harmony: Step = {
  id: "harmony", title: "Harmony", tier: "fast", group: "color", scope: ["chords", "pad", "stab"],
  goal: `Add the harmonic layer as ops: pad (register and voicing per the lane, -10 dB or lower, filter cutoff for warmth, width), stabs or chords that answer the bass on the offbeats, with a progression from the lane's dominant progressions. Activate pads in intro/build/break/drop2, stabs in build/drop/drop2. Stay in key.`,
  check: ({ song }) => (!has(song, ["pad", "chords", "stab"]) ? "no harmonic layer" : inKey(song, ["pad", "chords", "stab"]) < 0.8 ? "harmony leaves the key" : null),
};
const hook: Step = {
  id: "hook", title: "Hook and ear candy", tier: "fast", group: "color", scope: ["lead", "pluck", "arp", "fx", "audio"],
  goal: `Add the memorable element as ops: a lead/pluck/arp phrase (call and response with the bass, repetition with one variation), plus ear candy that mutates every 8 bars (a pattern variant for drop2, a perc accent, an fx hit). Library sounds from SAMPLES AVAILABLE may be dropped in as audio tracks with clip.sampleId (a vocal shout on the offbeat, an impact on the drop downbeat, a riser under the build). Keep at most 6 sounding elements in the drop. Stay in key.`,
  check: ({ song }) => (!has(song, ["lead", "pluck", "arp", "audio"]) ? "no hook element (need a lead, pluck, arp or audio track with notes)" : null),
};
const craft: Step = {
  id: "craft", title: "Arrangement craft", tier: "fast", group: "finish", scope: "arrangement",
  goal: `Arrangement craft as ops: fills (builds end in "cut", breakdown "roll"), automation ramps (pad or master filter opening across builds, reverb swell into the breakdown, outro fade), variants so drop2 differs from drop1, and per-section active lists that create contrast (breakdown loses kick and bass). Do not rewrite notes.`,
  check: ({ song }) => { const autos = song.sections.reduce((a, s) => a + (s.automation?.length ?? 0), 0); const build = song.sections.find((s) => /build/i.test(s.name)); if (autos < 2) return `only ${autos} automation ramps, want at least 2`; if (build && build.fill !== "cut") return "the build does not end in a cut"; const br = song.sections.find((s) => /break/i.test(s.name)); if (br && song.tracks.some((t) => t.role === "kick" && br.active.includes(t.id))) return "breakdown still has the kick"; return null; },
};
const mix: Step = {
  id: "mix", title: "Mix", tier: "fast", group: "finish", scope: "mix",
  goal: `Mix as ops on volumes, pans, sends, EQ, drive, master (compThreshold, makeup, limiter): kick and bass own the low end, pads sit low, hats and percussion give the top its life, stabs and leads pan for width. Use the measured facts: hit the lane's LUFS and band targets without clipping (peak <= 0).`,
  check: ({ song, facts }) => { const d = dropFacts(facts); if (!d) return null; if (d.peak !== undefined && d.peak > 0.2) return `drop peaks at ${d.peak.toFixed(1)} dBFS, clipping`; if (d.lufs < -12) return `drop at ${d.lufs.toFixed(1)} LUFS, want -10 to -7`; const sl = d.bands.sub + d.bands.low; if (sl > 0.9) return `drop mids and top missing, sub+low ${sl.toFixed(2)} (collection p50 0.57): raise stabs, chords, hats; open filters`; if (sl < 0.45) return `drop low end thin, sub+low ${sl.toFixed(2)}`; return null; },
};
const verdict: Step = {
  id: "verdict", title: "Verdict", tier: "deep", scope: "all",
  goal: `Listen back through the facts. Compare to the reference or the lane DNA. Make at most two final ops if something is clearly off, then in "say" give the 1-2 sentence verdict a producer would give and ONE question for the user; in "listen" say what to listen for first.`,
  check: () => null,
};
const extend: Step = {
  id: "extend", title: "Extend", tier: "deep", scope: "arrangement",
  goal: `The user wants this song finished. As ops: add the missing sections (build2, drop2, outro, or whatever the arc lacks), set bars and energy, activate tracks per section with contrast, and describe each section in its note. Do not rewrite existing notes.`,
  check: ({ song }) => (song.sections.length < 6 ? "still fewer than 6 sections" : null),
};
const fixSection: Step = {
  id: "fix", title: "Fix section", tier: "deep", scope: "all",
  goal: `Fix ONLY the named section using sectionNotes, variants, active, automation, or mixer ops scoped to it. Use the section facts. One clear improvement, then say what changed.`,
  check: () => null,
};

export const ROLLOUTS: Record<RolloutKind, Step[]> = {
  newSong: [blueprint, drums, bass, harmony, hook, craft, mix, verdict],
  emulate: [blueprint, drums, bass, harmony, hook, craft, mix, verdict],
  finish: [extend, hook, craft, mix, verdict],
  fixSection: [fixSection, verdict],
};

// Consecutive steps sharing a group run concurrently (they touch different tracks).
export function groupSteps(steps: Step[]): Step[][] {
  const out: Step[][] = [];
  for (const st of steps) {
    const last = out[out.length - 1];
    if (last && st.group && last[0].group === st.group) last.push(st); else out.push([st]);
  }
  return out;
}

export function scopeText(step: Step): string {
  if (step.scope === "all") return "any op";
  if (step.scope === "arrangement") return "section, removeSection, arrange, active, variant, automate, clearAutomation, loop, title, tempo, key, humanize, note";
  if (step.scope === "mix") return "set (volume, fx.*, synth.*, master.*), mute, unmute, humanize";
  return `addTrack / notes / sectionNotes / set / removeTrack for roles ${step.scope.join(", ")} plus active/variant for those tracks`;
}

export const patternSummary = (song: Song) => song.sections.map((s) => `${s.id}: ${s.active.map((id) => { const t = song.tracks.find((x) => x.id === id); return t ? `${id}(${patternFor(t, s).length}n)` : id; }).join(" ")}`).join("; ");
