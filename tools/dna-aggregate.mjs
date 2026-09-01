#!/usr/bin/env node
// Aggregate data/library/*.json (one MusicFacts record per track, written by tools/dna.mjs) into
// the lane DNA the app reads:
//   data/dna.json             per-lane and overall distributions (tempo, key, loudness, spectrum,
//                             groove, structure, energy contour, Roman-numeral progressions)
//   data/reference-index.json one row per measured track so the app can look a track up by name
//   data/dna-summary.md       readable per-lane summary
//   data/dna-validation.md    tag-vs-measured table for every tagged track plus hit rates
// Plain Node, no dependencies:  node tools/dna-aggregate.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIB = join(REPO, "data", "library");
const NOTES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const NOTE_INDEX = (n) => { const flat = { "C#": "Db", "D#": "Eb", "Gb": "F#", "G#": "Ab", "A#": "Bb" }; return NOTES.indexOf(flat[n] ?? n); };
const LANES = ["tech-house", "hard-house", "melodic", "dnb-or-halftime", "other"];

// ---------- lanes ----------
function laneOfBpm(b) {
  if (!Number.isFinite(b)) return null;
  if (b >= 120 && b <= 131) return "tech-house";
  if (b >= 136 && b <= 148) return "hard-house";
  if (b >= 110 && b <= 119) return "melodic";
  if (b >= 160 && b <= 180) return "dnb-or-halftime";
  return null;
}
export function laneOf(tempo) {
  const cands = [tempo.bpm, tempo.alt, tempo.bpm * 2, tempo.bpm / 2];
  for (const c of cands) { const l = laneOfBpm(c); if (l) return { lane: l, laneBpm: Math.round(c * 100) / 100 }; }
  return { lane: "other", laneBpm: tempo.bpm };
}

// ---------- small stats ----------
const sorted = (xs) => xs.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
function pct(xs, p) {
  const s = sorted(xs);
  if (s.length === 0) return null;
  const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
const r = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const P3 = (xs, d = 2) => ({ p25: r(pct(xs, 0.25), d), p50: r(pct(xs, 0.5), d), p75: r(pct(xs, 0.75), d) });
const P10 = (xs, d = 2) => ({ p10: r(pct(xs, 0.1), d), p50: r(pct(xs, 0.5), d), p90: r(pct(xs, 0.9), d) });
const mean = (xs) => { const s = sorted(xs); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null; };

function resample(arr, n) {
  if (!arr || arr.length === 0) return null;
  if (arr.length === n) return arr.slice();
  if (arr.length < n) return Array.from({ length: n }, (_, i) => { const x = (i * (arr.length - 1)) / (n - 1); const a = Math.floor(x), b = Math.min(arr.length - 1, a + 1); return arr[a] + (arr[b] - arr[a]) * (x - a); });
  return Array.from({ length: n }, (_, i) => { const a = Math.floor((i * arr.length) / n), b = Math.max(a + 1, Math.floor(((i + 1) * arr.length) / n)); let s = 0; for (let k = a; k < b; k++) s += arr[k]; return s / (b - a); });
}

// ---------- keys and chords ----------
export function relativeOf(name) {
  const [tonic, mode] = (name ?? "").split(" ");
  const i = NOTE_INDEX(tonic);
  if (i < 0) return "";
  return mode === "minor" ? `${NOTES[(i + 3) % 12]} major` : `${NOTES[(i + 9) % 12]} minor`;
}
export function camelotOf(name) {
  const [tonic, mode] = (name ?? "").split(" ");
  const minors = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "Db"];
  const majors = ["B", "F#", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];
  const i = (mode === "minor" ? minors : majors).indexOf(tonic);
  return i < 0 ? "" : `${i + 1}${mode === "minor" ? "A" : "B"}`;
}
const DEG_MINOR = ["I", "bII", "II", "bIII", "III", "IV", "bV", "V", "bVI", "VI", "bVII", "VII"];
const DEG_MAJOR = ["I", "bII", "II", "bIII", "III", "IV", "#IV", "V", "bVI", "VI", "bVII", "VII"];
export function roman(chord, key) {
  const m = /^([A-G][b#]?)(m?)$/.exec(chord ?? "");
  if (!m) return null;
  const root = NOTE_INDEX(m[1]), tonic = NOTE_INDEX(key.tonic);
  if (root < 0 || tonic < 0) return null;
  const d = (root - tonic + 12) % 12;
  const deg = (key.mode === "minor" ? DEG_MINOR : DEG_MAJOR)[d];
  return m[2] === "m" ? deg.toLowerCase() : deg;
}
export const romanProgression = (prog, key) => prog.map((c) => roman(c, key)).filter(Boolean);

function topCounts(map, n, total) {
  return [...map.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0])).slice(0, n)
    .map(([k, v]) => ({ [v.label ?? "value"]: k, n: v.n, share: total ? r(v.n / total, 3) : undefined, ...(v.examples ? { examples: v.examples.slice(0, 3) } : {}) }));
}

