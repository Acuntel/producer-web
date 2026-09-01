// Versions: every change is a version; undo/redo by voice; nothing is lost.
import type { Song } from "./types";

export type Version = { song: Song; label: string; at: number };

export class History {
  private past: Version[] = [];
  private future: Version[] = [];
  constructor(private cap = 60) {}
  push(song: Song, label: string) {
    this.past.push({ song, label, at: Date.now() });
    if (this.past.length > this.cap) this.past.shift();
    this.future = [];
  }
  undo(current: Song): Version | null {
    const v = this.past.pop();
    if (!v) return null;
    this.future.push({ song: current, label: "redo point", at: Date.now() });
    return v;
  }
  redo(current: Song): Version | null {
    const v = this.future.pop();
    if (!v) return null;
    this.past.push({ song: current, label: "undo point", at: Date.now() });
    return v;
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  get labels() { return this.past.map((v) => v.label).slice(-8); }
}

// A compact, human diff between two songs for the brain and the ledger.
export function diffSongs(a: Song, b: Song): string[] {
  const out: string[] = [];
  if (a.bpm !== b.bpm) out.push(`tempo ${a.bpm}→${b.bpm}`);
  if (a.key !== b.key) out.push(`key ${a.key}→${b.key}`);
  if (a.title !== b.title) out.push(`title ${a.title}→${b.title}`);
  if (JSON.stringify(a.humanize) !== JSON.stringify(b.humanize)) out.push("humanize changed");
  if (JSON.stringify(a.master) !== JSON.stringify(b.master)) out.push("master changed");
  const aT = new Map(a.tracks.map((t) => [t.id, t])), bT = new Map(b.tracks.map((t) => [t.id, t]));
  for (const [id, t] of bT) {
    const o = aT.get(id);
    if (!o) { out.push(`+track ${id} (${t.role})`); continue; }
    const ch: string[] = [];
    if (o.volume !== t.volume) ch.push(`vol ${o.volume}→${t.volume}`);
    if (!!o.mute !== !!t.mute) ch.push(t.mute ? "muted" : "unmuted");
    if (!!o.solo !== !!t.solo) ch.push(t.solo ? "solo" : "unsolo");
    if (JSON.stringify(o.notes) !== JSON.stringify(t.notes)) ch.push("notes");
    if (JSON.stringify(o.patterns) !== JSON.stringify(t.patterns)) ch.push("patterns");
    if (JSON.stringify(o.synth) !== JSON.stringify(t.synth)) ch.push("synth");
    if (JSON.stringify(o.fx) !== JSON.stringify(t.fx)) ch.push("fx");
    if ((o.transpose ?? 0) !== (t.transpose ?? 0)) ch.push(`transpose ${t.transpose ?? 0}`);
    if (ch.length) out.push(`${id}: ${ch.join(", ")}`);
  }
  for (const id of aT.keys()) if (!bT.has(id)) out.push(`-track ${id}`);
  const aS = new Map(a.sections.map((s) => [s.id, s])), bS = new Map(b.sections.map((s) => [s.id, s]));
  for (const [id, s] of bS) {
    const o = aS.get(id);
    if (!o) { out.push(`+section ${id} (${s.bars} bars)`); continue; }
    if (JSON.stringify(o) !== JSON.stringify(s)) out.push(`section ${id} changed${o.bars !== s.bars ? ` (${o.bars}→${s.bars} bars)` : ""}`);
  }
  for (const id of aS.keys()) if (!bS.has(id)) out.push(`-section ${id}`);
  if (JSON.stringify(a.arrangement) !== JSON.stringify(b.arrangement)) out.push(`arrangement ${b.arrangement.join(" ")}`);
  if (JSON.stringify(a.loop) !== JSON.stringify(b.loop)) out.push(b.loop ? "loop set" : "loop off");
  return out;
}
