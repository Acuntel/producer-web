"use client";
// The studio's harness hooks, under ?e2e=1 or ?voice=1 only: a probe reads the real output levels, the engine, the
// ears and the record, and edits it the way a studio surface does, so "can you hear it" is a measurement.
import { useEffect, type MutableRefObject } from "react";
import type { Engine } from "@/lib/engine";
import type { MusicFacts } from "@/lib/ears";
import type { Song } from "@/lib/song";

const isE2E = () => typeof window !== "undefined" && /[?&](e2e|voice)=1/.test(window.location.search);
type Refs = { engine: MutableRefObject<Engine | null>; facts: MutableRefObject<MusicFacts | null>; song: MutableRefObject<Song>; edit: MutableRefObject<(ops: unknown[], label: string) => Promise<boolean>>; newSession: MutableRefObject<() => Promise<void>> };

export function useStudioHarness(r: Refs) {
  useEffect(() => {
    if (!isE2E()) return;
    const w = window as unknown as Record<string, unknown>;
    w.__levels = () => r.engine.current?.getLevels() ?? null;
    w.__audio = () => r.engine.current?.health() ?? null;   // dropouts, graphs alive, rebuild cost
    w.__engine = () => r.engine.current;
    w.__facts = () => r.facts.current;
    w.__edit = (ops: unknown[], label: string) => r.edit.current(ops, label);   // tests/bars.probe.mjs
    w.__song = () => r.song.current;
    w.__newRecord = () => r.newSession.current();   // tests/draft.probe.mjs starts each name from a silent record
    w.__engineModule = () => import("@/lib/engine");
    w.__deskModule = () => import("@/lib/engine/deskProbe");   // tests/desk.probe.mjs: the seed through the offline replica of the room
    // Where a listen spends its time, so a stutter is traced and not guessed at.
    void import("@/lib/engine").then((m) => { w.__ears = () => m.hearTiming; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
