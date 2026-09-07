"use client";
// Analyze a record: a link or a file in; tempo, key, structure, the best eight
// bars, four stems and sliced drum one-shots out. Every result is one tap from
// the song. For the user's own projects; the original never outlives the job.
import { useEffect, useRef, useState } from "react";
import { canCapture, startCapture, type Capture } from "@/lib/capture";
import type { useStems } from "@/hooks/useStems";
import { hzToNote, mmss, identityLine } from "@/hooks/useStems";
import { Button, IconButton, Empty } from "./ui";
import { Icon } from "./Icon";

type Stems = ReturnType<typeof useStems>;

const STAGE: Record<string, string> = { identifying: "Naming it from the sound", "listening: tempo, key, structure": "Listening: tempo, key, structure", "separating the best bars": "Separating the best 16 bars first", "separating the whole record": "Separating the whole record", separating: "Separating the stems", slicing: "Slicing the drums", listening: "Listening like a producer", uploading: "Saving to your library", "from cache": "Already analyzed once, loading it" };
const stageLine = (j: NonNullable<Stems["job"]>) => j.status === "queued" ? "Waiting for the worker" : j.kind === "tracklist" ? (j.progress < 20 ? "Finding and fetching the mix" : `Naming the records, ${j.progress}%`) : j.progress < 12 ? "Finding and fetching the audio" : STAGE[j.result?.stage ?? ""] ?? (j.progress < 22 ? "Listening: tempo, key, structure" : "Working");
const pitchChip = (p: number) => Math.abs(p) >= 0.5 ? <span className="tnum rounded bg-s3 px-1.5 py-0.5 text-[11px] font-medium text-ink-2">{p > 0 ? "+" : ""}{p.toFixed(1)}%</span> : null;

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
      c.done.then((file) => { setCap(null); void stems.startCaptured(file); }).catch((e) => { setCap(null); setCapErr(e instanceof Error ? e.message : "Recording failed."); });
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
                  <p className="text-sm text-ink-2">Name a record, a DJ mix or a show and the producer finds it on SoundCloud, Mixcloud and the Internet Archive; or upload a file; or capture what is playing in another tab. A record comes back named from its sound with tempo, key, structure, four stems, the drums sliced into one-shots and what the studio hears. A mix comes back as its tracklist, each record one tap from the studio.</p>
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
                            {c.kind === "mix" || (c.duration_sec ?? 0) > 900
                              ? <Button tone="ghost" onClick={() => void stems.startTracklist({ url: c.url, name: `${c.artist ? c.artist + " - " : ""}${c.title}`.slice(0, 80) })}>Tracklist</Button>
                              : <Button tone="ghost" onClick={() => void stems.start({ url: c.url, name: `${c.artist ? c.artist + " - " : ""}${c.title}`.slice(0, 80) })}>Analyze</Button>}
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
                    {canCapture() && !cap && <Button tone="ghost" icon="ear" type="button" onClick={() => void stems.identifyPlaying()} disabled={starting || stems.identifying}>{stems.identifying ? "Listening" : "What is playing?"}</Button>}
                    <span className="text-xs text-ink-3">mp3, wav, m4a, up to 8 minutes; mixes up to 2 hours</span>
                  </div>
                  {stems.identified?.title && !running && (
                    <div className="flex items-center gap-3 rounded-xl border border-line/40 bg-s2/40 px-3 py-2">
                      {stems.identified.cover ? <img src={stems.identified.cover} alt="" className="h-10 w-10 rounded-md object-cover" /> : <Icon name="ear" size={18} className="text-ink-3" />}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-ink">{stems.identified.artist ? `${stems.identified.artist} - ` : ""}{stems.identified.title}</div>
                        <div className="truncate text-xs text-ink-3">{[stems.identified.album, stems.identified.label, stems.identified.year].filter(Boolean).join(" · ")}{Math.abs(stems.identified.pitchPct) >= 0.5 ? ` · played at ${stems.identified.pitchPct > 0 ? "+" : ""}${stems.identified.pitchPct.toFixed(1)}%` : ""}{stems.identified.confident ? "" : " · not fully sure"}</div>
                      </div>
                      <Button tone="accent" onClick={() => { const i = stems.identified!; void stems.start({ query: i.artist ? `${i.artist} ${i.title}` : i.title, name: `${i.artist ? `${i.artist} - ` : ""}${i.title}`.slice(0, 80) }); }}>Pull it in</Button>
                    </div>
                  )}
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
                  {job.result?.identity?.title && <p className="mt-1 text-xs text-ink-3">Named from the sound: {identityLine(job.result.identity)}</p>}
                  {job.result?.facts && <FactsLine f={job.result.facts} />}
                  {(job.result?.oneshots?.length || job.result?.preview?.oneshots?.length) ? (
                    <div className="mt-3">
                      <div className="eyebrow mb-1.5">{job.result?.oneshots?.length ? "Ready now, the whole record is sliced; the ears are still listening" : "Ready now, from the best 16 bars"}</div>
                      <ul className="grid gap-1.5 sm:grid-cols-2">
                        {(job.result?.oneshots?.length ? job.result.oneshots : job.result?.preview?.oneshots ?? []).slice(0, 4).map((s) => (
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
              {done && job.result?.kind === "tracklist" && (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-s2/60 p-4">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-semibold text-ink">{job.result.name ?? "The mix"}</div>
                        <p className="tnum mt-1 text-sm text-ink-2">{mmss(job.result.durationSec ?? 0)} · {job.result.tracklist?.length ?? 0} records named from the sound{job.result.timing ? ` in ${Math.round(job.result.timing.identifySec ?? 0)} s` : ""}</p>
                      </div>
                      <Button tone="quiet" onClick={stems.reset}>Analyze another</Button>
                    </div>
                  </div>
                  {job.result.tracklist?.length ? (
                    <ol className="space-y-1.5" aria-label="Tracklist">
                      {job.result.tracklist.map((e, i) => (
                        <li key={`${e.key}-${e.start}`} className="flex items-center gap-2 rounded-xl bg-s2/50 px-3 py-2">
                          <span className="tnum w-10 shrink-0 text-xs text-ink-3">{mmss(e.start)}</span>
                          {e.cover ? <img src={e.cover} alt="" className="h-8 w-8 shrink-0 rounded object-cover" /> : null}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-ink">{i + 1}. {e.artist ? `${e.artist} - ` : ""}{e.title}</div>
                            <div className="truncate text-xs text-ink-3">{[e.label, e.year].filter(Boolean).join(" · ")}{e.confident ? "" : " · not fully sure"}</div>
                          </div>
                          {pitchChip(e.pitchPct)}
                          <Button tone="ghost" onClick={() => void stems.start({ query: e.query, name: `${e.artist ? `${e.artist} - ` : ""}${e.title}`.slice(0, 80) })}>Pull it</Button>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="text-sm text-ink-2">Nothing in it could be named. Unreleased edits and very quiet passages stay anonymous; capture the part you care about from the tab instead.</p>}
                </div>
              )}
              {done && job.result && job.result.kind !== "tracklist" && (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-s2/60 p-4">
                    <div className="flex items-start gap-2">
                      {job.result.identity?.cover ? <img src={job.result.identity.cover} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" /> : null}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-semibold text-ink">{job.result.name ?? "Your record"}</div>
                        {job.result.identity?.title && <p className="truncate text-xs text-ink-3">Named from the sound: {[job.result.identity.album, job.result.identity.label, job.result.identity.year].filter(Boolean).join(" · ") || identityLine(job.result.identity)}{Math.abs(job.result.identity.pitchPct) >= 0.5 ? ` · played at ${job.result.identity.pitchPct > 0 ? "+" : ""}${job.result.identity.pitchPct.toFixed(1)}%` : ""}</p>}
                        {job.result.facts && <FactsLine f={job.result.facts} />}
                        {job.result.timing && <p className="tnum mt-1 text-[11px] text-ink-3">{job.result.cached ? "Served from the shared cache" : Object.entries(job.result.timing).map(([k, v]) => `${k} ${v}s`).join(" · ")}</p>}
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
