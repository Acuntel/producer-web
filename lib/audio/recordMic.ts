// The record mic: a second path from the talk mic with every speech process off (no echo cancellation, no noise
// suppression, no automatic gain), one channel, in the studio's own context, so a sung take is the voice as it was.
// Takes are meant for headphones: with the speakers on, the beat comes back through the mic.
export type RecordMic = { source: MediaStreamAudioSourceNode; track: MediaStreamTrack; deviceId: string; stop: () => void };

export async function openRecordMic(ctx: AudioContext): Promise<RecordMic> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
  const track = stream.getAudioTracks()[0];
  const source = ctx.createMediaStreamSource(stream);
  return { source, track, deviceId: track.getSettings().deviceId ?? track.label ?? "default", stop: () => { try { source.disconnect(); } catch { /* gone */ } for (const t of stream.getTracks()) t.stop(); } };
}
