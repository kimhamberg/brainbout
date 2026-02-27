#!/usr/bin/env python3
"""Generate synthesised UI sound palette for Brainbout.

Run:  .venv/bin/python scripts/gen-sounds.py

Uses numpy for waveform synthesis and Spotify's pedalboard for
reverb / compression polish.  Outputs WAV files to public/sounds/.
"""

from pathlib import Path

import numpy as np
from pedalboard import Compressor, Gain, Pedalboard, Reverb
from scipy.io import wavfile

SR = 44100
OUT = Path(__file__).resolve().parent.parent / "public" / "sounds"

# Subtle room reverb + gentle compression for polish
MASTER = Pedalboard(
    [
        Reverb(room_size=0.15, wet_level=0.18, dry_level=0.85, width=0.6),
        Compressor(threshold_db=-16, ratio=3, attack_ms=2, release_ms=80),
        Gain(gain_db=1.5),
    ]
)


# ── helpers ──────────────────────────────────────────────────────────


def _time(duration: float) -> np.ndarray:
    return np.linspace(0, duration, int(SR * duration), endpoint=False)


def sine(freq: float, duration: float) -> np.ndarray:
    return np.sin(2 * np.pi * freq * _time(duration))


def triangle(freq: float, duration: float) -> np.ndarray:
    t = _time(duration)
    return 2 * np.abs(2 * (t * freq - np.floor(t * freq + 0.5))) - 1


def noise(duration: float) -> np.ndarray:
    return np.random.default_rng(42).standard_normal(int(SR * duration))


def env(duration: float, attack: float = 0.005, decay: float = 12) -> np.ndarray:
    """Exponential decay envelope with smooth attack."""
    t = _time(duration)
    e = np.exp(-t * decay)
    a = min(int(SR * attack), len(e))
    if a > 0:
        e[:a] *= np.linspace(0, 1, a)
    return e


def silence(duration: float) -> np.ndarray:
    return np.zeros(int(SR * duration))


def master(samples: np.ndarray) -> np.ndarray:
    """Run samples through the master effects chain."""
    # pedalboard expects float32 in shape (channels, samples)
    buf = samples.astype(np.float32).reshape(1, -1)
    processed = MASTER(buf, SR)
    return processed.flatten()


def write(name: str, samples: np.ndarray) -> None:
    # normalize before mastering
    peak = np.max(np.abs(samples))
    if peak > 0:
        samples = samples / peak * 0.8
    # apply reverb + compression
    samples = master(samples)
    # final peak-limit
    peak = np.max(np.abs(samples))
    if peak > 1.0:
        samples = samples / peak
    data = (samples * 32767).astype(np.int16)
    path = OUT / f"{name}.wav"
    wavfile.write(str(path), SR, data)
    kb = path.stat().st_size / 1024
    print(f"  {name}.wav  ({len(data) / SR:.2f}s, {kb:.0f} KB)")


# ── sound definitions ────────────────────────────────────────────────


def correct() -> np.ndarray:
    """Ascending two-note pip  C5 → E5.  Bright, satisfying."""
    d = 0.07
    a = sine(523.25, d) * env(d, decay=25)  # C5
    b = sine(659.25, d) * env(d, decay=25)  # E5
    return np.concatenate([a, silence(0.02), b])


def wrong() -> np.ndarray:
    """Gentle descending minor second  E4 → Eb4.  Soft, not punishing."""
    d = 0.10
    a = triangle(329.63, d) * env(d, decay=10)  # E4
    b = triangle(311.13, d) * env(d, decay=10)  # Eb4
    return np.concatenate([a, silence(0.03), b])


def move() -> np.ndarray:
    """Soft wooden thud — chess piece placement."""
    d = 0.06
    thud = sine(110, d) * env(d, decay=50)
    click = noise(d) * env(d, decay=80) * 0.3
    return thud + click


def capture() -> np.ndarray:
    """Sharper percussive snap — chess piece capture."""
    d = 0.08
    thud = sine(165, d) * env(d, decay=40)
    click = noise(d) * env(d, decay=60) * 0.5
    snap = sine(600, 0.03) * env(0.03, decay=80) * 0.3
    base = thud + click
    # layer the high snap at the start
    base[: len(snap)] += snap
    return base


def check() -> np.ndarray:
    """Alert double-pip at A5 — chess check warning."""
    d = 0.06
    pip = sine(880, d) * env(d, decay=22)
    return np.concatenate([pip, silence(0.04), pip])


def victory() -> np.ndarray:
    """Ascending major arpeggio  C5 → E5 → G5 → C6.  Triumphant."""
    d, gap = 0.11, 0.04
    notes = [523.25, 659.25, 783.99, 1046.50]  # C5 E5 G5 C6
    parts: list[np.ndarray] = []
    for i, f in enumerate(notes):
        # each note slightly longer decay so the arpeggio blooms
        n = sine(f, d) * env(d, decay=5 + i)
        parts.append(n)
        if i < len(notes) - 1:
            parts.append(silence(gap))
    # sustained final chord: C6 + G5
    chord_d = 0.35
    chord = sine(1046.50, chord_d) + 0.5 * sine(783.99, chord_d)
    chord *= env(chord_d, decay=3.5)
    parts.append(chord)
    return np.concatenate(parts)


def defeat() -> np.ndarray:
    """Descending minor line  G4 → F4 → Eb4.  Gentle disappointment."""
    d, gap = 0.14, 0.04
    freqs = [392.00, 349.23, 311.13]  # G4 F4 Eb4
    parts: list[np.ndarray] = []
    for i, f in enumerate(freqs):
        n = triangle(f, d) * env(d, decay=5)
        parts.append(n)
        if i < len(freqs) - 1:
            parts.append(silence(gap))
    return np.concatenate(parts)


def draw() -> np.ndarray:
    """Neutral perfect-fifth resolution  C4 → G4."""
    d = 0.16
    a = sine(261.63, d) * env(d, decay=5)  # C4
    b = sine(392.00, d) * env(d, decay=5)  # G4
    return np.concatenate([a, silence(0.05), b])


def notify() -> np.ndarray:
    """Bell-like chime at G5 with harmonic overtones."""
    d = 0.25
    fundamental = sine(783.99, d)
    h2 = 0.4 * sine(783.99 * 2, d)
    h3 = 0.15 * sine(783.99 * 3, d)
    return (fundamental + h2 + h3) * env(d, decay=5)


# ── main ─────────────────────────────────────────────────────────────

SOUNDS = {
    "correct": correct,
    "wrong": wrong,
    "move": move,
    "capture": capture,
    "check": check,
    "victory": victory,
    "defeat": defeat,
    "draw": draw,
    "notify": notify,
}

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    print(f"Writing to {OUT}/\n")
    for name, fn in SOUNDS.items():
        write(name, fn())
    print("\nDone!")
