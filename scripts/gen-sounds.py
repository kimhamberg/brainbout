#!/usr/bin/env python3
"""Generate synthesised UI sound palette for Brainbout  (v2).

Run:  .venv/bin/python scripts/gen-sounds.py

Design principles (informed by Duolingo / Apple / cross-modal research):
  • Key of G — every tonal sound is derived from G major so the whole
    palette feels like one designed family.
  • ±5-cent detuning — two oscillators per voice, slightly apart, for
    organic warmth instead of sterile digital perfection.
  • Additive harmonics — 2nd + 3rd partial give each tone body
    (marimba-like vs bare tuning-fork).
  • FM synthesis — bell / chime sounds use frequency modulation with a
    decaying mod-index (bright attack → mellow sustain).
  • Low-pass @ 4 kHz — rolls off harsh highs to match Catppuccin's
    soft, warm visual palette.
  • Pedalboard master chain — subtle room reverb + gentle compression.

Outputs WAV files to public/sounds/.
"""

from pathlib import Path

import numpy as np
from pedalboard import Compressor, Gain, Pedalboard, Reverb
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100
OUT = Path(__file__).resolve().parent.parent / "public" / "sounds"

# ±5 cents gives slow organic beating between the two voices
DETUNE = 2 ** (5 / 1200)  # ≈ 1.0029

# Master effects chain
MASTER = Pedalboard(
    [
        Reverb(room_size=0.18, wet_level=0.22, dry_level=0.82, width=0.7),
        Compressor(threshold_db=-14, ratio=3.5, attack_ms=2, release_ms=60),
        Gain(gain_db=2.0),
    ]
)

# Key of G  ────────────────────────────────────────────────────────────
# G3  = 196.00   G4 = 392.00   G5 = 783.99   G6 = 1567.98
# A4  = 440.00   B4 = 493.88   B5 = 987.77
# D4  = 293.66   D5 = 587.33   D6 = 1174.66
# Eb4 = 311.13   F4 = 349.23   F#5 = 739.99


# ── primitives ───────────────────────────────────────────────────────


def _t(dur: float) -> np.ndarray:
    return np.linspace(0, dur, int(SR * dur), endpoint=False)


def sine(freq: float, dur: float) -> np.ndarray:
    return np.sin(2 * np.pi * freq * _t(dur))


def triangle(freq: float, dur: float) -> np.ndarray:
    t = _t(dur)
    return 2 * np.abs(2 * (t * freq - np.floor(t * freq + 0.5))) - 1


def noise(dur: float) -> np.ndarray:
    return np.random.default_rng(42).standard_normal(int(SR * dur))


def env(dur: float, attack: float = 0.008, decay: float = 12) -> np.ndarray:
    """Exponential decay with smooth raised-cosine attack."""
    t = _t(dur)
    e = np.exp(-t * decay)
    a = min(int(SR * attack), len(e))
    if a > 0:
        # raised-cosine attack avoids the click of a linear ramp
        e[:a] *= 0.5 * (1 - np.cos(np.pi * np.arange(a) / a))
    return e


def silence(dur: float) -> np.ndarray:
    return np.zeros(int(SR * dur))


def lpf(samples: np.ndarray, cutoff: float = 4000) -> np.ndarray:
    """4th-order Butterworth low-pass for Catppuccin softness."""
    sos = butter(4, cutoff, btype="low", fs=SR, output="sos")
    return sosfilt(sos, samples).astype(np.float64)


# ── composite voices ─────────────────────────────────────────────────


def warm(freq: float, dur: float, decay: float = 15) -> np.ndarray:
    """Detuned pair + harmonics → warm, alive tone."""
    hi, lo = freq * DETUNE, freq / DETUNE
    osc = sine(hi, dur) + sine(lo, dur)
    osc += 0.28 * sine(freq * 2, dur)  # 2nd harmonic — body
    osc += 0.10 * sine(freq * 3, dur)  # 3rd harmonic — presence
    osc /= np.max(np.abs(osc))
    return osc * env(dur, decay=decay)


def warm_tri(freq: float, dur: float, decay: float = 10) -> np.ndarray:
    """Detuned triangle pair — softer timbre for 'wrong' / 'defeat'."""
    hi, lo = freq * DETUNE, freq / DETUNE
    osc = triangle(hi, dur) + triangle(lo, dur)
    osc += 0.15 * sine(freq * 2, dur)  # subtle 2nd harmonic
    osc /= np.max(np.abs(osc))
    return osc * env(dur, decay=decay)


def fm_bell(
    freq: float,
    dur: float,
    mod_ratio: float = 1.41,
    mod_peak: float = 4.0,
    decay: float = 8,
) -> np.ndarray:
    """FM bell — bright attack that decays to pure tone."""
    t = _t(dur)
    mod_freq = freq * mod_ratio
    # mod-index decays: bright inharmonic transient → warm fundamental
    index = mod_peak * np.exp(-t * 14)
    modulator = index * np.sin(2 * np.pi * mod_freq * t)
    carrier = np.sin(2 * np.pi * freq * t + modulator)
    return carrier * env(dur, decay=decay)


