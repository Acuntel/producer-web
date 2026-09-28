// Which voice placement is on offer right now: the last one landed, until Brady gives it a verdict or a minute
// passes. While one is open, "next one" means the next slot for the voice, not the next take of the draft. Tone-free.
const OPEN_MS = 60_000;
let open: { moveId: string; at: number } | null = null;

export function markVoiceOffer(moveId: string, at = Date.now()) { open = { moveId, at }; }
export function closeVoiceOffer(moveId?: string) { if (!moveId || open?.moveId === moveId) open = null; }
export const voiceOfferOpen = (now = Date.now()) => !!open && now - open.at < OPEN_MS;
export const voiceOfferId = () => open?.moveId ?? null;
