"use client";
// Self-test: render the seeds offline, run the ears, print JSON. Driven by tests/e2e.mjs.
import { useEffect, useState } from "react";
import { SEED_TECH_HOUSE, SEED_HARD_HOUSE, applyOps } from "@/lib/song";

export default function SelfTest() {
  const [out, setOut] = useState<string>("running");
  useEffect(() => {
    (async () => {
      const t0 = performance.now();
      if (location.search.includes("lab")) {
        const eng = await import("@/lib/engine"); const ears = await import("@/lib/ears"); const song = await import("@/lib/song");
        (window as unknown as { __lab: unknown }).__lab = { ...eng, ...ears, ...song };
        setOut("lab ready"); return;
      }
      const log = (m: string) => { console.log("selftest:", m); setOut(`${m} (${Math.round(performance.now() - t0)}ms)`); };
      try {
        const { hearSong, renderSong, scheduleEvents } = await import("@/lib/engine");
        const { hear } = await import("@/lib/ears");
        const results: Record<string, unknown> = {};
        // Stage A: a tiny render to prove the offline graph resolves at all.
        log("render kick-only 8s");
        const tiny = { ...SEED_TECH_HOUSE, tracks: SEED_TECH_HOUSE.tracks.filter((t) => t.role === "kick") };
        const tA = performance.now(); const bufA = await renderSong(tiny, 8); results.tinyMs = Math.round(performance.now() - tA); results.tinyLen = bufA.length;
        log("hear kick-only");
        const tB = performance.now(); const fB = hear([bufA.getChannelData(0), bufA.getChannelData(1)], bufA.sampleRate, { bpmHint: 126 }); results.hearTinyMs = Math.round(performance.now() - tB);
        results.tiny = { bpm: fB.tempo.bpm, lufs: fB.loudness.integrated, peak: fB.loudness.peak, kickDensity: fB.groove.kickDensity };
        for (const seed of [SEED_TECH_HOUSE, SEED_HARD_HOUSE]) {
          log(`hearSong ${seed.title} full`);
          const s0 = performance.now();
          const facts = await hearSong(seed, { maxSeconds: 150 });
          results[seed.title] = { ms: Math.round(performance.now() - s0), totalBeats: scheduleEvents(seed).totalBeats, tempo: facts.tempo, key: facts.key, loudness: facts.loudness, spectrum: facts.spectrum, groove: facts.groove, dropAt: facts.structure.dropAt, sections: facts.structure.sections.map((x) => [x.label, Math.round(x.start), Math.round(x.lufs * 10) / 10, x.hasKick]), chords: facts.chords.progression, read: facts.read };
        }
        log("edited solo bass");
        const edited = applyOps(SEED_TECH_HOUSE, [{ op: "set", track: "bass", path: "fx.filter.cutoff", value: 300 }, { op: "solo", track: "bass" }, { op: "tempo", bpm: 128 }]).song;
        const f2 = await hearSong(edited, { maxSeconds: 60 });
        results.editedSoloBass = { tempo: f2.tempo.bpm, kickDensity: f2.groove.kickDensity, sub: f2.spectrum.bands.sub, low: f2.spectrum.bands.low, lufs: f2.loudness.integrated };
        setOut(JSON.stringify({ ok: true, totalMs: Math.round(performance.now() - t0), results }));
      } catch (e) {
        setOut(JSON.stringify({ ok: false, error: e instanceof Error ? `${e.message}\n${e.stack}` : String(e) }));
      }
    })();
  }, []);
  return <pre id="result" className="whitespace-pre-wrap p-4 text-xs">{out}</pre>;
}
