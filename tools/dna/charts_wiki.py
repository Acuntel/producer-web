"""The charts, every genre, every year, from Wikipedia's chart pages (CC BY-SA; only aggregates ship).

Page titles come from <scratchpad>/wiki_chart_pages.json (591 pages found by prefix: Billboard year-end Hot 100,
Hot 100 number ones, Dance Club Songs, R&B/Hip-Hop, Rap, Country, Alternative, Mainstream Rock, Latin, UK number
ones, UK Dance, best-selling UK/Ireland, Global 200). Every wikitable row that carries a title and an artist becomes
one row here: family, chart page, year, position (a rank on a year-end page; a sequence on a number-ones page),
title, artist, and the store's folded names.

Writes data/dna/raw/charts_wiki.parquet.   <dna-venv>/bin/python tools/dna/charts_wiki.py [pages.json]
"""
from __future__ import annotations

import json, re, sys, time
from pathlib import Path

import mwparserfromhell as mw
import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import util  # noqa: E402
from util import norm_artist, norm_title  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "dna" / "raw" / "charts_wiki.parquet"
UA = {"User-Agent": "TheProducerResearch/1.0 (bradyschwartz25@gmail.com) charts study, aggregates only"}
API = "https://en.wikipedia.org/w/api.php"


def wikitext(title: str) -> str | None:
    for attempt in range(3):
        try:
            r = requests.get(API, params={"action": "parse", "page": title, "prop": "wikitext", "redirects": 1, "format": "json", "formatversion": 2}, headers=UA, timeout=40).json()
            return r.get("parse", {}).get("wikitext")
        except Exception:
            time.sleep(2 * (attempt + 1))
    return None


def clean(cell: str) -> str:
    code = mw.parse(cell)
    for t in list(code.filter_templates()):
        name = str(t.name).strip().lower()
        try:
            if name in ("abbr", "abbrlink", "tooltip") and t.params: code.replace(t, str(t.params[0].value))
            elif name == "sortname" and t.params: code.replace(t, " ".join(str(p.value) for p in t.params[:2] if not str(p.name).strip().startswith(("nolink", "dab"))))
            elif name == "sort" and t.params: code.replace(t, str(t.params[1].value) if len(t.params) > 1 else str(t.params[0].value))
            elif name in ("nowrap", "hlist", "plainlist", "flatlist", "small", "unbulleted list", "ubl") and t.params: code.replace(t, " / ".join(str(p.value) for p in t.params))
            elif name.startswith("single") or name.startswith("song") or name.startswith("n/a"): code.remove(t)
            else: code.remove(t)
        except Exception: pass
    s = code.strip_code(normalize=True, collapse=True)
    s = re.sub(r"<[^>]+>", " ", s); s = re.sub(r"\[\[|\]\]", "", s); s = s.replace("''", "").replace('"', "")
    s = re.sub(r"\s+", " ", s).strip(" \t\n|†‡*")
    return s


def split_attrs(cell: str) -> tuple[str, str]:
    """A cell's attribute prefix and its content: 'scope=row style=...|1118' -> ('scope=row style=...', '1118')."""
    i = cell.find("|")
    if i < 0: return "", cell
    prefix = cell[:i]
    if "{{" in prefix or "[[" in prefix or "<" in prefix: return "", cell
    return prefix, cell[i + 1:]


def table_grid(tbl: str) -> list[list[tuple[str, bool]]]:
    """A wikitable as a rectangular grid of (raw cell, is_header), colspan and rowspan expanded."""
    rows: list[list[tuple[str, int, int, bool]]] = []; cur: list[tuple[str, int, int, bool]] = []
    for l in tbl.split("\n")[1:]:
        if l.startswith("|-"):
            if cur: rows.append(cur); cur = []
            continue
        if l.startswith("|+") or l.startswith("|}"): continue
        if not (l.startswith("!") or l.startswith("|")): 
            if cur: cur[-1] = (cur[-1][0] + " " + l, cur[-1][1], cur[-1][2], cur[-1][3])   # a cell continued on the next line
            continue
        for c in re.split(r"\s*(?:\|\||!!)\s*", l[1:]):
            attrs, text = split_attrs(c)
            # A "!scope=row" cell is a body cell that happens to be bold; only column headers count as headers.
            is_h = l.startswith("!") and "scope=row" not in attrs.replace('"', "").replace(" ", "")
            cs = re.search(r'colspan\s*=\s*"?(\d+)', attrs); rs = re.search(r'rowspan\s*=\s*"?(\d+)', attrs)
            cur.append((text, int(cs.group(1)) if cs else 1, int(rs.group(1)) if rs else 1, is_h))
    if cur: rows.append(cur)
    grid: list[list[tuple[str, bool]]] = []; pending: dict[int, tuple[str, int, bool]] = {}
    for r in rows:
        out: list[tuple[str, bool]] = []; col = 0; ci = 0
        while ci < len(r) or col in pending:
            if col in pending:
                text, rem, is_h = pending[col]; out.append((text, is_h))
                if rem > 1: pending[col] = (text, rem - 1, is_h)
                else: del pending[col]
                col += 1; continue
            text, cs, rs, is_h = r[ci]; ci += 1
            for _ in range(cs):
                out.append((text, is_h))
                if rs > 1: pending[col] = (text, rs - 1, is_h)
                col += 1
        grid.append(out)
    return grid


