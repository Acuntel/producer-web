"use client";
// Runs a rollout: step by step, each its own inference, the ears grading every step.
import { useCallback, useRef, useState } from "react";
import { applyOps, migrateSong, type Song } from "@/lib/song";
import type { MusicFacts } from "@/lib/ears";
import { ROLLOUTS, scopeText, type RolloutKind, type Step } from "@/lib/brain/rollouts";
import { logMoveScore } from "@/lib/scorecard";

export type RolloutState = { kind: RolloutKind; index: number; total: number; title: string; status: string } | null;
type Deps = {
  getSong: () => Song;
  applySong: (s: Song, opts?: { silent?: boolean }) => Promise<void>;
  hearNow: (s: Song) => Promise<MusicFacts | null>;
  getReference: () => { name: string; facts: MusicFacts } | null;
  getDeltas: (f: MusicFacts | null) => unknown;
  compact: (f: MusicFacts | null) => unknown;
  say: (t: string) => void;
  taste: () => string;
};

export function useRollout(deps: Deps) {
  const [rollout, setRollout] = useState<RolloutState>(null);
  const cancelRef = useRef(false);
  const cancel = useCallback(() => { cancelRef.current = true; }, []);

  const run = useCallback(async (kind: RolloutKind, ask: string, section?: string | null): Promise<{ say: string; listen: string | null } | null> => {
    const steps: Step[] = ROLLOUTS[kind];
    cancelRef.current = false;
    const prior: { id: string; summary: string }[] = [];
    let lastSay = "", lastListen: string | null = null;
    const t0 = Date.now();
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (cancelRef.current) break;
      let attempt = 1, failure: string | null = null;
      while (attempt <= 1 + (step.maxRetries ?? 1)) {
        setRollout({ kind, index: i, total: steps.length, title: step.title, status: attempt > 1 ? `retry: ${failure}` : "thinking" });
        const song = deps.getSong();
        const facts = await deps.hearNow(song).catch(() => null);
        const ref = deps.getReference();
        const r = await fetch("/api/step", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          step: { id: step.id, title: step.title, goal: step.goal, scope: scopeText(step), tier: step.tier, fullSong: !!step.fullSong }, kind, song, facts: deps.compact(facts),
          reference: ref ? { name: ref.name, facts: deps.compact(ref.facts) } : null, deltas: deps.getDeltas(facts), lane: song.lane, ask, prior, attempt, failure, section: section ?? null, taste: deps.taste(),
        }) }).then((x) => x.json()).catch(() => null);
        if (!r) { failure = "no reply"; attempt++; continue; }
        let next: Song | null = null, applied = 0, skipped = 0;
        if (r.song) { next = migrateSong(r.song); if (next && step.fullSong && next.tracks.length === 0 && song.tracks.length) next = { ...next, tracks: [] }; }
        else if (Array.isArray(r.ops)) { const res = applyOps(song, r.ops); next = res.song; applied = res.applied; skipped = res.skipped.length; }
        if (next) await deps.applySong(next, { silent: true });
        setRollout({ kind, index: i, total: steps.length, title: step.title, status: "listening" });
        const after = next ? await deps.hearNow(next).catch(() => null) : facts;
        const problem = step.check({ song: deps.getSong(), facts: after, reference: ref?.facts ?? null, lane: deps.getSong().lane, section: section ?? undefined });
        logMoveScore({ at: Date.now(), ask: `${kind}/${step.id}`, kind: "rollout", latencyMs: Date.now() - t0, opsApplied: applied, skipped, verified: problem ? "fail" : "pass" });
        if (r.say) { lastSay = r.say; if (i < steps.length - 1) deps.say(r.say); }
        if (r.listen) lastListen = r.listen;
        if (!problem) { prior.push({ id: step.id, summary: r.say ?? "done" }); break; }
        failure = problem; attempt++;
        if (attempt > 1 + (step.maxRetries ?? 1)) prior.push({ id: step.id, summary: `${r.say ?? "done"} (check still failing: ${problem})` });
      }
    }
    setRollout(null);
    return lastSay ? { say: lastSay, listen: lastListen } : null;
  }, [deps]);

  return { rollout, run, cancel };
}
