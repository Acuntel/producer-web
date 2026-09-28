"""The acapella: Kim Mel-Band RoFormer on the CPU (or any torch device), chunked with overlap-add.

Weights: KimberleyJSN/melbandroformer MelBandRoformer.ckpt, MIT on its Hugging Face card (2026-04-22 revision
ac9b0614, sha256 87201f4d...559e). Model code: lucidrains BS-RoFormer 0.3.10 (MIT), whose MelBandRoformer loads
this checkpoint with no missing and no unexpected keys. The config is the trainer's own
(ZFTurbo MSST configs/KimberleyJensen/config_vocals_mel_band_roformer_kj.yaml). The trainer's note, kept in
docs/SOURCES_AUDIT.md: the training data is not all his, and commercial integration is at our own risk."""
from __future__ import annotations
import os, threading, warnings
import numpy as np
import chunked

# The pinned model code predates torch 2.5 and says so on every import; the messages are about CUDA and are noise here.
warnings.filterwarnings("ignore", category=FutureWarning, module="rotary_embedding_torch")
warnings.filterwarnings("ignore", message=".*sdp_kernel.*")
warnings.filterwarnings("ignore", message="A window was not provided.*")

SR = 44100
CHUNK = 352800               # 8 s, the trained chunk
OVERLAP = int(os.environ.get("ROFORMER_OVERLAP", "2"))   # the trainer's inference setting; 4 is slower and a little cleaner
BATCH = int(os.environ.get("ROFORMER_BATCH", "1"))
MODEL_DIR = os.environ.get("MODEL_DIR", "/models")
DEVICE = os.environ.get("ROFORMER_DEVICE", "cpu")   # "cuda" on the GPU host (worker/gpu/modal_app.py)
CKPT = os.environ.get("KIM_CKPT", os.path.join(MODEL_DIR, "kim", "MelBandRoformer.ckpt"))
KIM_URL = "https://huggingface.co/KimberleyJSN/melbandroformer/resolve/ac9b0614ab3cd7f77219e18ba494dfd93956c348/MelBandRoformer.ckpt"
KIM_SHA256 = "87201f4d31afb5bc79993230fc49446918425574db48c01c405e44f365c7559e"
CONFIG = dict(dim=384, depth=6, stereo=True, num_stems=1, time_transformer_depth=1, freq_transformer_depth=1, num_bands=60,
              dim_head=64, heads=8, attn_dropout=0.0, ff_dropout=0.0, flash_attn=True, dim_freqs_in=1025, sample_rate=SR,
              stft_n_fft=2048, stft_hop_length=441, stft_win_length=2048, stft_normalized=False, mask_estimator_depth=2)

_model = None
_lock = threading.Lock()


def fetch_weights(dst: str = CKPT) -> str:
    """Download the checkpoint from its MIT source and check its bytes. Used at image build time."""
    import hashlib, urllib.request
    if os.path.exists(dst): return dst
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    tmp = dst + ".part"
    urllib.request.urlretrieve(KIM_URL, tmp)
    h = hashlib.sha256()
    with open(tmp, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""): h.update(block)
    if h.hexdigest() != KIM_SHA256: raise RuntimeError(f"Kim checkpoint sha256 {h.hexdigest()} is not the MIT revision")
    os.replace(tmp, dst)
    return dst


def model():
    """Loaded once per process, strict: a checkpoint that does not fit the code is an error, not a silent mess."""
    global _model
    with _lock:
        if _model is None:
            import torch
            from bs_roformer import MelBandRoformer
            torch.set_num_threads(int(os.environ.get("OMP_NUM_THREADS", "4")))
            m = MelBandRoformer(**CONFIG)
            m.load_state_dict(torch.load(CKPT, map_location="cpu", weights_only=True), strict=True)
            _model = m.to(DEVICE).eval()
    return _model


def vocals(mix: np.ndarray, overlap: int = OVERLAP, progress=None, first: tuple[int, int] | None = None, on_first=None) -> np.ndarray:
    """mix: (2, n) float32 at 44.1 kHz. Returns the vocal, (2, n). The instrumental is mix minus this."""
    import torch
    if mix.ndim != 2 or mix.shape[0] != 2: raise ValueError("the separator takes a (2, n) stereo array")
    m = model()
    def run(batch: np.ndarray) -> np.ndarray:
        with torch.inference_mode(): return m(torch.from_numpy(batch).to(DEVICE)).float().cpu().numpy()
    hook = (lambda y: on_first(y[0])) if on_first else None
    return chunked.overlap_add(run, mix, CHUNK, overlap, BATCH, progress, first, hook)[0].astype(np.float32)