// ---------- per-lane aggregate ----------
function aggregate(rows) {
  const n = rows.length;
  if (n === 0) return { n: 0 };
  const F = rows.map((t) => t.facts);
  const keyMap = new Map();
  for (const f of F) { const k = f.key.name; keyMap.set(k, { n: (keyMap.get(k)?.n ?? 0) + 1, label: "key" }); }
  const camMap = new Map();
  for (const f of F) { const k = camelotOf(f.key.name); if (k) camMap.set(k, { n: (camMap.get(k)?.n ?? 0) + 1, label: "camelot" }); }
  const minor = F.filter((f) => f.key.mode === "minor").length;
  // Keys the ears were sure about (confidence = profile-correlation margin over the runner-up).
  const confident = F.filter((f) => f.key.confidence >= 0.1);
  const confMap = new Map();
  for (const f of confident) { const k = f.key.name; confMap.set(k, { n: (confMap.get(k)?.n ?? 0) + 1, label: "key" }); }
  const band = (name) => P3(F.map((f) => f.spectrum.bands[name]), 3);
  const drops = rows.map((t) => ({ t, s: t.facts.structure.sections.find((s) => s.label === "drop") })).filter((x) => x.s);
  const dropBars = drops.map(({ t, s }) => (s.end - s.start) / (240 / t.facts.tempo.bpm));
  const dropFrac = drops.map(({ t, s }) => s.start / Math.max(t.durationSec, t.facts.duration));
  const contours = rows.map((t) => resample(t.facts.structure.energy, 16)).filter(Boolean);
  const bins = Array.from({ length: 16 }, (_, i) => contours.map((c) => c[i]));
  const progMap = new Map();
  const ngramMaps = { 2: new Map(), 3: new Map(), 4: new Map() };
  for (const t of rows) {
    const rp = romanProgression(t.facts.chords.progression, t.facts.key);
    if (rp.length === 0) continue;
    const key = rp.join("-");
    const e = progMap.get(key) ?? { n: 0, label: "progression", examples: [] };
    e.n++; if (e.examples.length < 3) e.examples.push(cleanName(t.name));
    progMap.set(key, e);
    for (const L of [2, 3, 4]) {
      const seen = new Set();
      for (let i = 0; i + L <= rp.length; i++) seen.add(rp.slice(i, i + L).join("-"));
      for (const g of seen) { const g2 = ngramMaps[L].get(g) ?? { n: 0, label: "progression" }; g2.n++; ngramMaps[L].set(g, g2); }
    }
  }
  const dropFound = drops.length;
  return {
    n,
    tempo: { ...P10(F.map((f) => f.tempo.bpm), 1), laneBpm: P10(rows.map((t) => t.laneBpm), 1), confidence: { p50: r(pct(F.map((f) => f.tempo.confidence), 0.5), 3) } },
    keys: {
      top: topCounts(keyMap, 8, n), topCamelot: topCounts(camMap, 8, n), minorShare: r(minor / n, 3),
      confidence: { p50: r(pct(F.map((f) => f.key.confidence), 0.5), 3) },
      confident: { n: confident.length, minConfidence: 0.1, top: topCounts(confMap, 8, confident.length), minorShare: confident.length ? r(confident.filter((f) => f.key.mode === "minor").length / confident.length, 3) : null },
    },
    loudness: {
      integrated: P10(F.map((f) => f.loudness.integrated), 1),
      shortTermMax: { p50: r(pct(F.map((f) => f.loudness.shortTermMax), 0.5), 1) },
      range: { p50: r(pct(F.map((f) => f.loudness.range), 0.5), 1) },
      crest: { p50: r(pct(F.map((f) => f.loudness.crest), 0.5), 1) },
      peak: { p50: r(pct(F.map((f) => f.loudness.peak), 0.5), 1) },
    },
    spectrum: {
      bands: { sub: band("sub"), low: band("low"), lowMid: band("lowMid"), mid: band("mid"), highMid: band("highMid"), air: band("air") },
      subPlusLow: P3(F.map((f) => f.spectrum.bands.sub + f.spectrum.bands.low), 3),
      centroidHz: P3(F.map((f) => f.spectrum.centroidHz), 0),
      mud: { p50: r(pct(F.map((f) => f.spectrum.mud), 0.5), 3) },
      harshness: { p50: r(pct(F.map((f) => f.spectrum.harshness), 0.5), 3) },
      width: { p50: r(pct(F.map((f) => f.spectrum.width), 0.5), 3) },
    },
    groove: {
      swing: P3(F.map((f) => f.groove.swing), 3),
      pump: P3(F.map((f) => f.groove.pump), 3),
      kickDensity: { p50: r(pct(F.map((f) => f.groove.kickDensity), 0.5), 2) },
      transientsPerBeat: { p50: r(pct(F.map((f) => f.groove.transientsPerBeat), 0.5), 2) },
      fourOnFloorShare: r(F.filter((f) => f.groove.kickDensity >= 3.5).length / n, 3),
    },
    structure: {
      dropFoundShare: r(dropFound / n, 3),
      dropAtSec: { p50: r(pct(drops.map(({ s }) => s.start), 0.5), 1) },
      dropFraction: { p50: r(pct(dropFrac, 0.5), 3) },
      firstDropBars: { p50: r(pct(dropBars, 0.5), 1) },
      sections: { p50: r(pct(F.map((f) => f.structure.sections.length), 0.5), 1) },
      barsAnalysed: { p50: r(pct(F.map((f) => f.structure.barsTotal), 0.5), 0) },
      durationSec: { p50: r(pct(rows.map((t) => t.durationSec), 0.5), 0) },
    },
    energyContour: {
      bins: 16,
      mean: bins.map((b) => r(mean(b), 3)),
      p25: bins.map((b) => r(pct(b, 0.25), 3)),
      p75: bins.map((b) => r(pct(b, 0.75), 3)),
    },
    progressions: {
      top: topCounts(progMap, 12, n),
      ngrams: { 2: topCounts(ngramMaps[2], 12, n), 3: topCounts(ngramMaps[3], 12, n), 4: topCounts(ngramMaps[4], 12, n) },
    },
  };
}