# ── output ───────────────────────────────────────────────────────────


def master(samples: np.ndarray) -> np.ndarray:
    buf = samples.astype(np.float32).reshape(1, -1)
    return MASTER(buf, SR).flatten()


def write(name: str, samples: np.ndarray) -> None:
    # low-pass → normalize → master → peak-limit
    samples = lpf(samples)
    peak = np.max(np.abs(samples))
    if peak > 0:
        samples = samples / peak * 0.75
    samples = master(samples)
    peak = np.max(np.abs(samples))
    if peak > 1.0:
        samples /= peak
    data = (samples * 32767).astype(np.int16)
    path = OUT / f"{name}.wav"
    wavfile.write(str(path), SR, data)
    kb = path.stat().st_size / 1024
    print(f"  {name}.wav  ({len(data) / SR:.2f}s, {kb:.0f} KB)")


# ── sound definitions (key of G) ─────────────────────────────────────


def correct() -> np.ndarray:
    """Ascending major third  G4 → B4.  Warm, rewarding.

    Same interval Duolingo uses for its success chime — a major third
    is the 'happy part of a major chord'.
    """
    d = 0.08
    a = warm(392.00, d, decay=22)  # G4
    b = warm(493.88, d, decay=22)  # B4
    return np.concatenate([a, silence(0.02), b])


def wrong() -> np.ndarray:
    """Descending tritone  B4 → F4.  Instinctively 'off', but gentle.

    The tritone (diabolus in musica) triggers discomfort even in babies.
    Triangle waves + detuning keep it soft rather than harsh.
    """
    d = 0.10
    a = warm_tri(493.88, d, decay=9)  # B4
    b = warm_tri(349.23, d, decay=9)  # F4
    return np.concatenate([a, silence(0.025), b])


def move() -> np.ndarray:
    """Soft wooden thud at G2 — chess piece placement."""
    d = 0.07
    thud = sine(98.00, d) * env(d, decay=45)  # G2 fundamental
    body = sine(196.00, d) * env(d, decay=55) * 0.3  # G3 2nd partial
    click = noise(d) * env(d, decay=85) * 0.25
    return thud + body + click


def capture() -> np.ndarray:
    """Percussive snap at D3 — chess piece capture."""
    d = 0.09
    thud = sine(146.83, d) * env(d, decay=38)  # D3
    body = sine(293.66, d) * env(d, decay=50) * 0.3  # D4 overtone
    click = noise(d) * env(d, decay=55) * 0.45
    snap = sine(587.33, 0.025) * env(0.025, decay=90) * 0.3  # D5 transient
    base = thud + body + click
    base[: len(snap)] += snap
    return base


def check() -> np.ndarray:
    """FM bell double-pip at D5 — chess check alert."""
    d = 0.07
    pip = fm_bell(587.33, d, mod_ratio=1.41, mod_peak=3.5, decay=20)  # D5
    return np.concatenate([pip, silence(0.04), pip])


def victory() -> np.ndarray:
    """G major arpeggio → blooming chord.  Triumphant.

    G4 → B4 → D5 → G5, then a sustained G5+B5+D6 chord with
    detuned voices that 'bloom' open.
    """
    d, gap = 0.10, 0.035
    arp_notes = [392.00, 493.88, 587.33, 783.99]  # G4 B4 D5 G5
    parts: list[np.ndarray] = []
    for i, f in enumerate(arp_notes):
        n = warm(f, d, decay=6 + i * 2)
        parts.append(n)
        parts.append(silence(gap))

    # blooming final chord — three detuned voices
    cd = 0.40
    chord = (
        warm(783.99, cd, decay=3)       # G5
        + 0.7 * warm(987.77, cd, decay=3)   # B5
        + 0.5 * warm(1174.66, cd, decay=3)  # D6
    )
    parts.append(chord)
    return np.concatenate(parts)


def defeat() -> np.ndarray:
    """Descending  G4 → Eb4 → D4.  Gentle minor disappointment."""
    d, gap = 0.13, 0.035
    freqs = [392.00, 311.13, 293.66]  # G4 Eb4 D4
    parts: list[np.ndarray] = []
    for i, f in enumerate(freqs):
        n = warm_tri(f, d, decay=5)
        parts.append(n)
        if i < len(freqs) - 1:
            parts.append(silence(gap))
    return np.concatenate(parts)


def draw() -> np.ndarray:
    """Perfect fifth  G4 → D5.  Neutral, resolved."""
    d = 0.14
    a = warm(392.00, d, decay=6)  # G4
    b = warm(587.33, d, decay=6)  # D5
    return np.concatenate([a, silence(0.04), b])


def notify() -> np.ndarray:
    """FM bell chime at G5 — session start / attention."""
    return fm_bell(783.99, 0.30, mod_ratio=1.41, mod_peak=5.0, decay=5)


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

    total = sum((OUT / f"{n}.wav").stat().st_size for n in SOUNDS) / 1024
    print(f"\n  Total: {total:.0f} KB")
    print("Done!")
