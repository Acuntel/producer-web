"""The worker's side of SEPARATOR_BACKEND=modal: send the mix, get the acapella back. Lossless both ways."""
from __future__ import annotations
import io
import numpy as np
import soundfile as sf

SR = 44100


def vocals(mix: np.ndarray) -> np.ndarray:
    """mix (2, n) float32 at 44.1 kHz -> vocal (2, n), computed by the deployed Modal function."""
    import modal
    buf = io.BytesIO(); sf.write(buf, np.clip(mix.T, -1, 1), SR, format="FLAC", subtype="PCM_24")
    sep = modal.Cls.from_name("producer-separator", "Separator")()
    out = sep.vocals.remote(buf.getvalue())
    y, _ = sf.read(io.BytesIO(out), dtype="float32", always_2d=True)
    v = np.ascontiguousarray(y.T)
    return v[:, : mix.shape[1]] if v.shape[1] >= mix.shape[1] else np.pad(v, ((0, 0), (0, mix.shape[1] - v.shape[1])))
