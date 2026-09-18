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
  if (/\b(library|my records|what have we made|show (me )?(my )?(records|projects|songs))\b/i.test(t)) return { say: "Here is everything you have made.", control: { library: true } };
  if (state.screen === "landing" || state.screen === "library") {
    if (/new (project|record|song)/i.test(t)) return { say: "New record. Who are we chasing tonight?", control: { new: true } };
    const m = t.match(/open (.+)/i);
    if (m) return { say: `Opening ${m[1]}.`, control: { open: m[1].trim() } };
    return { say: "Say new project, or name one to open.", control: {} };
  }
  if (STOP.test(t)) return { say: "Stopped.", control: { stop: true } };
  const g = t.match(/\b(?:grab|pull|take|steal)\b.*?\b(synth|bass|vocal|vocals|kick|snare|hat|hats|pad|keys|guitar|piano)\b(?:.*?\bat\s+(\d+):(\d\d)|.*?\bat\s+(\d+(?:\.\d+)?)\s*s)?/i);
  if (g) { const at = g[2] ? Number(g[2]) * 60 + Number(g[3]) : g[4] ? Number(g[4]) : null; return { say: `Grabbing the ${g[1]}.`, control: { grab: { what: g[1], at } } }; }
  // "go learn the biggest house records of 2019": everything after the verb is the description,
  // minus the words that carry no genre and no year.
  const l = t.match(/\b(?:go\s+)?(?:learn|study)\b\s+(.*)$/i);
  if (l) {
    const what = l[1]
      .replace(/\b(some|the|a|an|biggest|best|top|new|more|about|of|from|in|records?|songs?|tracks?|tunes?)\b/gi, " ")
      .replace(/[^a-z0-9&\s-]/gi, " ").replace(/\s+/g, " ").trim();
    return { say: "Going out to listen to records. It takes a few minutes.", control: { learn: { what: what || null, count: 6 } } };
  }

  // "isolate the vocal from X and put it before the drop"
  const v = t.match(/\b(?:isolate|lift|steal|take)\b[^.]*?\b(?:vocal|voice|acapella|hook)\b(?:.*?\bfrom\s+([^,.]+?))?(?:\s*(?:and|then)?\s*(?:put|drop|place)\s+it\s+([^.]*))?$/i);
  if (v) return { say: `Isolating the voice${v[1] ? ` on ${v[1].trim()}` : ""} and putting it into the build.`, control: { vocal: { what: null, from: v[1]?.trim() ?? null, where: v[2]?.trim() ?? "before the drop" } } };
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
