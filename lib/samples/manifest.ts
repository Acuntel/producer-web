// The sample library manifest: what the pack holds, who made it, under which
// license, and which one-shots form a drum kit. Pure: no audio, no DOM, so it
// runs in the brain routes, the engine and the Node tests alike.
export const SAMPLE_ROLES = ["kick", "clap", "snare", "hat", "openhat", "perc", "vocal", "keys", "fx", "riser", "loop"] as const;
export type SampleRole = (typeof SAMPLE_ROLES)[number];
export const KIT_SOUNDS = ["kick", "clap", "snare", "hat", "openhat", "perc"] as const;
export type KitSoundName = (typeof KIT_SOUNDS)[number];

// Licenses the library may ship. Attribution-free ones need no credit line.
export const ATTRIBUTION_FREE = ["CC0 1.0", "CC0", "Public Domain", "PD"];
export const ALLOWED_LICENSES = [...ATTRIBUTION_FREE, "CC BY 4.0", "CC BY 3.0"];
export const MAX_PACK_BYTES = 6 * 1024 * 1024;
export const MANIFEST_URL = "/samples/starter/manifest.json";
export const SAMPLE_KEY_PREFIX = "sample:";
// Clip-store key for a library sample, so the clip loaders can tell it from an upload.
export const sampleKey = (id: string) => `${SAMPLE_KEY_PREFIX}${id}`;
export const isSampleKey = (key: string) => key.startsWith(SAMPLE_KEY_PREFIX);
export const sampleIdOf = (key: string) => (isSampleKey(key) ? key.slice(SAMPLE_KEY_PREFIX.length) : null);

export type SampleEntry = {
  id: string; file: string; name: string; role: SampleRole;
  bpm?: number; key?: string; seconds?: number;
  source: string; url: string; license: string; author: string; attribution: string;
  via?: string; note?: string; bytes?: number;
};
export type SampleKitDef = { id: string; name: string; lane?: string; note?: string; sounds: Partial<Record<KitSoundName, string>> };
export type Manifest = { pack: string; base: string; about?: string; processing?: string; samples: SampleEntry[]; kits: SampleKitDef[] };

type Loose = Record<string, unknown>;
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const idOf = (file: string) => file.replace(/\.[a-z0-9]+$/i, "");

// Accepts the object form ({samples, kits}) and the plain array the pack shipped as.
export function parseManifest(raw: unknown, base = "/samples/starter"): Manifest {
  const obj: Loose = Array.isArray(raw) ? { samples: raw } : raw && typeof raw === "object" ? (raw as Loose) : {};
  const list = Array.isArray(obj.samples) ? (obj.samples as unknown[]) : [];
  const samples: SampleEntry[] = list.filter((x): x is Loose => !!x && typeof x === "object").map((x) => ({
    id: str(x.id) || idOf(str(x.file)), file: str(x.file), name: str(x.name) || idOf(str(x.file)), role: str(x.role) as SampleRole,
    bpm: num(x.bpm), key: typeof x.key === "string" ? x.key : undefined, seconds: num(x.seconds),
    source: str(x.source), url: str(x.url), license: str(x.license), author: str(x.author), attribution: str(x.attribution),
    via: typeof x.via === "string" ? x.via : undefined, note: typeof x.note === "string" ? x.note : undefined, bytes: num(x.bytes),
  }));
  const kitsRaw = Array.isArray(obj.kits) ? (obj.kits as unknown[]) : [];
  const kits: SampleKitDef[] = kitsRaw.filter((x): x is Loose => !!x && typeof x === "object" && typeof (x as Loose).id === "string").map((x) => {
    const sounds: SampleKitDef["sounds"] = {};
    const s = (x.sounds && typeof x.sounds === "object" ? x.sounds : {}) as Loose;
    for (const k of KIT_SOUNDS) if (typeof s[k] === "string") sounds[k] = s[k] as string;
    return { id: str(x.id), name: str(x.name) || str(x.id), lane: typeof x.lane === "string" ? x.lane : undefined, note: typeof x.note === "string" ? x.note : undefined, sounds };
  });
  return { pack: str(obj.pack, "starter"), base: str(obj.base, base), about: typeof obj.about === "string" ? obj.about : undefined, processing: typeof obj.processing === "string" ? obj.processing : undefined, samples, kits };
}

export const attributionFree = (license: string) => ATTRIBUTION_FREE.includes(license.trim());
export const licenseAllowed = (license: string) => ALLOWED_LICENSES.includes(license.trim());

