// Turn a SongDoc into absolute-beat events: pattern variants, solo/mute, fills,
// deterministic humanization, transposition, automation ramps, clip spans.
import type { Song, Track, Note, Automation, Section } from "../song/types";
import { isDrum } from "../song/types";
import { patternFor } from "../song/pattern";
export { patternFor };

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

// Deterministic PRNG: same seed, same feel, forever.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function audibleTracks(song: Song): Set<string> {
  const anySolo = song.tracks.some((t) => t.solo && !t.mute);
  return new Set(song.tracks.filter((t) => !t.mute && (!anySolo || t.solo)).map((t) => t.id));
}


export function scheduleEvents(song: Song): Schedule {
  const rng = mulberry32(song.humanize.seed);
  const swingShift = (song.humanize.swing - 0.5) * 0.5; // beats added to offbeat 16ths
  const beatSec = 60 / song.bpm;
  const clapLate = (song.humanize.clapLateMs / 1000) / beatSec;
  const pocket = ((song.humanize.pocketMs ?? 0) / 1000) / beatSec;
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
      const notes = patternFor(tr, sec);
      if (tr.role === "audio" && !tr.clip?.oneShot) {
        clipSpans.push({ trackId: tr.id, startBeat: cursor, beats: secBeats });
        continue;
      }
      if (notes.length === 0) continue;
      const list = perTrack.get(tr.id) ?? [];
      const loop = Math.max(0.25, tr.loopBeats);
      const reps = Math.ceil(secBeats / loop);
      const transpose = tr.transpose ?? 0;
      for (let r = 0; r < reps; r++) {
        for (const n of notes) {
          const local = r * loop + n[1];
          if (local >= secBeats) continue;
          // fill "cut": kick/bass/sub out for the final 2 beats, everything out for the last half beat.
          if (sec.fill === "cut" && local >= secBeats - 2 && ["kick", "bass", "sub"].includes(tr.role)) continue;
          if (sec.fill === "cut" && local >= secBeats - 0.5) continue;
          let beat = cursor + local;
          let vel = n[3];
          const frac = Math.round((n[1] % 0.5) * 100) / 100;
          const isOffbeat16 = frac === 0.25;
          if (isOffbeat16 && ["hat", "openhat", "perc", "bass", "pluck", "arp", "snare"].includes(tr.role)) beat += swingShift;
          if (tr.role === "clap") beat += clapLate;
          if (tr.role !== "kick") beat += pocket;
          if (["hat", "openhat", "snare", "perc"].includes(tr.role) && song.humanize.velVar > 0) {
            vel = Math.max(15, Math.min(127, Math.round(vel * (1 + (rng() - 0.5) * 2 * song.humanize.velVar))));
          }
          const midi = isDrum(tr.role) || tr.role === "audio" ? n[0] : n[0] + transpose;
          list.push({ beat: Math.max(0, beat), note: [midi, n[1], n[2], vel] });
          if (tr.role === "kick") kickBeats.push(beat);
        }
      }
      perTrack.set(tr.id, list);
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