TITLE_NAMES = ("title", "song", "single", "track", "song title", "single title")


def parse_tables(text: str) -> list[tuple[int | None, str, str]]:
    """Rows of (position, title, artist) from every wikitable that carries a title column and an artist column
    (several pairs when a page lists more than one chart side by side)."""
    rows: list[tuple[int | None, str, str]] = []
    for tbl in re.findall(r"\{\|.*?\n\|\}", text, flags=re.S):
        grid = table_grid(tbl)
        if not grid: continue
        hdr_rows = []
        for g in grid:
            if g and all(h for _, h in g) and (not hdr_rows or len(g) >= len(hdr_rows[0]) - 1): hdr_rows.append(g)
            else: break
        if not hdr_rows: continue
        names = [clean(t).lower() for t, _ in hdr_rows[-1]]
        body = grid[len(hdr_rows):]
        pairs = []
        for i, n in enumerate(names):
            if n in TITLE_NAMES:
                j = next((k for k in range(i + 1, min(len(names), i + 4)) if names[k].startswith(("artist", "performer", "act"))), None)
                if j is None: j = next((k for k in range(max(0, i - 3), i) if names[k].startswith(("artist", "performer", "act"))), None)
                if j is not None: pairs.append((i, j))
        if not pairs: continue
        pi = next((i for i, n in enumerate(names) if n in ("no.", "№", "#", "position", "rank", "no", "pos.", "pos", "number")), None)
        for r in body:
            cells = [t for t, _ in r]
            pos = None
            if pi is not None and pi < len(cells):
                m = re.search(r"\d+", clean(cells[pi])); pos = int(m.group()) if m else None
            for ti, ai in pairs:
                if max(ti, ai) >= len(cells): continue
                title = clean(cells[ti]); artist = clean(cells[ai])
                if not title or not artist or len(title) > 120 or len(artist) > 120 or title.lower() in ("song", "title", "single"): continue
                if title == artist or re.fullmatch(r"\d{4}", title) or re.fullmatch(r"\d{4}", artist): continue   # a year subheader read as a row
                rows.append((pos, title, artist))
    return rows


def main() -> None:
    pages_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/private/tmp/claude-501/-Users-bradyschwartz/ea6e9de9-3b33-4df1-a4bb-5e94483ee985/scratchpad/wiki_chart_pages.json")
    fam_pages: dict[str, list[str]] = json.loads(pages_path.read_text())
    t0 = time.time(); out = []; pages = 0; empty = []
    for family, titles in fam_pages.items():
        for title in titles:
            text = wikitext(title); pages += 1
            if not text: empty.append(title); continue
            year_m = re.search(r"(19|20)\d{2}", title); year = int(year_m.group()) if year_m else None
            decade = re.search(r"(19|20)\d0s", title)
            rows = parse_tables(text)
            if not rows: empty.append(title)
            for seq, (pos, t, a) in enumerate(rows, 1):
                out.append({"family": family, "page": title, "year": year, "decade_page": bool(decade), "position": pos if pos is not None else seq, "title": t, "artist": a})
            time.sleep(0.25)
            if pages % 50 == 0: print(f"[charts] {pages} pages, {len(out):,} rows, {len(empty)} empty ({time.time() - t0:.0f}s)", flush=True)
    df = pd.DataFrame(out)
    df["artist_norm"] = df["artist"].map(norm_artist); df["title_norm"] = df["title"].map(norm_title)
    df = df.drop_duplicates(["page", "position", "artist_norm", "title_norm"])
    util.write_parquet(df, OUT)
    print(f"[charts] {pages} pages -> {len(df):,} rows across {df['page'].nunique()} pages, {df['artist_norm'].nunique():,} artists; {len(empty)} pages gave nothing -> {OUT} in {time.time() - t0:.0f}s")
    print("[charts] rows per family:", df.groupby("family").size().to_dict())
    if empty: print("[charts] empty pages (first 12):", empty[:12])


if __name__ == "__main__":
    main()
