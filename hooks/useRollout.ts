"use client";
// Runs a rollout: step by step, each its own inference, the ears grading every
// step; steps that touch different tracks run concurrently.
import { useCallback, useRef, useState } from "react";
import { applyOps, migrateSong, withReferenceGroove, type Song } from "@/lib/song";
import type { MusicFacts } from "@/lib/ears";
import { ROLLOUTS, groupSteps, scopeText, type RolloutKind, type Step } from "@/lib/brain/rollouts";
import { logMoveScore } from "@/lib/scorecard";
import { economyQuery } from "@/lib/brain/stream";

export type RolloutState = { kind: RolloutKind; index: number; total: number; title: string; status: string } | null;
export type StepLog = { step: string; attempt: number; ms: number; model?: string; applied: number; skipped: number; check: string | null; say: string; tracks: number };
type Deps = {
  getSong: () => Song;
  applySong: (s: Song, opts?: { silent?: boolean }) => Promise<void>;
  hearNow: (s: Song) => Promise<MusicFacts | null>;
  getReference: () => { name: string; facts: MusicFacts } | null;
  getDeltas: (f: MusicFacts | null) => unknown;
  compact: (f: MusicFacts | null) => unknown;
  say: (t: string) => void;
  taste: () => string;
  onUsage?: (model: string | undefined, usage: unknown) => void;
};

// A blueprint has no tracks yet; keep a kick and a hat running so the wait is musical.
function withStarterBeat(s: Song): Song {
  const { song } = applyOps(s, [
    { op: "grid", track: "kick", role: "kick", name: "Kick", volume: 0, steps: "X...X...X...X...", midi: 36 },
    { op: "grid", track: "hat", role: "hat", name: "Hats", volume: -10, steps: "..x...x...x...x.", midi: 42 },
    ...s.sections.filter((x) => !/break/i.test(x.name)).map((x) => ({ op: "active" as const, section: x.id, add: ["kick", "hat"] })),
  ]);
  return song;
}

export function useRollout(deps: Deps) {
  const [rollout, setRollout] = useState<RolloutState>(null);
  const cancelRef = useRef(false);
  const cancel = useCallback(() => { cancelRef.current = true; }, []);

  const run = useCallback(async (kind: RolloutKind, ask: string, section?: string | null, lane?: string | null): Promise<{ say: string; listen: string | null } | null> => {
    const groups = groupSteps(ROLLOUTS[kind]);
    const total = ROLLOUTS[kind].length;
    cancelRef.current = false;
    const prior: { id: string; summary: string }[] = [];
    const log: StepLog[] = [];
    let lastSay = "", lastListen: string | null = null, done = 0;
    const t0 = Date.now();
    const status = (title: string, st: string) => setRollout({ kind, index: done, total, title, status: st });

    const runStep = async (step: Step, factsAtStart: MusicFacts | null): Promise<void> => {
      let attempt = 1, failure: string | null = null, facts = factsAtStart;
      while (attempt <= 1 + (step.maxRetries ?? 1) && !cancelRef.current) {
        status(step.title, attempt > 1 ? `retry: ${failure}` : "thinking");
        const song = deps.getSong();
        const ref = deps.getReference();
        const ts = Date.now();
        const r = await fetch("/api/step" + economyQuery(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          step: { id: step.id, title: step.title, goal: step.goal, scope: scopeText(step), tier: step.tier, fullSong: !!step.fullSong }, kind, song, facts: deps.compact(facts),
          reference: ref ? { name: ref.name, facts: deps.compact(ref.facts) } : null, deltas: deps.getDeltas(facts), lane: song.lane, askedLane: lane ?? null, ask, prior, attempt, failure, section: section ?? null, taste: deps.taste(),
        }) }).then((x) => x.json()).catch(() => null);
        if (!r) { failure = "no reply"; attempt++; continue; }
        if (r.usage) deps.onUsage?.(r.model, r.usage);
        // Apply against the FRESHEST song (a sibling step may have landed meanwhile).
        const base = deps.getSong();
        let next: Song | null = null, applied = 0, skipped = 0, rejected: string[] = [];
        if (r.song) { next = migrateSong(r.song); if (next && lane) next.lane = lane; if (next && next.tracks.length === 0) next = withStarterBeat(next); }
        else if (Array.isArray(r.ops)) { const res = applyOps(base, withReferenceGroove(r.ops, ref?.facts.groove.template)); next = res.song; applied = res.applied; skipped = res.skipped.length; rejected = res.skipped; if (res.skipped.length) console.warn("rollout skipped ops", step.id, res.skipped); }
        if (next) await deps.applySong(next, { silent: true });
        status(step.title, "listening");
        const after = next ? await deps.hearNow(next).catch(() => null) : facts;
        facts = after;
        let problem = step.check({ song: deps.getSong(), facts: after, reference: ref?.facts ?? null, lane: deps.getSong().lane, section: section ?? undefined });
        // Rejected ops are a failure the model can fix only if it is told exactly what bounced.
        if (rejected.length && (problem || applied === 0)) {
          const ids = `${deps.getSong().sections.map((s) => s.id).join(",")} | tracks ${deps.getSong().tracks.map((t) => t.id).join(",")}`;
          problem = `${problem ?? "every op was rejected"}. REJECTED OPS (wrong shape or unknown ids; the real section ids are ${ids}): ${rejected.slice(0, 4).join(" ;; ")}`;
        }
        const entry: StepLog = { step: step.id, attempt, ms: Date.now() - ts, model: r.model, applied, skipped, check: problem, say: r.say ?? "", tracks: deps.getSong().tracks.length };
        log.push(entry); console.log("rollout step", JSON.stringify(entry));
        logMoveScore({ at: Date.now(), ask: `${kind}/${step.id}`, kind: "rollout", latencyMs: entry.ms, opsApplied: applied, skipped, verified: problem ? "fail" : "pass" });
        if (r.say) { lastSay = r.say; if (step.id !== "verdict") deps.say(r.say); }
        if (r.listen) lastListen = r.listen;
        if (!problem) { prior.push({ id: step.id, summary: r.say ?? "done" }); break; }
        failure = problem; attempt++;
        if (attempt > 1 + (step.maxRetries ?? 1)) prior.push({ id: step.id, summary: `${r.say ?? "done"} (check still failing: ${problem})` });
      }
      done++;
    };

    for (const group of groups) {
      if (cancelRef.current) break;
      const facts = await deps.hearNow(deps.getSong()).catch(() => null);
      await Promise.all(group.map((st) => runStep(st, facts)));
    }
    if (typeof window !== "undefined") (window as unknown as { __steps?: StepLog[] }).__steps = log;
    console.log(`rollout ${kind} done in ${Math.round((Date.now() - t0) / 1000)}s`);
    setRollout(null);
    return lastSay ? { say: lastSay, listen: lastListen } : null;
  }, [deps]);

  return { rollout, run, cancel };
}
