// The sentence-hole probe (masterprompt phase 6): the producer says a four-sentence line while the voice
// route answers each sentence after a delay (a slow voice, like a real one's time to first byte), and every
// sentence's place on the audio clock is read back. The holes between sentences must stay under 150 ms:
// the next sentence is fetched while this one plays, and a short jitter buffer covers a slow chunk.
//   node tests/holes.probe.mjs [baseUrl] [--delay 600] [--seconds 1.2] [--out dir] [--label name]
// Chrome --headless=new --mute-audio, the app ?e2e=1&mock=1, the voice route stubbed (tests/load/guard.mjs).
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir, loadavg } from "node:os";
import { join } from "node:path";
import { launch, sleep } from "./load/chrome.mjs";
import { guard } from "./load/guard.mjs";

const args = process.argv.slice(2);
const BASE = args[0] && !args[0].startsWith("--") ? args[0] : "http://localhost:3111";
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const DELAY = Number(opt("delay", "600")); const SECS = Number(opt("seconds", "1.2"));
const OUT = opt("out", join(tmpdir(), "producer-holes")); const LABEL = opt("label", `holes-${Date.now()}`);
mkdirSync(OUT, { recursive: true });
const log = (m) => console.log(`[holes] ${m}`);
log(`voice answers after ${DELAY} ms with ${SECS} s per sentence, load average ${loadavg()[0].toFixed(1)}`);

const p = await launch("holes"); const g = await guard(p, { speakDelayMs: DELAY, speakSeconds: SECS });
await p.call("Page.navigate", { url: `${BASE}/?e2e=1&mock=1` });
await p.waitFor(`performance.getEntriesByName("producer:transport")[0]?.startTime ?? null`, 60000, "the transport");
await p.waitFor(`typeof window.__say === "function"`, 20000, "the voice hook");
await p.waitFor(`(window.__speech ?? []).length >= 1`, 30000, "the greeting to finish").catch(() => null);
const lines = [];
for (let k = 0; k < 3; k++) {
  const before = await p.js(`(window.__speech ?? []).length`);
  await p.js(`window.__say("That kick is sitting right on the one. The bass answers it on the off beat. Now the hats open up the second half. Tell me if you want it darker.").then(() => true)`);
  await p.waitFor(`(window.__speech ?? []).length > ${before}`, 30000, "the line");
  const line = await p.js(`JSON.stringify(window.__speech[window.__speech.length - 1])`).then(JSON.parse);
  const holes = []; for (let i = 1; i < line.length; i++) holes.push(Math.round((line[i].at - line[i - 1].end) * 1000));
  lines.push({ sentences: line.length, holesMs: holes }); log(`line ${k + 1}: ${line.length} sentences, holes ${holes.join(", ")} ms`);
  await sleep(500);
}
const worst = Math.max(...lines.flatMap((l) => l.holesMs), 0);
const out = { label: LABEL, delayMs: DELAY, seconds: SECS, lines, worstHoleMs: worst, loadavg: loadavg(), paid: g.paidCalls(), voiceStubbed: g.spend.speakStubbed };
writeFileSync(join(OUT, `${LABEL}.json`), JSON.stringify(out, null, 1));
log(`worst hole ${worst} ms (target under 150), voice requests stubbed ${g.spend.speakStubbed}, paid ${g.paidCalls()}: ${worst < 150 ? "PASS" : "FAIL"}`);
p.close(); process.exit(0);
