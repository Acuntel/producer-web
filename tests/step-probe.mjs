import { SEED_HARD_HOUSE } from "../lib/song/seeds.ts";
import { ROLLOUTS, scopeText } from "../lib/brain/rollouts.ts";
import { applyOps } from "../lib/song/ops.ts";
const base = { ...SEED_HARD_HOUSE, title: "PROBE", tracks: [] };
const skeleton = applyOps(base, [{ op: "grid", track: "kick", role: "kick", name: "Kick", volume: 0, steps: "X...X...X...X...", midi: 36 }, { op: "grid", track: "hat", role: "hat", name: "Hats", volume: -10, steps: "..x...x...x...x.", midi: 42 }]).song;
for (const id of ["drums", "hook"]) {
  const step = ROLLOUTS.newSong.find((s) => s.id === id);
  const song = id === "hook" ? SEED_HARD_HOUSE : skeleton;
  const t0 = Date.now();
  const r = await fetch("http://localhost:3111/api/step", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: { id: step.id, title: step.title, goal: step.goal, scope: scopeText(step), tier: step.tier, fullSong: !!step.fullSong }, kind: "newSong", song, facts: null, reference: null, deltas: null, lane: "hard-house", ask: "new song, KETTAMA style, surprise me", prior: [{ id: "blueprint", summary: "142 F minor, rave" }], attempt: 1, failure: null, section: null, taste: "" }) }).then((x) => x.json());
  const applied = Array.isArray(r.ops) ? applyOps(song, r.ops) : null;
  console.log(`${id}: ${Math.round((Date.now() - t0) / 1000)}s model=${r.model} stop=${r.stop} textLen=${r.textLength} out=${r.usage?.output_tokens} think=${r.thinking} say="${(r.say || "").slice(0, 80)}" ops=${Array.isArray(r.ops) ? r.ops.length : r.ops} applied=${applied?.applied} skipped=${JSON.stringify(applied?.skipped ?? []).slice(0, 300)} head=${(r.head || "").slice(0, 200).replace(/\n/g, " ")}`);
  if (Array.isArray(r.ops)) console.log("   first ops:", JSON.stringify(r.ops.slice(0, 3)).slice(0, 500));
}
