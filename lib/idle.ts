// Work that can wait for a quiet thread: writes to this device's store, mostly. Keyed and coalesced,
// so a burst of changes is one write per key (the newest), done when the browser is idle and never
// inside the frame the scheduler needs. `flush` runs whatever is pending now (the page is going away).
type IdleApi = { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };

export function idleWriter(timeoutMs = 1500, fallbackMs = 200) {
  const pending = new Map<string, () => void>();
  let handle: ReturnType<typeof setTimeout> | number | null = null;
  let viaIdle = false;
  const run = () => {
    handle = null;
    const fns = [...pending.values()]; pending.clear();
    for (const f of fns) { try { f(); } catch { /* one failed write never blocks the next */ } }
  };
  const schedule = (key: string, fn: () => void) => {
    pending.set(key, fn);
    if (handle !== null) return;
    const g = globalThis as unknown as IdleApi;
    if (typeof g.requestIdleCallback === "function") { viaIdle = true; handle = g.requestIdleCallback(run, { timeout: timeoutMs }); }
    else { viaIdle = false; handle = setTimeout(run, fallbackMs); }
  };
  const flush = () => {
    if (handle !== null) {
      const g = globalThis as unknown as IdleApi;
      if (viaIdle) g.cancelIdleCallback?.(handle as number); else clearTimeout(handle as ReturnType<typeof setTimeout>);
    }
    run();
  };
  return { schedule, flush, pending: () => pending.size };
}
