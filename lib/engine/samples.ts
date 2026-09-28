// The sample layer: the CC0 library shipped in public/samples, fetched through the asset store (the
// only fetch-and-decode path, assets.ts), and assembled into drum kits or fired as audio clips. Every
// URL carries the pack's content hash, so the browser keeps each file for a year and a new pack is a
// new URL. Every sound the library lacks falls back to the synthesized kit, per sound.
import { parseManifest, pickKit, sampleById, sampleKey, KIT_SOUNDS, MANIFEST_URL, type Manifest, type KitSoundName } from "../samples/manifest";
import { synthKit, type Kit, type KitStyle } from "./kits";
import { get as getAsset } from "./assets";

let manifestPromise: Promise<Manifest> | null = null;
const PACK_HASH = process.env.NEXT_PUBLIC_SAMPLES_HASH ?? "";
/** A library URL with the pack's content hash on it (next.config.ts computes it at build time). */
export const versioned = (url: string) => (PACK_HASH ? `${url}${url.includes("?") ? "&" : "?"}v=${PACK_HASH}` : url);

export function loadManifest(url = MANIFEST_URL): Promise<Manifest> {
  if (!manifestPromise) {
    manifestPromise = fetch(versioned(url)).then(async (r) => {
      if (!r.ok) throw new Error(`manifest ${r.status}`);
      return parseManifest(await r.json());
    }).catch((e) => { manifestPromise = null; throw e; });
  }
  return manifestPromise;
}

// Tests and tools can hand the loader a manifest instead of fetching one.
export function setManifest(m: Manifest | null) { manifestPromise = m ? Promise.resolve(m) : null; }

/** Where a library sample's bytes live, or null when the pack does not have it. */
export async function sampleUrl(id: string): Promise<string | null> {
  const m = await loadManifest();
  const e = sampleById(m, id);
  return e ? versioned(`${m.base}/${e.file}`) : null;
}

// One library sample, decoded once through the store. Null when it cannot be had this time; a failure is
// never kept, so the next ask tries again.
export function decodeSample(id: string, _manifest?: Manifest): Promise<AudioBuffer | null> {
  return getAsset(sampleKey(id), { why: "sample" }).catch(() => null);
}

export type SampleKitResult = { kit: Kit; kitId: string; name: string; used: Record<KitSoundName, string | null>; fallback: KitSoundName[]; failed: KitSoundName[] };
export type SampleKitOptions = { manifest?: Manifest; decode?: (id: string, m: Manifest) => Promise<AudioBuffer | null>; synth?: Kit };

// Assemble a playable Kit from the library by role (a kit id or a lane name); any sound
// that is missing or fails to decode uses the synthesized kit and is listed in `fallback`.
export async function sampleKit(kitOrLane: string, lane: KitStyle = "tech-house", opts?: SampleKitOptions): Promise<SampleKitResult> {
  // The manifest and the synthesized fallbacks load side by side, not one after the other.
  const [m, synth] = await Promise.all([opts?.manifest ?? loadManifest(), opts?.synth ?? synthKit(lane)]);
  const pick = pickKit(m, kitOrLane, lane);
  const decode = opts?.decode ?? decodeSample;
  const kit: Kit = { ...synth };
  const used = {} as Record<KitSoundName, string | null>;
  const fallback = new Set<KitSoundName>(pick.fallback);
  const failed: KitSoundName[] = [];
  await Promise.all(KIT_SOUNDS.map(async (sound) => {
    const e = pick.picks[sound];
    used[sound] = null;
    if (!e) return;
    const buf = await decode(e.id, m);
    if (buf) { kit[sound] = buf; used[sound] = e.id; } else { fallback.add(sound); failed.push(sound); }
  }));
  return { kit, kitId: pick.kitId, name: pick.name, used, fallback: KIT_SOUNDS.filter((s) => fallback.has(s)), failed };
}

// Warm the library sounds a song needs (kit plus referenced clips) before the graph builds.
export async function warmSamples(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => decodeSample(id)));
}
