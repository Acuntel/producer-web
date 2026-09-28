// Section 10 of the producer masterprompt, the engine rows, read from the ledger (and from the
// DevTools WebAudio domain for what only the browser can count). One line per metric, with the
// target beside it, so a run says at a glance what is fixed and what is not.
import { loadavg } from "node:os";
import { commitsIn } from "./instrument.mjs";

const r1 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);

export function coldMetrics(s) {
  const boot = s.marks["producer:boot"]?.[0] ?? null, tr = s.marks["producer:transport"]?.[0] ?? null, voice = s.marks["producer:voice"]?.[0] ?? null;
  const assets = s.ledger?.assets ?? [];
  const twice = assets.filter((a) => a.decodes > 1).map((a) => `${a.key} x${a.decodes}`);
  const hashes = {}; for (const d of s.load?.decodes ?? []) hashes[d.hash] = (hashes[d.hash] ?? 0) + 1;
  const studio = s.realtime.reduce((m, c) => (c.nodes > (m?.nodes ?? -1) ? c : m), null);
  return {
    pressToTransportMs: boot !== null && tr !== null ? tr - boot : null,
    order: voice === null || tr === null ? "no greeting" : voice <= tr ? `greeting first by ${tr - voice} ms` : `record first by ${voice - tr} ms`,
    maxDecodesPerKey: s.ledger?.maxDecodesPerKey ?? null, decodedTwice: twice, sameBytesDecodedTwice: Object.values(hashes).filter((n) => n > 1).length,
    realtimeContexts: s.realtime.length, studioNodes: studio?.nodes ?? null, studioNodesPeak: studio?.peak ?? null, renderCapacity: s.capacity,
    late: s.ledger?.counters?.late ?? null, lateStarts: s.load?.late ?? null, dueBeforeReady: (s.ledger?.dueBeforeReady ?? []).length,
    playback: s.ledger?.counters?.playback ?? null,
  };
}

export function playMetrics(s, bpm) {
  const beatMs = 60000 / (bpm || 120);
  const lands = (s.ledger?.landings ?? []).filter((l) => l.boundary && l.jobId !== "start");
  const off = lands.map((l) => Math.round((l.beatInBar ?? 0) * beatMs));
  return { landings: lands.length, onBeatOne: lands.filter((l) => (l.beatInBar ?? 1) < 0.01).length, msAfterBarLine: off, late: s.ledger?.counters?.late ?? null };
}

export function idleMetrics(s, t0, t1) {
  const secs = Math.max(1, (t1 - t0) / 1000);
  const idb = (s.load?.idb ?? []).filter((x) => x.t >= t0 && x.t < t1);
  return {
    seconds: Math.round(secs), idbOpensPerSec: r1(idb.length / secs), idbOpensLedgerPerSec: r1((s.ledger?.counters?.idbOpens ?? 0) / secs),
    appCommitsPerSec: r1((s.ledger?.counters?.appCommits ?? 0) / secs), reactCommitsPerSec: commitsIn(s.load?.commits ?? {}, t0, t1),
    late: s.ledger?.counters?.late ?? null, longTasks: (s.load?.lt ?? []).filter((x) => x.t >= t0 && x.t < t1).length,
  };
}

const row = (what, today, target, pass) => `  ${pass === true ? "PASS" : pass === false ? "FAIL" : "  - "}  ${what.padEnd(46)} ${String(today ?? "not measured").padEnd(44)} target ${target}`;

