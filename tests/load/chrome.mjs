// Headless Chrome for the probes, always muted, always in a throwaway profile, driven over CDP.
// One page per Chrome; the profile directory is removed (by its exact path) when the probe ends.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export async function launch(label = "probe") {
  const port = 9400 + ((process.pid + Math.floor(Math.random() * 97)) % 400);
  const profile = mkdtempSync(join(tmpdir(), `producer-${label}-`));
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${port}`, "--headless=new", "--mute-audio", "--no-first-run", "--no-default-browser-check",
    "--disable-gpu", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });
  const close = () => { try { chrome.kill("SIGKILL"); } catch { /* gone */ } try { rmSync(profile, { recursive: true, force: true }); } catch { /* in use */ } };
  process.on("exit", close);
  for (let i = 0; i < 80; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { await sleep(250); } }
  const version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const waiters = new Map(); const listeners = [];
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && waiters.has(msg.id)) { waiters.get(msg.id)(msg); waiters.delete(msg.id); return; } for (const l of listeners) l(msg); };
  const raw = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; waiters.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const { result: { targetId } } = await raw("Target.createTarget", { url: "about:blank" });
  const { result: { sessionId } } = await raw("Target.attachToTarget", { targetId, flatten: true });
  const call = (m, p) => raw(m, p, sessionId);
  const js = async (expr) => {
    const r = await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error((r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text ?? "eval failed").slice(0, 400));
    return r.result?.result?.value;
  };
  const waitFor = async (expr, ms, what) => { const t0 = Date.now(); for (;;) { const v = await js(expr).catch(() => null); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${what}`); await sleep(100); } };
  const exceptions = [];
  listeners.push((m) => {
    if (m.method === "Runtime.exceptionThrown") exceptions.push((m.params?.exceptionDetails?.exception?.description ?? m.params?.exceptionDetails?.text ?? "").slice(0, 240));
    if (m.method === "Runtime.consoleAPICalled" && m.params?.type === "error") exceptions.push(`error: ${(m.params.args ?? []).map((a) => a.description ?? a.value ?? "").join(" ").slice(0, 240)}`);
  });
  await call("Page.enable"); await call("Runtime.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  return { call, js, waitFor, on: (l) => listeners.push(l), exceptions, browser: version.Browser, close };
}

export { sleep };