// ---------- names ----------
export function cleanName(file) {
  let stem = file.replace(/\.[^.]+$/, "");
  stem = stem.replace(/^\d{2,3}\s+\d{1,2}[AB]\s+-\s+/i, "");
  stem = stem.replace(/\s+\d{1,2}[AB]\s+\d{2,3}$/i, "");
  stem = stem.replace(/^(.*?)_\d{2,3}_\d{1,2}[AB]$/i, "$1");
  return stem.replace(/\s+/g, " ").trim();
}
function artistTitle(t) {
  const name = cleanName(t.name);
  const id3Artist = t.id3?.artist && !/ezmp3|getmp3|www\./i.test(t.id3.artist) ? t.id3.artist.trim() : null;
  const parts = name.split(/\s+-\s+/);
  const artist = id3Artist ?? (parts.length >= 2 ? parts[0].trim() : null);
  const title = parts.length >= 2 && artist && name.toLowerCase().startsWith(parts[0].toLowerCase()) ? parts.slice(1).join(" - ").trim() : name;
  return { name, artist, title };
}

// ---------- validation ----------
function validate(rows) {
  const tagged = rows.filter((t) => t.tagBpm != null || t.tagKey);
  const lines = [];
  const tally = { tempoN: 0, tempoExact: 0, tempoOctave: 0, keyN: 0, keyExact: 0, keyRelative: 0, keyAlt: 0 };
  const byTier = {};
  for (const t of tagged) {
    const f = t.facts;
    let tv = "-", kv = "-";
    const tier = byTier[t.tier] ??= { tempoN: 0, tempoHit: 0, keyN: 0, keyHit: 0 };
    if (t.tagBpm != null) {
      tally.tempoN++; tier.tempoN++;
      const d = (x) => Math.abs(x - t.tagBpm);
      if (d(f.tempo.bpm) <= 2) { tv = "exact"; tally.tempoExact++; tier.tempoHit++; }
      else if (d(f.tempo.alt) <= 2 || d(f.tempo.bpm * 2) <= 2 || d(f.tempo.bpm / 2) <= 2) { tv = "octave"; tally.tempoOctave++; tier.tempoHit++; }
      else tv = "MISS";
    }
    if (t.tagKey) {
      tally.keyN++; tier.keyN++;
      if (f.key.name === t.tagKey) { kv = "exact"; tally.keyExact++; tier.keyHit++; }
      else if (f.key.name === relativeOf(t.tagKey)) { kv = "relative"; tally.keyRelative++; tier.keyHit++; }
      else if (f.key.alt === t.tagKey) { kv = "alt"; tally.keyAlt++; }
      else kv = "MISS";
    }
    lines.push({ name: cleanName(t.name).slice(0, 58), tier: t.tier, tagBpm: t.tagBpm ?? "", bpm: f.tempo.bpm, alt: f.tempo.alt, tempo: tv, tagKey: t.tagKey ?? "", key: f.key.name, keyAlt: f.key.alt, keyConf: f.key.confidence, keyV: kv });
  }
  const tempoRate = tally.tempoN ? (tally.tempoExact + tally.tempoOctave) / tally.tempoN : null;
  const keyRate = tally.keyN ? (tally.keyExact + tally.keyRelative) / tally.keyN : null;
  return { lines, tally, byTier, tempoRate, keyRate, tagged: tagged.length };
}

