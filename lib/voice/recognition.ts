// Ears for words: Web Speech API with interim results, restart-on-end.
export type RecognitionLike = {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((ev: { results: { [i: number]: { [j: number]: { transcript: string }; isFinal: boolean }; length: number } }) => void) | null;
  onend: (() => void) | null; onerror: ((ev: { error?: string; message?: string }) => void) | null;
  onstart?: (() => void) | null;
  start: () => void; stop: () => void; abort?: () => void;
};

export type RecognitionError = "blocked" | "nodevice" | "network" | "unknown";
export function classifyError(code: string | undefined): RecognitionError | null {
  switch (code) {
    case "not-allowed": case "service-not-allowed": return "blocked";
    case "audio-capture": return "nodevice";
    case "network": return "network";
    case "no-speech": case "aborted": return null;   // quiet room or our own restart: not an error
    default: return code ? "unknown" : null;
  }
}

export type Handlers = { onInterim: (t: string) => void; onFinal: (t: string) => void; onEnd: () => void; onError?: (kind: RecognitionError, code: string) => void; onStart?: () => void };

/** The browser's built-in recognizer (Web Speech). The voice loop prefers the realtime engine when a token can be had. */
export function makeRecognizer(handlers: Handlers): RecognitionLike | null {
  const W = window as unknown as { webkitSpeechRecognition?: new () => RecognitionLike; SpeechRecognition?: new () => RecognitionLike };
  const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";
  rec.onresult = (ev) => {
    const results = ev.results;
    let interim = "";
    for (let i = 0; i < results.length; i++) if (!results[i].isFinal) interim += results[i][0].transcript;
    handlers.onInterim(interim.trim());
    const last = results[results.length - 1];
    if (last?.isFinal) {
      handlers.onInterim("");
      const said = last[0]?.transcript?.trim();
      if (said) handlers.onFinal(said);
    }
  };
  rec.onend = handlers.onEnd;
  rec.onerror = (ev) => { const kind = classifyError(ev?.error); if (kind) handlers.onError?.(kind, ev?.error ?? "unknown"); };
  rec.onstart = () => handlers.onStart?.();
  return rec;
}

export const hasRecognition = () => typeof window !== "undefined" && !!((window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition || (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition);