// Every problem with a manifest, in plain words. `fileSize` returns the byte size of a file
// (or true when it exists and the size is unknown, false when it is missing).
export function validateManifest(m: Manifest, fileSize?: (file: string) => number | boolean): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let total = 0;
  if (m.samples.length === 0) out.push("no samples");
  for (const s of m.samples) {
    const tag = s.id || s.file || "?";
    if (!s.id) out.push(`${tag}: missing id`);
    if (seen.has(s.id)) out.push(`${tag}: duplicate id`); seen.add(s.id);
    if (!s.file) out.push(`${tag}: missing file`);
    if (!(SAMPLE_ROLES as readonly string[]).includes(s.role)) out.push(`${tag}: invalid role "${s.role}"`);
    if (!licenseAllowed(s.license)) out.push(`${tag}: license "${s.license}" is not allowed`);
    if (!s.url) out.push(`${tag}: missing source url`);
    if (!s.author) out.push(`${tag}: missing author`);
    if (!attributionFree(s.license) && !s.attribution) out.push(`${tag}: ${s.license} needs an attribution line`);
    if (s.role === "loop" && !s.bpm) out.push(`${tag}: loop without bpm`);
    if (fileSize && s.file) {
      const size = fileSize(s.file);
      if (size === false) out.push(`${tag}: file ${s.file} is missing`);
      else if (typeof size === "number" && typeof s.bytes === "number" && size !== s.bytes) out.push(`${tag}: bytes ${s.bytes} but the file is ${size}`);
      if (typeof size === "number") total += size;
    } else total += s.bytes ?? 0;
  }
  if (total > MAX_PACK_BYTES) out.push(`pack is ${(total / 1048576).toFixed(2)} MB, cap is ${MAX_PACK_BYTES / 1048576} MB`);
  const byId = new Map(m.samples.map((s) => [s.id, s]));
  const kitIds = new Set<string>();
  for (const k of m.kits) {
    if (kitIds.has(k.id)) out.push(`kit ${k.id}: duplicate id`); kitIds.add(k.id);
    for (const sound of KIT_SOUNDS) {
      const id = k.sounds[sound];
      if (!id) continue;
      const e = byId.get(id);
      if (!e) out.push(`kit ${k.id}: ${sound} points at unknown sample "${id}"`);
      else if (e.role !== sound) out.push(`kit ${k.id}: ${sound} points at "${id}" whose role is ${e.role}`);
    }
  }
  return out;
}

export type KitPick = { kitId: string; name: string; picks: Record<KitSoundName, SampleEntry | null>; fallback: KitSoundName[] };

// Which kit a name selects: an exact kit id, else the kit for that lane, else the first kit.
export function findKit(m: Manifest, kitOrLane: string, lane?: string): SampleKitDef | null {
  return m.kits.find((k) => k.id === kitOrLane) ?? m.kits.find((k) => k.lane && k.lane === kitOrLane) ?? (lane ? m.kits.find((k) => k.lane === lane) : undefined) ?? m.kits[0] ?? null;
}

// Assemble a kit by role: the kit's own choice when its role matches, else the first
// sample of that role, else nothing (the engine falls back to the synthesized sound).
export function pickKit(m: Manifest, kitOrLane: string, lane?: string): KitPick {
  const def = findKit(m, kitOrLane, lane);
  const byId = new Map(m.samples.map((s) => [s.id, s]));
  const picks = {} as Record<KitSoundName, SampleEntry | null>;
  const fallback: KitSoundName[] = [];
  for (const sound of KIT_SOUNDS) {
    const wanted = def?.sounds[sound] ? byId.get(def.sounds[sound]!) : undefined;
    const pick = wanted && wanted.role === sound ? wanted : m.samples.find((s) => s.role === sound) ?? null;
    picks[sound] = pick;
    if (!pick) fallback.push(sound);
  }
  return { kitId: def?.id ?? "auto", name: def?.name ?? "Library kit", picks, fallback };
}

export const sampleById = (m: Manifest, id: string) => m.samples.find((s) => s.id === id) ?? null;

// The listing the brain reads: kits first, then every sample by role with tempo and key when known.
export function samplesForBrain(m: Manifest): string {
  const lines: string[] = [];
  const kits = m.kits.map((k) => `${k.id}${k.lane ? ` (${k.lane})` : ""}: ${KIT_SOUNDS.map((s) => k.sounds[s]).filter(Boolean).join(", ")}`);
  lines.push(`KITS for song.kit (synth = the synthesized kit, the default): ${kits.join(" | ") || "none"}`);
  lines.push("SAMPLES for clip.sampleId (id \"name\" seconds, bpm and key when known):");
  for (const role of SAMPLE_ROLES) {
    const list = m.samples.filter((s) => s.role === role);
    if (!list.length) continue;
    lines.push(`${role}: ${list.map((s) => `${s.id} "${s.name}"${s.seconds ? ` ${s.seconds.toFixed(1)}s` : ""}${s.bpm ? ` ${s.bpm}bpm` : ""}${s.key ? ` ${s.key}` : ""}`).join("; ")}`);
  }
  return lines.join("\n");
}
