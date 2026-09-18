// The words people use for a kind of music, and the family the store files it under.
// Shared, because the research lane and the learning lane have to agree on what "house" means.
export const FAMILY_WORDS: Record<string, string> = { house: "house", techno: "techno", trance: "trance", garage: "garage", edm: "electronic", dance: "electronic", club: "electronic", electro: "electronic", dnb: "dnb", "drum and bass": "dnb", jungle: "dnb", dubstep: "dubstep", hardstyle: "hardstyle", "hard dance": "hardstyle", rave: "hardstyle", disco: "disco", rap: "hiphop", "hip hop": "hiphop", hiphop: "hiphop", trap: "hiphop", drill: "hiphop", pop: "pop", rock: "rock", metal: "metal", country: "country", "r&b": "rnb", rnb: "rnb", soul: "rnb", funk: "rnb", jazz: "jazz", reggae: "world", afrobeats: "world", amapiano: "house", gqom: "house", latin: "latin", reggaeton: "latin", folk: "folk", indie: "rock" };

/** Whole words only: "amapiano" is not "piano", "trapeze" is not "trap". */
export function familiesIn(q: string): string[] {
  const t = q.toLowerCase(); const out = new Set<string>();
  for (const [w, f] of Object.entries(FAMILY_WORDS)) if (new RegExp(`(^|[^a-z])${w.replace(/[-\s]/g, "[-\\s]?")}([^a-z]|$)`).test(t)) out.add(f);
  return [...out];
}

/** The year someone named, when they named one. */
export function yearIn(q: string): number | null {
  const m = q.match(/\b(19[5-9]\d|20[0-4]\d)\b/);
  return m ? Number(m[0]) : null;
}
