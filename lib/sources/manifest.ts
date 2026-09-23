// The owned manifest (docs/SOURCES_MANIFEST.json): every audio file the product keeps, its license and its exact bytes.
// This is the check that holds it true, in plain words like lib/samples/manifest.ts validateManifest. Pure: the files
// are read through the callbacks, so the Node test reads the disk and nothing here touches it.
import { COMMISSIONED, type Manifest } from "../samples/manifest";
import { ownedLicense } from "./owned";

export const OWNED_KINDS = ["freesound-cc0", "cc0-library", "commissioned", "made-here"] as const;
export type OwnedEntry = {
  path: string; sha256: string; bytes: number; lane: string; id?: string; license: string; holder: string;
  kind: string; source: string; url: string; author: string; via?: string; contract?: string;
};
export type OwnedManifest = { licenses: string[]; files: OwnedEntry[] };

/** Hosts whose sounds are licensed to one person and can never be the product's: a URL through any of them fails. */
export const PER_USER_HOSTS = /splice\.com|tracklib\.com|landr\.com|loopcloud|cymatics\.fm|output\.com|bandlab\.com|looperman\.com/i;
const FREESOUND_PAGE = /^https:\/\/freesound\.org\/(s\/\d+\/?|people\/[^/]+\/sounds\/\d+\/?)$/;

/** Every problem with the owned manifest. `file(path)` gives the bytes and sha256 on disk, or null when it is missing;
 *  `shipped` is every audio file the product serves (everything under public/), which must all be listed. */
export function checkOwned(doc: OwnedManifest, pack: Manifest, file: (path: string) => { sha256: string; bytes: number } | null, shipped: string[]): string[] {
  const out: string[] = [];
  const byPath = new Map<string, OwnedEntry>();
  for (const e of doc.files) {
    const tag = e.path || "?";
    if (byPath.has(e.path)) out.push(`${tag}: listed twice`);
    byPath.set(e.path, e);
    if (e.lane !== "owned" || e.holder !== "product") out.push(`${tag}: must be lane owned, held by the product`);
    if (!ownedLicense(e.license)) out.push(`${tag}: license "${e.license}" is not one the product can own`);
    if (!(OWNED_KINDS as readonly string[]).includes(e.kind)) out.push(`${tag}: kind "${e.kind}" is not an owned kind`);
    if (!e.url?.startsWith("https://")) out.push(`${tag}: no source page`);
    if (!e.author) out.push(`${tag}: no author`);
    if (PER_USER_HOSTS.test(`${e.url} ${e.via ?? ""} ${e.source}`)) out.push(`${tag}: comes through a per-user license host, which the product can never own`);
    if (e.kind === "freesound-cc0" && (!FREESOUND_PAGE.test(e.url) || !/^CC0/.test(e.license))) out.push(`${tag}: a Freesound sound needs its Freesound page and CC0`);
    if (e.kind === "commissioned" && (!e.contract || e.license !== COMMISSIONED)) out.push(`${tag}: a commissioned sound needs its signed buyout named in "contract"`);
    const disk = file(e.path);
    if (!disk) out.push(`${tag}: the file is missing`);
    else if (disk.sha256 !== e.sha256 || disk.bytes !== e.bytes) out.push(`${tag}: the file on disk is not the file whose license was recorded`);
  }
  for (const p of shipped) if (!byPath.has(p)) out.push(`${p}: shipped but not listed, so nobody has recorded its license`);
  const base = pack.base.replace(/^\//, "public/");
  for (const s of pack.samples) {
    const e = byPath.get(`${base}/${s.file}`);
    if (!e) { out.push(`${s.id}: in the sample pack but not in the owned manifest`); continue; }
    if (e.id !== s.id || e.license !== s.license || e.url !== s.url || e.author !== s.author) out.push(`${s.id}: the pack and the owned manifest disagree on its id, license, source or author`);
  }
  return out;
}
