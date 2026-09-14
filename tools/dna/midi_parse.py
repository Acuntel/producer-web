"""Per-file MIDI analysis for lakh.py: tempo map, channel-10 drums, melody/bass
track selection, 16th/8th grids, syncopation, swing, melody contour, and a
repetition-based structure guess. All quantization is tick-based (ticks map
linearly to beats regardless of tempo, so grids don't need the tempo map -
only duration_sec and the "is this file usable for grids" gate do).
"""
from __future__ import annotations

import statistics
from collections import Counter, defaultdict

import mido

import harmony

KICK = {35, 36}
SNARE = {38, 39, 40}
HAT_CLOSED = {42, 44}
HAT_OPEN = {46}
WEAK_16THS = {1, 3, 5, 7, 9, 11, 13, 15}


def load(path) -> dict:
    mid = mido.MidiFile(path)
    tpb = mid.ticks_per_beat
    tempo_events: list[tuple[int, int]] = []
    time_sig = None
    notes: list[dict] = []
    for track in mid.tracks:
        abs_tick = 0
        open_notes: dict[tuple[int, int], int] = {}
        for msg in track:
            abs_tick += msg.time
            if msg.type == "set_tempo":
                tempo_events.append((abs_tick, msg.tempo))
            elif msg.type == "time_signature" and time_sig is None:
                time_sig = msg.numerator
            elif msg.type == "note_on" and msg.velocity > 0:
                open_notes[(msg.channel, msg.note)] = abs_tick
            elif msg.type == "note_off" or (msg.type == "note_on" and msg.velocity == 0):
                key = (msg.channel, msg.note)
                start = open_notes.pop(key, None)
                if start is not None:
                    notes.append({"start": start, "end": abs_tick, "channel": msg.channel, "pitch": msg.note})
    tempo_events.sort()
    notes.sort(key=lambda n: n["start"])
    return {"tpb": tpb, "tempo_events": tempo_events, "time_sig": time_sig or 4, "notes": notes}


def dominant_tempo_bpm(tempo_events: list[tuple[int, int]], last_tick: int) -> float | None:
    if not tempo_events:
        return None
    spans = []
    for i, (tick, uspb) in enumerate(tempo_events):
        end = tempo_events[i + 1][0] if i + 1 < len(tempo_events) else last_tick
        spans.append((max(end - tick, 0), uspb))
    _dur, uspb = max(spans, key=lambda s: s[0])
    return 60_000_000 / uspb if uspb else None


def duration_seconds(tempo_events: list[tuple[int, int]], tpb: int, last_tick: int) -> float | None:
    if not tempo_events:
        return None
    seconds, prev_tick, prev_uspb = 0.0, 0, tempo_events[0][1]
    for tick, uspb in tempo_events:
        seconds += (tick - prev_tick) / tpb * prev_uspb / 1_000_000
        prev_tick, prev_uspb = tick, uspb
    seconds += (last_tick - prev_tick) / tpb * prev_uspb / 1_000_000
    return round(seconds, 2)


def key_from_notes(notes: list[dict]) -> tuple[int | None, str | None]:
    if not notes:
        return None, None
    hist = [0.0] * 12
    for n in notes:
        hist[n["pitch"] % 12] += (n["end"] - n["start"]) or 1
    best_score, best_pc, best_mode = None, None, None
    for pc in range(12):
        for mode, profile in (("major", harmony.KS_MAJOR), ("minor", harmony.KS_MINOR)):
            rotated = profile[-pc:] + profile[:-pc] if pc else profile
            score = sum(h * p for h, p in zip(hist, rotated))
            if best_score is None or score > best_score:
                best_score, best_pc, best_mode = score, pc, mode
    return best_pc, best_mode


def quantize(tick: int, bar_ticks: int, n_slots: int) -> tuple[int, int]:
    """-> (bar_index, slot 0..n_slots-1), rounding into the next bar if needed."""
    slot_ticks = bar_ticks / n_slots
    bar, rem = divmod(tick, bar_ticks)
    slot = round(rem / slot_ticks)
    if slot >= n_slots:
        bar, slot = bar + 1, 0
    return int(bar), int(slot)


