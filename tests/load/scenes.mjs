// What the probe does in the page: open the stage cold, or work a record by the order of work
// (the typed harness: new project, a source, a vocal, a chop, the beat, a real kit, a few moves).
import { sleep } from "./chrome.mjs";

const ledger = (page) => page.js(`window.__ledger ? JSON.stringify(window.__ledger()) : "null"`).then(JSON.parse);
const load = (page) => page.js(`JSON.stringify(window.__load ?? null)`).then(JSON.parse);
const marks = (page) => page.js(`JSON.stringify(Object.fromEntries(["producer:boot", "producer:voice", "producer:transport"].map((n) => [n, performance.getEntriesByName(n).map((e) => Math.round(e.startTime))])))`).then(JSON.parse);
const pageNow = (page) => page.js("performance.now()");

/** Everything a summary needs, read in one go. */
export async function snapshot(page, g) {
  const samples = g.requests().filter((r) => /\/samples\//.test(r.url)).map((r) => ({ url: r.url.replace(/^https?:\/\/[^/]+/, ""), status: r.status ?? null, bytes: r.bytes ?? 0, fromCache: !!r.fromCache }));
  return { ledger: await ledger(page), load: await load(page), marks: await marks(page), now: await pageNow(page), realtime: g.realtime().map((c) => ({ sr: c.sr, nodes: c.nodes, peak: c.peak })), capacity: await g.capacity().catch(() => []), samples, exceptions: [...new Set(page.exceptions)].slice(0, 12) };
}

/** A page load that lands on the stage and starts the seed by itself (?e2e=1), then waits. */
export async function cold(page, g, url, afterMs, reload = false) {
  g.resetAudio(); g.resetNet();
  if (reload) await page.call("Page.reload", { ignoreCache: false }); else await page.call("Page.navigate", { url });
  await page.waitFor(`performance.getEntriesByName("producer:transport")[0]?.startTime ?? null`, 60000, "the transport");
  await sleep(afterMs);
  return snapshot(page, g);
}

/** The order of work on a fresh record, by typed voice, ending on a record with a chop and a real kit playing. */
export async function orderOfWork(page, log) {
  const type = (text) => page.js(`(() => { const i = document.querySelector('input[aria-label="Message the producer"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
  const say = async (text) => { await page.waitFor(`!window.__ritual || !window.__ritual().speaking`, 60000, "the producer to finish speaking").catch(() => {}); log(`say: ${text}`); await type(text); };
  const song = `JSON.parse(localStorage.getItem('producer.song.v4'))`;
  const step = async (label, fn) => { try { await fn(); } catch (e) { log(`step ${label} FAILED: ${e.message}`); } };
  await page.waitFor(`!!document.querySelector('[data-role="new-project"]') && !!document.querySelector('input[aria-label="Message the producer"]') && typeof window.__levels === "function"`, 40000, "the landing");
  await step("new project", async () => { await type("new project"); await page.waitFor(`[...document.querySelectorAll('[data-role="producer-line"] p')].some((e) => /Who are we chasing/.test(e.textContent))`, 30000, "the greeting"); });
  await step("source", async () => { await say("What's the tempo of Summer by Calvin Harris?"); await page.waitFor(`(() => { const r = window.__ritual && window.__ritual(); return r && r.source && r.transportBpm === r.source.bpm; })()`, 40000, "the source grid"); });
  await step("vocal", async () => {
    // A synthetic vocal stem handed in the way a finished stems job hands one in (no worker, no spend).
    const made = await page.js(`(async () => {
      const SR = 22050, secs = 24, beat = 60 / 128;
      const buf = new OfflineAudioContext(1, SR * secs, SR).createBuffer(1, SR * secs, SR); const d = buf.getChannelData(0);
      let seed = 5; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
      for (let i = 0; i < d.length; i++) d[i] = rnd() * 0.0005;
      const sing = (fromBeat, len, amp, hz) => { const a = Math.round(fromBeat * beat * SR), n = Math.round(len * SR);
        for (let i = 0; i < n && a + i < d.length; i++) { const t = i / SR; const env = Math.min(1, t / 0.02, (n - i) / SR / 0.05) * (0.8 + 0.2 * Math.sin(2 * Math.PI * 3 * t)); d[a + i] += (Math.sin(2 * Math.PI * hz * t) * 0.7 + Math.sin(2 * Math.PI * hz * 2 * t) * 0.3) * amp * env; } };
      sing(4, 0.6, 0.12, 220); sing(16, 3.2, 0.6, 293.66); sing(32, 2.6, 0.42, 246.94);
      const eng = await window.__engineModule();
      const bytes = await eng.audioBufferToWav(buf).arrayBuffer();
      await eng.putClip({ id: "stem_loadjob_vocals", name: "Summer by Calvin Harris vocals", type: "audio/wav", bytes, createdAt: Date.now(), durationSec: secs }, { mirror: false });
      eng.cacheDecoded("stem_loadjob_vocals", buf);
      return window.__heard({ id: "loadjob", name: "Summer by Calvin Harris", vocals: "stem_loadjob_vocals", bpm: 128, tempoConfidence: 0.8, beatOffsetSec: 0, key: "G major", keyConfidence: 0.65 });
    })()`);
    log(`vocal stem handed in (${made})`);
  });
  await step("chop", async () => { await say("I'm making a chop"); await page.waitFor(`(() => { const v = window.__levels()?.tracks?.chop; return v > -60; })()`, 30000, "the chop to sound"); });
  await step("beat", async () => { await say("Let's go. To the beat."); await page.waitFor(`(() => { const s = ${song}; return ['kick', 'clap', 'hat', 'bass'].every((id) => s.tracks.some((t) => t.id === id)); })()`, 30000, "the beat"); });
  await step("kit", async () => { await sleep(2500); await say("use real drums"); await page.waitFor(`(() => ${song}.kit === 'starter')()`, 15000, "the kit"); });
}

/** A few instant moves while it plays, so the ledger has landings to place in the bar. */
export async function moves(page, log) {
  const type = (text) => page.js(`(() => { const i = document.querySelector('input[aria-label="Message the producer"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
  for (const text of ["mute the hat", "unmute the hat", "use the 808 kit", "use real drums", "mute the clap", "unmute the clap"]) {
    await page.waitFor(`!window.__ritual || !window.__ritual().speaking`, 30000, "quiet").catch(() => {});
    log(`move: ${text}`); await type(text); await sleep(2500);
  }
}

export { ledger, load, marks, pageNow };
