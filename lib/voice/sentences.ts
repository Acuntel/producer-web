// A line the producer says, split into sentences: each is fetched and played on its own, so speech
// starts as soon as the first one closes and the next is on its way while this one plays.
export function sentences(text: string): string[] {
  const out: string[] = [];
  const re = /[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) { const s = m[0].trim(); if (s) out.push(s); }
  return out.length ? out : [text.trim()];
}

/** 16-bit little-endian PCM into float samples. */
export function pcmToFloat(bytes: Uint8Array): Float32Array {
  const n = Math.floor(bytes.length / 2); const out = new Float32Array(n);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, n * 2);
  for (let i = 0; i < n; i++) out[i] = dv.getInt16(i * 2, true) / 32768;
  return out;
}
