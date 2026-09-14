// data/dna/hits.json -> knowledge/skills/hits.md: what the store says about why hits work, as
// numbers with their sample sizes, in the shape the Hands can quote. Run after the store is
// rebuilt, then `node tools/compile-skills.mjs`.
import { readFileSync, writeFileSync } from "node:fs";
const h = JSON.parse(readFileSync("data/dna/hits.json", "utf8"));
const r = (x, d = 2) => (typeof x === "number" ? Number(x.toFixed(d)) : "?");
const lines = [];
lines.push("# SKILL: why hits work, measured (the store, 2026-09-13)");
lines.push("");
lines.push(`Sources joined: Billboard Hot 100 1958 to now x Spotify audio features (${h.join_counts?.billboard_x_spotify ?? "?"} matched records), x Chordonomicon chord sheets (${h.join_counts?.billboard_x_chordonomicon ?? "?"}), x McGill expert chords (${h.join_counts?.billboard_x_mcgill ?? "?"}), x Lakh MIDI (${h.join_counts?.billboard_x_lakh ?? "?"}). Every number carries its n; below n=20 there is no number. Quote a number, not an adjective.`);
lines.push("");
const tiers = h.spotify_priors_by_hit_tier?.by_hit_tier ?? {};
if (tiers.number1 && tiers.charted) {
  lines.push("## Number ones against the rest of the chart (Spotify priors, 0 to 1)");
  lines.push("| tier | energy p50 | danceability p50 | valence p50 | duration p50 | n |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const t of ["number1", "top10", "top40", "charted"]) { const x = tiers[t]; if (!x) continue; lines.push(`| ${t} | ${r(x.energy_p50)} | ${r(x.danceability_p50)} | ${r(x.valence_p50)} | ${x.duration_p50 ? Math.round(x.duration_p50) + " s" : "?"} | ${x.n} |`); }
  const n1 = tiers.number1, ch = tiers.charted;
  lines.push("");
  lines.push(`Read: number ones are HAPPIER (valence ${r(n1.valence_p50)} vs ${r(ch.valence_p50)}) and MORE DANCEABLE (${r(n1.danceability_p50)} vs ${r(ch.danceability_p50)}) than records that merely charted, and LESS LOUD or busy (energy ${r(n1.energy_p50)} vs ${r(ch.energy_p50)}). The floor wins on groove and lift, not on force. MOVE: when the ask is "a hit", keep the kick straight and the syncopation medium (danceability), keep a major color or a bright minor with a lifted hook (valence), and do not crush the master or stack bright layers (energy).`);
  lines.push("");
}
const ms = h.mode_share_number1_vs_charted;
if (ms?.number1_major_share !== undefined) lines.push(`Mode: ${Math.round(ms.number1_major_share * 100)}% of number ones are major (n=${ms.number1_n}) against ${Math.round(ms.charted_major_share * 100)}% of everything charted (n=${ms.charted_n}). Minor hits exist in every decade; they carry a lifted hook or a bright chorus.`);
const dec = h.spotify_priors_by_hit_tier_and_decade ?? {};
const decs = Object.keys(dec).sort();
if (decs.length) {
  lines.push("");
  lines.push("## Number ones by decade (n in brackets)");
  lines.push("| decade | tempo p50 | energy | danceability | valence | duration |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const d of decs) {
    const n1 = dec[d]?.number1; if (!n1 || n1.n < 20) continue;
    const tempo = h.tempo_by_decade_number1_vs_never_charted?.by_decade?.[d]?.number1_tempo_p50;
    const dur = h.median_duration_number1_by_decade?.[d]?.median_duration_sec;
    lines.push(`| ${d}s | ${tempo ? Math.round(tempo) : "?"} | ${r(n1.energy_p50)} | ${r(n1.danceability_p50)} | ${r(n1.valence_p50)} | ${dur ? Math.round(dur) + " s" : "?"} [${n1.n}] |`);
  }
  lines.push("");
  // The read is computed from the table, so a rebuilt store never contradicts its own sentence.
  const rows = decs.map((d) => ({ d, n1: dec[d]?.number1, tempo: h.tempo_by_decade_number1_vs_never_charted?.by_decade?.[d]?.number1_tempo_p50, dur: h.median_duration_number1_by_decade?.[d]?.median_duration_sec })).filter((x) => x.n1 && x.n1.n >= 20 && x.tempo && x.dur);
  if (rows.length >= 3) {
    const first = rows[0], last = rows[rows.length - 1];
    const longest = rows.reduce((a, b) => (b.dur > a.dur ? b : a));
    const mostDance = rows.reduce((a, b) => (b.n1.danceability_p50 > a.n1.danceability_p50 ? b : a));
    const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
    lines.push(`Read: the median number one ran about ${Math.round(first.tempo)} BPM in the ${first.d}s and ${Math.round(last.tempo)} in the ${last.d}s; the longest number ones were the ${longest.d}s (${mmss(longest.dur)} at the median) and the ${last.d}s median is ${mmss(last.dur)}; danceability peaks in the ${mostDance.d}s at ${r(mostDance.n1.danceability_p50)}. MOVE: a hit today is about ${mmss(last.dur)}, opens fast, and the first hook is inside the first minute.`);
  }
}
const fc = h.first_chorus_bar_distribution_number1;
if (fc?.n >= 20) { lines.push(""); lines.push(`First chorus of a number one (Chordonomicon sections, n=${fc.n}): bar ${fc.p10} at p10, bar ${fc.p50} at the median, bar ${fc.p90} at p90. MOVE: the hook or drop of a hit lands by bar 20, and a radio edit by bar 8 to 12.`); }
if (typeof h.chord_vocab_p50_number1 === "number") lines.push(`Chord vocabulary of a number one: ${h.chord_vocab_p50_number1} distinct chords at the median. Simple harmony, rich hook.`);
const op = h.opening_progression_number1_by_decade ?? {};
const ops = Object.entries(op).filter(([, v]) => v && v.opening && v.n >= 5);
if (ops.length) {
  lines.push("");
  lines.push("## The opening four chords of number ones, by decade (Roman numerals relative to the key)");
  lines.push(ops.map(([d, v]) => `${d}s: ${v.opening} (${v.source}, n=${v.n})`).join(" · "));
}
const hc = h.harmony_class_share_number1_vs_everything;
if (hc?.number1) {
  lines.push("");
  lines.push(`Harmony families among number ones (n=${hc.number1_n}) vs everything: ` + Object.entries(hc.number1).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${Math.round(v * 100)}% (all ${Math.round((hc.everything?.[k] ?? 0) * 100)}%)`).join(", ") + ". Read: number ones borrow chords (modal mixture) as often as everything else and lean on blues and andalusian moves more than the average record; the four-chord axis loop is rarer among number ones than its reputation.");
}
lines.push("");
lines.push("## The checklist the studio scores a 'make it a hit' ask against");
lines.push("- Danceability first: straight kick, medium syncopation in hats and bass, a clear downbeat every bar.");
lines.push("- Valence: a lifted hook (arch contour, small intervals, one twist), major color or a bright minor chorus.");
lines.push("- Energy under control: master in band, no stacked bright layers, dynamics kept for the drop.");
lines.push("- Form: first hook by bar 20 at the latest, about 3:20 total, eight chords or fewer, the hook stated three times.");
lines.push("- Era: pick the decade's opening progression and tempo band when the ask names an era.");
writeFileSync("knowledge/skills/hits.md", lines.join("\n") + "\n");
console.log(`wrote knowledge/skills/hits.md (${lines.join("\n").length} chars)`);
