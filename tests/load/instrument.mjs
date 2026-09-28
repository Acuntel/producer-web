// Runs inside the page before any page script: counts what the ledger cannot see from inside the
// app. Every decode with a hash of its bytes (a key decoded twice shows up as the same hash twice),
// every IndexedDB open of any database, every React commit of any root (through the devtools hook,
// which production builds call too), long tasks, late source starts, and the first audible sample.
export const INSTRUMENT = String.raw`(() => {
  if (window.__load) return;
  const now = () => performance.now();
  const L = window.__load = { decodes: [], ctx: [], idb: [], commits: {}, lt: [], late: { starts: 0, late: 0, worstMs: 0 }, firsts: {} };
  const fnv = (buf) => { try { const u = new Uint8Array(buf, 0, Math.min(buf.byteLength, 65536)); let h = 2166136261; for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + ":" + buf.byteLength; } catch { return "?"; } };
  const BAC = window.BaseAudioContext.prototype; const dec = BAC.decodeAudioData;
  BAC.decodeAudioData = function (buf, ...rest) { if (buf && buf.byteLength > 64) L.decodes.push({ t: Math.round(now()), bytes: buf.byteLength, hash: fnv(buf) }); return dec.call(this, buf, ...rest); };
  const AC = window.AudioContext;
  window.AudioContext = new Proxy(AC, { construct(t, a, nt) { const o = Reflect.construct(t, a, nt); L.ctx.push({ t: Math.round(now()), sr: o.sampleRate, hint: a[0] && a[0].latencyHint }); return o; } });
  const wrapStart = (proto) => { const o = proto.start; if (!o) return; proto.start = function (when, ...rest) {
    try { const c = this.context; if (c && !(c instanceof OfflineAudioContext) && typeof when === "number" && when > 0) { L.late.starts++; const ms = (c.currentTime - when) * 1000; if (ms > 0) { L.late.late++; if (ms > L.late.worstMs) L.late.worstMs = Math.round(ms * 10) / 10; } } } catch {}
    return o.call(this, when, ...rest); }; };
  wrapStart(window.AudioBufferSourceNode.prototype); wrapStart(window.AudioScheduledSourceNode.prototype);
  if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__) { let rid = 0; window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject(r) { rid++; this.renderers.set(rid, r); return rid; }, onScheduleFiberRoot() {}, onCommitFiberRoot() { const b = Math.floor(now() / 1000); L.commits[b] = (L.commits[b] || 0) + 1; }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, checkDCE() {}, setStrictMode() {} }; }
  const open0 = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function (name) { L.idb.push({ t: Math.round(now()), name: String(name) }); return open0.apply(this, arguments); };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) L.lt.push({ t: Math.round(e.startTime), d: Math.round(e.duration) }); }).observe({ type: "longtask", buffered: true }); } catch {}
  const F = L.firsts;
  const fast = setInterval(() => {
    const l = window.__levels && window.__levels(); if (!l) return;
    const m = Array.isArray(l.master) ? Math.max(l.master[0], l.master[1]) : l.master;
    if (Number.isFinite(m) && m > -60) { F.firstSound = Math.round(now()); clearInterval(fast); }
  }, 4);
  setTimeout(() => clearInterval(fast), 90000);
})();`;

// Counts in a window of page time [t0, t1) from a snapshot of window.__load, per second.
export function perSecond(stamps, t0, t1) {
  const secs = Math.max(1e-3, (t1 - t0) / 1000);
  const n = stamps.filter((t) => t >= t0 && t < t1).length;
  return Math.round((n / secs) * 100) / 100;
}
export function commitsIn(commits, t0, t1) {
  let n = 0; for (const [s, c] of Object.entries(commits)) { const t = Number(s) * 1000; if (t >= t0 && t + 1000 <= t1) n += c; }
  return Math.round((n / Math.max(1e-3, Math.floor((t1 - t0) / 1000))) * 100) / 100;
}