def majority_grid(hits: dict[int, Counter], n_bars: int, n_slots: int, codes: dict[int, str] | None = None) -> str:
    """hits: slot -> Counter(bar -> count). Majority vote per slot across bars."""
    out = []
    for slot in range(n_slots):
        bars_hit = len(hits.get(slot, {}))
        frac = bars_hit / n_bars if n_bars else 0
        if frac > 0.5:
            out.append((codes or {}).get(slot, "X"))
        else:
            out.append(".")
    return "".join(out)


def drum_grids(notes: list[dict], bar_ticks: int) -> tuple[str | None, str | None, str | None, float | None]:
    drum_notes = [n for n in notes if n["channel"] == 9]
    if not drum_notes:
        return None, None, None, None
    n_bars = max(n["start"] // bar_ticks for n in drum_notes) + 1
    kick_hits, snare_hits, hat_closed_hits, hat_open_hits = (defaultdict(set) for _ in range(4))
    all_slots16, weak_hits = 0, 0
    for n in drum_notes:
        bar, slot = quantize(n["start"], bar_ticks, 16)
        all_slots16 += 1
        if slot in WEAK_16THS:
            weak_hits += 1
        if n["pitch"] in KICK:
            kick_hits[slot].add(bar)
        elif n["pitch"] in SNARE:
            snare_hits[slot].add(bar)
        elif n["pitch"] in HAT_CLOSED:
            hat_closed_hits[slot].add(bar)
        elif n["pitch"] in HAT_OPEN:
            hat_open_hits[slot].add(bar)
    kick = majority_grid(kick_hits, n_bars, 16)
    snare = majority_grid(snare_hits, n_bars, 16)
    hat_chars = []
    for slot in range(16):
        c_frac = len(hat_closed_hits.get(slot, ())) / n_bars
        o_frac = len(hat_open_hits.get(slot, ())) / n_bars
        if o_frac > 0.5 and o_frac >= c_frac:
            hat_chars.append("o")
        elif c_frac > 0.5:
            hat_chars.append("X")
        else:
            hat_chars.append(".")
    syncopation = round(weak_hits / all_slots16, 4) if all_slots16 else None
    return kick, snare, "".join(hat_chars), syncopation


def bass_rhythm_grid(notes: list[dict], bass_channel: int | None, bar_ticks: int) -> str | None:
    if bass_channel is None:
        return None
    bass_notes = [n for n in notes if n["channel"] == bass_channel]
    if not bass_notes:
        return None
    n_bars = max(n["start"] // bar_ticks for n in bass_notes) + 1
    hits = defaultdict(set)
    for n in bass_notes:
        bar, slot = quantize(n["start"], bar_ticks, 8)
        hits[slot].add(bar)
    return majority_grid(hits, n_bars, 8)


def swing_ratio(notes: list[dict], bar_ticks: int) -> float | None:
    """Median fractional beat-position of notes landing on the offbeat 8th
    ('and') within their beat. 0.5 = straight, ~0.667 = triplet swing."""
    beat_ticks = bar_ticks / 4
    samples = []
    for n in notes:
        if n["channel"] == 9:
            continue
        pos_in_beat = (n["start"] % beat_ticks) / beat_ticks
        if 0.3 <= pos_in_beat <= 0.7:
            samples.append(pos_in_beat)
    if len(samples) < 8:
        return None
    return round(statistics.median(samples), 4)


def pick_melody_bass(notes: list[dict]) -> tuple[int | None, int | None]:
    by_channel: dict[int, list[int]] = defaultdict(list)
    for n in notes:
        if n["channel"] != 9:
            by_channel[n["channel"]].append(n["pitch"])
    melody_ch, bass_ch = None, None
    best_median = None
    for ch, pitches in by_channel.items():
        if len(pitches) < 32:
            continue
        med = statistics.median(pitches)
        if best_median is None or med > best_median:
            best_median, melody_ch = med, ch
    best_low = None
    for ch, pitches in by_channel.items():
        if len(pitches) < 16:
            continue
        med = statistics.median(pitches)
        if med < 52 and (best_low is None or med < best_low):
            best_low, bass_ch = med, ch
    return melody_ch, bass_ch
