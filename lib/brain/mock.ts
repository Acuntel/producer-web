// A stand-in brain for the harness only. It never runs for a real user: the routes use it
// only when PRODUCER_MOCK=1 is set on the server or the request carries ?mock=1, and the
// harness sets both. Its job is to exercise every seam the real brain drives (research,
// tasks, auditions, stop, the landing) with deterministic answers, so the ritual can be
// proven end to end even when no model key has credit.
import type { VoiceControl, VoiceState } from "./voice";
import type { Song } from "../song/types";

const CMD = /\b(play|hear|audition|listen|run it|spin it)\b/i;
const STOP = /^(stop|hold on|wait|pause|enough)\b/i;
const CHANGE = /\b(make|add|drop|build|darker|louder|quieter|deeper|harder|faster|slower|bass|kick|hat|clap|drum|groove|synth|pad|hook)\b/i;

export function mockVoice(state: VoiceState, utterance: string): { say: string; control: VoiceControl } {
  const t = utterance.trim();
  if (state.screen === "landing") {
    if (/new (project|record|song)/i.test(t)) return { say: "New record. Who are we chasing tonight?", control: { new: true } };
    const m = t.match(/open (.+)/i);
    if (m) return { say: `Opening ${m[1]}.`, control: { open: m[1].trim() } };
    return { say: "Say new project, or name one to open.", control: {} };
  }
  if (STOP.test(t)) return { say: "Stopped.", control: { stop: true } };
  if (CMD.test(t)) return { say: "Playing eight bars. Say stop any time.", control: { audition: { section: "current", bars: 8 } } };
  if (CHANGE.test(t)) return { say: "On it. One second.", control: { task: t } };
  // Anything else on a blank record is the name of who we are chasing: research it, keep asking.
  if (state.song.tracks.length === 0 && state.research.length === 0) return { say: `${t}. Good. The swagger side or the ballad side?`, control: { research: t } };
  if (state.research.length) return { say: "Got it. I have the facts on them now, want me to build the first sixteen bars?", control: {} };
  return { say: "Got it.", control: {} };
}

// The mock Hands: a blank record gets a small real groove (kick, hats, a bass line) so an audition
// has something to play; a record with a bass gets a darker bass. Always a report line.
export function mockHands(song: Song): { say: string; ops: unknown[] | null; song: Song | null; listen: string | null } {
  if (song.tracks.length === 0) {
    const s: Song = {
      ...song, title: song.title === "Untitled" ? "MOCK GROOVE" : song.title, bpm: 124, key: "A minor",
      tracks: [
        { id: "kick", name: "Kick", role: "kick", volume: 0, loopBeats: 4, notes: [[36, 0, 0.25, 122], [36, 1, 0.25, 118], [36, 2, 0.25, 122], [36, 3, 0.25, 118]] },
        { id: "hat", name: "Hats", role: "hat", volume: -9, duck: true, loopBeats: 4, notes: [[42, 0.5, 0.1, 96], [42, 1.5, 0.1, 90], [42, 2.5, 0.1, 96], [42, 3.5, 0.1, 90]] },
        { id: "bass", name: "Bass", role: "bass", volume: -3, duck: true, loopBeats: 4, notes: [[45, 0.5, 0.4, 110], [45, 1.5, 0.4, 100], [48, 2.5, 0.4, 106], [43, 3.5, 0.4, 100]] },
      ],
      sections: [{ id: "drop", name: "Drop", bars: 16, active: ["kick", "hat", "bass"], fill: "none", energy: 1 }],
      arrangement: ["drop"],
    };
    return { say: "Kick, hats and a rolling bass are in. Sixteen bars, A minor, one twenty four.", ops: null, song: s, listen: "the bass on the offbeats" };
  }
  const bass = song.tracks.find((t) => t.role === "bass");
  if (bass) return { say: "Bass down two and the filter closed. Darker now.", ops: [{ op: "transpose", track: bass.id, semitones: -2 }, { op: "set", track: bass.id, path: "synth.cutoff", value: 240 }], song: null, listen: "the bass sitting lower under the kick" };
  return { say: "Nothing to change there yet.", ops: null, song: null, listen: null };
}

export const mockRequested = (req: Request) => process.env.PRODUCER_MOCK === "1" && new URL(req.url).searchParams.get("mock") === "1";
