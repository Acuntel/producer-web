// The shapes of a vocal placement (lib/song/place.ts). Tone-free and browser-free.
import type { Fit } from "../fit";
import type { SectionLabel } from "../vocalMap";

/** The kind of moment a section is, read from its name, fill and energy. */
export type SectionRole = "intro" | "groove" | "build" | "drop" | "break" | "outro";
/** What a phrase is in its record: the hook (the most repeated line), a verse line, a short tag, an ad-lib. */
export type PhraseRole = "hook" | "verse" | "tag" | "adlib";

/** One phrase of a source voice, in seconds on the SOURCE timeline. */
export type PlacePhrase = {
  id: number;
  start: number; end: number;
  /** What is cut: the whole phrase when it is short, else its loudest window with both edges moved to word gaps. */
  cut: [number, number];
  /** The stressed syllable the phrase anchors on, and the last word's onset (a lead-in lands that on the one). */
  stress: number; lastWord: number | null;
  text: string;
  /** Word onsets on the voice (the vocal map's word starts), for the rhythm term and the chop's syllables. */
  onsets: number[];
  role: PhraseRole;
  hookScore: number; repeats: number; rmsDb: number;
  /** 12 pitch-class weights of its sung notes (seconds per class), or null when nothing was pitched. */
  chroma: number[] | null;
  /** Its notes as MIDI, for the in-scale term and the register check. */
  midis: number[];
  /** Semitones that fit the phrase to its record's scale (the map's keyRelToSource): a line sung in another key. */
  keyRel: number | null;
  /** Its peak in dBFS on the separated vocal (with rmsDb, how loud the cut plays once it is normalized). */
  peakDb: number;
  section: SectionLabel | null;
  /** Source order among the phrases (verse lines keep it). */
  order: number;
};

/** A voice to place: the record's name, the stored clip its phrases are cut from, its tempo, key and phrases. */
export type VoiceSource = {
  name: string;
  clipKey: string;
  bpm: number;
  key: string | null;
  family: string | null;
  phrases: PlacePhrase[];
  hook: number | null;
  /** "record" (a separated vocal off a record) or "take" (Brady's own voice, already on this grid). */
  kind: "record" | "take";
};

export type SlotKind = "drop-hook" | "lead-in" | "break-verse" | "drop-chop" | "call-response" | "build-tag";

/** One sounding of a placement: the clip starts at `noteBeat` of `host` so the anchor lands on `anchorBeat` (the
 *  song's absolute beat). A drop-2 instance can be a double of the first. */
export type Instance = {
  host: string; hostIndex: number; noteBeat: number; anchorBeat: number; lengthBeats: number;
  cut: [number, number]; anchorInCut: number; double?: boolean; hits?: number[];
};

export type Terms = { H: number; K: number; R: number; C: number; M: number; S: number; B: number; E: number; G: number };

export type Slot = {
  kind: SlotKind;
  phrase: PlacePhrase;
  /** The section the anchor sits in (an arrangement index), and its role. */
  target: number; targetRole: SectionRole;
  fit: Fit & { playsAt: number };
  instances: Instance[];
  terms: Terms;
  score: number;
  /** Why this slot, in words the producer can say. */
  why: string;
};

/** A section as it sits in the arrangement: where it starts in song beats and how long it is. */
export type Placed = { id: string; name: string; index: number; startBeat: number; beats: number; bars: number; energy: number; fill: string; role: SectionRole; active: string[]; variants?: Record<string, unknown> };
