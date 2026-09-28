// A window of the arranged record, rendered offline: the same rig the room plays, started at a bar inside the song
// (loops caught up to their phase there), for as many bars as a check needs. The ears render only what they are
// asked to judge: a vocal placement is the bars before its anchor and the bar it lands on, never the whole record.
import type { Song, Track } from "../song/types";
import { buildGraphInSteps } from "./graph";
import { renderInSteps } from "./offline";
import { loadClipsFor, clipKeysFor } from "./clips";
import { getKit } from "./kits";
import { ensureStudioContext } from "./context";

export type WindowOptions = { sampleRate?: number; audible?: (t: Track) => boolean; tailSec?: number };

/** Beats `fromBeat` to `toBeat` of the arrangement as audio. `audible` keeps only the tracks it names (a stem group). */
export async function renderWindow(song: Song, fromBeat: number, toBeat: number, o: WindowOptions = {}): Promise<AudioBuffer> {
  const clips = await loadClipsFor(clipKeysFor(song), "check");
  const kit = await getKit(song.lane, song.kit, song.bpm);
  ensureStudioContext();
  // Only the tracks it is asked for are built: a voice heard alone lays one part, not the whole record, so the render
  // is a few milliseconds of the page's thread instead of a whole rig.
  const only = o.audible;
  const keep = only ? new Set(song.tracks.filter(only).map((t) => t.id)) : null;
  const s: Song = keep ? { ...song, loop: null, tracks: song.tracks.filter((t) => keep.has(t.id)).map((t) => ({ ...t, mute: false, solo: false })), sections: song.sections.map((q) => ({ ...q, active: q.active.filter((id) => keep.has(id)) })) } : { ...song, loop: null };
  const secs = ((toBeat - fromBeat) * 60) / song.bpm + (o.tailSec ?? 0.25);
  return renderInSteps(secs, 2, o.sampleRate ?? 22050, function* (transport) {
    const g = yield* buildGraphInSteps(s, transport, clips, kit);
    transport.start(0, `${Math.round(fromBeat * transport.PPQ)}i`);
    g.rig.catchUp(s, fromBeat, 0);
  });
}
