// Precise blips: cut a one-shot out of any decoded clip (a stem, a loop, an upload) on the
// nearest transient, trim to the decay, snap to zero crossings, fade, normalize. Then
// store it as a clip so a drum track or an audio track can play it.
import type { Song } from "../song/types";
import { loadClipsFor, putClip, cacheDecoded, decodeBytes } from "./clips";
import { audioBufferToWav } from "./render";

export type SliceOp = { op: "slice"; from: string; at: number; length?: number; role?: string; track?: string; name?: string; id?: string };
const DRUM = ["kick", "clap", "snare", "hat", "openhat", "perc"];

function mono(buf: AudioBuffer): Float32Array {
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) out[i] += d[i] / buf.numberOfChannels; }
  return out;
}

/** Where the hit really starts: the biggest energy jump in a short window around the asked time. */
export function findOnset(m: Float32Array, sr: number, atSec: number, windowSec = 0.35): number {
  const from = Math.max(0, Math.floor((atSec - 0.05) * sr)), to = Math.min(m.length - 1, Math.floor((atSec + windowSec) * sr));
  const hop = Math.max(32, Math.floor(sr / 1000) * 2);   // 2 ms frames
  let prev = 0, best = from, bestJump = -1;
  for (let i = from; i + hop < to; i += hop) {
    let e = 0; for (let j = i; j < i + hop; j++) e += m[j] * m[j];
    e = Math.sqrt(e / hop);
    const jump = e - prev * 1.05;
    if (jump > bestJump) { bestJump = jump; best = i; }
    prev = e;
  }
  // Back up to where the wave crosses zero before the jump so the click is gone.
  let s = Math.max(0, best - Math.floor(0.002 * sr));
  while (s > 0 && s > best - Math.floor(0.01 * sr) && !(m[s - 1] <= 0 && m[s] > 0)) s--;
  return s;
}

/** End of the blip: asked length, or the point the envelope stays under -40 dB of the peak, snapped to a zero crossing. */
function findEnd(m: Float32Array, sr: number, start: number, lengthSec: number | undefined, maxSec: number): number {
  const hard = Math.min(m.length, start + Math.floor((lengthSec ?? maxSec) * sr));
  if (lengthSec) return snapZero(m, hard);
  let peak = 0; for (let i = start; i < hard; i++) peak = Math.max(peak, Math.abs(m[i]));
  const floor = peak * 0.01;   // -40 dB
  const win = Math.floor(0.012 * sr);
  let e = start + Math.floor(0.06 * sr);
  for (; e + win < hard; e += win) { let mx = 0; for (let j = e; j < e + win; j++) mx = Math.max(mx, Math.abs(m[j])); if (mx < floor) break; }
  return snapZero(m, Math.min(hard, e + win));
}

function snapZero(m: Float32Array, i: number): number {
  let k = Math.min(m.length - 1, i);
  for (let n = 0; n < 2000 && k > 1; n++, k--) if (m[k - 1] <= 0 && m[k] > 0) return k;
  return Math.min(m.length, i);
}

export function sliceBuffer(src: AudioBuffer, atSec: number, lengthSec?: number, maxSec = 1.0): AudioBuffer {
  const sr = src.sampleRate;
  const m = mono(src);
  const start = findOnset(m, sr, atSec);
  const end = findEnd(m, sr, start, lengthSec, maxSec);
  const n = Math.max(Math.floor(0.03 * sr), end - start);
  const Ctx = (typeof OfflineAudioContext !== "undefined" ? OfflineAudioContext : null);
  if (!Ctx) throw new Error("no audio context");
  const ctx = new Ctx(src.numberOfChannels, n, sr);
  const out = ctx.createBuffer(src.numberOfChannels, n, sr);
  const fadeIn = Math.floor(0.003 * sr), fadeOut = Math.floor(0.015 * sr);
  let peak = 0;
  for (let c = 0; c < src.numberOfChannels; c++) {
    const d = src.getChannelData(c), o = out.getChannelData(c);
    for (let i = 0; i < n; i++) {
      let v = d[start + i] ?? 0;
      if (i < fadeIn) v *= i / fadeIn;
      if (i > n - fadeOut) v *= Math.max(0, (n - i) / fadeOut);
      o[i] = v; peak = Math.max(peak, Math.abs(v));
    }
  }
  const g = peak > 0 ? 0.891 / peak : 1;   // -1 dBFS
  for (let c = 0; c < out.numberOfChannels; c++) { const o = out.getChannelData(c); for (let i = 0; i < n; i++) o[i] *= g; }
  return out;
}

