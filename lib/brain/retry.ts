// One retry before the producer apologizes. Transient failures (rate limits, overload, a dropped socket) get a
// second attempt after a short jittered pause; anything else (a bad key, no credit) surfaces at once.
export const transient = (e: unknown): boolean => {
  const msg = String((e as { message?: string })?.message ?? e ?? "");
  const status = (e as { status?: number })?.status;
  return /rate.?limit|overloaded|429|529|5\d\d|ECONNRESET|ETIMEDOUT|socket hang up|fetch failed|terminated/i.test(msg) || (typeof status === "number" && (status === 429 || status >= 500));
};

export const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Run fn; on a transient failure wait 700 ms plus jitter and run it once more (attempt 1). */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, tries = 2, baseMs = 700): Promise<T> {
  let last: unknown = null;
  for (let i = 0; i < tries; i++) {
    try { return await fn(i); }
    catch (e) { last = e; if (i === tries - 1 || !transient(e)) throw e; await pause(baseMs * (i + 1) + Math.random() * 400); }
  }
  throw last;
}
