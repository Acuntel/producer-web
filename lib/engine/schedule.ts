// Turn a SongDoc into absolute-beat events: pattern variants and playlists,
// solo/mute, fills, deterministic humanization (groove pool, note chance,
// velocity deviation), transposition, automation ramps, clip spans.
import type { Song, Track, Note, Automation, Section } from "../song/types";
import { isDrum } from "../song/types";
import { patternFor } from "../song/pattern";
import { streamFor } from "../song/prng";
import { grooveFor, applyGroove } from "../song/groove";
export { patternFor };
export { mulberry32 } from "../song/prng";

export type Ev = { beat: number; note: Note };
export type SectionSpan = { id: string; name: string; startBeat: number; beats: number; fill: Section["fill"]; energy?: number };
export type AutoEv = Automation & { startBeat: number; endBeat: number };   // absolute beats
export type ClipSpan = { trackId: string; startBeat: number; beats: number };
export type Schedule = {
  perTrack: Map<string, Ev[]>;
  kickBeats: number[];
  totalBeats: number;
  sectionStarts: SectionSpan[];
  automation: AutoEv[];
  clipSpans: ClipSpan[];
  audible: Set<string>;
};

// Roles whose velocities carried the legacy humanize.velVar looseness; a track's own velDev overrides it.
const LOOSE_ROLES = ["hat", "openhat", "snare", "perc"];

export function audibleTracks(song: Song): Set<string> {
  const anySolo = song.tracks.some((t) => t.solo && !t.mute);
  return new Set(song.tracks.filter((t) => !t.mute && (!anySolo || t.solo)).map((t) => t.id));
}

type Feel = { beatSec: number; clapLate: number; pocket: number; velVar: number; seed: number };

// One track in one section: tile the pattern bar by bar (playlists may change it every bar,
// the loop phase is kept so 8-beat patterns play whole), then humanize each hit from the
// track's own seeded stream: chance roll, groove timing and accents, velocity deviation.
function trackEvents(song: Song, sec: Section, tr: Track, cursor: number, feel: Feel, list: Ev[], kickBeats: number[]) {
  const secBeats = sec.bars * 4;
  const loop = Math.max(0.25, tr.loopBeats);
  const rng = streamFor(feel.seed, `${sec.id}:${tr.id}`);
  const groove = grooveFor(tr, song);
  const transpose = tr.transpose ?? 0;
  const dev = tr.velDev ?? (LOOSE_ROLES.includes(tr.role) ? Math.round(feel.velVar * 80) : 0);
  const cut = sec.fill === "cut";
  for (let bar = 0; bar < sec.bars; bar++) {
    const notes = patternFor(tr, sec, bar, feel.seed);
    if (notes.length === 0) continue;
    const b0 = bar * 4, b1 = b0 + 4;
    const r0 = Math.floor(b0 / loop), r1 = Math.ceil(b1 / loop);
    for (let r = r0; r < r1; r++) {
      for (const n of notes) {
        const local = r * loop + n[1];
        if (local < b0 || local >= b1 || local >= secBeats) continue;
        // fill "cut": kick/bass/sub out for the final 2 beats, everything out for the last half beat, and a
        // note that starts before its cut ends there instead of ringing on into the gap.
        const cutAt = cut ? secBeats - (["kick", "bass", "sub"].includes(tr.role) ? 2 : 0.5) : Infinity;
        if (local >= cutAt) continue;
        const len = Math.min(n[2], cutAt - local);
        const chance = n[4] ?? tr.chance ?? 1;
        if (chance < 1 && rng() >= chance) continue;
        const hit = applyGroove(local, n[3], groove, rng, feel.beatSec);
        let beat = cursor + hit.beat;
        let vel = hit.vel;
        if (tr.role === "clap") beat += feel.clapLate;
        if (tr.role !== "kick") beat += feel.pocket;
        if (dev > 0) vel = Math.max(1, Math.min(127, vel + Math.round((rng() * 2 - 1) * dev)));
        const midi = isDrum(tr.role) || tr.role === "audio" ? n[0] : n[0] + transpose;
        list.push({ beat: Math.max(0, beat), note: [midi, n[1], len, vel] });
        if (tr.role === "kick") kickBeats.push(beat);
      }
    }
  }
}

