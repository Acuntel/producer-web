// Capture what is playing: the user picks a tab (YouTube, SoundCloud, Spotify web,
// anything) and shares its audio; the browser records it locally and hands back a
// file. Nothing is downloaded server-side and nothing leaves the machine until the
// user chooses to analyze it. Chrome requires video in the request for tab audio.
export type Capture = { stop: () => void; done: Promise<File> };

export function canCapture(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === "function" && typeof MediaRecorder !== "undefined";
}

export async function startCapture(maxSeconds = 300, name = "captured"): Promise<Capture> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } as MediaTrackConstraints });
  const audioTracks = stream.getAudioTracks();
  if (!audioTracks.length) { stream.getTracks().forEach((t) => t.stop()); throw new Error("No tab audio was shared. Pick the tab and tick the option to share its audio."); }
  stream.getVideoTracks().forEach((t) => t.stop());
  const audioOnly = new MediaStream(audioTracks);
  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
  const rec = new MediaRecorder(audioOnly, mime ? { mimeType: mime, audioBitsPerSecond: 192000 } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  let resolveDone: (f: File) => void, rejectDone: (e: Error) => void;
  const done = new Promise<File>((res, rej) => { resolveDone = res; rejectDone = rej; });
  const finish = () => {
    const type = rec.mimeType || mime || "audio/webm";
    const ext = type.includes("mp4") ? "m4a" : "webm";
    audioOnly.getTracks().forEach((t) => t.stop());
    if (!chunks.length) rejectDone(new Error("Nothing was recorded."));
    else resolveDone(new File(chunks, `${name}.${ext}`, { type }));
  };
  rec.onstop = finish;
  rec.onerror = () => rejectDone(new Error("Recording failed."));
  rec.start(1000);
  const timer = window.setTimeout(() => { if (rec.state !== "inactive") rec.stop(); }, maxSeconds * 1000);
  audioTracks[0].addEventListener("ended", () => { if (rec.state !== "inactive") rec.stop(); });
  return { stop: () => { window.clearTimeout(timer); if (rec.state !== "inactive") rec.stop(); }, done };
}
