// Verify a move against the ears: did the metric move the way the brain said it would?
import type { MusicFacts } from "../ears";
import type { Expectation } from "./parse";

const TOL: Record<string, number> = { centroidHz: 0.04, lufs: 0.4, pump: 0.03, transientsPerBeat: 0.15, harshness: 0.02, mud: 0.02, width: 0.03, energy: 0.03, sub: 0.02, low: 0.02, lowMid: 0.015, mid: 0.015, highMid: 0.015, air: 0.01 };

export function metricValue(f: MusicFacts, e: Expectation): number | null {
  const sec = e.section ? f.structure.sections.find((s) => s.label === e.section || (s as { id?: string }).id === e.section) : null;
  const src = sec ?? null;
  switch (e.metric) {
    case "centroidHz": return src?.centroidHz ?? f.spectrum.centroidHz;
    case "lufs": return src?.lufs ?? f.loudness.integrated;
    case "pump": return src?.pump ?? f.groove.pump;
    case "transientsPerBeat": return f.groove.transientsPerBeat;
    case "harshness": return f.spectrum.harshness;
    case "mud": return f.spectrum.mud;
    case "width": return f.spectrum.width;
    case "energy": return src?.energy ?? null;
    case "sub": case "low": case "lowMid": case "mid": case "highMid": case "air": return (src?.bands ?? f.spectrum.bands)[e.metric];
    default: return null;
  }
}

// Returns null when every expectation held (or could not be measured), else a plain-English contradiction.
export function verifyMove(before: MusicFacts | null, after: MusicFacts, expect: Expectation[]): string | null {
  if (!before) return null;
  const problems: string[] = [];
  for (const e of expect) {
    const a = metricValue(before, e), b = metricValue(after, e);
    if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) continue;
    const tol = e.metric === "centroidHz" ? Math.abs(a) * TOL.centroidHz : (TOL[e.metric] ?? 0.02);
    const delta = b - a;
    const wrongWay = e.dir === "up" ? delta < -tol : delta > tol;
    const flat = Math.abs(delta) <= tol;
    if (wrongWay) problems.push(`${e.section ? e.section + " " : ""}${e.metric} was supposed to go ${e.dir} but went from ${fmt(a)} to ${fmt(b)}`);
    else if (flat) problems.push(`${e.section ? e.section + " " : ""}${e.metric} did not move (${fmt(a)} to ${fmt(b)}); the change was too small to hear`);
  }
  return problems.length ? problems.join("; ") : null;
}

const fmt = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toString() : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3));
