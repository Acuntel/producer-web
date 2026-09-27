"""The job shapes the web app posts to the worker."""
from __future__ import annotations
from pydantic import BaseModel


class Source(BaseModel):
    url: str | None = None
    storage_path: str | None = None
    name: str | None = None
    query: str | None = None   # a song or artist name: the worker searches the public sources for it
    stem_paths: dict[str, str] | None = None   # kind "hear": the browser rendered mix + stem groups itself
    from_sec: float | None = None   # kind "tracklist": keep going from here (a run that stopped early)
    # The identity the ask names, when the DNA store resolved it before the job: ranked against, then checked.
    artist: str | None = None
    title: str | None = None
    duration_sec: float | None = None
    accept_version: str | None = None   # "cover", "remix", "live", "unverified" or "any": the user said to take it
    learn: bool = False                 # the learning lane: numbers only, no audio kept anywhere
    family: str | None = None           # the SOURCE record's family when the caller knows it (the chart's)


class Job(BaseModel):
    job_id: str
    owner: str
    project_id: str | None = None
    kind: str = "stems"
    source: Source
