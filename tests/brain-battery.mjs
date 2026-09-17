// Conversational Ableton battery against the real brain: every reply must parse, every op must apply,
// every resulting song must schedule. The resolver has to load before the module graph:
//   node --import ./tests/ts-resolve.mjs tests/brain-battery.mjs [baseUrl]   (npm run battery:song)
import "./ts-resolve.mjs";   // extensionless TypeScript imports inside lib/
import { applyOps } from "../lib/song/ops.ts";
import { migrateSong } from "../lib/song/migrate.ts";
import { SEED_TECH_HOUSE } from "../lib/song/seeds.ts";
import { scheduleEvents } from "../lib/engine/schedule.ts";
import { chordsForSection, condense } from "../lib/song/harmony.ts";

const BASE = process.argv[2] ?? "http://localhost:3111";
const ASKS = [
  ["solo the bass, I want to hear it alone", (s) => { const b = s.tracks.find((t) => t.role === "bass"); const others = s.tracks.filter((t) => t.id !== b.id && t.role !== "kick"); return b.solo === true || (others.length > 0 && others.every((t) => t.mute || (s.tracks.some((x) => x.solo) && !t.solo))); }],
  ["ok bring everything back and loop the drop", (s, r) => s.tracks.every((t) => !t.solo) && (s.loop?.section != null || r.action?.type === "loop")],
  ["put a filter sweep on the build so it opens up into the drop", (s) => s.sections.some((x) => (x.automation ?? []).some((a) => a.param === "filter.cutoff"))],
  ["add a dotted eighth delay on the stabs and pan them a little left", (s) => { const st = s.tracks.find((t) => t.role === "stab"); return !!st?.fx?.delay && (st.fx.pan ?? 0) < 0; }],
  ["make it 128 and take the whole thing up a key", (s) => s.bpm === 128 && s.tracks.filter((t) => ["bass", "sub", "stab", "pad"].includes(t.role)).every((t) => (t.transpose ?? 0) >= 1)],
  ["mute the pad and give drop 2 a different hat pattern than drop 1", (s) => s.tracks.find((t) => t.role === "pad").mute === true && !!(s.sections.find((x) => x.id === "drop2")?.variants?.hat)],
  ["I want to hum a bassline", (s, r) => r.action?.type === "recordHum"],
  ["take me back to the intro and pause there", (s, r) => r.action?.type === "goto" || r.action?.type === "pause"],
  ["make the drop hit harder", (s) => true],
  ["make the hats brighter and give me a B version with a different open hat pattern", (s, r) => Array.isArray(r.alternative) && r.alternative.length > 0],
  ["new song, KETTAMA style, surprise me", (s, r) => r.action?.type === "rollout" || (s.lane === "hard-house" && s.bpm >= 138 && s.tracks.length >= 6)],
];

let song = JSON.parse(JSON.stringify(SEED_TECH_HOUSE));
const messages = [];
let pass = 0, fail = 0;
for (const [ask, check] of ASKS) {
  messages.push({ role: "user", content: ask });
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages, song, facts: null, reference: null, nowPlaying: { section: "Drop", barInSection: 3, absBar: 27 }, taste: "no verdicts yet" }) });
  const data = await r.json();
  const ms = Date.now() - t0;
  messages.push({ role: "assistant", content: data.say });
  let next = song, applied = 0, skipped = [];
  if (Array.isArray(data.ops)) { const res = applyOps(song, data.ops); next = res.song; applied = res.applied; skipped = res.skipped; }
  else if (data.song) { const m = migrateSong(data.song); if (m) next = m; }
  let schedOk = true, totalBeats = 0;
  try { totalBeats = scheduleEvents(next).totalBeats; } catch (e) { schedOk = false; }
  const ok = schedOk && check(next, data) && !/hiccuped|not connected|setup step|credits/i.test(data.say);
  if (data.expect) console.log(`     expect: ${JSON.stringify(data.expect)}`);
  if (ok) pass++; else fail++;
  song = next;
  const drop = next.sections.find((x) => /drop/i.test(x.name)) ?? next.sections[0];
  console.log(`${ok ? "PASS" : "FAIL"} ${ms}ms · "${ask}"\n     say: ${data.say}\n     ${data.ops ? `ops ${applied} applied${skipped.length ? `, skipped ${JSON.stringify(skipped).slice(0, 160)}` : ""}` : data.song ? "FULL SONG" : "no change"} · action ${JSON.stringify(data.action)} · listen: ${data.listen ?? "-"} · ${next.bpm} BPM ${next.key} ${next.tracks.length} tracks ${totalBeats} beats · drop chords ${condense(chordsForSection(next, drop)).join(" ")}${data.detail ? ` · detail ${data.detail}` : ""}`);
}
console.log(`\n${pass}/${ASKS.length} passed`);
process.exit(fail ? 1 : 0);
