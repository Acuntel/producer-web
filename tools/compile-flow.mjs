// The flow skill: the measured patterns of form, joining and feel as plain sentences. node tools/compile-flow.mjs
import { readFileSync, writeFileSync } from "node:fs";
const f = JSON.parse(readFileSync("data/dna/flow.json", "utf8"));
const pct = (x) => `${Math.round(x * 100)}%`;
const q = (o, unit = "", d = 2) => (o ? `${o.p50.toFixed(d)}${unit} (middle half ${o.p25.toFixed(d)} to ${o.p75.toFixed(d)})` : "not enough rows");
const names = { I: "intro", V: "verse", C: "chorus", B: "bridge", P: "pre-chorus", S: "solo", O: "outro", D: "drop", K: "break", U: "build", X: "other" };
const nm = (c) => names[c] ?? c;
const gram = (name) => { const g = f.grammar[name]; if (!g) return null; const nx = Object.entries(g.next).filter(([a]) => ["I", "V", "C", "B", "D", "K", "U"].includes(a)).map(([a, b]) => `after the ${nm(a)}: ${b.map(([c, p]) => `${nm(c)} ${pct(p)}`).join(", ")}`).join("; "); return `- ${name === "all" ? "Across the store" : name} (${g.songs.toLocaleString()} structures): opens on the ${g.opens.map(([c, p]) => `${nm(c)} ${pct(p)}`).join(" or ")}; ${nx}; ${g.sections_p50 ?? "?"} sections in the middle record; the first chorus or drop lands at bar ${g.first_chorus_bar ? `${g.first_chorus_bar.p50} (middle half ${g.first_chorus_bar.p25} to ${g.first_chorus_bar.p75})` : "?"}; ${g.two_peaks_share !== null ? pct(g.two_peaks_share) : "?"} have two peaks.`; };
const t = f.turnarounds, e = f.energy, dj = f.dj;
const out = `# SKILL: flow (the patterns of form, joining and feel, measured from the store)

FORM. Section grammar, what follows what:
${["all", "pop", "rock", "hiphop", "electronic", "house", "rnb", "country", "latin"].map(gram).filter(Boolean).join("\n")}
Phrases are 4, 8 or 16 bars; a change lands on bar 1 of a phrase, one element at a time. A section that is 4 bars where the store says 8 to 16 reads as a stumble.

TURNAROUNDS (what opens and closes a chorus). Major choruses open on ${t.major.opens_on.map(([c, p]) => `${c} ${pct(p)}`).join(", ")} and close on ${t.major.closes_on.map(([c, p]) => `${c} ${pct(p)}`).join(", ")} (${t.major.choruses.toLocaleString()} choruses). Minor choruses open on ${t.minor.opens_on.map(([c, p]) => `${c} ${pct(p)}`).join(", ")} and close on ${t.minor.closes_on.map(([c, p]) => `${c} ${pct(p)}`).join(", ")} (${t.minor.choruses.toLocaleString()}). Closing on V (major) or bVII (minor) leans into the next section; closing on the tonic rests. Use the lean before a drop and the rest before a break.

ENERGY ARCS (${e.records} records with per-bar energy, energy as a share of the record's peak). A build rises ${q(e.build_slope_per_8_bars, "", 3)} of the peak per 8 bars; the break after the first peak falls ${q(e.break_depth)} of the peak; the second peak returns to ${q(e.second_peak_over_first)} of the first (never louder than about 1.0: a second drop that is much louder than the first sounds like the first was a mistake); the first peak lands at bar ${q(e.first_peak_bar, "", 0)}; a full gap right before the drop is rare (${pct(e.gap_before_drop_share)} of records), so favour a one-beat gap or a filter dip over silence. Smoothness: the energy jump at a section boundary is ${q(e.boundary_jump)} of the peak; above the upper quarter (${e.boundary_jump?.p75.toFixed(2)}) a transition reads as a cut, which is fine into a drop and wrong anywhere else.

JOINING (${dj.mixes} DJ mixes, ${dj.transitions.toLocaleString()} transitions from the canon). DJs bend a record's tempo by ${q(dj.pitch_bend_pct, "%", 1)}; consecutive records differ by ${q(dj.tempo_delta_bpm, " BPM", 1)}; where both keys are known (${dj.key_pairs_known} pairs, thin), the relationship is ${dj.key_relationship.map(([k, p]) => `${k} ${pct(p)}`).join(", ")}. Rules that follow: warp within 3%, prefer the same key or one step round the wheel, swap the bass at a phrase boundary, never at a bar inside one.

TRANSITION MOVE. {"op":"transition","from":"<section id>","bars":2|4|8,"gap":true|false,"lift":0.1} raises the master filter across the last bars of the section, pulls everything but the kick for the final bar when gap is true, and nudges the next section's energy. Build to drop: bars 4 to 8, gap on. Drop to break: bars 2, gap off. Verse to chorus: bars 2, lift 0.1.
`;
writeFileSync("knowledge/skills/flow.md", out); console.log(`wrote knowledge/skills/flow.md (${out.length} chars)`);
