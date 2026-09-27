"""Separation without Demucs, vocals first: the order uploads happen in, and the model-free split's arithmetic."""
import os
import numpy as np
import soundfile as sf
import pytest
import analysis, hearing, jobs, roformer, separate, supa
from models import Job, Source

SR = 44100


def tone_mix(path, sec=12.0):
    t = np.arange(int(SR * sec)) / SR
    kick = (np.sin(2 * np.pi * 55 * t) * np.exp(-((t % 0.5) * 18))).astype(np.float32)
    pad = (0.2 * np.sin(2 * np.pi * 330 * t)).astype(np.float32)
    y = np.stack([kick + pad, kick + pad], axis=1) * 0.5
    sf.write(path, y, SR); return path


@pytest.fixture
def fake_model(monkeypatch):
    """Kim stands in as 'the vocal is a quarter of the mix'; the hook span is handed over first, as the real one does."""
    def vocals(mix, overlap=2, progress=None, first=None, on_first=None):
        v = (mix * 0.25).astype(np.float32)
        if first and on_first: on_first(v[:, first[0]:first[1]])
        return v
    monkeypatch.setattr(roformer, "vocals", vocals)


def test_free_split_sums_back_to_the_instrumental(tmp_path):
    p = tone_mix(str(tmp_path / "inst.wav"))
    out = separate.free_split(p, str(tmp_path / "sep"))
    assert set(out) == {"drums", "bass", "other"}
    x = separate.load_stereo(p)
    total = sum(separate.load_stereo(v) for v in out.values())
    assert np.max(np.abs(total - x)) < 1e-3


def test_vocal_is_flac_and_the_hook_arrives_first(tmp_path, fake_model):
    p = tone_mix(str(tmp_path / "mix.wav"))
    got = []
    out = separate.vocal(p, str(tmp_path / "sep"), hook_sec=(2.0, 6.0), on_hook=lambda paths: got.append(paths))
    assert out["vocals"].endswith(".flac") and sf.info(out["vocals"]).format == "FLAC"
    assert len(got) == 1 and got[0]["vocals"].endswith("hook-vocals.flac")
    assert abs(sf.info(got[0]["vocals"]).duration - 4.0) < 0.01


def test_the_stems_job_uploads_the_voice_before_anything_else(tmp_path, fake_model, monkeypatch):
    uploads, updates = [], []
    monkeypatch.setattr(supa, "upload", lambda path, file, mime: uploads.append((path, mime)) or path)
    monkeypatch.setattr(supa, "update_job", lambda job_id, **f: updates.append(f))
    monkeypatch.setattr(supa, "insert_clips", lambda rows: [{"storage_path": r["storage_path"], "id": str(i)} for i, r in enumerate(rows)])
    monkeypatch.setattr(hearing, "hear", lambda wav, stems, facts: {"report": "", "embeddings": {}})
    monkeypatch.setattr(hearing, "clap_embed", lambda y, sr: np.zeros(4))
    wav = tone_mix(str(tmp_path / "src.wav"), 20.0)
    facts = analysis.analyze(wav); facts["name"] = "test"
    job = Job(job_id="j1", owner="u1", source=Source(query="x"))
    final = jobs.separate_and_publish(job, str(tmp_path), wav, "test", facts, None, {}, lambda k: None, {})
    names = [os.path.basename(p) for p, _ in uploads]
    assert names[0] == "preview-vocals.flac"
    assert names.index("vocals.flac") < min(names.index(n) for n in names if n in ("drums.mp3", "bass.mp3", "other.mp3"))
    assert dict(uploads)["u1/stems/j1/vocals.flac"] == "audio/flac"
    assert {s["stem"] for s in final["stems"]} >= {"vocals", "drums", "bass", "other"}
    assert final["separator"] == "kim-mel-band-roformer"
