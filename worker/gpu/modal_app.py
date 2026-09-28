"""The acapella on a GPU: Kim Mel-Band RoFormer as a Modal function. WRITTEN, NOT DEPLOYED.

No Modal account exists yet; the GPU host is Brady's call (docs/MASTERPROMPT_PRODUCER.md 5.2). When he says go:
    pip install modal==1.5.5 && modal token new
    modal deploy worker/gpu/modal_app.py          # from the repo root
and set SEPARATOR_BACKEND=modal plus MODAL_TOKEN_ID and MODAL_TOKEN_SECRET on the worker. Cost order: an L4 is
$0.000222 a second, and a 4-minute record should take about 10 to 30 s plus the first load (inferred, not measured;
measure it on the first deploy). The same code (worker/roformer.py, worker/chunked.py) runs here and on the CPU, so
the vocal is the same bytes either way, only faster. The weights are fetched from their MIT source at image build
and checked against their sha256."""
from __future__ import annotations
import os
import modal

HERE = os.path.dirname(os.path.abspath(__file__))
WORKER = os.path.dirname(HERE)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("torch==2.5.1", "numpy<2.3", "soundfile==0.12.1", "librosa==0.10.2.post1", "BS-RoFormer==0.3.10",
                 "rotary-embedding-torch==0.3.6", "beartype==0.14.1", "einops==0.8.1")
    .env({"MODEL_DIR": "/models", "ROFORMER_DEVICE": "cuda", "ROFORMER_BATCH": "4", "ROFORMER_OVERLAP": "2"})
    .add_local_file(os.path.join(WORKER, "roformer.py"), "/root/roformer.py", copy=True)
    .add_local_file(os.path.join(WORKER, "chunked.py"), "/root/chunked.py", copy=True)
    .run_commands("cd /root && python -c 'import roformer; roformer.fetch_weights()'")
)
app = modal.App("producer-separator", image=image)


@app.cls(gpu="L4", scaledown_window=120, timeout=600)
class Separator:
    @modal.enter()
    def load(self) -> None:
        import roformer
        roformer.model()   # onto the GPU once per container, not once per record

    @modal.method()
    def vocals(self, flac: bytes) -> bytes:
        """A stereo 44.1 kHz FLAC in, the acapella as 24-bit FLAC out."""
        import io
        import numpy as np
        import soundfile as sf
        import roformer
        y, sr = sf.read(io.BytesIO(flac), dtype="float32", always_2d=True)
        if sr != roformer.SR: raise ValueError(f"expected 44.1 kHz, got {sr}")
        v = roformer.vocals(np.ascontiguousarray(y.T))
        out = io.BytesIO(); sf.write(out, np.clip(v.T, -1, 1), sr, format="FLAC", subtype="PCM_24")
        return out.getvalue()
