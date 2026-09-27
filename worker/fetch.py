"""Getting the record: an upload from storage, a link as given, or a name through the resolver.

A name is resolved identity first (worker/resolver.py). Candidates are tried best first; each download is
named by Shazam and checked against the ask. Only a match is taken as the original. When no candidate is
the original, the job stops with one honest line (NotTheOriginal) unless the caller already said which other
version to take (source.accept_version)."""
from __future__ import annotations
import os, re, subprocess
from dataclasses import dataclass
import analysis, finder, identify, resolver, supa

MAX_VERIFY_DOWNLOADS = int(os.environ.get("MAX_VERIFY_DOWNLOADS", "3"))


@dataclass
class Fetched:
    wav: str
    name: str
    resolved: str | None
    ident: dict | None = None
    verdict: resolver.Verdict | None = None
    identified: bool = False


class NotTheOriginal(RuntimeError):
    """Every copy tried was a cover, remix, live take or unrecognised. Carries what to say and what was found."""
    def __init__(self, verdict: resolver.Verdict, ident: dict | None, url: str | None, tried: list[dict]):
        super().__init__(verdict.message or "not the original")
        self.verdict, self.ident, self.url, self.tried = verdict, ident, url, tried

    def result(self) -> dict:
        return {"version": self.verdict.version, "versionNote": self.verdict.message, "identity": self.ident,
                "candidateUrl": self.url, "needsConsent": True, "tried": self.tried}


def ask_of(src) -> resolver.Ask | None:
    """The identity a job asks for, when it asks for one by name. Uploads and bare links carry none."""
    artist, title = getattr(src, "artist", None), getattr(src, "title", None)
    if not (src.query or artist or title): return None
    return resolver.parse_ask(src.query or "", artist, title, getattr(src, "duration_sec", None))


def accepts(src, version: str) -> bool:
    want = (getattr(src, "accept_version", None) or "").lower()
    return bool(want) and (want == "any" or want == version)


def _download(target: str, tmp: str, max_seconds: int) -> tuple[str | None, str | None, str]:
    """yt-dlp one target into tmp. Returns (file, printed title, error tail)."""
    out = os.path.join(tmp, "dl.%(ext)s")
    # HLS copies download as parallel fragments (Mixcloud's plain file crawls at a few hundred KB/s from a server).
    cmd = ["yt-dlp", "-f", "bestaudio[protocol^=m3u8]/bestaudio/best", "--concurrent-fragments", "8", "--ignore-errors", "--max-downloads", "1", "--match-filter", f"duration <? {max_seconds + 420}", "-o", out, "--print", "title", "--no-simulate", "--quiet", "--no-warnings", "--socket-timeout", "20"]
    if not target.startswith("scsearch"): cmd.append("--no-playlist")
    proxy = os.environ.get("YTDLP_PROXY")
    if proxy: cmd += ["--proxy", proxy]
    r = subprocess.run(cmd + [target], capture_output=True, text=True, timeout=600)
    lines = [l for l in r.stdout.splitlines() if l.strip()]
    files = [f for f in os.listdir(tmp) if f.startswith("dl.")]
    if r.returncode in (0, 101) and files: return os.path.join(tmp, files[0]), (lines[0] if lines else None), ""
    for f in files:
        try: os.remove(os.path.join(tmp, f))
        except OSError: pass
    return None, None, f"{target.split(':')[0]}: {(r.stderr or r.stdout)[-160:].strip()}"


def _to_wav(raw: str, tmp: str, max_seconds: int, mono16: bool) -> str:
    wav = os.path.join(tmp, "src.wav")
    if mono16: subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-t", str(max_seconds), "-ac", "1", "-ar", "16000", "-vn", wav], check=True)
    else: analysis.ffmpeg_to_wav(raw, wav, max_seconds)
    os.remove(raw)
    return wav


def targets_for(src, want: str | None, ask: resolver.Ask | None) -> list[str]:
    if src.url:
        # YouTube bot-checks server requests, so a YouTube link gets a clear message pointing at Capture what is playing.
        if re.search(r"(youtube\.com|youtu\.be|music\.youtube)", src.url, re.I):
            raise RuntimeError("youtube blocked: YouTube refuses server downloads. Play it in a tab and use Capture what is playing, or upload the file.")
        return [src.url]
    ranked = finder.search(src.query or "", None, want, ask=ask)
    out = [finder.archive_first_file(c.url) or c.url if c.source == "archive" else c.url for c in ranked[:6]]
    print(f"finder: {len(ranked)} candidates for {src.query!r}; trying {len(out) or 1}", flush=True)
    return out or [f"scsearch5:{src.query}"]


def fetch_source(job, tmp: str, max_seconds: int, mono16: bool = False, verify: bool = False) -> Fetched:
    """The record as a WAV in tmp. With verify, a name is checked against Shazam before it is accepted."""
    src = job.source
    if src.storage_path:
        raw = os.path.join(tmp, "upload.bin"); supa.download(src.storage_path, raw)
        return Fetched(_to_wav(raw, tmp, max_seconds, mono16), src.name or os.path.basename(src.storage_path), None)
    ask = ask_of(src) if verify and not src.url else None
    errors: list[str] = []; tried: list[dict] = []; first_miss: tuple | None = None
    for target in targets_for(src, "mix" if job.kind == "tracklist" else None, ask):
        if ask and len(tried) >= MAX_VERIFY_DOWNLOADS: break
        raw, title, err = _download(target, tmp, max_seconds)
        if not raw: errors.append(err); continue
        name = src.name or title or "linked track"
        print(f"resolved via {target.split('/')[2] if '://' in target else target.split(':')[0]}: {name}", flush=True)
        wav = _to_wav(raw, tmp, max_seconds, mono16)
        if not ask: return Fetched(wav, name, target)
        ident = None
        try: ident = identify.identify_file(wav)
        except Exception as e: print("identify failed", e, flush=True)
        v = resolver.verify(ask, ident)
        tried.append({"url": target, "version": v.version, "heard": identify.display_name(ident)})
        if v.ok or accepts(src, v.version):
            if not v.ok: v = resolver.Verdict(v.version, f"This is the {v.version} you said to use.", v.reasons)
            return Fetched(wav, identify.display_name(ident) or name, target, ident, v, True)
        print(f"not the original ({v.version}): {v.reasons}", flush=True)
        if first_miss is None: first_miss = (v, ident, target)
        os.remove(wav)
    if first_miss: raise NotTheOriginal(first_miss[0], first_miss[1], first_miss[2], tried)
    raise RuntimeError("download failed: " + " | ".join(errors)[-600:])
