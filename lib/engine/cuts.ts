// A cut is named by what it is: the sound it was cut from, where, how long, and how. The same cut asked
// for twice is the same clip (stored once, decoded once), and a record that names it can always find it.
// Tone-free. Older ids (vox_, grab_, slice_, chop_) are clip ids saved records depend on and keep loading.
export function cutId(source: string, startSec: number, lengthSec: number, how = ""): string {
  const s = `${source}|${Math.round(startSec * 1000)}|${Math.round(lengthSec * 1000)}|${how}`;
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519); }
  return `cut:${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}