const isSlice = (o: unknown): o is SliceOp => !!o && typeof o === "object" && (o as { op?: string }).op === "slice" && typeof (o as SliceOp).from === "string" && typeof (o as SliceOp).at === "number";

/** Replace every "slice" op with concrete ops: the blip becomes a stored clip on a drum track or a one-shot audio track. */
export async function resolveSliceOps(ops: unknown[], song: Song, register?: (c: { id: string; name: string; durationSec?: number }) => void): Promise<{ ops: unknown[]; made: string[]; failed: string[] }> {
  const made: string[] = [], failed: string[] = [];
  if (!ops.some(isSlice)) return { ops, made, failed };
  const out: unknown[] = [];
  for (const o of ops) {
    if (!isSlice(o)) { out.push(o); continue; }
    try {
      const bufs = await loadClipsFor([o.from]);
      const src = bufs.get(o.from);
      if (!src) throw new Error(`no clip ${o.from}`);
      const cut = sliceBuffer(src, Math.max(0, o.at), o.length && o.length > 0 ? Math.min(4, o.length) : undefined);
      const bytes = await audioBufferToWav(cut).arrayBuffer();
      const role = o.role && (DRUM.includes(o.role) || o.role === "audio") ? o.role : "audio";
      const id = o.id ?? `slice_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const name = o.name ?? `${role} at ${o.at.toFixed(1)}s`;
      await putClip({ id, name, type: "audio/wav", bytes, createdAt: Date.now(), durationSec: cut.duration });
      cacheDecoded(id, await decodeBytes(bytes.slice(0)));
      register?.({ id, name, durationSec: cut.duration });
      const clip = { clipId: id, name, oneShot: true, semitones: 0, gainDb: 0, durationSec: cut.duration };
      if (role !== "audio") {
        const trackId = o.track ?? song.tracks.find((t) => t.role === role)?.id ?? role;
        if (!song.tracks.some((t) => t.id === trackId)) {
          const steps = role === "kick" ? "X...X...X...X..." : role === "snare" || role === "clap" ? "....X.......X..." : role === "hat" ? "..x...x...x...x." : "......x.......x.";
          out.push({ op: "grid", track: trackId, role, name: name.slice(0, 24), steps, midi: role === "kick" ? 36 : role === "snare" ? 38 : role === "clap" ? 39 : 42, volume: role === "kick" ? 0 : -8 });
          for (const s of song.sections) if (!/break/i.test(s.name) || role !== "kick") out.push({ op: "active", section: s.id, add: [trackId] });
        }
        out.push({ op: "set", track: trackId, path: "clip", value: clip });
      } else {
        const trackId = o.track ?? id;
        out.push({ op: "addTrack", track: { id: trackId, name: name.slice(0, 24), role: "audio", volume: -4, duck: true, loopBeats: 4, notes: [[60, 0, 0.5, 110]], clip } });
        for (const s of song.sections) if (/drop|groove/i.test(s.name)) out.push({ op: "active", section: s.id, add: [trackId] });
      }
      made.push(`${name} (${cut.duration.toFixed(2)} s)`);
    } catch (e) { failed.push(`${o.from} at ${o.at}: ${e instanceof Error ? e.message : "failed"}`); }
  }
  return { ops: out, made, failed };
}
