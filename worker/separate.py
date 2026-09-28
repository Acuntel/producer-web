"""Separation, vocals first, with no Demucs anywhere (its weights are research-only: docs/MASTERPROMPT_PRODUCER.md RC6).

The acapella is Kim Mel-Band RoFormer (worker/roformer.py). SEPARATOR_BACKEND picks where it runs: "local" runs it
in this process, "modal" sends the audio to the GPU function in worker/gpu/modal_app.py (written, not deployed).
The instrumental is the mix minus the vocal. Drums, bass and other come from the instrumental: SCNet XL IHF when
its code and weights are installed (MSST_DIR and SCNET_CKPT), otherwise a model-free split (harmonic and percussive
separation, then a crossover for the bass), after which drum_parts splits the drums as before."""
from __future__ import annotations
import os, subprocess
import numpy as np
import soundfile as sf

SR = 44100
BACKEND = os.environ.get("SEPARATOR_BACKEND", "local")
MODEL_NAME = "kim-mel-band-roformer"


def load_stereo(path: str) -> np.ndarray:
    """(2, n) float32 at 44.1 kHz; ffmpeg resamples anything else first."""
    info = sf.info(path)
    if info.samplerate != SR or info.channels != 2:
        fixed = path + ".44k.wav"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", path, "-ac", "2", "-ar", str(SR), fixed], check=True)
        path = fixed
    y, _ = sf.read(path, dtype="float32", always_2d=True)
    return np.ascontiguousarray(y.T)


def write(path: str, y: np.ndarray, subtype: str = "PCM_16") -> str:
    """WAV or FLAC by extension, clipped to full scale. The vocal ships lossless, never as MP3."""
    sf.write(path, np.clip(y.T, -1.0, 1.0), SR, subtype=subtype)
    return path


def vocal_array(mix: np.ndarray, progress=None, hook: tuple[int, int] | None = None, on_hook=None) -> np.ndarray:
    """The acapella of a (2, n) mix. With hook=(a, b) in samples, on_hook gets that span's vocal first."""
    if BACKEND == "modal":
        from gpu import client
        if hook and on_hook: on_hook(client.vocals(mix[:, hook[0]:hook[1]]))   # a second short call: GPU seconds are cheap
        return client.vocals(mix)
    import roformer
    return roformer.vocals(mix, progress=progress, first=hook, on_first=on_hook)


def vocal(wav_path: str, out_dir: str, progress=None, hook_sec: tuple[float, float] | None = None, on_hook=None) -> dict[str, str]:
    """The acapella as FLAC plus the instrumental as WAV (mix minus vocal), from one pass of the model. With hook_sec,
    on_hook(paths) gets the hook region's vocal and instrumental (FLAC and WAV) before the rest of the record is done."""
    os.makedirs(out_dir, exist_ok=True)
    mix = load_stereo(wav_path)
    span = None
    if hook_sec:
        a = max(0, int(hook_sec[0] * SR)); b = min(mix.shape[1], int(hook_sec[1] * SR))
        span = (a, b) if b - a > SR else None
    def hooked(v: np.ndarray) -> None:
        if not on_hook or not span: return
        on_hook({"vocals": write(os.path.join(out_dir, "hook-vocals.flac"), v),
                 "instrumental": write(os.path.join(out_dir, "hook-instrumental.wav"), mix[:, span[0]:span[1]] - v, "FLOAT")})
    v = vocal_array(mix, progress, span, hooked if span else None)
    return {"vocals": write(os.path.join(out_dir, "vocals.flac"), v),
            "instrumental": write(os.path.join(out_dir, "instrumental.wav"), mix - v, "FLOAT")}


def band_stems(instrumental_path: str, out_dir: str) -> dict[str, str]:
    """Drums, bass and other from the instrumental. SCNet XL IHF when installed, else the model-free split."""
    os.makedirs(out_dir, exist_ok=True)
    if os.environ.get("MSST_DIR") and os.environ.get("SCNET_CKPT"):
        import scnet
        return scnet.stems(instrumental_path, out_dir)
    return free_split(instrumental_path, out_dir)


def free_split(instrumental_path: str, out_dir: str, bass_hz: float = 150.0) -> dict[str, str]:
    """No model: median-filter harmonic/percussive separation per channel; the percussive part is the drums, the
    harmonic part below bass_hz is the bass, the rest of the harmonic part is the other. The three sum to the input."""
    import librosa
    from scipy.signal import butter, sosfiltfilt
    os.makedirs(out_dir, exist_ok=True)
    x = load_stereo(instrumental_path)
    drums = np.zeros_like(x); harm = np.zeros_like(x)
    for c in range(2):
        S = librosa.stft(x[c], n_fft=2048, hop_length=512)
        H, P = librosa.decompose.hpss(S, margin=1.0)
        drums[c] = librosa.istft(P, hop_length=512, length=x.shape[1])
        harm[c] = librosa.istft(H, hop_length=512, length=x.shape[1])
    sos = butter(4, bass_hz, "low", fs=SR, output="sos")
    bass = sosfiltfilt(sos, harm, axis=1).astype(np.float32)
    other = (x - drums - bass).astype(np.float32)
    return {"drums": write(os.path.join(out_dir, "drums.wav"), drums, "FLOAT"),
            "bass": write(os.path.join(out_dir, "bass.wav"), bass, "FLOAT"),
            "other": write(os.path.join(out_dir, "other.wav"), other, "FLOAT")}


def separate(wav_path: str, out_dir: str, progress=None, hook_sec=None, on_hook=None) -> dict[str, str]:
    """Everything, vocals first: vocals, instrumental, drums, bass, other."""
    out = vocal(wav_path, out_dir, progress, hook_sec, on_hook)
    out.update(band_stems(out["instrumental"], out_dir))
    return out
