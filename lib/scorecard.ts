// The scorecard: is the producer getting faster, more accurate, closer to the reference, and are its moves being judged?
import { loadLedger } from "./taste";
export type Move = {
  at: number; ask: string; kind: "local" | "brain" | "rollout" | "verify";
  latencyMs: number; opsApplied: number; skipped: number;
  verified?: "pass" | "fail" | "na"; refDelta?: number | null; lufs?: number | null;
};
const KEY = "producer.scorecard.v1";

export function loadMoves(): Move[] { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } }
export function logMoveScore(m: Move) { try { localStorage.setItem(KEY, JSON.stringify([...loadMoves(), m].slice(-500))); } catch {} }

// Reference closeness: 0 = identical DNA, larger = further. Bands (sum of abs share deltas), LUFS (per 10 dB), tempo, pump.
export function referenceDelta(d: { lufs: number; bands: Record<string, number>; tempoRatio: number; pump: number }): number {
  const bands = Object.values(d.bands).reduce((a, v) => a + Math.abs(v), 0);
  const tempo = Math.min(1, Math.abs(Math.log2(d.tempoRatio || 1)) * 2);
  return Math.round((bands + Math.abs(d.lufs) / 10 + tempo + Math.abs(d.pump) * 0.5) * 100) / 100;
}

export function scoreSummary(): { moves: number; p50Local: number; p50Brain: number; verifiedPass: number; verifiedFail: number; lastDelta: number | null; firstDelta: number | null } {
  const all = loadMoves();
  const p50 = (xs: number[]) => (xs.length ? xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
  const withDelta = all.filter((m) => typeof m.refDelta === "number");
  return {
    moves: all.length,
    p50Local: p50(all.filter((m) => m.kind === "local").map((m) => m.latencyMs)),
    p50Brain: p50(all.filter((m) => m.kind === "brain").map((m) => m.latencyMs)),
    verifiedPass: all.filter((m) => m.verified === "pass").length,
    verifiedFail: all.filter((m) => m.verified === "fail").length,
    lastDelta: withDelta.length ? (withDelta[withDelta.length - 1].refDelta as number) : null,
    firstDelta: withDelta.length ? (withDelta[0].refDelta as number) : null,
  };
}

/** How the moves were judged: a verdict inside the thirty seconds after they landed, none, or dead after three passes. */
export function verdictSummary(): { windows: number; liked: number; rejected: number; none: number; dead: number; medianMs: number | null } {
  const all = loadLedger().filter((e) => e.window || e.dead);
  const said = all.filter((e) => e.window && e.window.verdict !== "none" && e.window.saidAt !== null).map((e) => (e.window!.saidAt as number) - e.window!.landedAt).sort((a, b) => a - b);
  return {
    windows: all.length,
    liked: all.filter((e) => e.window?.verdict === "liked").length,
    rejected: all.filter((e) => e.window?.verdict === "rejected").length,
    none: all.filter((e) => e.window?.verdict === "none" && !e.dead).length,
    dead: all.filter((e) => e.dead).length,
    medianMs: said.length ? said[Math.floor(said.length / 2)] : null,
  };
}

export function scoreLine(): string {
  const s = scoreSummary();
  if (!s.moves) return "";
  const parts = [`${s.moves} moves`];
  const v = verdictSummary();
  if (v.windows) parts.push(`judged ${v.liked + v.rejected} of ${v.windows} inside 30 s${v.medianMs !== null ? ` (median ${(v.medianMs / 1000).toFixed(0)} s)` : ""}${v.dead ? `, ${v.dead} dead` : ""}`);
  if (s.p50Local) parts.push(`instant ${s.p50Local}ms`);
  if (s.p50Brain) parts.push(`brain ${(s.p50Brain / 1000).toFixed(1)}s`);
  if (s.verifiedPass + s.verifiedFail) parts.push(`verified ${s.verifiedPass}/${s.verifiedPass + s.verifiedFail}`);
  if (s.lastDelta !== null && s.firstDelta !== null) parts.push(`ref ${s.firstDelta}→${s.lastDelta}`);
  return parts.join(" · ");
}
