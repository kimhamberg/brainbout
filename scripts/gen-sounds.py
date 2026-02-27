#!/usr/bin/env python3
"""Generate synthesised UI sound palette for Brainbout  (v4).

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
  • Chess pieces use modal synthesis — multiple resonant modes with
    frequency-dependent damping, bandpass-filtered noise residual,
    and impact transient.  Based on research into wood acoustics:
    wood modal frequencies cluster 100-500 Hz (free-free beam ratios),
    wood has high damping (modes decay fast, thud not ring),
    and higher modes decay faster than lower ones.

Outputs WAV files to public/sounds/.
"""

import logging
from pathlib import Path
from typing import NamedTuple

import numpy as np
from pedalboard import Compressor, Gain, Pedalboard, Reverb
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

log = logging.getLogger(__name__)

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
    ],
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
    """Pure sine wave at the given frequency."""
    return np.sin(2 * np.pi * freq * _t(dur))


def triangle(freq: float, dur: float) -> np.ndarray:
    """Triangle wave at the given frequency."""
    t = _t(dur)
    return 2 * np.abs(2 * (t * freq - np.floor(t * freq + 0.5))) - 1


def noise(dur: float) -> np.ndarray:
    """White noise with a fixed seed for reproducible builds."""
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
    """Array of zeros (silence) for the given duration."""
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


class WoodParams(NamedTuple):
    """Parameters for modal wood-impact synthesis.

    Attributes:
        body_freq: Fundamental mode frequency (Hz), typically 80-200.
        dur: Total sound duration (seconds).
        noise_level: Mix level of the noise residual (0-1).
        body_decay: Base decay rate for the fundamental mode.
        brightness: Upper cutoff of the noise residual bandpass (Hz).
        hardness: Impact transient loudness (0-1); higher = harder surface.

    """

    body_freq: float
    dur: float
    noise_level: float = 0.5
    body_decay: float = 35
    brightness: float = 500
    hardness: float = 0.5


def wood_hit(p: WoodParams) -> np.ndarray:
    """Modal synthesis of wood-on-wood impact for chess pieces.

    Based on acoustic research:
      - Wood modal frequencies follow free-free beam ratios relative
        to the fundamental: 1.0, 2.76, 5.40, 8.93 (non-harmonic).
      - Wood has high damping: modes decay fast (thud, not ring).
      - Higher modes decay faster: loss proportional to b1 + b3*f^2
        (frequency-dependent damping from Nathan Ho / modal synthesis lit).
      - Audible wood resonance sits 100-500 Hz (Tsugi procedural
        foley research), NOT the 30-170 kHz ultrasonic range.

    Layers:
      1. Modal bank: 4 resonant modes at beam ratios, each with
         frequency-dependent exponential decay
      2. Residual noise: bandpass-filtered (200-brightness Hz) for
         the 'woody' texture of contact
      3. Impact transient: very short broadband noise burst (~3 ms)
         filtered to 400-2000 Hz for the initial 'click'

    """
    t = _t(p.dur)

    # Free-free beam modal ratios (first 4 modes)
    # From beam vibration theory: f_n / f_1 for free-free boundary
    mode_ratios = [1.0, 2.76, 5.40, 8.93]
    mode_amps = [1.0, 0.35, 0.15, 0.06]

    # Modal bank - each mode is a decaying sine with freq-dependent damping
    # Higher modes decay faster: decay_k = body_decay * (f_k / f_1)^0.7
    modal = np.zeros_like(t)
    for ratio, amp in zip(mode_ratios, mode_amps, strict=True):
        freq_k = p.body_freq * ratio
        if freq_k > SR / 2:
            continue  # skip modes above Nyquist
        decay_k = p.body_decay * (ratio**0.7)
        modal += amp * sine(freq_k, p.dur) * env(p.dur, decay=decay_k)

    # Residual noise - bandpass-filtered for woody texture (200-brightness Hz)
    noise_decay_rate = p.body_decay * 1.5  # noise dies faster than body
    raw = noise(p.dur) * env(p.dur, decay=noise_decay_rate)
    woody = bpf(raw, 200, min(p.brightness, SR / 2 - 1)) * p.noise_level

    # Impact transient - short broadband click (~3 ms)
    imp_dur = 0.003
    imp_samples = int(SR * imp_dur)
    imp = noise(imp_dur) * env(imp_dur, attack=0.0003, decay=300) * p.hardness
    imp = bpf(imp, 400, 2000)

    out = modal + woody
    out[:imp_samples] += imp
    return out