// ---------- summary markdown ----------
function fmtProg(list) { return list.map((p) => `${p.progression} (${p.n})`).join("; "); }
function laneSummary(lane, a) {
  if (!a.n) return `## ${lane}\n\nNo tracks.\n`;
  const b = a.spectrum.bands;
  const keys = a.keys.top.map((k) => `${k.key} ${Math.round(k.share * 100)}%`).join(", ");
  return [
    `## ${lane} (n = ${a.n})`,
    ``,
    `| measure | value |`,
    `| --- | --- |`,
    `| tempo p10 / p50 / p90 | ${a.tempo.p10} / ${a.tempo.p50} / ${a.tempo.p90} BPM |`,
    `| keys (top) | ${keys} |`,
    `| minor share | ${Math.round(a.keys.minorShare * 100)}% |`,
    `| keys with confidence >= 0.1 (n = ${a.keys.confident.n}) | ${a.keys.confident.top.map((k) => `${k.key} ${Math.round(k.share * 100)}%`).join(", ") || "none"} |`,
    `| integrated LUFS p10 / p50 / p90 | ${a.loudness.integrated.p10} / ${a.loudness.integrated.p50} / ${a.loudness.integrated.p90} |`,
    `| loudness range p50 | ${a.loudness.range.p50} LU |`,
    `| crest p50 / peak p50 | ${a.loudness.crest.p50} dB / ${a.loudness.peak.p50} dBFS |`,
    `| bands p50 sub / low / lowMid / mid / highMid / air | ${b.sub.p50} / ${b.low.p50} / ${b.lowMid.p50} / ${b.mid.p50} / ${b.highMid.p50} / ${b.air.p50} |`,
    `| sub + low p50 | ${a.spectrum.subPlusLow.p50} |`,
    `| centroid p25 / p50 / p75 | ${a.spectrum.centroidHz.p25} / ${a.spectrum.centroidHz.p50} / ${a.spectrum.centroidHz.p75} Hz |`,
    `| mud / harshness / width p50 | ${a.spectrum.mud.p50} / ${a.spectrum.harshness.p50} / ${a.spectrum.width.p50} |`,
    `| swing p25 / p50 / p75 | ${a.groove.swing.p25} / ${a.groove.swing.p50} / ${a.groove.swing.p75} |`,
    `| pump p25 / p50 / p75 | ${a.groove.pump.p25} / ${a.groove.pump.p50} / ${a.groove.pump.p75} |`,
    `| kick density p50 / transients per beat p50 | ${a.groove.kickDensity.p50} / ${a.groove.transientsPerBeat.p50} |`,
    `| four on the floor share (kicks per bar >= 3.5) | ${Math.round(a.groove.fourOnFloorShare * 100)}% |`,
    `| drop found | ${Math.round(a.structure.dropFoundShare * 100)}% of tracks |`,
    `| first drop at p50 | ${a.structure.dropAtSec.p50} s, ${Math.round((a.structure.dropFraction.p50 ?? 0) * 100)}% of the track |`,
    `| first drop length p50 | ${a.structure.firstDropBars.p50} bars |`,
    `| sections p50 | ${a.structure.sections.p50} |`,
    `| energy contour (16 bins, mean) | ${a.energyContour.mean.join(" ")} |`,
    ``,
    `Top progressions (whole condensed progression, Roman numerals relative to the detected key): ${fmtProg(a.progressions.top.slice(0, 8)) || "none"}.`,
    ``,
    `Most common 2-chord moves: ${fmtProg(a.progressions.ngrams[2].slice(0, 8)) || "none"}.`,
    ``,
    `Most common 4-chord runs: ${fmtProg(a.progressions.ngrams[4].slice(0, 6)) || "none"}.`,
    ``,
  ].join("\n");
}

