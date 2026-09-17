// Finding the voice inside a voice. A separated vocal stem is mostly silence with phrases in it;
// this cuts it into those phrases, scores them the way a producer picks a hook, and works out where
// a chosen phrase has to start so that its last word lands on the downbeat of the drop.
//
// Nothing here touches the browser: it is arithmetic over samples, so it can be tested.

export type Phrase = { startSec: number; endSec: number; peakDb: number; rmsDb: number; score: number };

const DB = (x: number) => 20 * Math.log10(Math.max(1e-7, x));

/** RMS in dB per hop, the envelope a phrase shows up in. */
export function envelope(samples: Float32Array, sampleRate: number, hopSec = 0.01, winSec = 0.025): Float32Array {
  const hop = Math.max(1, Math.round(hopSec * sampleRate));
  const win = Math.max(hop, Math.round(winSec * sampleRate));
  const n = Math.max(0, Math.floor((samples.length - win) / hop) + 1);
  const out = new Float32Array(Math.max(0, n));
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const a = i * hop;
    for (let j = a; j < a + win; j++) sum += samples[j] * samples[j];
    out[i] = DB(Math.sqrt(sum / win));
  }
  return out;
}

function percentile(values: Float32Array, p: number): number {
  if (!values.length) return -120;
  const a = Array.from(values).sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * p)))];
}

export type PhraseOptions = { hopSec?: number; minSec?: number; maxSec?: number; joinSec?: number; overFloorDb?: number };

/** Every phrase in a vocal stem: where it starts, where it ends, how loud it is, how much of a hook it looks like. */
export function findPhrases(samples: Float32Array, sampleRate: number, opts: PhraseOptions = {}): Phrase[] {
  const hopSec = opts.hopSec ?? 0.01;
  const minSec = opts.minSec ?? 0.35;
  const maxSec = opts.maxSec ?? 6;
  const joinSec = opts.joinSec ?? 0.22;
  const env = envelope(samples, sampleRate, hopSec);
  if (env.length < 4) return [];
  const floor = percentile(env, 0.2);
  const loudest = Math.max(...env);
  // A phrase is well above the room the stem leaves behind, and within thirty dB of the loudest thing in it.
  const open = Math.max(floor + (opts.overFloorDb ?? 12), loudest - 30);
  const close = open - 6;
  const join = Math.max(1, Math.round(joinSec / hopSec));

  const spans: [number, number][] = [];
  let inPhrase = false, from = 0, quiet = 0;
  for (let i = 0; i < env.length; i++) {
    if (!inPhrase) { if (env[i] >= open) { inPhrase = true; from = i; quiet = 0; } continue; }
    if (env[i] >= close) { quiet = 0; continue; }
    if (++quiet >= join) { spans.push([from, i - quiet]); inPhrase = false; }
  }
  if (inPhrase) spans.push([from, env.length - 1]);

  const out: Phrase[] = [];
  for (const [a, b] of spans) {
    const startSec = a * hopSec, endSec = Math.min((b + 1) * hopSec, samples.length / sampleRate);
    const len = endSec - startSec;
    if (len < minSec) continue;
    let peak = -120, sum = 0, n = 0;
    for (let i = a; i <= b && i < env.length; i++) { if (env[i] > peak) peak = env[i]; sum += env[i]; n++; }
    const rms = n ? sum / n : -120;
    // A phrase longer than the cap is kept, cut to its loudest window: hooks are short, verses are not.
    const use = Math.min(len, maxSec);
    out.push({ startSec, endSec: startSec + use, peakDb: peak, rmsDb: rms, score: 0 });
  }
  // The pick a producer would make: loud, and long enough to be a line rather than a breath.
  const top = out.length ? Math.max(...out.map((p) => p.rmsDb)) : 0;
  for (const p of out) {
    const loud = Math.max(0, Math.min(1, 1 - (top - p.rmsDb) / 18));
    const len = Math.min(1, (p.endSec - p.startSec) / 2);
    p.score = Math.round((loud * 0.65 + len * 0.35) * 1000) / 1000;
  }
  return out.sort((a, b) => a.startSec - b.startSec);
}

/** The phrase the ask points at: the words if they quoted any, otherwise the strongest hook. */
export function pickPhrase(phrases: Phrase[], opts?: { words?: { at: number; text: string }[]; said?: string | null; nth?: number }): Phrase | null {
  if (!phrases.length) return null;
  const said = (opts?.said ?? "").toLowerCase().replace(/["'']/g, "").trim();
  if (said && opts?.words?.length) {
    const hit = opts.words.find((w) => w.text.toLowerCase().includes(said) || said.includes(w.text.toLowerCase().slice(0, 24)));
    if (hit) {
      const near = phrases.reduce((best, p) => (Math.abs(p.startSec - hit.at) < Math.abs(best.startSec - hit.at) ? p : best), phrases[0]);
      return near;
    }
  }
  const ranked = [...phrases].sort((a, b) => b.score - a.score);
  return ranked[Math.min(ranked.length - 1, Math.max(0, opts?.nth ?? 0))] ?? null;
}

const PC: Record<string, number> = { c: 0, "c#": 1, db: 1, d: 2, "d#": 3, eb: 3, e: 4, f: 5, "f#": 6, gb: 6, g: 7, "g#": 8, ab: 8, a: 9, "a#": 10, bb: 10, b: 11 };

/** How far to move a phrase so it sits in the record's key, or null when that would wreck the voice. */
export function tuneFor(rootMidi: number | null, songKey: string, limit = 3): number | null {
  if (rootMidi === null || !Number.isFinite(rootMidi)) return null;
  const root = PC[songKey.trim().split(/\s+/)[0].toLowerCase()];
  if (root === undefined) return null;
  let diff = ((root - Math.round(rootMidi)) % 12 + 12) % 12;
  if (diff > 6) diff -= 12;
  return Math.abs(diff) <= limit ? diff : null;
}

/** Where in its own section a phrase has to start so its last word lands on the next downbeat. */
export function leadIn(sectionBeats: number, phraseBeats: number, beforeBeats = 0): { startBeat: number; cut: boolean } {
  const want = sectionBeats - phraseBeats - beforeBeats;
  return { startBeat: Math.max(0, want), cut: want < 0 };
}
