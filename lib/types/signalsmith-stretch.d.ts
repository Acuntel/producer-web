// signalsmith-stretch ships no types: its default export makes a Stretch AudioWorkletNode (lib/audio/stretch.ts).
declare module "signalsmith-stretch" {
  const SignalsmithStretch: (context: BaseAudioContext, options?: AudioWorkletNodeOptions) => Promise<AudioWorkletNode>;
  export default SignalsmithStretch;
}
