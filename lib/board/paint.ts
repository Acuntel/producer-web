// The console, painted. Everything here is a measurement: the hits are the ones the
// transport will fire, the needles are the meters on the live output, the spectrum is
// the analyser on the master, and the loudness is what the ears measured. Nothing is
// decorative and nothing is clickable; it is a window onto the record, not a control panel.
import type { Ev } from "../engine/schedule";

export const C = {
  bg: "#050507", s1: "#0b0b10", s2: "#12121a", s3: "#1b1b24", line: "#282834",
  ink: "#f6f6fa", ink2: "#b6b6c6", ink3: "#8e8ea0",
  live: "#39ff88", accent: "#ff2d92", warn: "#ffb020", cool: "#8b5cf6", hot: "#ff4d4d",
};

export type LaneModel = { id: string; name: string; role: string; color: string; melodic: boolean; pMin: number; pMax: number; audio: boolean; clipName?: string };
export type SectionModel = { id: string; name: string; bars: number; startBeat: number; beats: number; energy: number; label: string };
export type Frame = {
  lanes: LaneModel[];
  sections: SectionModel[];
  totalBeats: number;
  bpm: number;
  key: string;
  beat: number | null;               // absolute beats, null when stopped
  sectionIdx: number;
  events: Map<string, Ev[]>;         // per track, absolute beats, already humanized
  audible: Set<string>;
  master: [number, number];          // dBFS L/R from the meter
  peakHold: [number, number];
  rms3s: number;                     // dB over the last three seconds of output
  tracks: Record<string, number>;    // dBFS per track
  trackHold: Record<string, number>;
  spectrum: Float32Array | null;
  lufs: number | null;               // integrated, measured by the ears
  measuredBpm: number | null;
  energyCurve: number[] | null;      // per bar, from the ears
  dropAtBeat: number | null;
  late: number;
  cacheMb: number;
  moves: { trackId: string; label: string; at: number }[];
  now: number;
};

const PAD = 12;
const RULER_H = 18;
// A phone gets the same information in less room: shorter names, a tighter meter, a shallower desk,
// and the lanes keep whatever is left, because the lanes are the record.
const shape = (w: number) => (w < 520
  ? { nameW: 74, meterW: 54, masterH: 52, arrH: 38, laneMin: 13, laneMax: 30, compact: true }
  : { nameW: 104, meterW: 74, masterH: 96, arrH: 46, laneMin: 18, laneMax: 34, compact: false });

