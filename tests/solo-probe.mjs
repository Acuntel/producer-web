import { SEED_TECH_HOUSE } from "../lib/song/seeds.ts";
const U = process.argv[2] ?? "http://localhost:3111";
const r = await fetch(`${U}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: "solo the bass, I want to hear it alone" }], song: SEED_TECH_HOUSE, facts: null, reference: null, nowPlaying: { section: "Drop", barInSection: 3, absBar: 27 }, taste: "no verdicts yet" }) }).then((x) => x.json());
console.log("say:", r.say); console.log("ops:", JSON.stringify(r.ops)); console.log("action:", JSON.stringify(r.action));
