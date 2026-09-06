// The lane index the browser can use without the filesystem: ids, names, home
// tempo, the words the user says for each, the measured DNA band that stands
// in for it, and the kicks per bar the drum check expects. The full recipes
// live in knowledge/lanes/lanes.json (server side, lib/brain/lanes.ts); the
// lanes test keeps the two in step.
export type LaneInfo = { id: string; name: string; home: number; range: [number, number]; aliases: string[]; dnaLane: string; kicksPerBar: number; blurb: string };

export const LANE_INDEX: LaneInfo[] = [
  { id: "tech-house", name: "Tech house", home: 126, range: [124, 130], dnaLane: "tech-house", kicksPerBar: 4, blurb: "John Summit, Dom Dolla, Chris Lake; the home lane",
    aliases: ["tech house", "tech-house", "techhouse", "john summit", "dom dolla", "chris lake", "fisher"] },
  { id: "hard-house", name: "Hard house", home: 142, range: [140, 145], dnaLane: "hard-house", kicksPerBar: 4, blurb: "KETTAMA, G-Town, speed garage at 140-145",
    aliases: ["hard house", "hard-house", "hardhouse", "kettama", "g-town", "g town", "speed garage", "4x4 garage"] },
  { id: "melodic-house", name: "Melodic house and techno", home: 124, range: [120, 126], dnaLane: "tech-house", kicksPerBar: 4, blurb: "Afterlife, Anyma, ARTBAT, Solee; the epic or cinematic ask past tech-house",
    aliases: ["melodic house", "melodic techno", "melodic-house", "afterlife", "anyma", "artbat", "solee", "tale of us", "progressive house"] },
  { id: "afro-house", name: "Afro house", home: 122, range: [118, 124], dnaLane: "melodic", kicksPerBar: 4, blurb: "Keinemusik, Black Coffee; amapiano at 112 and 3-step at 116 inside it",
    aliases: ["afro house", "afro-house", "afrohouse", "afro tech", "afro", "keinemusik", "black coffee", "amapiano", "3-step", "3 step", "three step", "rampa", "adam port"] },
  { id: "deep-house", name: "Deep house and piano house", home: 123, range: [120, 125], dnaLane: "tech-house", kicksPerBar: 4, blurb: "MAW, Kerri Chandler, Duke Dumont, Route 94, Shouse",
    aliases: ["deep house", "deep-house", "deephouse", "piano house", "kerri chandler", "masters at work", "shouse", "duke dumont", "route 94", "disclosure"] },
  { id: "uk-garage", name: "UK garage, 2-step", home: 132, range: [128, 138], dnaLane: "tech-house", kicksPerBar: 2, blurb: "MJ Cole, Artful Dodger, PinkPantheress; skippy 2-step, not 4x4",
    aliases: ["uk garage", "uk-garage", "ukg", "garage", "2-step", "2 step", "two step", "two-step", "mj cole", "artful dodger", "pinkpantheress", "pink pantheress", "skippy garage"] },
  { id: "jersey-club", name: "Jersey club", home: 140, range: [130, 150], dnaLane: "hard-house", kicksPerBar: 5, blurb: "MCVertt, DJ Sliink, UNIIQU3, the R-You, DJ TAJ and BERGE edits; the five-kick flip",
    aliases: ["jersey club", "jersey-club", "jersey", "mcvertt", "dj sliink", "sliink", "uniiqu3", "dj taj", "berge", "r-you", "club flip", "jersey flip", "baltimore club"] },
  { id: "trap-club", name: "Trap and hip-hop club edits", home: 150, range: [130, 170], dnaLane: "dnb-or-halftime", kicksPerBar: 1.5, blurb: "written at double time, 150 = felt 75; FE!N, Magnolia, Mask Off",
    aliases: ["trap", "trap club", "trap-club", "trap edit", "hip hop", "hip-hop", "hiphop", "drill", "travis scott", "playboi carti", "carti", "808 edit"] },
  { id: "techno", name: "Techno, peak time and driving", home: 132, range: [128, 136], dnaLane: "tech-house", kicksPerBar: 4, blurb: "Adam Beyer, Eli Brown, Charlotte de Witte; hypnotic Berlin sub-lane",
    aliases: ["techno", "peak time", "peak-time", "adam beyer", "eli brown", "charlotte de witte", "drumcode", "berlin", "hypnotic techno"] },
  { id: "trance", name: "Trance, uplifting and hard", home: 138, range: [136, 150], dnaLane: "hard-house", kicksPerBar: 4, blurb: "uplifting at 136-140, hard trance revival at 145-150",
    aliases: ["trance", "uplifting trance", "hard trance", "psytrance", "psy trance", "tiesto", "armin", "sandstorm", "darude", "eurodance"] },
  { id: "pop", name: "Pop", home: 110, range: [96, 128], dnaLane: "tech-house", kicksPerBar: 2, blurb: "modern radio and dance pop; verse, pre, chorus, not drops",
    aliases: ["pop", "pop song", "radio pop", "dance pop", "synth pop", "synthpop", "dua lipa", "the weeknd", "sabrina carpenter", "taylor swift", "ariana", "charli xcx"] },
  { id: "hardstyle", name: "Hardstyle and rawstyle", home: 150, range: [145, 160], dnaLane: "hard-house", kicksPerBar: 4, blurb: "the distorted pitched kick is the bass; euphoric breakdown, screech climax",
    aliases: ["hardstyle", "hard style", "rawstyle", "raw style", "headhunterz", "sub zero project", "d-block", "euphoric hardstyle", "defqon"] },
  { id: "psychedelic", name: "Psychedelic pop and rock groove", home: 112, range: [100, 124], dnaLane: "tech-house", kicksPerBar: 2, blurb: "Tame Impala school: melodic round bass, swung live drums, phased wide pads, delay-drenched hooks",
    aliases: ["psychedelic", "psych", "psych pop", "psychedelic pop", "psychedelic rock", "tame impala", "kevin parker", "mgmt", "neo psychedelia", "dreamy rock"] },
];

export const laneInfo = (id: string): LaneInfo | null => LANE_INDEX.find((l) => l.id === id) ?? null;
export const laneIds = (): string[] => LANE_INDEX.map((l) => l.id);
export const laneHomeBpm = (id: string): number | null => laneInfo(id)?.home ?? null;
export const laneKicksPerBar = (id: string): number => laneInfo(id)?.kicksPerBar ?? 4;
// The measured tempo band in data/dna.json that stands in for a lane the collection never measured by name.
export const dnaLaneFor = (id: string): string => laneInfo(id)?.dnaLane ?? id;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ALIASES: { lane: string; alias: string; re: RegExp }[] = LANE_INDEX
  .flatMap((l) => l.aliases.map((alias) => ({ lane: l.id, alias, re: new RegExp(`\\b${esc(alias)}\\b`) })))
  .sort((a, b) => b.alias.length - a.alias.length);
export const ALIAS_ALTERNATION = ALIASES.map((a) => esc(a.alias)).join("|");

// The lane whose longest alias appears in the (already lowercased, cleaned) text; "speed garage" wins over "garage".
export function laneNamed(text: string): string | null {
  const t = text.toLowerCase();
  for (const a of ALIASES) if (a.re.test(t)) return a.lane;
  return null;
}

// A lane id from whatever the brain wrote: an exact id, a name or alias, else a plausible id it may have invented.
export const laneId = (v: unknown): string | null => (typeof v !== "string" || !v.trim() ? null : laneInfo(v.trim()) ? v.trim() : laneNamed(v) ?? (/^[a-z0-9-]{3,}$/.test(v.trim()) ? v.trim() : null));