const dbUnit = (db: number, floor = -60) => Math.max(0, Math.min(1, (db - floor) / -floor));
const tnum = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "--");
const meterColor = (db: number) => (db > -3 ? C.hot : db > -12 ? C.warn : C.live);

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, opts: { size?: number; color?: string; align?: CanvasTextAlign; weight?: number } = {}) {
  ctx.font = `${opts.weight ?? 500} ${opts.size ?? 11}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillStyle = opts.color ?? C.ink3;
  ctx.textAlign = opts.align ?? "left";
  ctx.textBaseline = "middle";
  ctx.fillText(s, x, y);
}

/** One frame of the whole console. `w` and `h` are CSS pixels; the context is already scaled. */
export function paint(ctx: CanvasRenderingContext2D, w: number, h: number, f: Frame) {
  ctx.clearRect(0, 0, w, h);
  const s = shape(w);
  const gridX = PAD + s.nameW + s.meterW;
  const gridW = Math.max(40, w - gridX - PAD);
  let y = PAD;
  y = readout(ctx, w, y, f, s.compact);
  y = arrangement(ctx, PAD, y, w - PAD * 2, f, s.arrH);
  y = ruler(ctx, gridX, y, gridW, f);
  const lanesH = Math.max(s.laneMin, h - y - s.masterH - PAD);
  lanes(ctx, PAD, y, lanesH, gridX, gridW, f, s);
  master(ctx, PAD, h - s.masterH, w - PAD * 2, s.masterH - PAD, f, s.compact);
}

// The corner a DAW keeps: where we are, the tempo set against the tempo measured, and the dropouts.
function readout(ctx: CanvasRenderingContext2D, w: number, y: number, f: Frame, compact: boolean): number {
  const bar = f.beat === null ? null : Math.floor(f.beat / 4) + 1;
  const beatInBar = f.beat === null ? null : Math.floor(f.beat % 4) + 1;
  const sec = f.sections[f.sectionIdx];
  const where = bar === null ? "stopped" : `${bar}.${beatInBar}`;
  text(ctx, where, PAD, y + 7, { size: 13, color: C.ink, weight: 700 });
  const barsTotal = Math.round(f.totalBeats / 4);
  text(ctx, `of ${barsTotal} bars${sec ? ` · ${sec.name}` : ""}`, PAD + 46, y + 7, { size: 11, color: C.ink3 });
  const right: string[] = [`${f.bpm} BPM`];
  if (!compact && f.measuredBpm !== null && Math.abs(f.measuredBpm - f.bpm) >= 0.2) right.push(`${tnum(f.measuredBpm)} heard`);
  if (!compact) right.push(f.key);
  if (f.late > 0) right.push(`${f.late} dropouts`);   // never shortened to "drop": that word is the music
  text(ctx, right.join("   "), w - PAD, y + 7, { size: 11, align: "right", color: f.late > 0 ? C.warn : C.ink3 });
  return y + 20;
}

// The arrangement: sections by length, shaded by their energy target, with the energy the ears
// actually measured drawn over them and the drop marked.
function arrangement(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, f: Frame, arrH: number): number {
  const h = arrH - 14;
  ctx.fillStyle = C.s1; ctx.fillRect(x, y, w, h);
  const per = w / Math.max(1, f.totalBeats);
  for (let i = 0; i < f.sections.length; i++) {
    const s = f.sections[i];
    const sx = x + s.startBeat * per, sw = Math.max(1, s.beats * per - 2);
    const now = i === f.sectionIdx && f.beat !== null;
    ctx.fillStyle = now ? "rgba(57,255,136,0.16)" : C.s2;
    ctx.fillRect(sx, y, sw, h);
    ctx.fillStyle = now ? "rgba(57,255,136,0.3)" : "rgba(255,255,255,0.06)";
    const eh = Math.round(h * Math.max(0.05, s.energy));
    ctx.fillRect(sx, y + h - eh, sw, eh);
    if (sw > s.name.length * 6.6 + 10) text(ctx, s.name.toUpperCase(), sx + 5, y + h / 2, { size: 10, color: now ? C.live : C.ink3, weight: 700 });
  }
  // What the ears measured, bar by bar, over the top.
  if (f.energyCurve && f.energyCurve.length > 1) {
    ctx.beginPath();
    for (let b = 0; b < f.energyCurve.length; b++) {
      const px = x + b * 4 * per, py = y + h - Math.max(1, f.energyCurve[b] * (h - 2));
      if (b === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = "rgba(246,246,250,0.55)"; ctx.lineWidth = 1; ctx.stroke();
  }
  if (f.dropAtBeat !== null) {
    const dx = x + f.dropAtBeat * per;
    ctx.fillStyle = C.accent;
    ctx.beginPath(); ctx.moveTo(dx - 4, y - 1); ctx.lineTo(dx + 4, y - 1); ctx.lineTo(dx, y + 5); ctx.closePath(); ctx.fill();
  }
  if (f.beat !== null) {
    const px = x + f.beat * per;
    ctx.fillStyle = C.ink; ctx.fillRect(px, y - 2, 1, h + 4);
  }
  return y + arrH;
}

// Every beat of the bar you are in, and the sixteenths between them.
function ruler(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, f: Frame): number {
  const per = w / 4;
  for (let b = 0; b < 4; b++) {
    const bx = x + b * per;
    ctx.fillStyle = C.line; ctx.fillRect(bx, y + 6, 1, RULER_H - 8);
    text(ctx, String(b + 1), bx + 4, y + RULER_H - 4, { size: 10, color: C.ink3, weight: 700 });
    for (let s = 1; s < 4; s++) { ctx.fillStyle = "rgba(40,40,52,0.7)"; ctx.fillRect(bx + (s * per) / 4, y + 12, 1, RULER_H - 14); }
  }
  return y + RULER_H;
}

// One lane per track: its level in decibels with a peak hold, and the hits of the bar you are in,
// placed where they will actually fire, tall as their velocity.
function lanes(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, gridX: number, gridW: number, f: Frame, s: ReturnType<typeof shape>) {
  const n = Math.max(1, f.lanes.length);
  const laneH = Math.max(s.laneMin, Math.min(s.laneMax, h / n));
  const barStart = f.beat === null ? 0 : Math.floor(f.beat / 4) * 4;
  const per = gridW / 4;
  for (let i = 0; i < f.lanes.length; i++) {
    const L = f.lanes[i];
    const ly = y + i * laneH;
    if (ly + laneH > y + h + 1) { text(ctx, `+${f.lanes.length - i} more`, x, ly + 8, { size: 10, color: C.ink3 }); break; }
    const on = f.audible.has(L.id);
    const db = f.tracks[L.id] ?? -100;
    const hold = f.trackHold[L.id] ?? -100;
    ctx.globalAlpha = on ? 1 : 0.4;

    const room = Math.floor((s.nameW - 12) / 6.2);
    text(ctx, L.name.length > room ? `${L.name.slice(0, room - 1)}…` : L.name, x + 10, ly + laneH / 2, { size: 11, color: on ? C.ink2 : C.ink3 });
    ctx.fillStyle = L.color; ctx.beginPath(); ctx.arc(x + 4, ly + laneH / 2, 2.5, 0, Math.PI * 2); ctx.fill();

    // The meter: a bar in decibels with the peak held, and the number beside it.
    const mx = x + s.nameW, mw = s.meterW - 28, mh = Math.max(4, Math.min(10, laneH - 12));
    ctx.fillStyle = C.s2; ctx.fillRect(mx, ly + (laneH - mh) / 2, mw, mh);
    if (on && db > -100) {
      ctx.fillStyle = meterColor(db);
      ctx.fillRect(mx, ly + (laneH - mh) / 2, mw * dbUnit(db), mh);
    }
    if (hold > -60) { ctx.fillStyle = meterColor(hold); ctx.fillRect(mx + mw * dbUnit(hold) - 1, ly + (laneH - mh) / 2, 1.5, mh); }
    text(ctx, on ? (db > -60 ? tnum(db, 0) : "--") : "mute", mx + s.meterW - 30 + 26, ly + laneH / 2, { size: 10, align: "right", color: on ? C.ink3 : C.warn });

    // The bar: the beat grid, then the hits that will fire in it.
    const gy = ly + 2, gh = laneH - 5;
    ctx.fillStyle = C.s1; ctx.fillRect(gridX, gy, gridW, gh);
    for (let b = 1; b < 4; b++) { ctx.fillStyle = C.line; ctx.fillRect(gridX + b * per, gy, 1, gh); }
    for (let s = 0; s < 16; s++) { if (s % 4) { ctx.fillStyle = "rgba(40,40,52,0.45)"; ctx.fillRect(gridX + (s * per) / 4, gy, 1, gh); } }
    if (L.audio) {
      ctx.fillStyle = `${L.color}33`; ctx.fillRect(gridX, gy, gridW, gh);
      text(ctx, L.clipName ?? "audio", gridX + 5, gy + gh / 2, { size: 10, color: C.ink2 });
    }
    const evs = f.events.get(L.id) ?? [];
    const span = Math.max(1, L.pMax - L.pMin);
    for (const e of evs) {
      const rel = e.beat - barStart;
      if (rel < -0.05 || rel >= 4) continue;
      const ex = gridX + rel * per;
      const vel = Math.max(0.04, e.note[3] / 127);
      if (L.melodic) {
        const ey = gy + (1 - (e.note[0] - L.pMin) / span) * (gh - 5) + 1;
        const ew = Math.max(2, (e.note[2] / 4) * gridW);
        ctx.fillStyle = L.color; ctx.globalAlpha = (on ? 1 : 0.4) * (0.45 + vel * 0.55);
        ctx.fillRect(ex, ey, ew, 3);
      } else {
        const eh = Math.max(2, vel * (gh - 3));
        ctx.fillStyle = L.color; ctx.globalAlpha = (on ? 1 : 0.4) * (0.5 + vel * 0.5);
        ctx.fillRect(ex, gy + gh - eh - 1, 2, eh);
      }
      ctx.globalAlpha = on ? 1 : 0.4;
    }
    // What the producer just did to this track, over its lane for a few seconds, never past its edge.
    const move = f.moves.find((m) => m.trackId === L.id && f.now - m.at < 3500);
    if (move) {
      const room = Math.max(6, Math.floor((gridW - 16) / 6.2));
      const label = move.label.length > room ? `${move.label.slice(0, room - 1)}…` : move.label;
      const tw = label.length * 6.2 + 10;
      ctx.fillStyle = "rgba(5,5,7,0.82)"; ctx.fillRect(gridX + gridW - 4 - tw, gy + 1, tw, gh - 2);
      text(ctx, label, gridX + gridW - 9, ly + laneH / 2, { size: 10, align: "right", color: C.live, weight: 700 });
    }
    ctx.globalAlpha = 1;
  }
  // One playhead across every lane, where a desk puts it.
  if (f.beat !== null) {
    const px = gridX + ((f.beat - barStart) / 4) * gridW;
    ctx.fillStyle = C.ink; ctx.fillRect(px, y, 1, Math.min(h, f.lanes.length * laneH));
  }
}

// The master: what leaves the desk, in decibels, in loudness, and across the spectrum.
function master(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: Frame, compact: boolean) {
  ctx.fillStyle = C.s1; ctx.fillRect(x, y, w, h);
  const numX = x + (compact ? 44 : 84);
  const specX = x + (compact ? 130 : 176);
  const specW = Math.max(60, w - (specX - x) - 8);
  const mh = h - 20;
  // Two needles with a scale, the way a desk shows its output.
  for (let i = 0; i < 2; i++) {
    const db = f.master[i], hold = f.peakHold[i];
    const mx = x + 8 + i * 14, mw = 9;
    ctx.fillStyle = C.s3; ctx.fillRect(mx, y + 6, mw, mh);
    const lit = mh * dbUnit(db);
    ctx.fillStyle = meterColor(db); ctx.fillRect(mx, y + 6 + mh - lit, mw, lit);
    if (hold > -60) { ctx.fillStyle = hold > -1 ? C.hot : C.ink; ctx.fillRect(mx, y + 6 + mh - mh * dbUnit(hold) - 1, mw, 1.5); }
    text(ctx, i ? "R" : "L", mx + mw / 2, y + h - 6, { size: 9, align: "center", color: C.ink3 });
  }
  // The scale: every tick is drawn, but a label only where it has room (11 px from the last one), so the
  // top of the scale never piles 0, -6 and -12 on top of each other on a short desk.
  if (!compact) {
    let lastY = -Infinity;
    for (const db of [0, -6, -12, -24, -48]) {
      const ly = y + 6 + mh * (1 - dbUnit(db));
      ctx.fillStyle = "rgba(40,40,52,0.9)"; ctx.fillRect(x + 40, ly, 12, 1);
      if (ly - lastY >= 11) { text(ctx, String(db), x + 55, ly, { size: 9, color: C.ink3 }); lastY = ly; }
    }
  }
  // The numbers a mix is judged by. PEAK is the loudest real sample (the desk's ceiling is -1 dBFS), RMS is
  // three seconds of level, LUFS is the whole record as the ears measured it. Laid out to the room there is:
  // stacked when tall, side by side when short, and the least needed row dropped before anything overlaps.
  const peak = Math.max(f.peakHold[0], f.peakHold[1]);
  const all: [string, string, string][] = [
    ["PEAK", `${tnum(peak)} dB`, peak > -1.2 ? C.hot : C.ink],
    ["LUFS", f.lufs === null ? "hearing" : tnum(f.lufs), C.ink2],
    ["RMS 3s", `${tnum(f.rms3s)} dB`, C.ink2],
  ];
  const valueRight = specX - 10;
  const stacked = !compact && mh / all.length >= 26;
  // Side by side, a row is a 9 px label and a right-aligned number in the 76 to 82 px between the needles and the
  // spectrum: "RMS 3s" shortens to "RMS" to fit, and the phone desk keeps two rows.
  const fit = Math.max(1, Math.min(compact ? 2 : all.length, Math.floor(mh / 14)));
  const rows = stacked ? all : all.slice(0, fit).map(([l, v, c]) => [l === "RMS 3s" ? "RMS" : l, v, c] as [string, string, string]);
  const rowH = mh / rows.length;
  rows.forEach(([label, value, color], i) => {
    const ry = y + 6 + i * rowH;
    if (stacked) { text(ctx, label, numX, ry + rowH * 0.3, { size: 9, color: C.ink3, weight: 700 }); text(ctx, value, numX, ry + rowH * 0.72, { size: 12, color }); }
    else { text(ctx, label, numX, ry + rowH / 2, { size: 9, color: C.ink3, weight: 700 }); text(ctx, value, valueRight, ry + rowH / 2, { size: compact ? 10 : 11, color, align: "right" }); }
  });

  // The spectrum on a log axis, the way an analyser reads: decades marked, the curve filled.
  const sp = f.spectrum;
  ctx.fillStyle = C.bg; ctx.fillRect(specX, y + 6, specW, mh);
  const fMin = 20, fMax = 20000, logMin = Math.log10(fMin), logSpan = Math.log10(fMax) - logMin;
  for (const hz of compact ? [100, 1000, 10000] : [30, 100, 300, 1000, 3000, 10000]) {
    const gx = specX + ((Math.log10(hz) - logMin) / logSpan) * specW;
    ctx.fillStyle = "rgba(40,40,52,0.8)"; ctx.fillRect(gx, y + 6, 1, mh);
    text(ctx, hz >= 1000 ? `${hz / 1000}k` : String(hz), gx + 3, y + 6 + mh - 7, { size: 9, color: C.ink3 });
  }
  if (sp && sp.length) {
    const nyq = 22050, binHz = nyq / sp.length, top = y + 6, bh = mh;
    ctx.beginPath(); ctx.moveTo(specX, top + bh);
    for (let px = 0; px <= specW; px += 2) {
      const hz = Math.pow(10, logMin + (px / specW) * logSpan);
      const bin = Math.min(sp.length - 1, Math.max(0, Math.round(hz / binHz)));
      const v = Math.max(0, Math.min(1, (sp[bin] + 100) / 100));
      ctx.lineTo(specX + px, top + bh - v * bh);
    }
    ctx.lineTo(specX + specW, top + bh); ctx.closePath();
    ctx.fillStyle = "rgba(57,255,136,0.18)"; ctx.fill();
    ctx.strokeStyle = C.live; ctx.lineWidth = 1; ctx.stroke();
  }
}