export function scheduleEvents(song: Song): Schedule {
  const beatSec = 60 / song.bpm;
  const feel: Feel = {
    beatSec,
    clapLate: (song.humanize.clapLateMs / 1000) / beatSec,
    pocket: ((song.humanize.pocketMs ?? 0) / 1000) / beatSec,
    velVar: song.humanize.velVar,
    seed: song.humanize.seed,
  };
  const audible = audibleTracks(song);

  const perTrack = new Map<string, Ev[]>();
  const kickBeats: number[] = [];
  const sectionStarts: SectionSpan[] = [];
  const automation: AutoEv[] = [];
  const clipSpans: ClipSpan[] = [];
  let cursor = 0;

  const secById = new Map(song.sections.map((s) => [s.id, s]));
  for (const secId of song.arrangement) {
    const sec = secById.get(secId);
    if (!sec) continue;
    const secBeats = sec.bars * 4;
    sectionStarts.push({ id: sec.id, name: sec.name, startBeat: cursor, beats: secBeats, fill: sec.fill, energy: sec.energy });

    for (const tr of song.tracks) {
      if (!audible.has(tr.id) || !sec.active.includes(tr.id)) continue;
      if (tr.role === "audio" && !tr.clip?.oneShot) {
        clipSpans.push({ trackId: tr.id, startBeat: cursor, beats: secBeats });
        continue;
      }
      const list = perTrack.get(tr.id) ?? [];
      trackEvents(song, sec, tr, cursor, feel, list, kickBeats);
      if (list.length) perTrack.set(tr.id, list);
    }
    // fill "roll": clap crescendo through the final 2 beats.
    if (sec.fill === "roll") {
      const clap = song.tracks.find((t) => t.role === "clap" && sec.active.includes(t.id) && audible.has(t.id))
        ?? song.tracks.find((t) => t.role === "clap" && audible.has(t.id));
      if (clap) {
        const list = perTrack.get(clap.id) ?? [];
        for (let i = 0; i < 8; i++) {
          const beat = cursor + secBeats - 2 + i * 0.25;
          if (list.some((e) => Math.abs(e.beat - beat) < 0.02)) continue; // the regular clap already lands here
          list.push({ beat, note: [39, 0, 0.1, 70 + i * 8] });
        }
        list.sort((a, b) => a.beat - b.beat);
        perTrack.set(clap.id, list);
      }
    }
    for (const a of sec.automation ?? []) {
      if (a.track !== "master" && !audible.has(a.track)) continue;
      const s0 = Math.max(0, Math.min(secBeats, a.startBeat ?? 0));
      const s1 = Math.max(s0 + 0.25, Math.min(secBeats, a.endBeat ?? secBeats));
      automation.push({ ...a, startBeat: cursor + s0, endBeat: cursor + s1 });
    }
    cursor += secBeats;
  }
  return { perTrack, kickBeats, totalBeats: cursor, sectionStarts, automation, clipSpans, audible };
}

// Where a beat falls: section, bar within it, absolute bar.
export function locate(sectionStarts: SectionSpan[], beat: number) {
  const s = sectionStarts.find((x) => beat >= x.startBeat && beat < x.startBeat + x.beats);
  if (!s) return null;
  return { section: s.name, sectionId: s.id, index: sectionStarts.indexOf(s), barInSection: Math.floor((beat - s.startBeat) / 4) + 1, beatInBar: Math.floor(beat % 4) + 1, absBar: Math.floor(beat / 4) + 1 };
}

// Loop region in absolute beats for the transport.
export function loopBounds(song: Song, sectionStarts: SectionSpan[], totalBeats: number): { start: number; end: number } {
  const l = song.loop;
  if (l?.section) {
    const s = sectionStarts.find((x) => x.id === l.section || x.name.toLowerCase() === l.section!.toLowerCase());
    if (s) return { start: s.startBeat, end: s.startBeat + s.beats };
  }
  if (l && typeof l.startBar === "number" && typeof l.endBar === "number" && l.endBar > l.startBar) {
    return { start: Math.max(0, (l.startBar - 1) * 4), end: Math.min(totalBeats, l.endBar * 4) };
  }
  return { start: 0, end: totalBeats };
}
