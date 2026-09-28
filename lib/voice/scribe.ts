// The real speech engine: ElevenLabs realtime speech to text over a WebSocket. The browser mints a
// short-lived token from our server; hooks/useSpeak.ts streams 16 kHz PCM from the mic (through the
// studio's input tap) and reads the partial and committed transcripts.
let availability: Promise<boolean> | null = null;
/** Once per page: can we get a token? If not, the loop falls back to Web Speech. */
export function scribeAvailable(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (/[?&]stt=webspeech/.test(window.location.search)) return Promise.resolve(false);
  availability ??= fetch("/api/stt/token", { method: "POST" }).then((r) => r.ok).catch(() => false);
  return availability;
}