// ---------- main ----------
function main() {
  const files = readdirSync(LIB).filter((f) => f.endsWith(".json"));
  const rows = [];
  for (const f of files) {
    try {
      const t = JSON.parse(readFileSync(join(LIB, f), "utf8"));
      if (!t.facts?.tempo) continue;
      const { lane, laneBpm } = laneOf(t.facts.tempo);
      rows.push({ ...t, id: f.slice(0, -5), lane, laneBpm });
    } catch { /* skip unreadable */ }
  }
  const byLane = Object.fromEntries(LANES.map((l) => [l, rows.filter((t) => t.lane === l)]));
  const tiers = {};
  for (const t of rows) tiers[t.tier] = (tiers[t.tier] ?? 0) + 1;
  const v = validate(rows);
  const dna = {
    builtAt: new Date().toISOString(), tracks: rows.length, tiers,
    validation: { tagged: v.tagged, tempoRate: r(v.tempoRate, 3), keyRate: r(v.keyRate, 3), tally: v.tally, byTier: v.byTier },
    laneRule: "measured BPM: tech-house 120-131, hard-house 136-148, melodic 110-119, dnb-or-halftime 160-180; the alternate tempo (half or double) is tried when the primary lands nowhere; else other",
    notes: [
      "Facts come from lib/ears hear() on the first 240 s of each track, mono 22050 Hz, with the filename BPM tag passed as bpmHint.",
      "dropFraction divides the first drop start by the full track duration, not the analysed 240 s.",
      "Progressions are the track's condensed chords.progression rewritten as Roman numerals relative to the detected key (case follows chord quality; flats are relative to the major scale, so natural minor reads i, bIII, iv, v, bVI, bVII). ngrams count each distinct run once per track.",
      "Lanes are tempo bands only: a hip-hop edit at 126 BPM lands in tech-house. Use tier and fourOnFloorShare to filter when that matters.",
    ],
    all: aggregate(rows),
    lanes: Object.fromEntries(LANES.map((l) => [l, aggregate(byLane[l])])),
  };
  writeFileSync(join(REPO, "data", "dna.json"), JSON.stringify(dna, null, 1));

  const index = rows.map((t) => {
    const { name, artist, title } = artistTitle(t);
    const f = t.facts;
    return {
      name, artist, title, bpm: f.tempo.bpm, altBpm: f.tempo.alt, key: f.key.name, camelot: camelotOf(f.key.name), keyConfidence: f.key.confidence,
      lufs: f.loudness.integrated, dropAt: f.structure.dropAt, lane: t.lane, laneBpm: t.laneBpm,
      tagBpm: t.tagBpm ?? null, tagKey: t.tagKey ?? null, durationSec: t.durationSec, tier: t.tier, id: t.id, path: t.path,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  writeFileSync(join(REPO, "data", "reference-index.json"), JSON.stringify(index, null, 1));

  const tierLines = Object.entries(v.byTier).map(([tier, s]) => `| ${tier} | ${s.tempoN} | ${s.tempoN ? Math.round((100 * s.tempoHit) / s.tempoN) : "-"}% | ${s.keyN} | ${s.keyN ? Math.round((100 * s.keyHit) / s.keyN) : "-"}% |`);
  const vmd = [
    `# Tag versus measured`,
    ``,
    `${v.tagged} tagged tracks of ${rows.length} measured. Tempo hit = measured BPM within 2 of the tag, or an exact half/double (via alt or 2x/0.5x). Key hit = exact or relative major/minor. "alt" means the ears' second choice matched the tag (counted as a miss).`,
    ``,
    `| | n | hit |`,
    `| --- | --- | --- |`,
    `| tempo | ${v.tally.tempoN} | ${v.tempoRate == null ? "-" : Math.round(v.tempoRate * 100)}% (exact ${v.tally.tempoExact}, octave ${v.tally.tempoOctave}) |`,
    `| key | ${v.tally.keyN} | ${v.keyRate == null ? "-" : Math.round(v.keyRate * 100)}% (exact ${v.tally.keyExact}, relative ${v.tally.keyRelative}, alt-only ${v.tally.keyAlt}) |`,
    ``,
    `| tier | tempo n | tempo hit | key n | key hit |`,
    `| --- | --- | --- | --- | --- |`,
    ...tierLines,
    ``,
    `Note: the tag BPM is also passed to hear() as bpmHint, so the tempo agreement is not independent. The DJ LIBRARY tags themselves came from an earlier automated analysis, not a human.`,
    ``,
    `| track | tier | tag BPM | BPM | alt | tempo | tag key | key | key alt | conf | key |`,
    `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
    ...v.lines.map((l) => `| ${l.name.replace(/\|/g, "/")} | ${l.tier} | ${l.tagBpm} | ${l.bpm} | ${l.alt} | ${l.tempo} | ${l.tagKey} | ${l.key} | ${l.keyAlt} | ${l.keyConf} | ${l.keyV} |`),
    ``,
  ].join("\n");
  writeFileSync(join(REPO, "data", "dna-validation.md"), vmd);

  const smd = [
    `# Lane DNA summary`,
    ``,
    `Built ${dna.builtAt} from ${rows.length} measured tracks (${Object.entries(tiers).map(([k, n]) => `${k} ${n}`).join(", ")}).`,
    `Lane rule: ${dna.laneRule}.`,
    `Lane sizes: ${LANES.map((l) => `${l} ${byLane[l].length}`).join(", ")}.`,
    `Tag agreement: tempo ${v.tempoRate == null ? "-" : Math.round(v.tempoRate * 100)}% of ${v.tally.tempoN}, key ${v.keyRate == null ? "-" : Math.round(v.keyRate * 100)}% of ${v.tally.keyN} (see dna-validation.md).`,
    ``,
    ...LANES.map((l) => laneSummary(l, dna.lanes[l])),
    laneSummary("all", dna.all),
  ].join("\n");
  writeFileSync(join(REPO, "data", "dna-summary.md"), smd);

  // console output: validation table for every tagged track, then the headline
  console.log(`tag vs measured (${v.tagged} tagged of ${rows.length} measured)`);
  console.table(v.lines.map(({ name, tagBpm, bpm, alt, tempo, tagKey, key, keyV }) => ({ name, tagBpm, bpm, alt, tempo, tagKey, key, keyV })));
  console.log(`tempo hit ${v.tally.tempoExact + v.tally.tempoOctave}/${v.tally.tempoN} = ${v.tempoRate == null ? "-" : (v.tempoRate * 100).toFixed(1)}% (exact ${v.tally.tempoExact}, octave ${v.tally.tempoOctave})`);
  console.log(`key hit ${v.tally.keyExact + v.tally.keyRelative}/${v.tally.keyN} = ${v.keyRate == null ? "-" : (v.keyRate * 100).toFixed(1)}% (exact ${v.tally.keyExact}, relative ${v.tally.keyRelative}, alt-only ${v.tally.keyAlt})`);
  for (const [tier, s] of Object.entries(v.byTier)) console.log(`  ${tier}: tempo ${s.tempoHit}/${s.tempoN}, key ${s.keyHit}/${s.keyN}`);
  if (v.tempoRate != null && v.tempoRate < 0.85) console.log("WARNING: tempo agreement below 85%. Check decode and hints before trusting the aggregate.");
  if (v.keyRate != null && v.keyRate < 0.7) console.log("WARNING: key agreement below 70%. Check decode before trusting the aggregate.");
  console.log(`lanes: ${LANES.map((l) => `${l} ${byLane[l].length}`).join(", ")}`);
  for (const l of [...LANES, "all"]) {
    const a = l === "all" ? dna.all : dna.lanes[l];
    if (!a.n) continue;
    console.log(`${l.padEnd(16)} n ${String(a.n).padStart(3)}  bpm ${a.tempo.p50}  lufs ${a.loudness.integrated.p50}  sub+low ${a.spectrum.subPlusLow.p50}  pump ${a.groove.pump.p50}  swing ${a.groove.swing.p50}  drop ${a.structure.dropAtSec.p50}s (${a.structure.dropFraction.p50})  dropBars ${a.structure.firstDropBars.p50}`);
  }
  console.log(`wrote data/dna.json, data/reference-index.json (${index.length}), data/dna-summary.md, data/dna-validation.md`);
}

const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === (await import("node:fs")).realpathSync(process.argv[1]);
if (isEntry) main();
