// The offline path: one rig, applied once, for a render or a listen. It exists so the
// ears and the WAV drive exactly the same code as the live transport, and anything the
// producer hears back is what the room is playing.
import type * as Tone from "tone";
import type { Song } from "../song/types";
import { Rig, type Clips, type Health } from "./rig";
import type { Schedule } from "./schedule";
import type { Analysis } from "./board";
import type { Kit } from "./kits";
import type { Voice } from "./voices";

export type { Clips, Health, Analysis };
export type Graph = { rig: Rig; schedule: Schedule; analysis: Analysis; voiceById: Map<string, Voice>; health: Health; dispose: () => void };

type Transport = ReturnType<typeof Tone.getTransport>;

export function buildGraph(song: Song, transport: Transport, clips: Clips = new Map(), kit?: Kit, kitId = ""): Graph {
  const rig = new Rig(transport, undefined, false);
  rig.apply(song, clips, kit, kitId);
  return { rig, schedule: rig.schedule, analysis: rig.analysis, voiceById: rig.voiceById, health: rig.health, dispose: () => rig.dispose() };
}
