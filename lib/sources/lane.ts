// Where the sounds come from (docs/MASTERPROMPT_SMOOTH.md phase 4). A lane answers one question for the ritual's
// "next": what could the seed be now, on this grid. It ranks on what its catalog already says (role, tempo, key)
// and never fetches audio to do it, so a lane that is off costs nothing.
//
// The lanes are kept legally apart by who holds the license. The owned lane (./owned) is sound the product may keep
// and serve: CC0 and commissioned buyouts, every file listed with its license in docs/SOURCES_MANIFEST.json. Splice
// (./splice) is licensed to one person through their own account, and its audio never leaves that person's device
// (docs/SOURCES_SPLICE.md). Tracklib has no public API, so it is a handoff note there and not a lane.
import type { AudioClip } from "../song/types";

export type LaneId = "owned" | "splice";
/** Who the license is with. "product": ours to keep and serve. "user": theirs alone, and it stays on their device. */
export type Holder = "product" | "user";
export type License = { name: string; holder: Holder; url: string; credit: string | null };

/** What the room wants next: the grid it has to sit on, the roles that can be the seed, and what has already played. */
export type Want = { bpm: number; key?: string | null; roles?: readonly string[]; played?: ReadonlySet<string> };

export type Candidate = {
  lane: LaneId;
  id: string;              // unique across lanes: "<lane>:<id in the lane>"
  name: string;
  role: string;
  clip: AudioClip;         // what the "next" op places as the seed
  beats: number;           // its loop, in whole bars of the grid
  bpm: number | null;      // the tempo the catalog gives it, before any stretch
  playsAt: number | null;  // the tempo it is treated as on this grid: its own, or its double or half
  tempoConfidence: number; // how sure the catalog is of that tempo (0 when it has none)
  key: string | null;
  keyConfidence: number;
  semitones: number;       // how far it is moved to sit in the grid's key
  fit: number;             // 0 to 1: how little it has to be bent to sit on this grid
  license: License;
};

export interface Lane {
  id: LaneId;
  on: boolean;
  /** Why a lane has nothing to offer, in a full sentence, when it is off or not built. */
  why?: string;
  candidates(want: Want): Promise<Candidate[]>;
}

/** The next thing to play: the best unplayed candidate from the first lane that is on and has one. */
export async function nextFrom(lanes: readonly Lane[], want: Want): Promise<Candidate | null> {
  for (const lane of lanes) {
    if (!lane.on) continue;
    const c = (await lane.candidates(want)).find((x) => !want.played?.has(x.id));
    if (c) return c;
  }
  return null;
}
