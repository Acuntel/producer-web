// What a batch of ops touched, in words a lane can show: "filter 520 Hz", "new notes",
// "sample: Demo Track 1 · kick". The visible proof that the producer moved something.
import type { Song } from "./types";

export type LaneMove = { trackId: string; label: string; at: number; auditionClipId?: string };

const short = (v: unknown) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : typeof v === "string" ? v.slice(0, 18) : typeof v === "boolean" ? (v ? "on" : "off") : v && typeof v === "object" ? "" : String(v));

export function movesFromOps(ops: unknown[], before: Song, after: Song): LaneMove[] {
  const at = Date.now();
  const out = new Map<string, LaneMove>();
  const add = (trackId: string | undefined, label: string, clipId?: string) => {
    if (!trackId) return;
    const t = after.tracks.find((x) => x.id === trackId) ?? before.tracks.find((x) => x.id === trackId);
    const id = t?.id ?? trackId;
    const cur = out.get(id);
    out.set(id, { trackId: id, label: cur ? `${cur.label} · ${label}`.slice(0, 60) : label, at, auditionClipId: clipId ?? cur?.auditionClipId });
  };
  for (const raw of ops) {
    const o = raw as Record<string, unknown>;
    if (!o || typeof o.op !== "string") continue;
    const track = typeof o.track === "string" ? o.track : undefined;
    switch (o.op) {
      case "set": {
        const path = String(o.path ?? "");
        if (track === "master" || track === "song") break;
        if (path === "clip") { const c = o.value as { name?: string; clipId?: string } | null; add(track, c ? `sound: ${c.name ?? "sample"}` : "own sound back", c?.clipId); }
        else add(track, `${path.replace(/^fx\./, "").replace(/^synth\./, "").replace("filter.cutoff", "filter")} ${short(o.value)}`.trim());
        break;
      }
      case "notes": add(track, o.pattern ? `pattern ${String(o.pattern)}` : "new notes"); break;
      case "grid": add(track, o.section ? `grid in ${String(o.section)}` : "new grid"); break;
      case "sectionNotes": add(track, `notes in ${String(o.section)}`); break;
      case "addTrack": { const t = o.track as { id?: string; name?: string; clip?: { name?: string; clipId?: string } } | undefined; if (t?.id) add(t.id, t.clip ? `placed ${t.clip.name ?? "clip"}` : "new track", t.clip?.clipId); break; }
      case "mute": case "unmute": case "solo": case "unsolo": if (track && track !== "all") add(track, o.op); break;
      case "transpose": add(track, `transpose ${short(o.semitones)}`); break;
      case "shift": add(track, `nudged ${short(o.beats)} beats`); break;
      case "velocity": add(track, "velocity shaped"); break;
      case "chance": add(track, `chance ${short(o.value)}`); break;
      case "velDev": add(track, `velocity life ${short(o.steps)}`); break;
      case "groove": if (track && track !== "all" && track !== "drums" && track !== "song") add(track, `groove ${String(o.name ?? "")}`); break;
      case "variant": add(track, `variant in ${String(o.section)}`); break;
      case "fill": add(track, `fill in ${String(o.section)}`); break;
      case "automate": { const a = o.automation as { track?: string; param?: string } | undefined; if (a?.track && a.track !== "master") add(a.track, `sweep ${a.param ?? ""}`.trim()); break; }
      default: break;
    }
  }
  return [...out.values()];
}