# ── output ───────────────────────────────────────────────────────────


def master(samples: np.ndarray) -> np.ndarray:
    """Run samples through the pedalboard master effects chain."""
    buf = samples.astype(np.float32).reshape(1, -1)
    return MASTER(buf, SR).flatten()


def write(name: str, samples: np.ndarray) -> None:
    """Process and write a sound to a WAV file."""
    # fade-out -> low-pass -> pad for reverb tail -> normalize -> master ->
    # trim silence -> peak-limit -> fade-out
    samples = fadeout(samples)
    samples = lpf(samples)
    # Pad with 200 ms silence so reverb tail can decay naturally
    pad = np.zeros(int(SR * 0.2))
    samples = np.concatenate([samples, pad])
    peak = np.max(np.abs(samples))
    if peak > 0:
        samples = samples / peak * 0.75
    samples = master(samples)
    # Trim trailing silence (below -60 dB ≈ 0.001) to keep files small
    threshold = 0.001
    last_loud = len(samples) - 1
    while last_loud > 0 and abs(samples[last_loud]) < threshold:
        last_loud -= 1
    # Keep a small margin after the last audible sample
    samples = samples[: min(last_loud + int(SR * 0.01), len(samples))]
    peak = np.max(np.abs(samples))
    if peak > 1.0:
        samples /= peak
    # Final fade-out after reverb tail to prevent any residual pop
    samples = fadeout(samples)
    data = (samples * 32767).astype(np.int16)
    path = OUT / f"{name}.wav"
    wavfile.write(str(path), SR, data)
    kb = path.stat().st_size / 1024
    log.info("%s.wav  (%.2fs, %.0f KB)", name, len(data) / SR, kb)


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

    Modal synthesis at G2 (98 Hz) — 4 beam modes with fast decay.
    Noise residual capped at 500 Hz for the woody texture.
    Moderate hardness — felt-bottom piece on wooden board.
    """
    return wood_hit(
        WoodParams(
            body_freq=98.00,  # G2 - board fundamental
            dur=0.12,
            noise_level=0.55,
            body_decay=40,
            brightness=500,  # wood resonance caps ~500 Hz
            hardness=0.45,
        ),
    )


def capture() -> np.ndarray:
    """Piece-on-piece clack then board placement — chess capture.

    Two layered modal wood hits:
      1. Piece clack — higher fundamental (~196 Hz), brighter noise,
         harder transient (wood-on-wood collision)
      2. Board thud — lower fundamental (~110 Hz), softer noise,
         gentler transient (piece settling on board)
    """
    # piece clack — higher, harder, brighter
    clack = wood_hit(
        WoodParams(
            body_freq=196.00,  # G3 - small piece resonance
            dur=0.05,
            noise_level=0.6,
            body_decay=55,
            brightness=500,
            hardness=0.7,
        ),
    )
    # board thud — deeper, softer, follows the clack
    thud = wood_hit(
        WoodParams(
            body_freq=110.00,  # A2 - board resonance
            dur=0.10,
            noise_level=0.45,
            body_decay=38,
            brightness=450,
            hardness=0.35,
        ),
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
    logging.basicConfig(level=logging.INFO, format="  %(message)s")
    OUT.mkdir(parents=True, exist_ok=True)
    log.info("Writing to %s/\n", OUT)
    for name, fn in SOUNDS.items():
        write(name, fn())

    total = sum((OUT / f"{n}.wav").stat().st_size for n in SOUNDS) / 1024
    log.info("\n  Total: %.0f KB", total)
    log.info("Done!")
