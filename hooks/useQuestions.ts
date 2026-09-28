"use client";
// The producer's questions in the room (lib/ritual/questions.ts): "Do you like this beat?" once the draft has played
// 16 to 32 bars, then one offer drawn from what the draft is missing, and any offer the studio needs (a verify that
// missed). Bars are counted while the transport runs, from the moment the draft landed. The answer is read from
// Brady's next words; "yes" keeps it, "no" or a reason plays the next seed, an option lands the offer.
import { useCallback, useEffect, useRef, useState } from "react";
import type { useStudio } from "./useStudio";
import type { DraftNow } from "./useDraft";
import type { Steer } from "@/lib/song/draft";
import { initialQ, nextAsk, askOffer, readAnswer, expire, askClock, QUESTION_GAP_MS, type Ask, type QState } from "@/lib/ritual/questions";
import { gapsOf, offerLine, offerOps, type OfferId } from "@/lib/song/drafting/gaps";
import { logMove, attachWindow } from "@/lib/taste";
import { route } from "@/lib/brain/route";

type Studio = ReturnType<typeof useStudio>;
type Deps = { studio: Studio; speak: (t: string) => Promise<void> | void; talking: boolean; draftNow: () => DraftNow; next: (steer: Steer | null, why?: string) => unknown; vocal: (from: string | null) => void };
const DONE: Record<OfferId, string> = {
  roll: "A snare roll goes into the drop on the next bar.", lead: "A high lead goes over the drops on the next bar.", arp: "An arp comes into the breakdown and the drops on the next bar.",
  openhat: "Open hats go into the groove on the next bar.", vocal: "I am going to find a voice for it.",
};
const harness = () => typeof window !== "undefined" && /[?&](e2e|typed)=1/.test(window.location.search);

export function useQuestions(d: Deps) {
  const dRef = useRef(d); dRef.current = d;
  const stateRef = useRef<QState>(initialQ());
  const bars = useRef<{ key: string | null; bars: number; tick: number }>({ key: null, bars: 0, tick: 0 });
  const offerRef = useRef<{ line: string; yes: () => void } | null>(null);
  const yesRef = useRef<(() => void) | null>(null);
  const logRef = useRef<{ kind: string; line: string; at: number; bars: number; draft: string | null }[]>([]);
  const [open, setOpen] = useState<Ask | null>(null);

  const ask = useCallback((a: Ask, line: string) => {
    askClock.last = a.at; setOpen({ ...a, line });
    logRef.current.push({ kind: a.kind, line, at: a.at, bars: Math.round(bars.current.bars * 10) / 10, draft: a.draft });
    dRef.current.studio.append("assistant", line); void dRef.current.speak(line);
  }, []);

  // A miss the studio wants to offer (useStudio's verify): asked when the room is free.
  const onOffer = d.studio.onOffer;
  useEffect(() => { onOffer((line, yes) => { offerRef.current = { line, yes }; }); return () => onOffer(null); }, [onOffer]);

  useEffect(() => {
    if (!d.studio.started) return;
    const id = window.setInterval(() => {
      const s = dRef.current.studio, now = Date.now();
      const cur = dRef.current.draftNow(), b = bars.current;
      if (cur && b.key !== cur.key) { b.key = cur.key; b.bars = 0; b.tick = cur.landedAt; }
      const eng = s.liveEngine();
      if (cur && eng?.playing) b.bars += (Math.max(0, now - Math.max(b.tick, cur.landedAt)) / 1000) * s.getSong().bpm / 240;
      b.tick = now;
      const st: QState = { ...stateRef.current, lastAskAt: Math.max(stateRef.current.lastAskAt, askClock.last) };
      const talking = dRef.current.talking;
      if (offerRef.current) {
        const r = askOffer(st, offerRef.current.line, now, talking);
        stateRef.current = r.state;
        if (r.ask) { yesRef.current = offerRef.current.yes; offerRef.current = null; ask(r.ask, r.ask.line); }
        return;
      }
      const r = nextAsk(st, cur?.key ?? null, b.bars, now, talking || !eng?.playing, () => gapsOf(s.getSong()));
      stateRef.current = r.state;
      if (r.ask) ask(r.ask, r.ask.kind === "offer" ? offerLine(r.ask.offers ?? []) : r.ask.line);
      else if (!r.state.open) setOpen((o) => (o ? null : o));
    }, 250);
    return () => window.clearInterval(id);
  }, [d.studio.started, ask]);

  /** Brady's words, if they answer the open question. True when they did (nothing else should act on them). */
  const answer = useCallback((words: string): boolean => {
    const st = expire(stateRef.current, Date.now()); const q = st.open;
    // An ask of its own ("make the drums hit harder", "louder hats") is not an answer, even with a steer word in it.
    if (!q || ["draft", "voice", "take", "refine", "small"].includes(route(words, dRef.current.studio.getSong()).kind)) return false;
    const a = readAnswer(words, q);
    if (!a) return false;
    stateRef.current = { ...st, open: null }; setOpen(null);
    const s = dRef.current.studio; const song = s.getSong();
    const say = (line: string) => { s.append("assistant", line); void dRef.current.speak(line); };
    s.append("user", words);
    if (q.kind === "beat") {
      const entry = logMove({ title: song.title, said: words, move: `first draft from ${song.draft?.name ?? "the source"}, take ${(song.draft?.take ?? 0) + 1}` });
      attachWindow(entry.id, { landedAt: q.at, windowMs: QUESTION_GAP_MS, saidAt: Date.now(), words, verdict: a.verdict === "yes" ? "liked" : "rejected", closedBy: "verdict" });
      if (a.verdict === "yes") say("Kept. We build on this one.");
      else dRef.current.next(a.steer, a.steer ? "I hear you." : undefined);
      return true;
    }
    if (q.kind === "offer") {
      const pick = a.option ?? (a.verdict === "yes" ? q.offers?.[0]?.id ?? null : null);
      if (!pick) { say("Fine. It stays as it is."); return true; }
      if (pick === "vocal") { say(DONE.vocal); dRef.current.vocal(song.draft?.name ?? song.source?.name ?? null); return true; }
      void s.edit(offerOps(song, pick), `added ${pick}`).then((ok) => say(ok ? DONE[pick] : "That one would not go in. Say it again and I will try."));
      return true;
    }
    const yes = yesRef.current; yesRef.current = null;
    if (a.verdict === "yes" && yes) yes(); else say("Then it stays as it is.");
    return true;
  }, []);

  useEffect(() => {
    if (!harness()) return;
    (window as unknown as { __questions?: () => unknown }).__questions = () => ({ state: stateRef.current, log: logRef.current, bars: Math.round(bars.current.bars * 10) / 10, draft: bars.current.key, askClock: askClock.last });
  }, []);
  return { open, answer };
}
