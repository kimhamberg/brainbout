#!/usr/bin/env python3
"""Generate synthesised UI sound palette for Brainbout  (v3).

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
  • Fade-out on every sound — 8ms raised-cosine eliminates pop/click
    when playback is interrupted or the file ends.
  • Chess pieces use bandpass-filtered noise + resonant body for a
    closer-to-wood character.

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
# G2  = 98.00    G3 = 196.00   G4 = 392.00   G5 = 783.99
# B2  = 123.47   B3 = 246.94   B4 = 493.88   B5 = 987.77
# D3  = 146.83   D4 = 293.66   D5 = 587.33   D6 = 1174.66
# Eb3 = 155.56   Eb4 = 311.13  F3 = 174.61   F4 = 349.23


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
        e[:a] *= 0.5 * (1 - np.cos(np.pi * np.arange(a) / a))
    return e


def silence(dur: float) -> np.ndarray:
    return np.zeros(int(SR * dur))


def bpf(samples: np.ndarray, lo: float, hi: float, order: int = 4) -> np.ndarray:
    """Bandpass filter."""
    sos = butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return sosfilt(sos, samples).astype(np.float64)


def lpf(samples: np.ndarray, cutoff: float = 4000) -> np.ndarray:
    """4th-order Butterworth low-pass for Catppuccin softness."""
    sos = butter(4, cutoff, btype="low", fs=SR, output="sos")
    return sosfilt(sos, samples).astype(np.float64)


def fadeout(samples: np.ndarray, dur: float = 0.008) -> np.ndarray:
    """Raised-cosine fade-out to eliminate end-of-file pops."""
    n = min(int(SR * dur), len(samples))
    if n > 0:
        samples = samples.copy()
        samples[-n:] *= 0.5 * (1 + np.cos(np.pi * np.arange(n) / n))
    return samples


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


def wood_hit(
    body_freq: float,
    dur: float,
    noise_level: float = 0.5,
    body_decay: float = 35,
    noise_decay: float = 55,
    brightness: float = 1200,
) -> np.ndarray:
    """Simulated wood-on-wood impact for chess pieces.

    Layers:
      1. Resonant body — sine at the board's natural frequency, fast decay
      2. Board overtone — 2nd partial for warmth
      3. Bandpass noise — the 'woody' texture of felt-on-board (200–brightness Hz)
      4. Impact transient — very short high-frequency noise burst
    """
    # resonant body
    body = sine(body_freq, dur) * env(dur, decay=body_decay)
    overtone = sine(body_freq * 2.3, dur) * env(dur, decay=body_decay * 1.4) * 0.2

    # woody texture — bandpass filtered noise
    raw = noise(dur) * env(dur, decay=noise_decay)
    woody = bpf(raw, 200, brightness) * noise_level

    # sharp impact transient in first ~3ms
    imp_dur = 0.003
    imp = noise(imp_dur) * env(imp_dur, attack=0.0005, decay=200) * 0.6
    imp = bpf(imp, 800, 3500)

    out = body + overtone + woody
    out[: len(imp)] += imp
    return out


# ── output ───────────────────────────────────────────────────────────


def master(samples: np.ndarray) -> np.ndarray:
    buf = samples.astype(np.float32).reshape(1, -1)
    return MASTER(buf, SR).flatten()


def write(name: str, samples: np.ndarray) -> None:
    # fade-out → low-pass → normalize → master → peak-limit → fade-out
    samples = fadeout(samples)
    samples = lpf(samples)
    peak = np.max(np.abs(samples))
    if peak > 0:
        samples = samples / peak * 0.75
    samples = master(samples)
    peak = np.max(np.abs(samples))
    if peak > 1.0:
        samples /= peak
    # final fade-out after reverb tail to prevent any residual pop
    samples = fadeout(samples)
    data = (samples * 32767).astype(np.int16)
    path = OUT / f"{name}.wav"
    wavfile.write(str(path), SR, data)
    kb = path.stat().st_size / 1024
    print(f"  {name}.wav  ({len(data) / SR:.2f}s, {kb:.0f} KB)")


# ── sound definitions (key of G) ─────────────────────────────────────


def correct() -> np.ndarray:
    """Ascending major third  G3 → B3.  Warm, rewarding.

    Same interval Duolingo uses — a major third is the 'happy part
    of a major chord'.  Pitched in octave 3 for cozy depth.
    """
    d = 0.09
    a = warm(196.00, d, decay=18)  # G3
    b = warm(246.94, d, decay=18)  # B3
    return np.concatenate([a, silence(0.02), b])


def wrong() -> np.ndarray:
    """Descending tritone  B3 → F3.  Instinctively 'off', but gentle.

    Triangle waves + detuning keep it soft.  Octave 3 for warmth.
    """
    d = 0.11
    a = warm_tri(246.94, d, decay=8)  # B3
    b = warm_tri(174.61, d, decay=8)  # F3
    return np.concatenate([a, silence(0.025), b])


def move() -> np.ndarray:
    """Wood-on-wood thud — chess piece placed on board.

    Bandpass-filtered noise for woody texture, resonant body at G2,
    short impact transient for the felt-and-wood contact.
    """
    return wood_hit(
        body_freq=98.00,  # G2
        dur=0.10,
        noise_level=0.55,
        body_decay=30,
        noise_decay=45,
        brightness=1000,
    )


def capture() -> np.ndarray:
    """Piece-on-piece clack then placement — chess capture.

    Two layered wood hits: a brighter clack (pieces colliding)
    followed immediately by the board thud.
    """
    # piece clack — higher, brighter
    clack = wood_hit(
        body_freq=220.00,  # A3
        dur=0.04,
        noise_level=0.7,
        body_decay=60,
        noise_decay=80,
        brightness=2000,
    )
    # board thud — deeper, follows the clack
    thud = wood_hit(
        body_freq=110.00,  # A2
        dur=0.08,
        noise_level=0.45,
        body_decay=35,
        noise_decay=50,
        brightness=900,
    )
    return np.concatenate([clack, thud])


def check() -> np.ndarray:
    """FM bell double-pip at D4 — chess check alert."""
    d = 0.08
    pip = fm_bell(293.66, d, mod_ratio=1.41, mod_peak=3.5, decay=18)  # D4
    return np.concatenate([pip, silence(0.04), pip])


def victory() -> np.ndarray:
    """G major arpeggio → blooming chord.  Triumphant.

    G3 → B3 → D4 → G4, then a sustained G4+B4+D5 chord with
    detuned voices that 'bloom' open.
    """
    d, gap = 0.10, 0.035
    arp_notes = [196.00, 246.94, 293.66, 392.00]  # G3 B3 D4 G4
    parts: list[np.ndarray] = []
    for i, f in enumerate(arp_notes):
        n = warm(f, d, decay=6 + i * 2)
        parts.append(n)
        parts.append(silence(gap))

    # blooming final chord — three detuned voices
    cd = 0.45
    chord = (
        warm(392.00, cd, decay=3)  # G4
        + 0.7 * warm(493.88, cd, decay=3)  # B4
        + 0.5 * warm(587.33, cd, decay=3)  # D5
    )
    parts.append(chord)
    return np.concatenate(parts)


def defeat() -> np.ndarray:
    """Descending  G3 → Eb3 → D3.  Gentle minor disappointment."""
    d, gap = 0.14, 0.035
    freqs = [196.00, 155.56, 146.83]  # G3 Eb3 D3
    parts: list[np.ndarray] = []
    for i, f in enumerate(freqs):
        n = warm_tri(f, d, decay=5)
        parts.append(n)
        if i < len(freqs) - 1:
            parts.append(silence(gap))
    return np.concatenate(parts)


def draw() -> np.ndarray:
    """Perfect fifth  G3 → D4.  Neutral, resolved."""
    d = 0.15
    a = warm(196.00, d, decay=6)  # G3
    b = warm(293.66, d, decay=6)  # D4
    return np.concatenate([a, silence(0.04), b])


def notify() -> np.ndarray:
    """FM bell chime at G4 — session start / attention."""
    return fm_bell(392.00, 0.30, mod_ratio=1.41, mod_peak=5.0, decay=5)


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
