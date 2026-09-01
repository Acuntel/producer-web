// The producer speaks: ElevenLabs via /api/speak, browser voice as fallback.
// One utterance at a time; stop() is barge-in.
let current: HTMLAudioElement | null = null;
let voiceOk: boolean | null = null;

export async function speak(text: string, onEnd: () => void): Promise<void> {
  stop();
  const clean = text.trim();
  if (!clean) { onEnd(); return; }
  if (voiceOk !== false) {
    try {
      const r = await fetch("/api/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: clean }) });
      if (r.ok) {
        voiceOk = true;
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = new Audio(url);
        current = a;
        const done = () => { if (current === a) current = null; URL.revokeObjectURL(url); onEnd(); };
        a.onended = done; a.onerror = done;
        await a.play().catch(done);
        return;
      }
      if (r.status === 503) voiceOk = false;
    } catch { /* fall through to the browser voice */ }
  }
  browserSpeak(clean, onEnd);
}

function browserSpeak(text: string, onEnd: () => void) {
  if (typeof speechSynthesis === "undefined") { onEnd(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.06;
  u.onend = onEnd; u.onerror = onEnd;
  speechSynthesis.speak(u);
}

export function stop() {
  if (current) { try { current.pause(); } catch {} current = null; }
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

export const isSpeaking = () => current !== null || (typeof speechSynthesis !== "undefined" && speechSynthesis.speaking);
