"""Drums, bass and other with SCNet XL IHF (ZFTurbo MSST release v1.0.15, weights MIT per the trainer, trained on
MUSDB18 only, which is academic-use data: the same at-your-own-risk note as the acapella, docs/SOURCES_AUDIT.md).
Runs only when MSST_DIR points at a checkout of ZFTurbo/Music-Source-Separation-Training (MIT, pinned in the
Dockerfile) and SCNET_CKPT at model_scnet_ep_36_sdr_10.0891.ckpt. It is fed the instrumental (mix minus the Kim
vocal), so its own vocal output is discarded."""
from __future__ import annotations
import os, sys, threading
import numpy as np
import chunked, separate

SOURCES = ["drums", "bass", "other", "vocals"]
CONFIG = dict(sources=SOURCES, audio_channels=2, dims=[4, 64, 128, 256], nfft=4096, hop_size=1024, win_size=4096,
              normalized=True, band_SR=[0.230, 0.370, 0.400], band_stride=[1, 4, 4], band_kernel=[3, 4, 4],
              conv_depths=[3, 3, 3], compress=4, conv_kernel=3, num_dplayer=8, expand=1)
CHUNK = 485100   # 11 s, the trained chunk

_model = None
_lock = threading.Lock()


def model():
    global _model
    with _lock:
        if _model is None:
            import torch
            sys.path.insert(0, os.environ["MSST_DIR"])
            from models.scnet.scnet import SCNet
            torch.set_num_threads(int(os.environ.get("OMP_NUM_THREADS", "4")))
            m = SCNet(**CONFIG)
            sd = torch.load(os.environ["SCNET_CKPT"], map_location="cpu", weights_only=False)
            m.load_state_dict(sd.get("state_dict", sd) if isinstance(sd, dict) else sd, strict=True)
            _model = m.eval()
    return _model


def stems(instrumental_path: str, out_dir: str, overlap: int = 2) -> dict[str, str]:
    import torch
    x = separate.load_stereo(instrumental_path)
    m = model()
    def run(batch: np.ndarray) -> np.ndarray:
        with torch.inference_mode(): return m(torch.from_numpy(batch)).numpy()
    y = chunked.overlap_add(run, x, CHUNK, overlap, 1)
    return {name: separate.write(os.path.join(out_dir, f"{name}.wav"), y[i], "FLOAT") for i, name in enumerate(SOURCES) if name != "vocals"}
