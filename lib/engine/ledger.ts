// The ledger, which is the debugger. Every load, every landing and every placement is written
// here with its times, and the counters say whether both threads keep up. A fix is done when a
// probe reads this and proves it. Tone-free on purpose: the page and the hooks write to it
// without pulling the engine into the first bundle. Exposed as window.__ledger under ?e2e=1 and
// ?trace=1; every time is performance.now() in milliseconds unless its name says otherwise.

export type Tier = "T0" | "T1" | "T2" | "T3" | "T4" | "-";
export type AssetSource = "memory" | "idb" | "http" | "render";
export type AssetRow = {
  key: string; why: string; tier: Tier; requestedAt: number; requests: number;
  source: AssetSource | null; decodes: number; decodedAt: number | null; readyAt: number | null;
  dueAt: number | null; firstHeardAt: number | null; bytes: number | null; error: string | null;
};
// boundary "now" is today's engine: a change lands wherever the playhead is.
export type Boundary = "now" | "beat" | "bar" | "phrase";
export type LandingRow = {
  jobId: string; boundary: Boundary; calledAt: number; landedAt: number;
  landsAtBar: number | null; landsAtTime: number | null; beatInBar: number | null;
  partsChanged: string[]; voicesRebuilt: string[]; notReady: string[];
  /** Where the boundary's audio time sits on the transport's grid, read back from the transport. */
  measuredBeatInBar?: number | null;
  /** For each part laid anew, how many beats after the boundary its first hit fired (never negative). */
  firstHits?: Record<string, number>;
};
export type PlacementRow = { at: number; phrase: string; slot: string; scores: Record<string, number>; checks: Record<string, number | boolean>; verdict: string | null };

type Health = { late: number; events: number; graphsAlive: number };
type Stats = { underrunEvents?: number; underrunDuration?: number; totalDuration?: number };

const MAX_ROWS = 4000;
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const sec = (t: number) => Math.floor(t / 1000);

const assets = new Map<string, AssetRow>();
const landings: LandingRow[] = [];
const placements: PlacementRow[] = [];
const dueBeforeReady: { key: string; at: number }[] = [];
const perSec = { idbOpens: {} as Record<number, number>, appCommits: {} as Record<number, number> };
const totals = { idbOpens: 0, appCommits: 0 };
let health: (() => Health | null) | null = null;
let audioCtx: (() => unknown) | null = null;
let landingSeq = 0;

function row(key: string): AssetRow {
  let r = assets.get(key);
  if (!r) {
    if (assets.size >= MAX_ROWS) { const oldest = assets.keys().next().value; if (oldest !== undefined) assets.delete(oldest); }
    r = { key, why: "", tier: "-", requestedAt: now(), requests: 0, source: null, decodes: 0, decodedAt: null, readyAt: null, dueAt: null, firstHeardAt: null, bytes: null, error: null };
    assets.set(key, r);
  }
  return r;
}

/** Something asked for this sound. The first ask names why; later asks only count. */
export function assetRequested(key: string, why: string, tier: Tier = "-") {
  const r = row(key); r.requests++;
  if (!r.why) { r.why = why; r.tier = tier; }
}
/** The bytes were turned into samples (a decode or a render). More than one per load is waste. */
export function assetDecoded(key: string, bytes?: number) {
  const r = row(key); r.decodes++;
  if (r.decodedAt === null) r.decodedAt = now();
  if (typeof bytes === "number") r.bytes = bytes;
}
/** The sound can be played from here on, and where it came from. */
export function assetReady(key: string, source: AssetSource) {
  const r = row(key);
  if (r.readyAt === null) { r.readyAt = now(); r.source = source; r.error = null; }
}
export function assetFailed(key: string, error: string) { row(key).error = error.slice(0, 160); }
/** The engine laid a record that plays this sound. Not ready at that moment means silence where it belongs. */
export function assetDue(key: string, ready: boolean) {
  const r = row(key);
  if (r.dueAt === null) r.dueAt = now();
  if (!ready && dueBeforeReady.length < MAX_ROWS) dueBeforeReady.push({ key, at: now() });
}
/** The first time a voice playing this sound fired, at the moment it is heard (audio time mapped to page time). */
export function assetHeard(key: string, at = now()) {
  const r = row(key);
  if (r.firstHeardAt === null) r.firstHeardAt = at;
}

export function recordLanding(r: Omit<LandingRow, "jobId"> & { jobId?: string }): LandingRow {
  const full: LandingRow = { ...r, jobId: r.jobId ?? `j${++landingSeq}` };
  landings.push(full); if (landings.length > MAX_ROWS) landings.shift();
  return full;
}
export function recordPlacement(p: Omit<PlacementRow, "at">) {
  placements.push({ ...p, at: now() }); if (placements.length > MAX_ROWS) placements.shift();
}

export function countIdbOpen() { totals.idbOpens++; const s = sec(now()); perSec.idbOpens[s] = (perSec.idbOpens[s] ?? 0) + 1; }
export function countAppCommit() { totals.appCommits++; const s = sec(now()); perSec.appCommits[s] = (perSec.appCommits[s] ?? 0) + 1; }

/** The engine hands over its health (late notes, rigs alive) and its realtime context once. */
export function ledgerSources(s: { health?: () => Health | null; context?: () => unknown }) {
  if (s.health) health = s.health;
  if (s.context) audioCtx = s.context;
}

function stats(): Stats | null {
  try {
    const c = audioCtx?.() as { playbackStats?: Record<string, unknown> } | null | undefined;
    const p = c?.playbackStats; if (!p) return null;
    const out: Stats = {};
    for (const k of ["underrunEvents", "underrunDuration", "totalDuration"] as const) if (typeof p[k] === "number") out[k] = p[k] as number;
    return out;
  } catch { return null; }
}

/** Everything, as plain data: what a probe reads. */
export function ledgerSnapshot() {
  const rows = [...assets.values()];
  const h = (() => { try { return health?.() ?? null; } catch { return null; } })();
  return {
    at: now(),
    assets: rows,
    landings: [...landings],
    placements: [...placements],
    dueBeforeReady: [...dueBeforeReady],
    counters: { idbOpens: totals.idbOpens, appCommits: totals.appCommits, late: h?.late ?? null, events: h?.events ?? null, graphsAlive: h?.graphsAlive ?? null, playback: stats() },
    perSec: { idbOpens: { ...perSec.idbOpens }, appCommits: { ...perSec.appCommits } },
    maxDecodesPerKey: rows.reduce((m, r) => Math.max(m, r.decodes), 0),
  };
}
export type LedgerSnapshot = ReturnType<typeof ledgerSnapshot>;

/** A probe's clean slate, for a measured window. The engine's sources are kept. */
export function resetLedger() {
  assets.clear(); landings.length = 0; placements.length = 0; dueBeforeReady.length = 0;
  perSec.idbOpens = {}; perSec.appCommits = {}; totals.idbOpens = 0; totals.appCommits = 0;
}

export const traceOn = () => typeof window !== "undefined" && /[?&]trace=1/.test(window.location.search);
if (typeof window !== "undefined" && /[?&](e2e|trace)=1/.test(window.location.search)) {
  const w = window as unknown as { __ledger?: () => LedgerSnapshot; __ledgerReset?: () => void };
  w.__ledger = ledgerSnapshot;
  w.__ledgerReset = resetLedger;
}
