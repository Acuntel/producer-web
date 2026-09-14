"""Download every raw source into data/dna/raw/, resume-safe. Run standalone
(`python download.py`) or import `ensure(key)` from the per-source scripts.
Never commits: data/dna/raw/ is gitignored.
"""
from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

RAW = Path(__file__).resolve().parents[2] / "data" / "dna" / "raw"

# key -> (url, filename, approx expected bytes for a "looks complete" check)
SOURCES = {
    "billboard": (
        "https://raw.githubusercontent.com/utdata/rwd-billboard-data/main/data-out/hot-100-current.csv",
        "billboard.csv", 20_000_000),
    "spotify": (
        "https://huggingface.co/datasets/maharshipandya/spotify-tracks-dataset/resolve/main/dataset.csv",
        "spotify.csv", 15_000_000),
    "chordonomicon": (
        "https://huggingface.co/datasets/ailsntua/Chordonomicon/resolve/main/chordonomicon_v2.csv",
        "chordonomicon.csv", 264_000_000),
    "lakh": (
        "http://hog.ee.columbia.edu/craffel/lmd/clean_midi.tar.gz",
        "lakh.tar.gz", 234_000_000),
    "groove": (
        "https://storage.googleapis.com/magentadata/datasets/groove/groove-v1.0.0-midionly.zip",
        "groove.zip", 3_000_000),
    "mcgill": (
        "https://www.dropbox.com/scl/fi/t1qd5jsowvur7qzt5jww3/billboard-2.0-salami_chords.tar.gz?rlkey=aq5wi70gzctmt4niqgt2k8xea&dl=1",
        "mcgill.tar.gz", 330_000),  # actual gzip is ~340KB (890 salami_chords.txt files)
}


def _looks_complete(path: Path, approx_bytes: int) -> bool:
    if not path.exists():
        return False
    size = path.stat().st_size
    return size >= approx_bytes * 0.9


def download(key: str, retries: int = 2) -> Path | None:
    url, filename, approx_bytes = SOURCES[key]
    RAW.mkdir(parents=True, exist_ok=True)
    dest = RAW / filename
    if _looks_complete(dest, approx_bytes):
        print(f"[{key}] already downloaded: {dest} ({dest.stat().st_size:,} bytes)")
        return dest
    for attempt in range(1, retries + 1):
        print(f"[{key}] downloading (attempt {attempt}/{retries}) -> {dest}")
        t0 = time.time()
        try:
            subprocess.run(
                ["curl", "-L", "-C", "-", "--fail", "--retry", "3", "-o", str(dest), url],
                check=True, timeout=1800)
        except subprocess.CalledProcessError as e:
            print(f"[{key}] curl failed (attempt {attempt}): {e}")
            continue
        except subprocess.TimeoutExpired:
            print(f"[{key}] curl timed out (attempt {attempt})")
            continue
        dt = time.time() - t0
        if _looks_complete(dest, approx_bytes):
            print(f"[{key}] done in {dt:.1f}s: {dest.stat().st_size:,} bytes")
            return dest
        print(f"[{key}] downloaded but size looks wrong ({dest.stat().st_size if dest.exists() else 0:,} bytes, wanted ~{approx_bytes:,})")
    print(f"[{key}] SKIPPED after {retries} failed attempts")
    return None


def ensure(key: str) -> Path | None:
    """Used by per-source scripts: download if missing, return path or None."""
    url, filename, approx_bytes = SOURCES[key]
    dest = RAW / filename
    if _looks_complete(dest, approx_bytes):
        return dest
    return download(key)


def main() -> None:
    keys = sys.argv[1:] or list(SOURCES.keys())
    for key in keys:
        download(key)


if __name__ == "__main__":
    main()
