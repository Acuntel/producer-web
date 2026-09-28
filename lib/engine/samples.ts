// The sample layer: the CC0 library shipped in public/samples, fetched on demand,
// decoded once, cached, and assembled into drum kits or fired as audio clips.
// Every sound the library lacks falls back to the synthesized kit, per sound.
import { parseManifest, pickKit, sampleById, sampleKey, KIT_SOUNDS, MANIFEST_URL, type Manifest, type KitSoundName } from "../samples/manifest";
import { synthKit, type Kit, type KitStyle } from "./kits";
import { assetRequested, assetDecoded, assetReady, assetFailed } from "./ledger";

let manifestPromise: Promise<Manifest> | null = null;
const decoded = new Map<string, Promise<AudioBuffer | null>>();

export function loadManifest(url = MANIFEST_URL): Promise<Manifest> {
  if (!manifestPromise) {
    manifestPromise = fetch(url).then(async (r) => {
      if (!r.ok) throw new Error(`manifest ${r.status}`);
      return parseManifest(await r.json());
    }).catch((e) => { manifestPromise = null; throw e; });
  }
  return manifestPromise;
}

// Tests and tools can hand the loader a manifest instead of fetching one.
export function setManifest(m: Manifest | null) { manifestPromise = m ? Promise.resolve(m) : null; decoded.clear(); }

async function decodeUrl(url: string, key: string): Promise<AudioBuffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const bytes = await r.arrayBuffer();
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const size = bytes.byteLength;
  const buf = await ctx.decodeAudioData(bytes);
  assetDecoded(key, size); assetReady(key, "http");
  return buf;
}

// Decode one library sample (cached forever for the session). Null when it cannot be had.
export function decodeSample(id: string, manifest?: Manifest): Promise<AudioBuffer | null> {
  let p = decoded.get(id);
  if (!p) {
    const key = sampleKey(id);
    assetRequested(key, "sample");
    p = (manifest ? Promise.resolve(manifest) : loadManifest()).then((m) => {
      const e = sampleById(m, id);
      if (!e) { assetFailed(key, "not in the manifest"); return null; }
      return decodeUrl(`${m.base}/${e.file}`, key);
    }).catch((e) => { assetFailed(key, e instanceof Error ? e.message : "decode failed"); return null; });
    decoded.set(id, p);
  }
  return p;
}

export function sampleIsCached(id: string) { return decoded.has(id); }

export type SampleKitResult = { kit: Kit; kitId: string; name: string; used: Record<KitSoundName, string | null>; fallback: KitSoundName[] };
export type SampleKitOptions = { manifest?: Manifest; decode?: (id: string, m: Manifest) => Promise<AudioBuffer | null>; synth?: Kit };

// Assemble a playable Kit from the library by role (a kit id or a lane name); any sound
// that is missing or fails to decode uses the synthesized kit and is listed in `fallback`.
export async function sampleKit(kitOrLane: string, lane: KitStyle = "tech-house", opts?: SampleKitOptions): Promise<SampleKitResult> {
  const m = opts?.manifest ?? (await loadManifest());
  const pick = pickKit(m, kitOrLane, lane);
  const synth = opts?.synth ?? (await synthKit(lane));
  const decode = opts?.decode ?? decodeSample;
  const kit: Kit = { ...synth };
  const used = {} as Record<KitSoundName, string | null>;
  const fallback = new Set<KitSoundName>(pick.fallback);
  await Promise.all(KIT_SOUNDS.map(async (sound) => {
    const e = pick.picks[sound];
    used[sound] = null;
    if (!e) return;
    const buf = await decode(e.id, m);
    if (buf) { kit[sound] = buf; used[sound] = e.id; } else fallback.add(sound);
  }));
  return { kit, kitId: pick.kitId, name: pick.name, used, fallback: KIT_SOUNDS.filter((s) => fallback.has(s)) };
}

// Warm the library sounds a song needs (kit plus referenced clips) before the graph builds.
export async function warmSamples(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => decodeSample(id)));
}
