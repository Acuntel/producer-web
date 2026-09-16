// The Voice's decisions on the real model: forty utterances, each with the control kind the room expects.
// node tests/voice.battery.mjs [baseUrl]   (add ?mock=1 to the url against a PRODUCER_MOCK=1 server for a shape check)
// Exits 0 with "skipped" when the brain is down (no key, no credit, allowance used), so it never fails a build for money.
import { SEED_TECH_HOUSE } from "../lib/song/seeds.ts";

const BASE = process.argv[2] ?? "http://localhost:3111";
const url = new URL("/api/voice", BASE); if (/[?&]mock=1/.test(BASE)) url.searchParams.set("mock", "1");
const kindOf = (c) => (c.stop ? "stop" : c.audition ? "audition" : c.research ? "research" : c.task ? "task" : c.new ? "new" : c.open ? "open" : "none");
const CASES = [
  ["stop", "stop"], ["stop stop", "stop"], ["hold on", "stop"],
  ["let me hear it", "audition"], ["play me the drop", "audition"], ["can I hear the intro", "audition"], ["run it back", "audition"],
  ["who is kettama", "research"], ["pull up fred again", "research"], ["what does burial sound like", "research"], ["look up 90s garage", "research"],
  ["make it darker", "task"], ["the kick is too soft", "task"], ["give me a rolling bassline", "task"], ["add a vocal chop in the drop", "task"],
  ["take the tempo to 128", "task"], ["more energy in the second drop", "task"], ["the hats are too bright", "task"], ["swap the pad for something warmer", "task"],
  ["build a tech house record in the style of chris lake", "task"], ["I want that sun feeling, warm and bright", "task"], ["make the breakdown sadder", "task"],
  ["new record", "new"], ["start something fresh", "new"], ["open my last project", "open"],
  ["what do you think so far", "none"], ["nice", "none"], ["that's the one", "none"], ["how much have we spent", "none"], ["thanks", "none"],
  ["who are we chasing tonight? kettama", "research"], ["let's chase john summit", "research"],
  ["louder", "none"], ["mute the pad", "none"], ["undo that", "none"],
  ["play it from the top", "audition"], ["hit me with eight bars", "audition"],
  ["more like the reference in the low end", "task"], ["double the hats in the drop", "task"], ["I don't like it, go again", "task"],
];
const state = { screen: "stage", song: SEED_TECH_HOUSE, paused: true, inflight: [], research: [], localMoves: [], reports: [], messages: [] };
let agree = 0, down = null; const misses = [];
for (const [utterance, want] of CASES) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ state, utterance }) }).then((x) => x.json()).catch((e) => ({ detail: String(e) }));
  if (r.down || /no key|credit|cap:/i.test(r.detail ?? "")) { down = r.detail ?? r.down; break; }
  const got = kindOf(r.control ?? {});
  if (got === want) agree++; else misses.push(`"${utterance}" -> ${got}, wanted ${want} (${(r.say ?? "").slice(0, 60)})`);
}
if (down) { console.log(`voice battery: skipped, brain down (${down})`); process.exit(0); }
const pct = Math.round((100 * agree) / CASES.length);
console.log(`voice battery: ${agree}/${CASES.length} (${pct}%)`); for (const m of misses) console.log("  miss:", m);
process.exit(pct >= 95 ? 0 : 1);
