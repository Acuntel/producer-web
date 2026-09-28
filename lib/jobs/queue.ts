// Every piece of work is a job in one FIFO queue (masterprompt section 4). A job resolves when its change has
// landed in the audio, not when the network returned: the runner hands back the engine's landing and the queue
// waits on it. Stop, undo, redo, new and open move the record's epoch, and every job made for another epoch is
// cancelled: a runner still in flight sees alive() go false and drops its result instead of applying it.
export type JobState = "queued" | "running" | "landing" | "landed" | "failed" | "cancelled";
export type JobOrigin = "draft" | "next" | "task" | "refine" | "voice" | "take" | "level" | "report";
export type Job = { id: string; text: string; origin: JobOrigin; songId: string; state: JobState; landsAtBar: number | null; landsAtTime: number | null; detail: string | null; queuedAt: number; doneAt: number | null };
export type LandingLike = { landsAtBar: number | null; landsAtTime: number | null; landed: Promise<boolean> };
export type RunResult = { landing?: LandingLike | null; detail?: string | null; failed?: boolean } | void;
export type Runner = (job: Job, alive: () => boolean) => Promise<RunResult>;

const LANDING_TIMEOUT_MS = 20_000;

export class JobQueue {
  private jobs: Job[] = [];
  private runs = new Map<string, { run: Runner; resolve: (j: Job) => void }>();
  private running: string | null = null;
  private seq = 0;
  private listeners = new Set<(jobs: Job[]) => void>();
  private idlers: (() => void)[] = [];
  epoch = 0;

  constructor(private now: () => number = () => Date.now()) {}

  /** The record a job belongs to: its id and the epoch it was made in. */
  songKey(songId: string | null | undefined) { return `${songId ?? "none"}#${this.epoch}`; }

  enqueue(p: { text: string; origin: JobOrigin; songId?: string | null }, run: Runner): { job: Job; done: Promise<Job> } {
    const job: Job = { id: `j${++this.seq}`, text: p.text, origin: p.origin, songId: this.songKey(p.songId), state: "queued", landsAtBar: null, landsAtTime: null, detail: null, queuedAt: this.now(), doneAt: null };
    this.jobs = [...this.jobs.filter((j) => !finished(j) || this.now() - (j.doneAt ?? 0) < 8000), job];
    const done = new Promise<Job>((resolve) => this.runs.set(job.id, { run, resolve }));
    this.emit(); void this.pump();
    return { job, done };
  }

  /** A new epoch (stop, undo, redo, new, open): everything made before it is cancelled. */
  bump(why: string) { this.epoch++; this.cancelWhere((j) => !j.songId.endsWith(`#${this.epoch}`), why); }
  cancelWhere(pred: (j: Job) => boolean, why: string): number {
    let n = 0;
    for (const j of this.jobs) if (!finished(j) && pred(j)) { this.set(j, { state: "cancelled", detail: why, doneAt: this.now() }); this.settle(j); n++; }
    if (n) this.emit();
    return n;
  }

  idle() { return this.running === null && !this.jobs.some((j) => j.state === "queued"); }
  /** Resolves the next time nothing is queued or running. */
  whenIdle(): Promise<void> { return this.idle() ? Promise.resolve() : new Promise((r) => this.idlers.push(r)); }
  current(): Job | null { return this.jobs.find((j) => j.id === this.running) ?? this.jobs.find((j) => j.state === "queued") ?? null; }
  snapshot(): Job[] { return this.jobs.map((j) => ({ ...j })); }
  onChange(f: (jobs: Job[]) => void) { this.listeners.add(f); return () => { this.listeners.delete(f); }; }

  private emit() { const s = this.snapshot(); for (const f of this.listeners) f(s); }
  private set(j: Job, patch: Partial<Job>) { Object.assign(j, patch); }
  private settle(j: Job) { const r = this.runs.get(j.id); if (r) { this.runs.delete(j.id); r.resolve({ ...j }); } }

  private async pump() {
    if (this.running) return;
    const job = this.jobs.find((j) => j.state === "queued");
    if (!job) { const w = this.idlers.splice(0); for (const f of w) f(); return; }
    this.running = job.id;
    const alive = () => job.state !== "cancelled" && job.songId === this.songKey(job.songId.slice(0, job.songId.lastIndexOf("#")));
    this.set(job, { state: "running" }); this.emit();
    try {
      const r = await this.runs.get(job.id)?.run(job, alive);
      if (!alive()) { if (job.state !== "cancelled") this.set(job, { state: "cancelled", detail: "the record changed", doneAt: this.now() }); }
      else if (r && r.failed) this.set(job, { state: "failed", detail: r.detail ?? null, doneAt: this.now() });
      else if (r && r.landing) {
        this.set(job, { state: "landing", landsAtBar: r.landing.landsAtBar, landsAtTime: r.landing.landsAtTime, detail: r.detail ?? null }); this.emit();
        await Promise.race([r.landing.landed, new Promise((res) => setTimeout(res, LANDING_TIMEOUT_MS))]);
        this.set(job, alive() ? { state: "landed", doneAt: this.now() } : { state: "cancelled", detail: "the record changed", doneAt: this.now() });
      } else this.set(job, { state: "landed", detail: r ? r.detail ?? null : null, doneAt: this.now() });
    } catch (e) { this.set(job, { state: "failed", detail: e instanceof Error ? e.message.slice(0, 120) : "failed", doneAt: this.now() }); }
    this.settle(job); this.running = null; this.emit();
    void this.pump();
  }
}

export const finished = (j: Job) => j.state === "landed" || j.state === "failed" || j.state === "cancelled";

/** The studio's one queue. */
export const studioJobs = new JobQueue();

/** What the progress bar says for a job, in full sentences. */
export function jobLine(j: Job | null): string | null {
  if (!j) return null;
  if (j.state === "queued") return "It is queued behind the work in front of it.";
  if (j.state === "running") return j.origin === "draft" || j.origin === "next" ? "I am writing the draft." : "I am working on it.";
  if (j.state === "landing") return j.landsAtBar ? `It lands on bar ${j.landsAtBar}.` : "It lands on the next bar.";
  if (j.state === "landed") return "It landed.";
  if (j.state === "failed") return "That one did not land.";
  return "It was cancelled.";
}
