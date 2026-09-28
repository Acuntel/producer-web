// What the voice probes reach for in the page (tests/place.probe.mjs, tests/take.probe.mjs), loaded only under ?e2e=1:
// the real planner, fit, cut, render and check, so a probe measures the product's own path and nothing else.
export { compileDraft } from "../song/draft";
export { laneDna } from "../song/drafting/sources";
export { parseVocalMap } from "../song/vocalMap";
export { voiceFromMap, voiceFromPhrases, planPlacements, placementOps, placementWindow, layout, fitVoice } from "../song/place";
export { applyOps } from "../song/ops";
export { vocalCheck } from "../ears/vocalCheck";
export { cutPhraseClip } from "../engine/slice";
export { cutId } from "../engine/cuts";
export { decodeBytes } from "../engine/clips";
export { renderWindow } from "../engine/window";
export { keyShift, fitKey, voiceFit } from "../song/fit";
export { findPhrases } from "../song/vocal";
export { learningSummary } from "../learn/placement";
export { rmsEnvelope, onsetNear, hopOf, firstOver } from "../ears/vocalMeasure";
