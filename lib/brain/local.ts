// Instant intents: transport, mixer, loop, tempo, undo. Resolved on the client
// in zero milliseconds; the brain is told afterward so it stays in sync.
import type { Song, Track, Role } from "../song/types";
import { isDrum } from "../song/types";
import type { Op } from "../song/ops";
import type { BrainAction } from "./parse";

export type LocalIntent = { ops?: Op[]; action?: BrainAction; say: string; note: string; kind: string; history?: "undo" | "redo"; ab?: "a" | "b" | "keepA" | "keepB"; rollout?: "newSong" | "emulate" | "finish" | "fixSection" };

// Big builds are deterministic: these phrasings always run the process engine.
export function rolloutIntent(text: string, hasReference: boolean): { kind: "newSong" | "emulate" | "finish" | "fixSection"; section?: string } | null {
  const t = clean(text);
  if (/\b(make|build|produce|do) (it|this|our song|our track|the song|the track|something|one|a (song|track)) (like|in the style of|sound like|closer to) (the|this|that|my) (reference|ref|track i uploaded|upload)\b/.test(t) || /\b(emulate|chase|copy the dna of|match) (the|this|that|my) (reference|ref)\b/.test(t)) return { kind: hasReference ? "emulate" : "newSong" };
  if (/\b(new song|new track|fresh (song|track|one)|start (a )?(new|fresh) (song|track|one)|start over with a new (song|track)|make me a (new )?(song|track|record|banger|tune)|build me a (song|track|record)|write me a (song|track))\b/.test(t)) return { kind: hasReference ? "emulate" : "newSong" };
  if (/\b(finish (it|the song|the track|this)|build (it|this) out|take (it|this) to the end|complete (it|the song|the track)|full arrangement|arrange (it|this|the whole thing))\b/.test(t)) return { kind: "finish" };
  const m = t.match(/\b(rebuild|redo|remake|rework|fix|rewrite) (the |my )?(intro|groove|build ?2?|drop ?2?|second drop|breakdown|break|outro)\b/);
  if (m) return { kind: "fixSection", section: m[3].replace(/\s+/g, "") };
  return null;
}

const SYN: [RegExp, Role[] | "all-drums"][] = [
  [/\b(kicks?|kick drums?|bass drums?)\b/, ["kick"]],
  [/\b(claps?)\b/, ["clap"]],
  [/\b(snares?|ghost snares?|ghosts?)\b/, ["snare"]],
  [/\b(open ?hats?|open hi ?-?hats?)\b/, ["openhat"]],
  [/\b(hats?|hi ?-?hats?|hihats?|closed hats?)\b/, ["hat"]],
  [/\b(percs?|percussion|tambourines?|tambs?|shakers?)\b/, ["perc"]],
  [/\b(sub|subs|sub ?bass)\b/, ["sub"]],
  [/\b(bass|bassline|bass line|reese|warp)\b/, ["bass"]],
  [/\b(chords?|keys|piano)\b/, ["chords"]],
  [/\b(stabs?|hoovers?)\b/, ["stab"]],
  [/\b(pads?|strings|atmosphere)\b/, ["pad"]],
  [/\b(leads?|melody|top ?line)\b/, ["lead"]],
  [/\b(plucks?)\b/, ["pluck"]],
  [/\b(arps?|arpeggios?)\b/, ["arp"]],
  [/\b(vocals?|vox|samples?|clips?|audio)\b/, ["audio"]],
  [/\b(drums|beat|beats|percussions)\b/, "all-drums"],
];

