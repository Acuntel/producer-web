"use client";
// Analyze a record: a link or a file in; tempo, key, structure, the best eight
// bars, four stems and sliced drum one-shots out. Every result is one tap from
// the song. For the user's own projects; the original never outlives the job.
import { useEffect, useRef, useState } from "react";
import { canCapture, startCapture, type Capture } from "@/lib/capture";
import type { useStems } from "@/hooks/useStems";
import { hzToNote, mmss } from "@/hooks/useStems";
import { Button, IconButton, Empty } from "./ui";
import { Icon } from "./Icon";

type Stems = ReturnType<typeof useStems>;

const STAGE: Record<string, string> = { "separating the best bars": "Separating the best 16 bars first", "separating the whole record": "Separating the whole record", separating: "Separating the stems", slicing: "Slicing the drums", listening: "Listening like a producer", uploading: "Saving to your library", "from cache": "Already analyzed once, loading it" };
const stageLine = (j: NonNullable<Stems["job"]>) => j.status === "queued" ? "Waiting for the worker" : j.progress < 15 ? "Finding and fetching the audio" : j.progress < 22 ? "Listening: tempo, key, structure" : STAGE[j.result?.stage ?? ""] ?? "Working";

export function AnalyzeSheet({ stems, signedIn, onSignIn, onClose }: { stems: Stems; signedIn: boolean; onSignIn: () => void; onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [cap, setCap] = useState<Capture | null>(null);
  const [capSec, setCapSec] = useState(0);
  const [capErr, setCapErr] = useState<string | null>(null);
  useEffect(() => { if (!cap) return; const t = window.setInterval(() => setCapSec((s) => s + 1), 1000); return () => window.clearInterval(t); }, [cap]);
  async function beginCapture() {
    setCapErr(null);
    try {
      const c = await startCapture(300, "what was playing");
      setCap(c); setCapSec(0);
      c.done.then((file) => { setCap(null); void stems.start({ file }); }).catch((e) => { setCap(null); setCapErr(e instanceof Error ? e.message : "Recording failed."); });
    } catch (e) { setCapErr(e instanceof Error && /Permission|NotAllowed|denied/i.test(e.message) ? "Sharing was cancelled." : e instanceof Error ? e.message : "Could not start capturing."); }
  }
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const { job, error, starting } = stems;
  const running = job && (job.status === "queued" || job.status === "running");
  const done = job?.status === "done" && job.result;

  return (
    <div role="dialog" aria-modal="true" aria-label="Analyze a record" className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="panel flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-3xl sm:max-w-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line/50 px-4 py-3">
          <Icon name="scissors" size={18} className="text-ink-3" />
          <h2 className="text-lg font-semibold">Analyze a record</h2>
          <IconButton name="close" label="Close" onClick={onClose} size={32} className="ml-auto" />
        </div>
        <div className="scroll-y min-h-0 flex-1 px-4 py-4">
          {!signedIn ? (
            <div className="flex flex-col gap-3 rounded-2xl bg-s2/60 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">Sign in to analyze records.</div>
                <div className="text-xs text-ink-3">Stems and one-shots save to your library, so they need an account.</div>
              </div>
              <Button tone="accent" icon="user" onClick={onSignIn}>Sign in</Button>
            </div>
          ) : (
            <>
              {!running && (
                <div className="space-y-2">
                  <p className="text-sm text-ink-2">Name a record and the producer finds it on SoundCloud, or upload a file, or capture what is playing in another tab. You get its tempo, key and structure, four stems, the kick, snare and hat sliced out as one-shots, and what the studio hears.</p>
                  <form onSubmit={(e) => { e.preventDefault(); const v = query.trim(); if (!v) return; if (/^https?:\/\//i.test(v)) void stems.start({ url: v }); else void stems.find(v); }} className="flex gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line/60 bg-base px-3 py-2 focus-within:border-accent/60">
                      <Icon name="search" size={15} className="shrink-0 text-ink-3" />
                      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Artist and title, a link, or a file link" aria-label="Find a record" className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none" />
                    </div>
                    <Button tone="accent" type="submit" disabled={starting || stems.finding || !query.trim()}>{stems.finding ? "Searching" : "Find it"}</Button>
                  </form>
                  {(stems.candidates.length > 0 || stems.localHits.length > 0) && (
                    <div className="rounded-xl border border-line/40 bg-s2/40 p-2">
                      <div className="eyebrow mb-1.5 px-1">Found{stems.candidates.length ? ` on ${[...new Set(stems.candidates.map((c) => c.source))].join(", ")}` : ""}{stems.localHits.length ? `${stems.candidates.length ? " and" : ""} in your folder` : ""}</div>
                      <ul className="max-h-56 space-y-1 overflow-y-auto">
                        {stems.localHits.slice(0, 3).map((h) => (
                          <li key={`l-${h.path}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-s2">
                            <span className="rounded bg-live/15 px-1.5 py-0.5 text-[11px] font-medium text-live">folder</span>
                            <span className="min-w-0 flex-1 truncate text-sm text-ink" title={h.path}>{h.name}</span>
                            <Button tone="ghost" onClick={() => void stems.analyzeLocal(h)}>Analyze</Button>
                          </li>
                        ))}
                        {stems.candidates.slice(0, 8).map((c) => (
                          <li key={`${c.source}-${c.url}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-s2">
                            <span className="rounded bg-s3 px-1.5 py-0.5 text-[11px] font-medium text-ink-2">{c.source}{c.kind === "mix" ? " · mix" : c.kind === "sample" ? " · sample" : ""}</span>
                            <span className="min-w-0 flex-1 truncate text-sm text-ink" title={c.title}>{c.artist ? `${c.artist} · ` : ""}{c.title}</span>
                            {c.duration_sec ? <span className="tnum shrink-0 text-xs text-ink-3">{mmss(c.duration_sec)}</span> : null}
                            <Button tone="ghost" onClick={() => void stems.start({ url: c.url, name: `${c.artist ? c.artist + " - " : ""}${c.title}`.slice(0, 80) })}>Analyze</Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button tone="ghost" icon="plus" type="button" onClick={() => fileRef.current?.click()} disabled={starting || !!cap}>Upload a file</Button>
                    {stems.canPickFolder && <Button tone="ghost" icon="folder" type="button" onClick={() => void stems.connectLocal(!stems.folder.count)} disabled={starting}>{stems.folder.count ? `Folder: ${stems.folder.name} (${stems.folder.count})` : "Use a folder on this computer"}</Button>}
                    {canCapture() && (cap ? (
                      <Button tone="live" icon="stop" type="button" onClick={() => cap.stop()}>Stop capturing ({capSec}s)</Button>
                    ) : (
                      <Button tone="ghost" icon="mic" type="button" onClick={() => void beginCapture()} disabled={starting}>Capture what is playing</Button>
                    ))}
                    <span className="text-xs text-ink-3">mp3, wav, m4a, up to 8 minutes</span>
                  </div>
                  {cap && <p className="text-xs text-live">Recording the tab you shared. Let the part you want play through, then stop.</p>}
                  {!cap && canCapture() && <p className="text-xs text-ink-3">Capture records the audio of another tab, such as YouTube or SoundCloud, right here in your browser. Nothing is downloaded for you; it is your own recording, for your own project.</p>}
                  {capErr && <p role="alert" className="text-xs text-warn">{capErr}</p>}
                  <input ref={fileRef} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void stems.start({ file: f }); e.target.value = ""; }} />
                </div>
              )}
              {error && <p role="alert" className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">{error}</p>}
              {running && job && (
                <div className="rounded-2xl bg-s2/60 p-4">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{job.result?.facts?.name ?? job.source.name ?? job.source.url ?? "Your record"}</span>
                    <span className="tnum text-xs text-ink-3">{job.progress}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-s3"><div className="h-full rounded-full bg-cool transition-[width] duration-500 ease-snap" style={{ width: `${Math.max(3, job.progress)}%` }} /></div>
                  <p className="mt-2 text-xs text-ink-2">{stageLine(job)}.</p>
                  {job.result?.facts && <FactsLine f={job.result.facts} />}
                  {job.result?.preview?.oneshots?.length ? (
                    <div className="mt-3">
                      <div className="eyebrow mb-1.5">Ready now, from the best 16 bars</div>
                      <ul className="grid gap-1.5 sm:grid-cols-2">
                        {job.result.preview.oneshots.slice(0, 4).map((s) => (
                          <li key={s.path} className="flex items-center gap-2 rounded-xl border border-line/40 bg-s2/60 px-3 py-2">
                            <Preview path={s.path} stems={stems} />
                            <span className="min-w-0 flex-1 truncate text-sm capitalize text-ink">{s.role}</span>
                            <Button tone="ghost" onClick={() => void stems.useOneShot(s)}>Use it</Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
              {done && job.result && (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-s2/60 p-4">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-semibold text-ink">{job.result.name ?? "Your record"}</div>
                        {job.result.facts && <FactsLine f={job.result.facts} />}
                      </div>
                      <Button tone="quiet" onClick={stems.reset}>Analyze another</Button>
                    </div>
                    {job.result.facts?.blocks && <EnergyStrip blocks={job.result.facts.blocks} best={job.result.facts.bestBars.startBar} />}
                    {job.result.hearing?.report && (
                      <div className="mt-3 rounded-xl bg-base/60 p-3">
                        <div className="eyebrow mb-1">What the studio hears</div>
                        <p className="text-sm leading-relaxed text-ink-2">{job.result.hearing.report}</p>
                        {!!job.result.hearing.clap?.descriptors?.length && (
                          <div className="mt-2 flex flex-wrap gap-1">{job.result.hearing.clap.descriptors.slice(0, 6).map(([d]) => <span key={d} className="rounded bg-s3 px-1.5 py-0.5 text-[11px] font-medium text-ink-2">{d}</span>)}</div>
                        )}
                        {!!job.result.hearing.lyrics?.lines?.length && <p className="mt-2 text-xs text-ink-3">Lyrics heard: {job.result.hearing.lyrics.lines.slice(0, 3).map((l) => l.text).join(" / ")}</p>}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button tone="accent" icon="notes" onClick={() => { stems.askBreakdown(); onClose(); }}>Ask the producer for the breakdown</Button>
                    </div>
                  </div>
                  {!!job.result.oneshots?.length && (
                    <section>
                      <h3 className="eyebrow mb-2">Drums sliced from this record</h3>
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {job.result.oneshots.map((s) => (
                          <li key={s.path} className="flex items-center gap-2 rounded-2xl border border-line/40 bg-s2/60 px-3 py-2.5">
                            <Preview path={s.path} stems={stems} />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold capitalize text-ink">{s.role}</div>
                              <div className="tnum truncate text-xs text-ink-3">{s.fundamentalHz ? `${hzToNote(s.fundamentalHz)} · ${Math.round(s.fundamentalHz)} Hz · ` : ""}{Math.round(s.durationSec * 1000)} ms · at {mmss(s.atSec)}</div>
                            </div>
                            <Button tone="ghost" onClick={() => void stems.useOneShot(s)}>Use this {s.role}</Button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {!!job.result.stems?.length && (
                    <section>
                      <h3 className="eyebrow mb-2">Stems</h3>
                      <ul className="space-y-1.5">
                        {job.result.stems.map((s) => (
                          <li key={s.stem} className="flex items-center gap-2 rounded-xl bg-s2/50 px-3 py-2">
                            <Preview path={s.path} stems={stems} />
                            <span className="min-w-0 flex-1 truncate text-sm capitalize text-ink">{s.stem}</span>
                            <Button tone="ghost" onClick={() => void stems.addStemLoop(s)}>Loop the best 8 bars</Button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <p className="text-xs text-ink-3">For your own projects. A recording you do not own needs clearance from its rights holders before anything built on it is released. The DNA, tempo, key, groove and arrangement, is always yours to emulate.</p>
                </div>
              )}
              {!running && !done && !error && <div className="mt-2"><Empty icon="scissors" title="Nothing analyzed yet" hint="Try the record you keep coming back to. The producer will tell you what makes it work." /></div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FactsLine({ f }: { f: NonNullable<NonNullable<Stems["job"]>["result"]>["facts"] & object }) {
  return (
    <p className="tnum mt-1 text-sm text-ink-2">
      {Math.round(f.bpm)} BPM · {f.key} · {mmss(f.durationSec)}{f.dropAt !== null && f.dropAt !== undefined ? ` · drop at ${mmss(f.dropAt)}` : ""} · best 8 bars {mmss(f.bestBars.startSec)} to {mmss(f.bestBars.endSec)}
    </p>
  );
}

function EnergyStrip({ blocks, best }: { blocks: { bar: number; at: number; energy: number }[]; best: number }) {
  return (
    <div className="mt-3 flex h-10 items-end gap-0.5" aria-label="Energy by eight bar block">
      {blocks.map((b) => {
        const hot = best >= b.bar && best < b.bar + 8;
        return <div key={b.bar} title={`${mmss(b.at)} · energy ${b.energy}`} className={`flex-1 rounded-sm ${hot ? "bg-accent" : "bg-cool/60"}`} style={{ height: `${Math.max(8, b.energy * 100)}%` }} />;
      })}
    </div>
  );
}

function Preview({ path, stems }: { path: string; stems: Stems }) {
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => { audio.current?.pause(); }, []);
  async function toggle() {
    if (playing) { audio.current?.pause(); setPlaying(false); return; }
    const u = await stems.previewUrl(path); if (!u) return;
    const a = new Audio(u); audio.current = a; a.onended = () => setPlaying(false); a.onerror = () => setPlaying(false);
    await a.play().catch(() => setPlaying(false)); setPlaying(true);
  }
  return <IconButton name={playing ? "stop" : "play"} label={playing ? "Stop preview" : "Preview"} size={32} onClick={() => void toggle()} />;
}
