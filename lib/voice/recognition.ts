// Ears for words: Web Speech API with interim results, restart-on-end.
export type RecognitionLike = {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((ev: { results: { [i: number]: { [j: number]: { transcript: string }; isFinal: boolean }; length: number } }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start: () => void; stop: () => void; abort?: () => void;
};

export function makeRecognizer(handlers: { onInterim: (t: string) => void; onFinal: (t: string) => void; onEnd: () => void }): RecognitionLike | null {
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
  rec.onerror = () => {};
  return rec;
}

export const hasRecognition = () => typeof window !== "undefined" && !!((window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition || (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition);