/** The table. `m` holds whatever modes ran: cold, reload, play, idle, desk, spend. */
export function printTable(m) {
  const lines = [`\n[load] section 10, engine rows (load average ${loadavg().map((x) => x.toFixed(2)).join(" ")})`];
  const d = m.desk; const g = d?.gates ?? {};
  if (m.idle) {
    lines.push(row("IndexedDB opens per second, clip record", `${m.idle.idbOpensPerSec} (ledger ${m.idle.idbOpensLedgerPerSec})`, "0", m.idle.idbOpensPerSec === 0));
    lines.push(row("App commits per second, playing untouched", `${m.idle.appCommitsPerSec} (all roots ${m.idle.reactCommitsPerSec})`, "under 1", m.idle.appCommitsPerSec < 1));
  }
  if (d?.full) {
    lines.push(row("Seed samples on a flat top", `${d.full.flatTopSamples} (at the old clamp ${d.full.atOldClamp}${d.full.ceilingOvers !== undefined ? `; past the curve ${d.full.ceilingOvers}, ceiling input peak ${d.full.ceilingInPeakDb} dBFS` : ""})`, "0", g.noFlatTops));
    lines.push(row("Seed true peak", `${d.full.truePeakDb} dBTP (sample ${d.full.samplePeakDb})`, "at or below -1 dBFS", g.truePeakUnderMinus1));
    lines.push(row("Seed loudness", `${d.full.lufs} LUFS (drop ${d.full.dropLufs})`, "-10 to -8 LUFS", g.lufsInRange));
    if (d.full.gapDb !== undefined) lines.push(row("The gap before a drop", `${d.full.gapDb} dBFS RMS (loudest gap)`, "silent (-60 or below)", g.gapSilent));
  }
  if (d?.velocity) lines.push(row("Drum onset vs its own velocity", `r ${d.velocity.minR} on the grid (${Object.entries(d.velocity.tracks).map(([k, v]) => `${k} ${v.r}${v.rGroove !== undefined ? `/${v.rGroove} swung` : ""}`).join(", ")})`, "1.0", g.velocityFollows));
  if (d?.swap) lines.push(row("Pad swap discontinuity", `${d.swap.ratio}x the pad's own largest step`, "no spike (1.5x at most)", g.swapClean));
  if (d?.wrap) lines.push(row("Master after the loop wrap", `${d.wrap.deltaDb} dB against the first pass`, "base (within 0.5 dB)", g.wrapAtBase));
  if (d?.snap) lines.push(row("A move during the outro fade", `${d.snap.deltaDb} dB against no move`, "no snapback (within 1 dB)", g.noSnapback));
  if (m.play) lines.push(row("Where a change lands", `${m.play.onBeatOne} of ${m.play.landings} on beat 1; ms after the bar line ${m.play.msAfterBarLine.join(", ")}`, "beat 1, 10 of 10", m.play.landings ? m.play.onBeatOne === m.play.landings : null));
  if (m.cold) {
    lines.push(row("Native nodes, seed (studio context)", `${m.cold.studioNodes} (peak ${m.cold.studioNodesPeak})`, "under 600", m.cold.studioNodes !== null ? m.cold.studioNodes < 600 : null));
    lines.push(row("Realtime AudioContexts", m.cold.realtimeContexts, "1", m.cold.realtimeContexts === 1));
    lines.push(row("Decodes per key per load (cold)", `${m.cold.maxDecodesPerKey}${m.cold.decodedTwice.length ? ` (${m.cold.decodedTwice.join(", ")})` : ""}`, "exactly 1", m.cold.maxDecodesPerKey !== null ? m.cold.maxDecodesPerKey <= 1 : null));
    lines.push(row("Greeting vs record order (cold)", m.cold.order, "identical 10 of 10", null));
    lines.push(row("Late notes (rig counter)", m.cold.late, "0", m.cold.late === 0));
  }
  if (m.reload) lines.push(row("Press to transport, reopened sample-kit record", `${m.reload.pressToTransportMs} ms`, "under 300 ms", m.reload.pressToTransportMs !== null ? m.reload.pressToTransportMs < 300 : null));
  if (m.spend) lines.push(row("Paid calls in this mock run", `${m.spendPaid} (mocked ${JSON.stringify(m.spend.mocked)}, voice stubbed ${m.spend.speakStubbed}, blocked ${JSON.stringify(m.spend.blocked)})`, "0", m.spendPaid === 0));
  console.log(lines.join("\n"));
}
