"use client";
// Routing in code, on Brady's own words, before any model hears them (lib/brain/route.ts): a draft, the next take,
// a voice off a record, a take of his own, or a named refine. What is left goes to the Voice lane.
import { useCallback } from "react";
import type { useStudio } from "./useStudio";
import { route, type RefineStep } from "@/lib/brain/route";
import { studioJobs } from "@/lib/jobs/queue";

type Studio = ReturnType<typeof useStudio>;
type Draft = { run: (name: string | null, o?: { surprise?: boolean; heardAt?: number }) => unknown; next: (steer: null) => unknown; tryName: (t: string, heardAt?: number) => Promise<boolean> } | undefined;
type Deps = { studio: () => Studio; speak: (t: string) => Promise<void>; draft: () => Draft; doVocal: (v: { what?: string | null; from?: string | null; where?: string | null }) => Promise<void> };
const REFINE_LINE: Record<RefineStep, string> = { drums: "I am working on the drums now.", bass: "I am reworking the bass now.", harmony: "I am reworking the chords now.", hook: "I am writing a new hook now.", craft: "I am working on the arrangement now.", mix: "I am mixing it now.", finish: "I am building it out to a full arrangement now.", fixSection: "I am reworking that section now." };

export function useRouteWords(d: Deps) {
  const { studio, speak, draft, doVocal } = d;
  // A named refine ("make the drums hit harder", "rebuild the drop"): one of the old build's steps, as a job.
  const doRefine = useCallback(async (step: RefineStep, section?: string) => {
    const s = studio(); const line = REFINE_LINE[step];
    s.append("assistant", line); void speak(line);
    studioJobs.enqueue({ text: line, origin: "refine", songId: s.getSong().id }, async () => { await s.runAction({ type: "rollout", kind: step, section }, s.getSong(), line); return {}; });
  }, []);
  // A take of his own: the hum recorder today; the take recorder of Phase 10 keeps what he just said.
  const doTake = useCallback(async (what: "record" | "said") => {
    const s = studio();
    if (what === "record") { await s.runAction({ type: "recordHum", beats: 8, track: "lead" }, s.getSong(), "record me"); return; }
    const line = "Keeping what you just said needs the take recorder, and that is the next piece of work. For now say record me and I will count you in.";
    s.append("assistant", line); await speak(line);
  }, []);
  // Routing in code, on his own words, before any model hears them (lib/brain/route.ts).
  const routeWords = useCallback((t: string, heardAt: number): boolean => {
    const s = studio();
    const r = route(t, s.getSong());
    const dr = draft();
    if (r.kind === "draft" && dr) { s.append("user", t); dr.run(r.name, { surprise: r.surprise, heardAt }); return true; }
    if (r.kind === "next" && dr) { s.append("user", t); dr.next(null); return true; }
    if (r.kind === "voice") { s.append("user", t); void doVocal({ from: r.from, what: r.what, where: r.where }); return true; }
    if (r.kind === "take") { s.append("user", t); void doTake(r.what); return true; }
    if (r.kind === "refine") { s.append("user", t); void doRefine(r.step, r.section); return true; }
    return false;
  }, [doVocal, doTake, doRefine]);
  return { routeWords, doTake, doRefine };
}
