// Temperature 0 to 0.3 on the brain routes, so the same words give the same moves (masterprompt phase 8).
// Claude Opus 5, Sonnet 5 and the Opus 4.7 and later families refuse sampling parameters with a 400, so the
// temperature is sent only to a model that takes it (Haiku 4.5 on the Voice lane, or an older model set by env).
const NO_SAMPLING = /^claude-(?:opus-(?:5|4-[78])|sonnet-5|fable|mythos)/;
export const samplingFor = (model: string, temperature = 0.2): { temperature?: number } => (NO_SAMPLING.test(model) ? {} : { temperature });