const clean = (t: string) => t.toLowerCase().replace(/[^a-z0-9#\s.'-]/g, " ").replace(/\s+/g, " ").trim();

export function matchTracks(text: string, song: Song): Track[] {
  const t = clean(text);
  const byName = song.tracks.filter((tr) => tr.name.length > 2 && t.includes(tr.name.toLowerCase()));
  if (byName.length) return byName;
  for (const [re, roles] of SYN) {
    if (!re.test(t)) continue;
    if (roles === "all-drums") return song.tracks.filter((tr) => isDrum(tr.role));
    const found = song.tracks.filter((tr) => roles.includes(tr.role));
    if (found.length) return found;
  }
  return [];
}

function matchSection(text: string, song: Song): string | null {
  const t = clean(text);
  if (/\b(top|beginning|start of the (song|track))\b/.test(t)) return song.arrangement[0] ?? null;
  if (/\b(the end|outro)\b/.test(t)) return song.sections.find((s) => /outro/i.test(s.name))?.id ?? song.arrangement[song.arrangement.length - 1] ?? null;
  const ordered = [...song.sections].sort((a, b) => b.name.length - a.name.length);
  for (const s of ordered) {
    const n = s.name.toLowerCase();
    if (t.includes(n) || t.includes(s.id.toLowerCase())) return s.id;
  }
  if (/\bsecond drop|drop ?2|drop two\b/.test(t)) return song.sections.find((s) => /drop ?2/i.test(s.name))?.id ?? null;
  if (/\bdrop\b/.test(t)) return song.sections.find((s) => /^drop$/i.test(s.name) || /drop/i.test(s.name))?.id ?? null;
  if (/\bbreak(down)?\b/.test(t)) return song.sections.find((s) => /break/i.test(s.name))?.id ?? null;
  if (/\bbuild ?(up)?\b/.test(t)) return song.sections.find((s) => /build/i.test(s.name))?.id ?? null;
  return null;
}

const names = (ts: Track[]) => ts.map((x) => x.name).join(", ");

// "use real drums" / "back to synth drums": the drum sample kit on the song, resolved instantly.
const KIT_WORDS: Record<string, string> = { real: "starter", sampled: "starter", sample: "starter", starter: "starter", live: "starter", "808": "starter-808", acoustic: "starter-acoustic", hard: "starter-hard", synth: "synth", synthesized: "synth", synthetic: "synth", electronic: "synth" };
const KIT_SAY: Record<string, string> = { starter: "Real drums are on.", "starter-hard": "The hard kit is on.", "starter-808": "The 808 kit is on.", "starter-acoustic": "The acoustic kit is on.", synth: "Back to the synth drums." };
function kitIntent(t: string, song: Song): LocalIntent | null {
  const m = t.match(/^(?:use|switch to|switch back to|put on|load|give me|try|go with|go back to|back to) (?:the )?(?<k>real|sampled|sample|starter|live|808|acoustic|hard|synth|synthesized|synthetic|electronic) (?:drums|drum kit|kit|sounds|samples|drum sounds|drum samples)(?: please)?$/)
    ?? t.match(/^(?:use|load) (?:the )?samples$/) ?? t.match(/^(?<k>real|sampled|synth) drums(?: please)?$/);
  if (!m) return null;
  const kit = KIT_WORDS[m.groups?.k ?? "real"] ?? "starter";
  const value = kit === "starter" && song.lane === "hard-house" ? "starter-hard" : kit;
  return { ops: [{ op: "set", track: "song", path: "kit", value }], say: KIT_SAY[value], note: `drum kit set to ${value}`, kind: "kit" };
}

export function localIntent(text: string, song: Song): LocalIntent | null {
  const t = clean(text);
  if (!t || t.split(" ").length > 12) return null;
  const sec = (id: string) => song.sections.find((s) => s.id === id)?.name ?? id;

  if (/^(undo|undo that|go back|revert|take that back|no undo)$/.test(t)) return { history: "undo", say: "Undone.", note: "user undid the last change", kind: "undo" };
  if (/^(redo|redo that|bring it back)$/.test(t)) return { history: "redo", say: "Back on.", note: "user redid the change", kind: "redo" };
  if (/^(play|play it|go|start|resume|keep going|hit it|run it)$/.test(t)) return { action: { type: "play" }, say: "", note: "play", kind: "transport" };
  if (/^(pause|pause it|stop|stop it|hold on|hold up|wait|freeze|shh|quiet)$/.test(t)) return { action: { type: "pause" }, say: "", note: "pause", kind: "transport" };
  if (/^(play|switch to|let me hear|give me) (version )?a$|^(the )?first one$/.test(t)) return { ab: "a", say: "Version A.", note: "user switched to A", kind: "ab" };
  if (/^(play|switch to|let me hear|give me) (version )?b$|^(the )?second one$/.test(t)) return { ab: "b", say: "Version B.", note: "user switched to B", kind: "ab" };
  if (/^(keep|go with|i like|take) (version )?a$/.test(t)) return { ab: "keepA", say: "A it is.", note: "user chose A", kind: "ab" };
  if (/^(keep|go with|i like|take) (version )?b$/.test(t)) return { ab: "keepB", say: "B it is.", note: "user chose B", kind: "ab" };
  const kit = kitIntent(t, song);
  if (kit) return kit;

  const bpm = t.match(/\b(\d{2,3}) ?bpm\b/) ?? (/^(make it|set it to|go to|tempo) (\d{2,3})$/.test(t) ? t.match(/(\d{2,3})$/) : null);
  if (bpm) { const v = Number(bpm[1]); if (v >= 60 && v <= 200) return { ops: [{ op: "tempo", bpm: v }], say: `${v}.`, note: `tempo set to ${v}`, kind: "tempo" }; }
  if (/^(a (bit|little|touch) )?(faster|quicker|speed it up|pick it up)( a (bit|little|touch))?$/.test(t)) return { ops: [{ op: "tempo", bpm: song.bpm + 2 }], say: `${song.bpm + 2}.`, note: "tempo +2", kind: "tempo" };
  if (/^(way|much|a lot) faster$/.test(t)) return { ops: [{ op: "tempo", bpm: song.bpm + 6 }], say: `${song.bpm + 6}.`, note: "tempo +6", kind: "tempo" };
  if (/^(a (bit|little|touch) )?(slower|slow it down|bring it down)( a (bit|little|touch))?$/.test(t)) return { ops: [{ op: "tempo", bpm: song.bpm - 2 }], say: `${song.bpm - 2}.`, note: "tempo -2", kind: "tempo" };
  if (/^(way|much|a lot) slower$/.test(t)) return { ops: [{ op: "tempo", bpm: song.bpm - 6 }], say: `${song.bpm - 6}.`, note: "tempo -6", kind: "tempo" };

  if (/^(stop looping|unloop|let it run|play the whole (thing|song|track)|full song|play it through|play through)$/.test(t)) return { ops: [{ op: "loop", loop: null }], action: { type: "unloop" }, say: "Running the whole thing.", note: "loop off", kind: "loop" };
  const loopM = t.match(/^(loop|repeat|keep playing|cycle) (the |on the )?(.+)$/) ?? t.match(/^(.+) on (a )?loop$/) ?? t.match(/^(.+) again and again$/);
  if (loopM) { const id = matchSection(loopM[loopM.length - 1], song); if (id) return { ops: [{ op: "loop", loop: { section: id } }], action: { type: "loop", section: id }, say: `Looping the ${sec(id)}.`, note: `looping ${sec(id)}`, kind: "loop" }; }
  const gotoM = t.match(/^(take me|go|jump|skip|back|bring me|let'?s go) (back |straight |ahead )?(to |into )(the )?(.+)$/) ?? t.match(/^(from the )?(top|beginning)$/);
  if (gotoM) { const id = matchSection(gotoM[gotoM.length - 1], song); if (id) return { action: { type: "goto", section: id }, say: "", note: `jumped to ${sec(id)}`, kind: "transport" }; }

  if (/^(everything|all|everyone|the rest|full mix|all of it|the whole mix) (back|back in|in)( now| please)?$|^(bring|put) (everything|it all|all of it|the rest) back( in)?$|^(unsolo|un solo|unsolo everything|no more solo)$/.test(t)) {
    return { ops: [{ op: "unsolo", track: "all" }, { op: "unmute", track: "all" }], say: "Everything's back.", note: "all tracks unsoloed and unmuted", kind: "mixer" };
  }
  const soloM = t.match(/^(?:solo|isolate|just|only|play (?:me )?(?:just|only)|let me hear (?:just|only)|i want to hear (?:just|only)|give me (?:just|only)) (?:the )?(?<t>.+?)(?: alone| by itself| on its own| solo)?$/)
    ?? t.match(/^(?:play (?:me )?)?(?:the )?(?<t>.+?) (?:alone|by itself|on its own|solo|solo'?d)$/);
  if (soloM?.groups?.t) {
    const ts = matchTracks(soloM.groups.t, song);
    if (ts.length) return { ops: [{ op: "unsolo", track: "all" }, ...ts.map((x) => ({ op: "solo" as const, track: x.id }))], say: `${names(ts)} alone.`, note: `soloed ${names(ts)}`, kind: "mixer" };
  }
  const unmuteM = t.match(/^(unmute|bring back|bring in|add back|put back|turn on|un-mute) (the )?(.+)$/);
  if (unmuteM) { const ts = matchTracks(unmuteM[3], song); if (ts.length) return { ops: ts.map((x) => ({ op: "unmute" as const, track: x.id })), say: `${names(ts)} back in.`, note: `unmuted ${names(ts)}`, kind: "mixer" }; }
  const muteM = t.match(/^(mute|kill|cut|drop|take out|take off|remove|lose|get rid of|turn off|silence|no more) (the )?(.+)$/);
  if (muteM && !/\b(that|this|it)\b$/.test(t)) { const ts = matchTracks(muteM[3], song); if (ts.length) return { ops: ts.map((x) => ({ op: "mute" as const, track: x.id })), say: `${names(ts)} out.`, note: `muted ${names(ts)}`, kind: "mixer" }; }

  const amount = /\b(a lot|way|much|big)\b/.test(t) ? 6 : /\b(a (bit|little|touch|hair|tad)|slightly|tiny)\b/.test(t) ? 1.5 : 3;
  const volM = t.match(/^(?:turn|bring|push|pull|take|bump) (?:the )?(?<t>.+?) (?<dir>up|down|louder|quieter|softer)(?: a (?:bit|little|touch|lot|hair|tad)| way| much| slightly)?$/)
    ?? t.match(/^(?<dir>more|less) (?:of the |the )?(?<t>.+)$/)
    ?? t.match(/^(?:the )?(?<t>.+?) (?<dir>louder|quieter|softer|up|down)(?: a (?:bit|little|touch|lot|hair|tad)| way| much| slightly)?$/);
  if (volM?.groups?.t) {
    const dir = /^(up|louder|more)$/.test(volM.groups.dir) ? 1 : -1;
    const ts = matchTracks(volM.groups.t, song);
    if (ts.length) return { ops: ts.map((x) => ({ op: "set" as const, track: x.id, path: "volume", value: Math.max(-40, Math.min(6, Math.round((x.volume + dir * amount) * 2) / 2)) })), say: `${names(ts)} ${dir > 0 ? "up" : "down"} ${amount}.`, note: `${names(ts)} volume ${dir > 0 ? "+" : "-"}${amount} dB`, kind: "mixer" };
    if (/^(everything|it|the whole thing|master|the mix|the volume)$/.test(volM.groups.t)) return { ops: [{ op: "set", track: "master", path: "volume", value: (song.master?.volume ?? 0) + dir * 2 }], say: dir > 0 ? "Louder." : "Quieter.", note: `master ${dir > 0 ? "+" : "-"}2 dB`, kind: "mixer" };
  }
  if (/^(louder|turn it up|crank it|more volume)$/.test(t)) return { ops: [{ op: "set", track: "master", path: "volume", value: (song.master?.volume ?? 0) + 2 }], say: "Louder.", note: "master +2 dB", kind: "mixer" };
  if (/^(quieter|turn it down|too loud|softer|less volume)$/.test(t)) return { ops: [{ op: "set", track: "master", path: "volume", value: (song.master?.volume ?? 0) - 2 }], say: "Quieter.", note: "master -2 dB", kind: "mixer" };
  return null;
}
