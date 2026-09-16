// The math skill: the pattern engine's vocabulary and the chord transition tables learned from the store,
// rendered as plain sentences the Hands can quote. node tools/compile-math.mjs -> knowledge/skills/math.md
import { readFileSync, writeFileSync } from "node:fs";
const m = JSON.parse(readFileSync("data/dna/markov.json", "utf8"));
const pct = (x) => `${Math.round(x * 100)}%`;
const fam = (name) => { const t = m[name]; if (!t) return null; const nx = Object.entries(t.next).slice(0, 5).map(([a, b]) => `after ${a}: ${b.map(([c, p]) => `${c} ${pct(p)}`).join(", ")}`).join("; "); return `- ${name === "all" ? "Across the store" : name} (${t.songs.toLocaleString()} progressions): opens on ${t.first.slice(0, 3).map(([c, p]) => `${c} ${pct(p)}`).join(", ")}; ${nx}; the common four-chord cycles ${t.cycles.slice(0, 3).map(([c]) => c).join(" | ")}.`; };
const out = `# SKILL: the math of music (patterns the engine can make by name, and the chord odds the store measured)

RHYTHM. E(k, n) is Bjorklund's Euclidean rhythm: k hits spread as evenly as possible over n steps. The ones the world dances to: E(4,16) four on the floor; E(3,8) the tresillo (X..X..X.); E(5,8) the cinquillo (X.XX.XX.); E(5,16) rotated is the son clave family; E(7,16) is a Brazilian-leaning 16th pattern; E(9,16) a dense Afro pattern. The op is {"op":"euclid","track":"<id>","hits":k,"steps":n,"rotate":r,"midi":m,"role":"<role>"} and it lands as a grid. Rotation moves the accent onto or off the downbeat; the tresillo rotated by 3 is what most people call the bossa feel. Named grids in lib/song/patterns.ts: four_floor, tresillo, cinquillo, son_clave, rumba_clave, bossa, offbeat, backbeat, shuffle.
POLYMETER. A 3-step figure over a 4-step grid repeats every 12; a 5 over 4 every 20; a 7 over 16 every 112 steps (7 bars). Use one polymetric layer at most, on hats or a perc, never on the kick, and resolve it on a downbeat every 4 or 8 bars.
DENSITY. Thinning keeps downbeats, then off-eighths, then 16ths; thickening fills in that order. A drop is usually 1.5 to 2x the density of the groove on hats and 1x on kick.
FORM. The golden section of a 64-bar record is bar 40 (0.618); of 128 bars, bar 79. The biggest moment (the second drop, the peak) lands there in a great many records; the first drop sits near bar 16 or 32. Tension is a build of 8 or 16 bars with density and filter rising together.
MELODY. Contours: rise, fall, arch, wave, flat. A hook is a two-bar shape repeated with one change on the fourth repeat. Intervals: step motion sings, a leap of a fourth or a sixth is the memorable note; land leaps on chord tones.
HARMONY, MEASURED. What follows what in the store (roman numerals in the record's key; lowercase minor):
${["all", "house", "techno", "pop", "hiphop", "rnb", "rock", "electronic", "latin"].map(fam).filter(Boolean).join("\n")}
Use these as odds, not rules: a progression that follows the odds sounds familiar; one deliberate departure (a chord with under 10% odds) is the hook. When asked what the math is, name it in one sentence: "that kick is E(4,16); the hats are E(7,16) rotated by 2; the bass follows the i bVI bIII bVII cycle".
`;
writeFileSync("knowledge/skills/math.md", out); console.log(`wrote knowledge/skills/math.md (${out.length} chars)`);
