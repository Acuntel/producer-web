// Credits for the library sounds a song uses, built from the manifest. CC0 needs
// no credit; anything else does, and the download then writes a sidecar text file.
import type { Song } from "./song/types";
import { attributionFree, pickKit, sampleById, KIT_SOUNDS, type Manifest, type SampleEntry } from "./samples/manifest";

export type Credits = { entries: SampleEntry[]; required: boolean; text: string };

// Does the song reach into the library at all? Cheap, no manifest needed.
export const usesSamples = (song: Song) => (!!song.kit && song.kit !== "synth") || song.tracks.some((t) => !!t.clip?.sampleId);

// Every library entry the song plays: referenced clips, plus the kit sounds its drum tracks use.
export function samplesUsed(song: Song, m: Manifest): SampleEntry[] {
  const out = new Map<string, SampleEntry>();
  for (const t of song.tracks) {
    const id = t.clip?.sampleId;
    if (!id) continue;
    const e = sampleById(m, id);
    if (e) out.set(e.id, e);
  }
  if (song.kit && song.kit !== "synth") {
    const pick = pickKit(m, song.kit, song.lane);
    for (const s of KIT_SOUNDS) {
      const e = pick.picks[s];
      if (e && song.tracks.some((t) => t.role === s && !t.synth?.wave)) out.set(e.id, e);
    }
  }
  return [...out.values()];
}

export const attributionRequired = (entries: SampleEntry[]) => entries.some((e) => !attributionFree(e.license));

export function creditsText(song: Song, entries: SampleEntry[]): string {
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    `Sample credits for "${song.title}"`,
    `Written by the producer on ${date}.`,
    "",
    "This song uses the following sounds from the studio's sample library. Sounds under CC0 or in the public domain need no credit. Every other sound must be credited with the line shown under it whenever the song is published.",
    "",
  ];
  entries.forEach((e, i) => {
    lines.push(`${i + 1}. ${e.name}`);
    lines.push(`   Role: ${e.role}. Author: ${e.author}. Source: ${e.source}. License: ${e.license}${attributionFree(e.license) ? " (no credit required)" : " (credit required)"}.`);
    if (e.url) lines.push(`   ${e.url}`);
    if (e.attribution) lines.push(`   ${e.attribution}`);
    lines.push("");
  });
  const required = entries.filter((e) => !attributionFree(e.license));
  if (required.length) {
    lines.push("Credit lines to publish with the song:");
    for (const e of required) lines.push(`- ${e.attribution || `"${e.name}" by ${e.author} (${e.url}), ${e.license}`}`);
  } else lines.push("Nothing here requires a credit line. This file records provenance so the song's history is never lost.");
  return lines.join("\n") + "\n";
}

export function creditsFor(song: Song, m: Manifest): Credits {
  const entries = samplesUsed(song, m);
  return { entries, required: attributionRequired(entries), text: entries.length ? creditsText(song, entries) : "" };
}

export const creditsFileName = (song: Song) => `${song.title.replace(/\s+/g, "-")}-credits.txt`;
