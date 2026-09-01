// Deterministic plain-English producer read of a MusicFacts object. No em dashes.
import type { MusicFacts } from "./facts";

export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const pct = (v: number) => Math.round(v * 100);

export function describe(f: MusicFacts): string {
  const out: string[] = [];
  const lufs = Number.isFinite(f.loudness.integrated) ? f.loudness.integrated.toFixed(1) : "silent";
  out.push(`${Math.round(f.tempo.bpm)} BPM, ${f.key.name}, integrated ${lufs} LUFS with a ${f.loudness.range.toFixed(1)} dB loudness range.`);
  const b = f.spectrum.bands;
  const lowShare = pct(b.sub + b.low);
  const notes: string[] = [];
  if (b.lowMid + b.mid < 0.18) notes.push("the mids are thin");
  if (f.spectrum.mud > 0.42) notes.push("the low mids are muddy");
  if (f.spectrum.harshness > 0.2) notes.push("the top end is harsh");
  if (b.air < 0.01) notes.push("there is almost no air above 6 kHz");
  out.push(`Sub and low carry ${lowShare} percent of the energy${notes.length ? ", " + notes.join(", ") : ""}.`);
  const kick = f.groove.kickDensity >= 3.4 ? "the kick runs four to the floor" : f.groove.kickDensity >= 1.5 ? "the kick pattern is broken up" : "there is little kick";
  const pump = f.groove.pump >= 0.55 ? "the mix pumps hard on every kick" : f.groove.pump >= 0.3 ? "there is a clear sidechain breath" : "there is little pumping";
  const drop = f.structure.dropAt !== null ? `The first drop lands at ${mmss(f.structure.dropAt)}` : "There is no clear drop in the analyzed span";
  out.push(`${drop}, ${kick} with a swing of ${pct(f.groove.swing)} percent, and ${pump}.`);
  if (f.chords.progression.length > 0) out.push(`Chords run ${f.chords.progression.join(", ")}.`);
  const secs = f.structure.sections.filter((s) => s.label !== "section").slice(0, 8);
  if (secs.length > 1) out.push(`Sections: ${secs.map((s) => `${s.label} ${mmss(s.start)}`).join(", ")}.`);
  return out.join(" ");
}
