"""Overlap-add is exact for an identity model, and the hook span arrives first and equals the final result."""
import numpy as np
import chunked


def test_identity_is_reconstructed_exactly():
    rng = np.random.default_rng(0)
    mix = rng.standard_normal((2, 50_000)).astype(np.float32)
    out = chunked.overlap_add(lambda x: x, mix, 8_000, overlap=2, batch=3)
    assert out.shape == (1, 2, 50_000)
    assert np.max(np.abs(out[0] - mix)) < 1e-5


def test_the_hook_span_lands_first_and_matches_the_whole():
    rng = np.random.default_rng(1)
    mix = rng.standard_normal((2, 60_000)).astype(np.float32)
    seen = []; calls = []
    def fn(x):
        calls.append(x.shape[0]); return np.stack([x * 0.5, x * 2.0], axis=1)
    out = chunked.overlap_add(fn, mix, 8_000, overlap=4, batch=1, first=(30_000, 38_000), on_first=lambda y: seen.append((len(calls), y.copy())))
    assert len(seen) == 1
    n_first, hook = seen[0]
    assert n_first < len(calls), "the hook was ready before every window had run"
    assert hook.shape == (2, 2, 8_000)
    assert np.max(np.abs(hook - out[:, :, 30_000:38_000])) < 1e-5
    assert np.max(np.abs(out[1] - 2 * mix)) < 1e-4
