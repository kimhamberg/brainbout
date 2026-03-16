#!/usr/bin/env python3
"""Generate synthesised UI sound palette for Brainbout  (v6).

Run:  .venv/bin/python scripts/gen-sounds.py

Chess piece sounds (move/capture) are optimized via scipy differential
evolution so that every measured output metric falls between Lichess and
Chess.com reference values.  Metrics are 4 statistical moments x 2
domains: frequency moments computed on log2(freq) axis (perceptually
weighted), time moments on the energy envelope.

Tonal UI sounds (correct, wrong, victory, defeat, draw, check, notify)
are unchanged from v4 — key of G, warm detuned synthesis.

Outputs WAV files to public/sounds/.
"""

import logging
import time
from pathlib import Path
from typing import NamedTuple

import numpy as np
from pedalboard import (
    Compressor,
    Gain,
    HighpassFilter,
    Limiter,
    LowpassFilter,
    Pedalboard,
    Reverb,
)
from scipy.io import wavfile
from scipy.optimize import differential_evolution
from scipy.signal import butter, sosfiltfilt, welch
from tqdm import tqdm

log = logging.getLogger(__name__)

SR = 44100
OUT = Path(__file__).resolve().parent.parent / "public" / "sounds"

# ±5 cents gives slow organic beating between the two voices
DETUNE = 2 ** (5 / 1200)  # ≈ 1.0029

# Seeded RNG for reproducible "between Lichess & Chess.com" parameter picks
_rng = np.random.default_rng(960)  # Chess960!


def _between(a: float, b: float) -> float:
    """Random value uniformly between a and b (order doesn't matter)."""
    lo, hi = min(a, b), max(a, b)
    return float(_rng.uniform(lo, hi))


# ── Global processing for tonal UI sounds ─────────────────────────
# These only affect non-chess sounds (correct, wrong, victory, etc.).
# Chess sounds use fully optimizer-controlled chains instead.

LPF_CUTOFF = _between(6000, 8000)

MASTER = Pedalboard(
    [
        Reverb(
            room_size=_between(0.12, 0.25),
            wet_level=_between(0.15, 0.28),
            dry_level=_between(0.75, 0.88),
            damping=_between(0.3, 0.55),
            width=_between(0.5, 0.8),
        ),
        Compressor(
            threshold_db=_between(-18, -10),
            ratio=_between(2.5, 4.0),
            attack_ms=_between(1.0, 3.5),
            release_ms=_between(40, 80),
        ),
        Limiter(
            threshold_db=_between(-3, -1),
            release_ms=_between(60, 120),
        ),
        Gain(gain_db=_between(1.0, 3.0)),
    ],
)

# ── Reference metrics ─────────────────────────────────────────────
# 8 metrics: 4 statistical moments x 2 domains.
# Frequency moments are computed on log2(freq) axis (perceptual weighting).
# All target ranges are [min(lichess, chesscom), max(lichess, chesscom)].
# Tolerance factor widens each range symmetrically (0.10 = ±10%).
REF_TOLERANCE = 0.10


def _ref_range(a: float, b: float) -> tuple[float, float]:
    """Build a target range from two reference values, widened by REF_TOLERANCE."""
    lo, hi = min(a, b), max(a, b)
    span = hi - lo
    margin = max(span * REF_TOLERANCE, abs(lo) * REF_TOLERANCE)
    return (lo - margin, hi + margin)


# ── MOVE reference measurements ──
# Freq moments on log2(freq); time moments as weighted distribution over t_ms.
# Lichess:
#   f_centroid=635.1  f_spread=0.6374  f_skewness=-2.87  f_kurtosis=14.46
#   t_centroid=62.1   t_spread=2.2     t_skewness=9.75   t_kurtosis=166.04
# Chess.com:
#   f_centroid=744.3  f_spread=0.6454  f_skewness=-0.68  f_kurtosis=0.93
#   t_centroid=55.2   t_spread=3.5     t_skewness=5.10   t_kurtosis=83.57

MOVE_REF = {
    "f_centroid": _ref_range(635.1, 744.3),
    "f_spread": _ref_range(0.6374, 0.6454),
    "f_skewness": _ref_range(-2.87, -0.68),
    "f_kurtosis": _ref_range(0.93, 14.46),
    "t_centroid": _ref_range(55.2, 62.1),
    "t_spread": _ref_range(2.2, 3.5),
    "t_skewness": _ref_range(5.10, 9.75),
    "t_kurtosis": _ref_range(83.57, 166.04),
}

# ── CAPTURE reference measurements ──
# Lichess:
#   f_centroid=1231.8  f_spread=0.8339  f_skewness=-1.89  f_kurtosis=5.43
#   t_centroid=66.3    t_spread=9.6     t_skewness=2.82   t_kurtosis=6.74
# Chess.com:
#   f_centroid=1136.1  f_spread=0.9915  f_skewness=-0.47  f_kurtosis=1.70
#   t_centroid=63.0    t_spread=5.8     t_skewness=4.86   t_kurtosis=62.17

CAPTURE_REF = {
    "f_centroid": _ref_range(1136.1, 1231.8),
    "f_spread": _ref_range(0.8339, 0.9915),
    "f_skewness": _ref_range(-1.89, -0.47),
    "f_kurtosis": _ref_range(1.70, 5.43),
    "t_centroid": _ref_range(63.0, 66.3),
    "t_spread": _ref_range(5.8, 9.6),
    "t_skewness": _ref_range(2.82, 4.86),
    "t_kurtosis": _ref_range(6.74, 62.17),
}

# Key of G — all pitches derived via note() from 12-TET A4 = 440 Hz


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


def pink_noise(dur: float) -> np.ndarray:
    """Pink noise (1/f) — more natural frequency distribution than white."""
    n = int(SR * dur)
    white = np.random.default_rng(42).standard_normal(n)
    spectrum = np.fft.rfft(white)
    freqs = np.fft.rfftfreq(n, d=1 / SR)
    freqs[0] = 1.0
    spectrum /= np.sqrt(freqs)
    pink = np.fft.irfft(spectrum, n=n)
    peak = np.max(np.abs(pink))
    return pink / peak if peak > 0 else pink


def env(dur: float, attack: float = 0.008, decay: float = 12) -> np.ndarray:
    """Exponential decay with smooth raised-cosine attack."""
    t = _t(dur)
    e = np.exp(-t * decay)
    a = min(int(SR * attack), len(e))
    if a > 0:
        e[:a] *= 0.5 * (1 - np.cos(np.pi * np.arange(a) / a))
    return e


_IMPACT_ATTACK = 0.0005  # 0.5 ms raised-cosine attack (physical contact time)


def impact_env(
    dur: float,
    onset: float = 0.05,
    decay_tau: float = 0.005,
    decay_beta: float = 0.5,
) -> np.ndarray:
    """Weibull (stretched exponential) impact envelope.

    Models a percussive strike: silence → near-instant onset → fast initial
    decay with a faint long tail.  The Weibull survival function
    exp(-(t/τ)^β) with β<1 produces the extreme positive skewness and
    kurtosis seen in real chess piece impacts:

        β ≈ 0.4  →  energy skewness ≈ 6,  kurtosis ≈ 80+
        β ≈ 0.5  →  energy skewness ≈ 4,  kurtosis ≈ 40+

    onset:      time of impact start (seconds) — controls t_centroid
    decay_tau:  Weibull scale (seconds) — controls t_spread
    decay_beta: Weibull shape (0 < β < 1) — controls skewness/kurtosis
    """
    t = _t(dur)
    onset_idx = max(0, int(onset * SR))
    t_rel = np.maximum(t - onset, 0)

    # Weibull survival function: exp(-(t/τ)^β)
    e = np.exp(-((t_rel / decay_tau) ** decay_beta))

    # Zero before onset
    e[:onset_idx] = 0.0

    # Smooth 0.5 ms raised-cosine attack to avoid click artifacts
    attack_n = max(1, int(SR * _IMPACT_ATTACK))
    end = min(onset_idx + attack_n, len(e))
    n = end - onset_idx
    if n > 0:
        e[onset_idx:end] *= 0.5 * (1 - np.cos(np.pi * np.arange(n) / n))

    return e


def silence(dur: float) -> np.ndarray:
    """Array of zeros (silence) for the given duration."""
    return np.zeros(int(SR * dur))


def bpf(samples: np.ndarray, lo: float, hi: float, order: int = 2) -> np.ndarray:
    """Zero-phase bandpass filter."""
    sos = butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return sosfiltfilt(sos, samples).astype(np.float64)


def lpf(samples: np.ndarray, cutoff: float | None = None) -> np.ndarray:
    """Zero-phase Butterworth low-pass."""
    if cutoff is None:
        cutoff = LPF_CUTOFF
    sos = butter(2, cutoff, btype="low", fs=SR, output="sos")
    return sosfiltfilt(sos, samples).astype(np.float64)


def fadeout(samples: np.ndarray, dur: float = 0.008) -> np.ndarray:
    """Raised-cosine fade-out to eliminate end-of-file pops."""
    n = min(int(SR * dur), len(samples))
    if n > 0:
        samples = samples.copy()
        samples[-n:] *= 0.5 * (1 + np.cos(np.pi * np.arange(n) / n))
    return samples


# ── psychoacoustic solvers ──────────────────────────────────────────
# Scientifically derived parameters replacing hand-tuned magic numbers.
#
# References:
#   ISO 226:2003  — Normal equal-loudness-level contours
#   IEC 61672-1   — A-weighting frequency response
#   Glasberg & Moore (1990) — Equivalent rectangular bandwidth (ERB)
#   Zwislocki (1969) — Temporal summation of loudness (JASA 46, 431–441)
#   Plomp & Levelt (1965) — Tonal consonance and critical bandwidth (JASA 38, 548–560)
#   Moore (2012) — An Introduction to the Psychology of Hearing (6th ed.)

# ── Musical pitch ──

_SEMITONE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def note(name: str) -> float:
    """Convert a note name to frequency in Hz (A4 = 440 Hz, 12-TET).

    Supports sharps (#) and flats (b).
    Examples: note("G3") → 196.0, note("Bb3") → 233.08, note("F#3") → 185.0
    """
    letter = name[0].upper()
    rest = name[1:]
    accidental = 0
    if rest.startswith("#"):
        accidental = 1
        rest = rest[1:]
    elif rest.startswith("b"):
        accidental = -1
        rest = rest[1:]
    midi = 12 * (int(rest) + 1) + _SEMITONE[letter] + accidental
    return 440.0 * 2 ** ((midi - 69) / 12)


# ── ISO 226:2003 equal loudness contour data (Table 1) ──
# 29 standard frequencies from 20 Hz to 12.5 kHz.
_ISO226_F = np.array([
    20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500,
    630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000,
    10000, 12500,
], dtype=np.float64)

_ISO226_AF = np.array([
    0.532, 0.506, 0.480, 0.455, 0.432, 0.409, 0.387, 0.367, 0.349, 0.330,
    0.315, 0.301, 0.288, 0.276, 0.267, 0.259, 0.253, 0.250, 0.246, 0.244,
    0.243, 0.243, 0.243, 0.242, 0.242, 0.245, 0.254, 0.271, 0.301,
])

_ISO226_LU = np.array([
    -31.6, -27.2, -23.0, -19.1, -15.9, -13.0, -10.3, -8.1, -6.2, -4.5,
    -3.1, -2.0, -1.1, -0.4, 0.0, 0.3, 0.5, 0.0, -2.7, -4.1, -1.0, 1.7,
    2.5, 1.2, -2.1, -7.1, -11.2, -10.7, -3.1,
])

_ISO226_TF = np.array([
    78.5, 68.7, 59.5, 51.1, 44.0, 37.5, 31.5, 26.5, 22.1, 17.9, 14.4,
    11.4, 8.6, 6.2, 4.4, 3.0, 2.2, 2.4, 3.5, 1.7, -1.3, -4.2, -6.0,
    -5.4, -1.5, 6.0, 12.6, 13.9, 12.3,
])

_ISO226_LOG_F = np.log10(_ISO226_F)


def _iso226_spl(freq_hz: float, phon: float = 40) -> float:
    """SPL (dB) needed at freq_hz to achieve the given phon level (ISO 226:2003).

    Uses linear interpolation on log-frequency axis between the 29 standard points.
    Valid for 20 Hz–12.5 kHz and 0–90 phon.
    """
    log_f = np.log10(np.clip(freq_hz, 20, 12500))
    af = float(np.interp(log_f, _ISO226_LOG_F, _ISO226_AF))
    lu = float(np.interp(log_f, _ISO226_LOG_F, _ISO226_LU))
    tf = float(np.interp(log_f, _ISO226_LOG_F, _ISO226_TF))

    big_af = 4.47e-3 * (10 ** (0.025 * phon) - 1.15) + (
        0.4 * 10 ** (((tf + lu) / 10) - 9)
    ) ** af
    return float(((10.0 / af) * np.log10(big_af)) - lu + 94)


# Cache the 1 kHz reference SPL for the default phon level
_REF_SPL_1K = _iso226_spl(1000, 40)


def equal_loudness(freq_hz: float, phon: float = 40) -> float:
    """Amplitude multiplier so freq_hz is perceived as loud as 1 kHz.

    At 40 phon (moderate listening), 100 Hz needs ~25 dB more SPL than 1 kHz.
    Returns a linear amplitude ratio (>1 for frequencies the ear is less
    sensitive to, <1 for the 2–5 kHz sensitivity peak).
    """
    spl = _iso226_spl(freq_hz, phon)
    ref = _REF_SPL_1K if phon == 40 else _iso226_spl(1000, phon)
    db_diff = spl - ref
    return float(10 ** (db_diff / 20))


# ── IEC 61672-1 A-weighting ──

_AW_F1 = 20.598997
_AW_F2 = 107.65265
_AW_F3 = 737.86223
_AW_F4 = 12194.217


def a_weight_db(freq_hz: float) -> float:
    """A-weighting in dB at freq_hz per IEC 61672-1.

    Approximates human hearing sensitivity at moderate levels (~40 phon).
    Returns 0 dB at 1 kHz, negative for less-sensitive frequencies.
    """
    f2 = freq_hz**2
    num = _AW_F4**2 * f2**2
    den = (
        (f2 + _AW_F1**2)
        * np.sqrt((f2 + _AW_F2**2) * (f2 + _AW_F3**2))
        * (f2 + _AW_F4**2)
    )
    return float(20 * np.log10(num / den) + 2.0)


# ── Glasberg & Moore (1990) — ERB ──


def critical_bandwidth(freq_hz: float) -> float:
    """Equivalent Rectangular Bandwidth (Hz) at the given frequency.

    ERB(f) = 24.7 × (4.37 × f/1000 + 1).
    Filter bandwidths ≥ 1 ERB sound natural; narrower filtering rings.
    """
    return 24.7 * (4.37 * freq_hz / 1000 + 1)


# ── Zwislocki (1969) — temporal integration ──

_T_INTEGRATION = 0.200  # 200 ms auditory integration window


def temporal_loudness(duration_s: float) -> float:
    """Amplitude multiplier compensating for short-sound loudness loss.

    The auditory system integrates energy over ~200 ms (Zwislocki 1969).
    A 50 ms sound is perceived ~6 dB quieter than a 200 ms sound at equal peak.
    Returns >1.0 for durations < 200 ms.
    """
    if duration_s >= _T_INTEGRATION:
        return 1.0
    return float(np.sqrt(_T_INTEGRATION / duration_s))


# ── Decay rate solver ──


def decay_rate(duration: float, target_db: float = -60) -> float:
    """Exponential decay constant k for exp(−t·k) to reach target_db at t=duration.

    −60 dB is the standard "silence floor" (amplitude × 0.001).
    −40 dB is appropriate when a subsequent fadeout() handles the tail.
    """
    amplitude_ratio = 10 ** (target_db / 20)  # e.g. −60 dB → 0.001
    return float(-np.log(amplitude_ratio) / duration)


# ── Attack time (Moore 2012) ──

_ATTACK_TABLE: dict[str, float] = {
    "click": 0.0005,      # 0.5 ms — impulse, sub-resolution
    "percussive": 0.002,  # 2 ms — sharp transient
    "tonal": 0.015,       # 15 ms — clean onset, no click
    "pad": 0.050,         # 50 ms — gentle swell
}


def attack_time(style: str) -> float:
    """Perceptually appropriate attack duration (seconds).

    Based on auditory temporal resolution of ~2–3 ms for gap detection
    (Moore 2012, "An Introduction to the Psychology of Hearing").
    """
    return _ATTACK_TABLE[style]


# ── Harmonic rolloff ──


def harmonic_amplitude(n: int, rolloff_db_per_octave: float = 6.0) -> float:
    """Natural harmonic amplitude for the nth partial.

    Most acoustic sources follow ~6 dB/octave (1/n).
    Brighter: 3 dB/oct. Duller: 12 dB/oct.
    """
    if n <= 1:
        return 1.0
    return float(n ** -(rolloff_db_per_octave / 6.0))


# ── Plomp & Levelt (1965) — pleasant detuning ──


def detune_for_chorus(freq_hz: float, beat_hz: float = 1.5) -> float:
    """Detune ratio for pleasant beating (chorus effect).

    Maximum dissonance occurs at ~25% of the critical bandwidth (Plomp & Levelt 1965).
    Pleasant beating lives at 0.5–4 Hz — far below the roughness threshold.
    Returns a ratio like 1.002 so that freq × ratio − freq ≈ beat_hz.
    """
    return 1.0 + beat_hz / freq_hz


# ── Composite mix-level solver ──


def mix_level(
    freq_hz: float,
    duration_s: float = 0.2,
    role_db: float = 0.0,
) -> float:
    """Perceptually balanced amplitude for one element in a mix.

    Combines equal-loudness compensation, temporal integration, and role.
    role_db: 0 = foreground, −3 = mid, −6 = background, −12 = ambient.
    """
    el = equal_loudness(freq_hz)
    tl = temporal_loudness(duration_s)
    role_lin = 10 ** (role_db / 20)
    return float(el * tl * role_lin)


# ── composite voices ─────────────────────────────────────────────────


def warm(freq: float, dur: float, decay: float | None = None) -> np.ndarray:
    """Detuned pair + harmonics → warm, alive tone.

    Detuning derived from Plomp & Levelt (1965): beat rate of ~1.5 Hz
    sits well below the critical-bandwidth roughness threshold.
    Harmonic levels follow natural 6 dB/oct rolloff.
    """
    dt = detune_for_chorus(freq, beat_hz=1.5)
    hi, lo = freq * dt, freq / dt
    osc = sine(hi, dur) + sine(lo, dur)
    osc += harmonic_amplitude(2) * sine(freq * 2, dur)  # 2nd: −6 dB
    osc += harmonic_amplitude(3) * sine(freq * 3, dur)  # 3rd: −9.5 dB
    osc /= np.max(np.abs(osc))
    k = decay if decay is not None else decay_rate(dur, target_db=-20)
    return osc * env(dur, decay=k)


def warm_tri(freq: float, dur: float, decay: float | None = None) -> np.ndarray:
    """Detuned triangle pair — softer timbre for 'wrong' / 'defeat'.

    Triangle waves have only odd harmonics rolling off at 12 dB/oct,
    giving a naturally duller timbre than sine-based warm().
    """
    dt = detune_for_chorus(freq, beat_hz=1.5)
    hi, lo = freq * dt, freq / dt
    osc = triangle(hi, dur) + triangle(lo, dur)
    osc += harmonic_amplitude(2, rolloff_db_per_octave=12) * sine(freq * 2, dur)
    osc /= np.max(np.abs(osc))
    k = decay if decay is not None else decay_rate(dur, target_db=-20)
    return osc * env(dur, decay=k)


def fm_bell(
    freq: float,
    dur: float,
    mod_ratio: float = 1.41,
    mod_peak: float = 4.0,
    decay: float | None = None,
) -> np.ndarray:
    """FM bell — bright attack that decays to pure tone.

    mod_ratio=√2 produces inharmonic sidebands (bell-like).
    FM index decays at ~3× the main decay → bright attack mellows quickly,
    mimicking natural high-frequency air absorption.
    """
    t = _t(dur)
    k = decay if decay is not None else decay_rate(dur, target_db=-30)
    mod_freq = freq * mod_ratio
    index = mod_peak * np.exp(-t * k * 3)  # FM index decays 3× faster
    modulator = index * np.sin(2 * np.pi * mod_freq * t)
    carrier = np.sin(2 * np.pi * freq * t + modulator)
    return carrier * env(dur, decay=k)


# ── wood synthesis ───────────────────────────────────────────────────


class WoodParams(NamedTuple):
    """Parameters for modal wood-impact synthesis.

    Minimal set: 7 optimizer-controlled params + dur (fixed per sound type).
    """

    body_freq: float
    dur: float
    noise_level: float = 0.5
    brightness: float = 2500
    mode_spread: float = 0.5
    # Weibull impact envelope — controls temporal energy distribution
    onset: float = 0.05  # impact start time (seconds)
    decay_tau: float = 0.005  # Weibull scale (seconds)
    decay_beta: float = 0.5  # Weibull shape (< 1 = stretched exponential)


def wood_hit(p: WoodParams) -> np.ndarray:
    """Modal synthesis of wood-on-wood impact for chess pieces.

    Minimal chain: modal sines x lognormal envelope + filtered pink noise.
    No separate mode_decay, impact chirp, or noise_decay — the single
    lognormal envelope controls all temporal shaping.
    """
    # Eigenfrequency ratios of a free-free Euler-Bernoulli beam.
    # f_n ∝ λ_n², where λ_n are roots of cos(λ)cosh(λ) = 1:
    # λ₁=4.730, λ₂=7.853, λ₃=10.996, λ₄=14.137
    # → (λ_n/λ₁)² = 1.000, 2.757, 5.404, 8.933
    mode_ratios = [1.0, 2.76, 5.40, 8.93]
    # Amplitude per mode: base + mode_spread * range.
    # mode_spread is optimizer-controlled; base and range define how
    # the spectral energy distributes across overtones.
    mode_amps = [
        1.0,
        0.35 + p.mode_spread * 0.35,
        0.15 + p.mode_spread * 0.25,
        0.06 + p.mode_spread * 0.14,
    ]

    # Weibull impact envelope (onset controls temporal centroid)
    main_env = impact_env(p.dur, p.onset, p.decay_tau, p.decay_beta)

    modal = np.zeros_like(main_env)
    for ratio, amp in zip(mode_ratios, mode_amps, strict=True):
        freq_k = p.body_freq * ratio
        if freq_k > SR / 2:
            continue
        modal += amp * sine(freq_k, p.dur) * main_env

    # Filtered pink noise — same envelope as modes (no separate decay)
    noise_lo = max(100, p.body_freq * 0.5)
    raw = pink_noise(p.dur) * main_env
    woody = bpf(raw, noise_lo, min(p.brightness, SR / 2 - 1)) * p.noise_level

    return modal + woody


# ── analysis & optimization ──────────────────────────────────────────


def _quick_analyze(samples: np.ndarray) -> dict:
    """Compute 8 metrics: 4 statistical moments x 2 domains.

    Frequency domain: moments on log2(freq) axis (perceptually weighted).
    - f_centroid: geometric mean frequency (Hz)
    - f_spread:   spectral width (octaves)
    - f_skewness: asymmetry in log-freq space (dimensionless)
    - f_kurtosis: peakedness in log-freq space (Fisher, dimensionless)

    Time domain: moments on energy envelope.
    - t_centroid: energy center of mass (ms)
    - t_spread:   energy dispersion (ms)
    - t_skewness: asymmetry of energy distribution (dimensionless)
    - t_kurtosis: peakedness of energy distribution (Fisher, dimensionless)
    """
    eps = 1e-30

    # -- Frequency domain (PSD via Welch, moments on log2 axis) --
    nperseg = min(2048, len(samples))
    freqs, psd = welch(samples, fs=SR, nperseg=nperseg)

    # Skip DC bin (log2(0) is undefined)
    freqs = freqs[1:]
    psd = psd[1:]
    total = np.sum(psd) + eps

    log_freqs = np.log2(freqs)
    f_centroid_log = np.sum(log_freqs * psd) / total
    f_centroid = 2**f_centroid_log  # geometric mean (Hz)
    f_dev = log_freqs - f_centroid_log
    f_spread = np.sqrt(np.sum(f_dev**2 * psd) / total)  # octaves
    f_skewness = np.sum(f_dev**3 * psd) / (total * f_spread**3 + eps)
    f_kurtosis = np.sum(f_dev**4 * psd) / (total * f_spread**4 + eps) - 3  # Fisher

    # -- Time domain (energy envelope) --
    energy = samples**2
    e_total = np.sum(energy) + eps
    t_ms = np.arange(len(samples)) / SR * 1000  # in ms

    t_centroid = np.sum(t_ms * energy) / e_total
    t_dev = t_ms - t_centroid
    t_spread = np.sqrt(np.sum(t_dev**2 * energy) / e_total)
    t_skewness = np.sum(t_dev**3 * energy) / (e_total * t_spread**3 + eps)
    t_kurtosis = np.sum(t_dev**4 * energy) / (e_total * t_spread**4 + eps) - 3

    return {
        "f_centroid": f_centroid,
        "f_spread": f_spread,
        "f_skewness": f_skewness,
        "f_kurtosis": f_kurtosis,
        "t_centroid": t_centroid,
        "t_spread": t_spread,
        "t_skewness": t_skewness,
        "t_kurtosis": t_kurtosis,
    }


def _range_cost(actual: dict, ref: dict) -> float:
    """Zero when all metrics are within [lo, hi], positive otherwise.

    Penalty is normalized by the midpoint of the range (proportional
    deviation), so a 10% overshoot in f_centroid and a 10% overshoot
    in t_centroid contribute equally.  This prevents metrics with
    narrow target ranges from dominating the optimizer.
    """
    total = 0.0
    for key, (lo, hi) in ref.items():
        val = actual[key]
        scale = abs((lo + hi) / 2) + 1e-10
        if val < lo:
            total += ((lo - val) / scale) ** 2
        elif val > hi:
            total += ((val - hi) / scale) ** 2
    return total


# ── output ───────────────────────────────────────────────────────────


def master(samples: np.ndarray) -> np.ndarray:
    """Run samples through the pedalboard master effects chain."""
    buf = samples.astype(np.float32).reshape(1, -1)
    return MASTER(buf, SR).flatten()


_REVERB_TAIL_PAD = 0.2  # seconds — room for reverb decay (tonal sounds only)
_PRE_FX_HEADROOM = 0.75  # peak normalization before FX (-2.5 dBFS)
_SILENCE_FLOOR = 0.001  # -60 dBFS — trim trailing silence below this
_POST_TRIM_PAD = 0.01  # seconds — short guard after last audible sample


def _process(samples: np.ndarray, chain: Pedalboard | None = None) -> np.ndarray:
    """Full processing pipeline (same as write but returns samples)."""
    samples = fadeout(samples)
    if chain is None:
        # Tonal UI sounds: global LPF + reverb tail pad (MASTER has reverb)
        samples = lpf(samples)
        pad = np.zeros(int(SR * _REVERB_TAIL_PAD))
        samples = np.concatenate([samples, pad])
    peak = np.max(np.abs(samples))
    if peak > 0:
        samples = samples / peak * _PRE_FX_HEADROOM
    fx = chain if chain is not None else MASTER
    buf = samples.astype(np.float32).reshape(1, -1)
    samples = fx(buf, SR).flatten().astype(np.float64)
    last_loud = len(samples) - 1
    while last_loud > 0 and abs(samples[last_loud]) < _SILENCE_FLOOR:
        last_loud -= 1
    samples = samples[: min(last_loud + int(SR * _POST_TRIM_PAD), len(samples))]
    peak = np.max(np.abs(samples))
    if peak > 1.0:
        samples /= peak
    return fadeout(samples)


def write(name: str, samples: np.ndarray, chain: Pedalboard | None = None) -> None:
    """Process and write a sound to a WAV file.

    Leading silence is stripped so game sounds play instantly.
    (The onset delay exists only for metric matching during optimization.)
    """
    samples = _process(samples, chain)
    # Strip leading silence (from impact onset delay)
    first_loud = 0
    while first_loud < len(samples) and abs(samples[first_loud]) < _SILENCE_FLOOR:
        first_loud += 1
    if first_loud > 0:
        guard = int(SR * _POST_TRIM_PAD)
        samples = samples[max(0, first_loud - guard) :]
    data = (samples * 32767).astype(np.int16)
    path = OUT / f"{name}.wav"
    wavfile.write(str(path), SR, data)
    kb = path.stat().st_size / 1024
    log.info("%s.wav  (%.2fs, %.0f KB)", name, len(data) / SR, kb)


# ── optimizer early-stop thresholds ───────────────────────────────────
_COST_THRESHOLD = 0.01  # stop if cost drops below this
_TIME_LIMIT_S = 120  # max wall-clock seconds per optimizer run
_PLATEAU_WINDOW = 20  # number of generations to check for plateau

# ── parameter optimization ───────────────────────────────────────────


# Cached optimized chains for chess sounds
_MOVE_CHAIN: Pedalboard | None = None
_CAPTURE_CHAIN: Pedalboard | None = None


def _make_chain(hpf: float, lpf_cut: float, gn: float) -> Pedalboard:
    """Build a per-sound processing chain (3 optimizer-controlled params).

    Minimal: HPF (rumble removal) → LPF (brightness cap) → Gain.
    Reverb, compressor, and limiter removed — they added dimensions
    without meaningfully improving metric convergence.
    """
    return Pedalboard(
        [
            HighpassFilter(cutoff_frequency_hz=hpf),
            LowpassFilter(cutoff_frequency_hz=lpf_cut),
            Gain(gain_db=gn),
        ],
    )


def _make_wood(x: np.ndarray, dur: float) -> WoodParams:
    """Unpack optimizer vector into WoodParams (7 synth params)."""
    bf, nl, br, ms, onset, tau, beta = x[:7]
    return WoodParams(
        body_freq=bf,
        dur=dur,
        noise_level=nl,
        brightness=br,
        mode_spread=ms,
        onset=onset,
        decay_tau=tau,
        decay_beta=beta,
    )


# Shared synth bounds (7 dims) — used by both move and capture optimizers
_SYNTH_BOUNDS = [
    (200, 1500),  # body_freq (Hz)
    (0.1, 0.95),  # noise_level
    (800, 10000),  # brightness (noise filter cutoff, Hz)
    (0.05, 0.99),  # mode_spread
    (0.01, 0.10),  # onset (impact start, 10-100ms)
    (0.0005, 0.02),  # decay_tau (Weibull scale, 0.5-20ms)
    (0.2, 0.8),  # decay_beta (Weibull shape, <1 = stretched exp)
]

# Chain bounds (3 dims)
_CHAIN_BOUNDS = [
    (40, 200),  # hpf_cutoff (Hz)
    (4000, 16000),  # lpf_cutoff (Hz)
    (0.5, 8.0),  # gain_db
]


# ── Analytical initial guesses ───────────────────────────────────────
# Derived from reference metrics to seed the optimizer near the solution.

# Neutral chain starting point (3 dims)
_CHAIN_X0 = [
    80,  # hpf_cutoff (Hz): rumble removal
    8000,  # lpf_cutoff (Hz): preserve detail
    2.0,  # gain_db
]

# Move: single wood_hit, dur=0.25s
_MOVE_X0 = np.array(
    [
        # -- Synth params (7 dims) --
        690,  # body_freq: midpoint of ref f_centroid (635.1, 744.3) Hz
        0.2,  # noise_level: low noise → narrow f_spread
        1500,  # brightness: low → energy below centroid → negative f_skewness
        0.2,  # mode_spread: narrow → tight f_spread (~0.64 octaves)
        0.055,  # onset: ~55ms leading silence (matches ref t_centroid)
        0.002,  # decay_tau: 2ms Weibull scale → tight t_spread (~3ms)
        0.4,  # decay_beta: stretched exp → high skewness (~6) & kurtosis (~80)
        # -- Chain params (3 dims) --
        *_CHAIN_X0,
    ],
)

# Capture: clack (0.08s) + thud (0.20s) = 0.28s total
# Ref t_centroid 63-66ms → most energy in clack (0-80ms) + early thud
# Ref f_centroid 1136-1232 Hz → brighter than move
_CAPTURE_X0 = np.array(
    [
        # -- Clack synth (7 dims) — bright, short impact --
        1400,  # body_freq: bright clack near ref f_centroid
        0.4,  # noise_level
        4000,  # brightness: bright noise
        0.4,  # mode_spread
        0.03,  # onset: 30ms into the 80ms clack
        0.003,  # decay_tau: slightly wider than move
        0.45,  # decay_beta: stretched exp
        # -- Thud synth (7 dims) — warm body resonance --
        600,  # body_freq: warm low thud
        0.3,  # noise_level
        1500,  # brightness
        0.2,  # mode_spread
        0.01,  # onset: 10ms into thud → total ~90ms from capture start
        0.004,  # decay_tau
        0.45,  # decay_beta
        # -- Chain params (3 dims) --
        *_CHAIN_X0,
    ],
)


def _optimize_move() -> tuple[WoodParams, Pedalboard]:
    """Find WoodParams + chain where all output metrics fall within MOVE_REF."""
    log.info("  optimizing move...")
    t0 = time.monotonic()

    def objective(x: np.ndarray) -> float:
        params = _make_wood(x, dur=0.25)
        chain = _make_chain(*x[7:10])
        raw = wood_hit(params)
        metrics = _quick_analyze(_process(raw, chain))
        return _range_cost(metrics, MOVE_REF)

    bounds = _SYNTH_BOUNDS + _CHAIN_BOUNDS  # 10 dims

    log.info("    x0 cost=%.6f", objective(_MOVE_X0))

    pbar = tqdm(total=500, desc="    move", unit="gen", leave=True)
    best_cost = [float("inf")]
    plateau_check: list[float] = []

    def _move_cb(xk: np.ndarray, _convergence: float = 0.0) -> bool | None:
        pbar.update(1)
        cost = objective(xk)
        best_cost[0] = min(best_cost[0], cost)
        pbar.set_postfix(cost=f"{best_cost[0]:.6f}")
        plateau_check.append(best_cost[0])
        if best_cost[0] < _COST_THRESHOLD or (time.monotonic() - t0) > _TIME_LIMIT_S:
            return True
        # Stop if <1% improvement over last _PLATEAU_WINDOW generations
        if len(plateau_check) >= _PLATEAU_WINDOW:
            old = plateau_check[-_PLATEAU_WINDOW]
            if old > 0 and (old - best_cost[0]) / old < _COST_THRESHOLD:
                log.info("    plateau detected (gen %d)", len(plateau_check))
                return True
        return None

    result = differential_evolution(
        objective,
        bounds,
        seed=960,
        maxiter=500,
        tol=1e-10,
        popsize=10,
        x0=_MOVE_X0,
        callback=_move_cb,
    )
    pbar.close()
    log.info(
        "    cost=%.6f  nfev=%d  (%.0fs)",
        result.fun,
        result.nfev,
        time.monotonic() - t0,
    )

    params = _make_wood(result.x, dur=0.25)
    chain = _make_chain(*result.x[7:10])
    return params, chain


def _optimize_capture() -> tuple[WoodParams, WoodParams, Pedalboard]:
    """Find clack+thud WoodParams + chain where metrics fall within CAPTURE_REF."""
    log.info("  optimizing capture...")
    t0 = time.monotonic()

    def objective(x: np.ndarray) -> float:
        clack = wood_hit(_make_wood(x[:7], dur=0.08))
        thud = wood_hit(_make_wood(x[7:14], dur=0.20))
        chain = _make_chain(*x[14:17])
        raw = np.concatenate([clack, thud])
        metrics = _quick_analyze(_process(raw, chain))
        return _range_cost(metrics, CAPTURE_REF)

    bounds = _SYNTH_BOUNDS + _SYNTH_BOUNDS + _CHAIN_BOUNDS  # 17 dims

    log.info("    x0 cost=%.6f", objective(_CAPTURE_X0))

    pbar = tqdm(total=500, desc="    capture", unit="gen", leave=True)
    best_cost = [float("inf")]
    plateau_check: list[float] = []

    def _cap_cb(xk: np.ndarray, _convergence: float = 0.0) -> bool | None:
        pbar.update(1)
        cost = objective(xk)
        best_cost[0] = min(best_cost[0], cost)
        pbar.set_postfix(cost=f"{best_cost[0]:.6f}")
        plateau_check.append(best_cost[0])
        if best_cost[0] < _COST_THRESHOLD or (time.monotonic() - t0) > _TIME_LIMIT_S:
            return True
        # Stop if <1% improvement over last _PLATEAU_WINDOW generations
        if len(plateau_check) >= _PLATEAU_WINDOW:
            old = plateau_check[-_PLATEAU_WINDOW]
            if old > 0 and (old - best_cost[0]) / old < _COST_THRESHOLD:
                log.info("    plateau detected (gen %d)", len(plateau_check))
                return True
        return None

    result = differential_evolution(
        objective,
        bounds,
        seed=960,
        maxiter=500,
        tol=1e-10,
        popsize=10,
        x0=_CAPTURE_X0,
        callback=_cap_cb,
    )
    pbar.close()
    log.info(
        "    cost=%.6f  nfev=%d  (%.0fs)",
        result.fun,
        result.nfev,
        time.monotonic() - t0,
    )

    clack_p = _make_wood(result.x[:7], dur=0.08)
    thud_p = _make_wood(result.x[7:14], dur=0.20)
    chain = _make_chain(*result.x[14:17])
    return clack_p, thud_p, chain


# ── run optimizations ────────────────────────────────────────────────

_MOVE_PARAMS: WoodParams | None = None
_CAPTURE_CLACK: WoodParams | None = None
_CAPTURE_THUD: WoodParams | None = None


def _ensure_optimized() -> None:
    global _MOVE_PARAMS, _CAPTURE_CLACK, _CAPTURE_THUD, _MOVE_CHAIN, _CAPTURE_CHAIN
    if _MOVE_PARAMS is None:
        _MOVE_PARAMS, _MOVE_CHAIN = _optimize_move()
        _CAPTURE_CLACK, _CAPTURE_THUD, _CAPTURE_CHAIN = _optimize_capture()


# ── sound definitions (key of G) ─────────────────────────────────────


def correct() -> np.ndarray:
    """Ascending major third  G3 → B3.  Warm, rewarding.

    Decay rate: −20 dB in 90 ms → notes sustain into each other (legato).
    """
    d = 0.09
    k = decay_rate(d, target_db=-20)
    a = warm(note("G3"), d, decay=k)
    b = warm(note("B3"), d, decay=k)
    return np.concatenate([a, silence(0.02), b])


def wrong() -> np.ndarray:
    """Descending tritone  B3 → F3.  Instinctively 'off', but gentle.

    Faster decay (−30 dB) than correct() — wrong feedback should not linger.
    """
    d = 0.11
    k = decay_rate(d, target_db=-30)
    a = warm_tri(note("B3"), d, decay=k)
    b = warm_tri(note("F3"), d, decay=k)
    return np.concatenate([a, silence(0.025), b])


def move() -> np.ndarray:
    """Wood-on-wood thud — parameters found by optimization."""
    _ensure_optimized()
    if _MOVE_PARAMS is None:
        msg = "_MOVE_PARAMS not initialized after optimization"
        raise RuntimeError(msg)
    return wood_hit(_MOVE_PARAMS)


def capture() -> np.ndarray:
    """Piece-on-piece clack + board thud — parameters found by optimization."""
    _ensure_optimized()
    if _CAPTURE_CLACK is None:
        msg = "_CAPTURE_CLACK not initialized after optimization"
        raise RuntimeError(msg)
    if _CAPTURE_THUD is None:
        msg = "_CAPTURE_THUD not initialized after optimization"
        raise RuntimeError(msg)
    clack = wood_hit(_CAPTURE_CLACK)
    thud = wood_hit(_CAPTURE_THUD)
    return np.concatenate([clack, thud])


def check() -> np.ndarray:
    """FM bell double-pip at D4 — chess check alert.

    Decay: −30 dB in 80 ms for crisp pips that don't blur together.
    """
    d = 0.08
    pip = fm_bell(note("D4"), d, mod_ratio=1.41, mod_peak=3.5, decay=decay_rate(d, -30))
    return np.concatenate([pip, silence(0.04), pip])


def victory() -> np.ndarray:
    """G major arpeggio → blooming chord.  Triumphant.

    Arp notes use progressively slower decay (−15 dB) for legato buildup.
    Final chord decays to −20 dB for a warm sustain.
    Chord voice levels compensated by equal_loudness (ISO 226).
    """
    d, gap = 0.10, 0.035
    arp_notes = [note("G3"), note("B3"), note("D4"), note("G4")]
    parts: list[np.ndarray] = []
    for i, f in enumerate(arp_notes):
        # Progressively slower decay → building sustain
        k = decay_rate(d, target_db=-15 + i * -2)
        n = warm(f, d, decay=k)
        parts.append(n)
        parts.append(silence(gap))
    cd = 0.45
    k_chord = decay_rate(cd, target_db=-20)
    # Balance chord voices by equal loudness (ISO 226:2003)
    vol_g4 = equal_loudness(note("G4"))
    vol_b4 = equal_loudness(note("B4"))
    vol_d5 = equal_loudness(note("D5"))
    # Normalize so root is 1.0
    chord = (
        warm(note("G4"), cd, decay=k_chord)
        + (vol_b4 / vol_g4) * warm(note("B4"), cd, decay=k_chord)
        + (vol_d5 / vol_g4) * warm(note("D5"), cd, decay=k_chord)
    )
    parts.append(chord)
    return np.concatenate(parts)


def defeat() -> np.ndarray:
    """Descending  G3 → Eb3 → D3.  Gentle minor disappointment.

    Decay: −25 dB — notes linger slightly for a melancholy feel,
    but faster than correct() to avoid overstaying.
    """
    d, gap = 0.14, 0.035
    k = decay_rate(d, target_db=-25)
    freqs = [note("G3"), note("Eb3"), note("D3")]
    parts: list[np.ndarray] = []
    for i, f in enumerate(freqs):
        n = warm_tri(f, d, decay=k)
        parts.append(n)
        if i < len(freqs) - 1:
            parts.append(silence(gap))
    return np.concatenate(parts)


def draw() -> np.ndarray:
    """Perfect fifth  G3 → D4.  Neutral, resolved.

    Decay: −20 dB — moderate sustain for a settled, resolved feeling.
    """
    d = 0.15
    k = decay_rate(d, target_db=-20)
    a = warm(note("G3"), d, decay=k)
    b = warm(note("D4"), d, decay=k)
    return np.concatenate([a, silence(0.04), b])


def notify() -> np.ndarray:
    """FM bell chime at G4 — session start / attention.

    Longer duration with −25 dB decay for a clear, ringing bell tone.
    """
    d = 0.30
    return fm_bell(note("G4"), d, mod_ratio=1.41, mod_peak=5.0, decay=decay_rate(d, -25))


# ── flux rhythm sounds ──────────────────────────────────────────────


def beat_tick() -> np.ndarray:
    """Low wood thump — quiet rhythmic tick for the beat loop.

    120 Hz fundamental with one harmonic (natural 6 dB/oct rolloff).
    Temporal loudness compensation: 50 ms sound perceived ~6 dB quieter
    than 200 ms (Zwislocki 1969), so we boost amplitude.
    Decay: −50 dB in 50 ms for clean inaudibility.
    """
    dur = 0.05
    t = _t(dur)
    vol = temporal_loudness(dur)
    osc = vol * (sine(120, dur) + harmonic_amplitude(2) * sine(240, dur))
    e = np.exp(-t * decay_rate(dur, target_db=-50))
    return fadeout(osc * e)


def beat_tick_accent() -> np.ndarray:
    """Brighter tick — accented beat with added harmonic.

    Same as beat_tick but adds 3rd harmonic for brightness.
    """
    dur = 0.05
    t = _t(dur)
    vol = temporal_loudness(dur)
    osc = vol * (
        sine(120, dur)
        + harmonic_amplitude(2) * sine(240, dur)
        + harmonic_amplitude(3) * sine(360, dur)
    )
    e = np.exp(-t * decay_rate(dur, target_db=-50))
    return fadeout(osc * e)


def beat_tick_urgent() -> np.ndarray:
    """Sharper tick — climax urgency.

    Higher fundamental (180 Hz) with harmonics. Percussive attack (2 ms).
    """
    dur = 0.05
    t = _t(dur)
    vol = temporal_loudness(dur)
    osc = vol * (
        sine(180, dur)
        + harmonic_amplitude(2) * sine(360, dur)
        + harmonic_amplitude(3) * sine(540, dur)
    )
    e = np.exp(-t * decay_rate(dur, target_db=-50))
    atk = int(SR * attack_time("percussive"))
    if atk > 0:
        e[:atk] *= 0.5 * (1 - np.cos(np.pi * np.arange(atk) / atk))
    return fadeout(osc * e)


def correct_burst() -> np.ndarray:
    """FM bell pop — punchy correct feedback.

    Decay: −40 dB in 120 ms (fadeout handles the remaining tail).
    """
    dur = 0.12
    return fadeout(fm_bell(note("G4"), dur, mod_ratio=1.41, mod_peak=5.0,
                           decay=decay_rate(dur, target_db=-40)))


def wrong_crack() -> np.ndarray:
    """Noise burst + low thud — wrong answer.

    Noise band-passed to 1 ERB around 1 kHz for focused impact.
    Low thud at 80 Hz with equal-loudness boost.
    Both decay to −40 dB.
    """
    dur = 0.18
    t = _t(dur)
    k = decay_rate(dur, target_db=-40)
    # Noise: band-pass around 1 kHz, ±2 ERBs wide
    erb_1k = critical_bandwidth(1000)
    noise = bpf(pink_noise(dur), max(100, 1000 - 2 * erb_1k),
                min(1000 + 2 * erb_1k, SR / 2 - 1)) * np.exp(-t * k)
    # Low thud with equal-loudness compensation
    thud_vol = equal_loudness(80) * 0.3
    thud = thud_vol * sine(80, dur) * np.exp(-t * k)
    return fadeout(lpf(noise * 0.4 + thud, cutoff=1000 + 2 * erb_1k))


def nogo_dissolve() -> np.ndarray:
    """Airy chime — correct no-go withhold.

    Perfect fifth G5 + D6 (Plomp & Levelt: intervals > critical bandwidth
    are perceived as consonant). Tonal attack (15 ms).
    """
    dur = 0.25
    t = _t(dur)
    # G5 + D6 = perfect fifth, highly consonant
    # G5 + D6 = perfect fifth, highly consonant
    g5, d6 = note("G5"), note("D6")
    vol_g5 = equal_loudness(g5)
    vol_d6 = equal_loudness(d6)
    osc = vol_g5 * sine(g5, dur) + vol_d6 * sine(d6, dur)
    e = np.exp(-t * decay_rate(dur, target_db=-40))
    atk = int(SR * attack_time("tonal"))
    if atk > 0:
        e[:atk] *= 0.5 * (1 - np.cos(np.pi * np.arange(atk) / atk))
    return fadeout(osc * e)


def nogo_fail() -> np.ndarray:
    """Low buzz — failed no-go inhibition.

    Odd harmonics of 100 Hz (approximating square wave).
    Filtered at ~1 ERB above fundamental for a focused, unpleasant buzz.
    """
    dur = 0.15
    t = _t(dur)
    k = decay_rate(dur, target_db=-40)
    osc = (
        sine(100, dur)
        + harmonic_amplitude(3, rolloff_db_per_octave=3) * sine(300, dur)
        + harmonic_amplitude(5, rolloff_db_per_octave=3) * sine(500, dur)
    )
    e = np.exp(-t * k)
    cutoff = 100 + critical_bandwidth(100)  # ~1 ERB above fundamental
    return fadeout(lpf(osc * e, cutoff=cutoff))


def switch_whoosh() -> np.ndarray:
    """Filtered noise sweep (high → low) — rule switch.

    Pink noise modulated by a descending carrier. Decay to −35 dB.
    """
    dur = 0.18
    t = _t(dur)
    k = decay_rate(dur, target_db=-35)
    n = pink_noise(dur)
    sweep_freq = 6000 * np.exp(-t * k) + 200
    carrier = np.sin(2 * np.pi * np.cumsum(sweep_freq) / SR)
    result = n * 0.3 + carrier * 0.2
    e = np.exp(-t * k)
    return fadeout(lpf(result * e, cutoff=6000 + critical_bandwidth(6000)))


def golden_chime() -> np.ndarray:
    """Rising FM arpeggio (G4 → B4 → D5) — golden shape.

    Each note uses decay_rate for −35 dB in 80 ms.
    Temporal loudness compensation applied per note.
    """
    d, gap = 0.08, 0.02
    k = decay_rate(d, target_db=-35)
    freqs = [note("G4"), note("B4"), note("D5")]
    parts: list[np.ndarray] = []
    for i, f in enumerate(freqs):
        pip = fm_bell(f, d, mod_ratio=1.41, mod_peak=3.0, decay=k)
        pip *= temporal_loudness(d)
        parts.append(pip)
        if i < len(freqs) - 1:
            parts.append(silence(gap))
    return fadeout(np.concatenate(parts))


def streak_up() -> np.ndarray:
    """Quick rising pitch pip — streak increment.

    400→1000 Hz sweep. Temporal loudness compensation for 100 ms duration.
    Decay: −40 dB for clean tail.
    """
    dur = 0.10
    t = _t(dur)
    freq = 400 + 600 * t / dur
    osc = np.sin(2 * np.pi * np.cumsum(freq) / SR)
    e = np.exp(-t * decay_rate(dur, target_db=-40))
    return fadeout(osc * e * temporal_loudness(dur))


# ── flux background music ───────────────────────────────────────────

_BGM_BPM = 128
_BGM_BEAT = 60.0 / _BGM_BPM  # ~0.469s
_BGM_BAR = _BGM_BEAT * 4  # ~1.875s
_BGM_BARS = 40  # 40 bars = 75s at 128 BPM
_BGM_DUR = _BGM_BAR * _BGM_BARS

# G minor: Gm → Eb → Cm → D progression
_GM_ROOT = [note("G2"), note("Eb2"), note("C3"), note("D3")]
_GM_CHORD = [
    (note("G3"), note("Bb3"), note("D4")),    # Gm
    (note("Eb3"), note("G3"), note("Bb3")),   # Eb
    (note("C3"), note("Eb3"), note("G3")),    # Cm
    (note("D3"), note("F#3"), note("A3")),    # D
]
_GM_ARP = [
    [note("G3"), note("Bb3"), note("D4"), note("G4")],    # Gm
    [note("Eb3"), note("G3"), note("Bb3"), note("Eb4")],  # Eb
    [note("C3"), note("Eb3"), note("G3"), note("C4")],    # Cm
    [note("D3"), note("F#3"), note("A3"), note("D4")],    # D
]


def _bgm_kick(dur: float) -> np.ndarray:
    """EDM kick — sine pitch envelope 160→45 Hz.

    Levels set by mix_level() at ~50 Hz (kick body), foreground role.
    Decay: −30 dB for punchy but present tail.
    """
    t = _t(dur)
    freq = 45 + 115 * np.exp(-t * decay_rate(dur, target_db=-20))
    phase = 2 * np.pi * np.cumsum(freq) / SR
    osc = np.sin(phase)
    e = np.exp(-t * decay_rate(dur, target_db=-30))
    vol = mix_level(50, dur, role_db=0)  # foreground
    return np.tanh(osc * e * 1.8) * vol


def _bgm_snare(dur: float) -> np.ndarray:
    """Snare — band-passed noise burst + body sine.

    Noise band: 200 Hz–8 kHz (~ERB-aligned). Body at 200 Hz.
    Mix role: mid (−3 dB).
    """
    t = _t(dur)
    k = decay_rate(dur, target_db=-35)
    noise = np.random.default_rng(123).standard_normal(len(t))
    noise = bpf(noise, 200, min(8000, SR / 2 - 1), order=2)
    noise_env = np.exp(-t * k)
    body = np.sin(2 * np.pi * 200 * t) * np.exp(-t * k * 1.5)
    vol = mix_level(200, dur, role_db=-3)  # mid
    return fadeout((noise * noise_env * 0.3 + body * 0.4) * vol)


def _bgm_hihat(dur: float, closed: bool = True) -> np.ndarray:
    """Hi-hat — band-passed noise.

    Band: 6–16 kHz. Decay derived for closed (−50 dB) vs open (−25 dB).
    Mix role: background (−6 dB).
    """
    t = _t(dur)
    k = decay_rate(dur, target_db=-50 if closed else -25)
    e = np.exp(-t * k)
    noise = np.random.default_rng(456).standard_normal(len(t))
    filtered = bpf(noise, 6000, min(16000, SR / 2 - 1), order=2)
    vol = mix_level(8000, dur, role_db=-6)  # background
    return filtered * e * vol


def _bgm_bass(freq: float, dur: float) -> np.ndarray:
    """Sub bass — sine with one harmonic (natural 6 dB/oct rolloff).

    Equal-loudness compensated. Tonal attack for smooth bar transitions.
    """
    t = _t(dur)
    osc = np.sin(2 * np.pi * freq * t)
    osc += harmonic_amplitude(2) * np.sin(2 * np.pi * freq * 2 * t)
    e = np.ones_like(t)
    atk = int(SR * attack_time("tonal"))
    if atk > 0:
        e[:atk] *= np.linspace(0, 1, atk)
    rel = int(SR * attack_time("tonal"))
    if rel > 0:
        e[-rel:] *= np.linspace(1, 0, rel)
    vol = mix_level(freq, dur, role_db=-3)  # mid
    return osc * e * vol


def _bgm_pad(freqs: tuple[float, ...], dur: float, volume: float = 0.08) -> np.ndarray:
    """Supersaw-style pad — detuned oscillator stack per note.

    Detune ratios derived from Plomp & Levelt (1965): ~1.5 Hz beating
    per voice sits well below the critical-bandwidth roughness threshold.
    Pad attack/release use pad-style timing (50 ms).
    """
    t = _t(dur)
    pad = np.zeros_like(t)
    for f in freqs:
        dt = detune_for_chorus(f, beat_hz=1.5)
        # 5 voices: two detuned pairs + center
        for ratio in [1 / dt**2, 1 / dt, 1.0, dt, dt**2]:
            pad += np.sin(2 * np.pi * f * ratio * t)
    pad /= max(np.max(np.abs(pad)), 1e-10)
    atk = int(SR * attack_time("pad"))
    rel = int(SR * attack_time("pad"))
    if atk > 0:
        pad[:atk] *= 0.5 * (1 - np.cos(np.pi * np.arange(atk) / atk))
    if rel > 0:
        pad[-rel:] *= 0.5 * (1 + np.cos(np.pi * np.arange(rel) / rel))
    return pad * volume


def _bgm_arp_note(freq: float, dur: float) -> np.ndarray:
    """FM bell arp note — short, bright.

    Decay: −30 dB for clean separation between notes.
    FM index decays 3× faster (high-frequency air absorption).
    Mix role: mid (−3 dB).
    """
    t = _t(dur)
    k = decay_rate(dur, target_db=-30)
    mod_freq = freq * 1.41
    index = 3.0 * np.exp(-t * k * 3)
    mod = index * np.sin(2 * np.pi * mod_freq * t)
    carrier = np.sin(2 * np.pi * freq * t + mod)
    e = np.exp(-t * k)
    vol = mix_level(freq, dur, role_db=-3)
    return carrier * e * vol


def _bgm_riser(dur: float) -> np.ndarray:
    """Build-up riser — filtered noise with rising tone.

    Noise band-passed to 300–6 kHz (>1 ERB at both ends for natural width).
    Rising tone 200→2200 Hz with quadratic intensity.
    Mix role: ambient (−12 dB rising to 0 dB).
    """
    t = _t(dur)
    noise = np.random.default_rng(789).standard_normal(len(t))
    erb_lo = critical_bandwidth(300)
    erb_hi = critical_bandwidth(6000)
    noise = bpf(noise, max(20, 300 - erb_lo), min(6000 + erb_hi, SR / 2 - 1), order=2)
    e = (t / dur) ** 2  # quadratic rise
    freq = 200 + 2000 * (t / dur) ** 2
    tone = np.sin(2 * np.pi * np.cumsum(freq) / SR)
    vol_noise = mix_level(2000, dur, role_db=-12)
    vol_tone = mix_level(1000, dur, role_db=-6)
    return (noise * vol_noise + tone * vol_tone) * e


def _sidechain_env(n_samples: int, beat_samples: int) -> np.ndarray:
    """Sidechain compression envelope — ducks on each beat."""
    e = np.ones(n_samples)
    duck_len = min(int(beat_samples * 0.3), beat_samples)
    duck = np.linspace(0.3, 1.0, duck_len)
    for i in range(0, n_samples, beat_samples):
        end = min(i + duck_len, n_samples)
        actual = end - i
        e[i:end] = duck[:actual]
    return e


def flux_bgm() -> np.ndarray:
    """75-second electronic track for Flux gameplay.

    128 BPM, G minor, 40 bars. Three-act structure matching session acts:
    - Warmup (bars 1-8): kick + bass + pad intro, builds
    - Flow (bars 9-32): full beat — kick, snare, hi-hat, bass, arp, pad
    - Climax (bars 33-40): 16th hi-hats, doubled arp, riser, max energy
    """
    n = int(SR * _BGM_DUR)
    beat_n = int(SR * _BGM_BEAT)
    bar_n = int(SR * _BGM_BAR)

    mix = np.zeros(n)

    # Pre-generate one-shot drum samples (short, reusable)
    kick_sample = _bgm_kick(0.25)
    snare_sample = _bgm_snare(0.15)
    hat_closed = _bgm_hihat(0.06, closed=True)
    hat_open = _bgm_hihat(0.12, closed=False)

    def place(target: np.ndarray, sample: np.ndarray, pos: int) -> None:
        """Mix a sample into the target at the given position."""
        end = min(pos + len(sample), len(target))
        actual = end - pos
        if actual > 0 and pos >= 0:
            target[pos:end] += sample[:actual]

    # ── Drum pattern ──
    for bar in range(_BGM_BARS):
        bar_start = bar * bar_n

        # Kick: four-on-the-floor (all bars except 1-2 for intro feel)
        if bar >= 2:
            for beat in range(4):
                place(mix, kick_sample, bar_start + beat * beat_n)
        elif bar >= 0:
            # Bars 0-1: kick on 1 and 3 only (half-time intro)
            place(mix, kick_sample, bar_start)
            place(mix, kick_sample, bar_start + 2 * beat_n)

        # Snare on 2 and 4 (starts bar 4)
        if bar >= 4:
            place(mix, snare_sample, bar_start + 1 * beat_n)
            place(mix, snare_sample, bar_start + 3 * beat_n)

        # Hi-hat pattern
        if bar >= 6 and bar < 32:
            # 8th notes during flow
            for eighth in range(8):
                pos = bar_start + int(eighth * beat_n / 2)
                place(mix, hat_closed, pos)
        elif bar >= 32:
            # 16th notes during climax
            for sixteenth in range(16):
                pos = bar_start + int(sixteenth * beat_n / 4)
                sample = hat_open if sixteenth % 4 == 0 else hat_closed
                place(mix, sample, pos)

        # Snare roll build-up (bars 31-32, leading into climax)
        if bar in (30, 31):
            roll_divisions = 8 if bar == 30 else 16
            for div in range(roll_divisions):
                pos = bar_start + int(div * bar_n / roll_divisions)
                vol = 0.3 + 0.7 * (div / roll_divisions)
                place(mix, snare_sample * vol, pos)

    # ── Bass line (one note per bar, following chord roots) ──
    bass_track = np.zeros(n)
    for bar in range(_BGM_BARS):
        if bar < 2:
            continue  # No bass in first 2 bars
        chord_idx = (bar // 2) % 4  # Change chord every 2 bars
        root = _GM_ROOT[chord_idx]
        seg = _bgm_bass(root, _BGM_BAR)
        start = bar * bar_n
        end = min(start + len(seg), n)
        bass_track[start:end] += seg[: end - start]

    # Sidechain ducking on bass
    sc = _sidechain_env(n, beat_n)
    bass_track *= sc
    mix += bass_track

    # ── Pad (starts bar 4, swells through flow) ──
    pad_track = np.zeros(n)
    for bar in range(_BGM_BARS):
        if bar < 4:
            continue
        chord_idx = (bar // 2) % 4
        chord = _GM_CHORD[chord_idx]
        # Volume increases through the track
        vol = 0.06 if bar < 8 else 0.10 if bar < 32 else 0.14
        seg = _bgm_pad(chord, _BGM_BAR, volume=vol)
        start = bar * bar_n
        end = min(start + len(seg), n)
        pad_track[start:end] += seg[: end - start]

    # Low-pass the pad for warmth
    pad_track = lpf(pad_track, cutoff=4000)
    pad_track *= sc  # Sidechain
    mix += pad_track

    # ── Arp (starts bar 8, 8th note arpeggios) ──
    arp_track = np.zeros(n)
    for bar in range(_BGM_BARS):
        if bar < 8:
            continue
        chord_idx = (bar // 2) % 4
        arp_notes = _GM_ARP[chord_idx]
        # 8th note arp (16th in climax)
        divisions = 16 if bar >= 32 else 8
        for div in range(divisions):
            note_idx = div % len(arp_notes)
            freq = arp_notes[note_idx]
            # Higher octave in climax
            if bar >= 32:
                freq *= 2
            note_dur = _BGM_BEAT / (2 if bar >= 32 else 1) * 0.8
            seg = _bgm_arp_note(freq, note_dur)
            pos = bar * bar_n + int(div * bar_n / divisions)
            place(arp_track, seg, pos)

    mix += arp_track

    # ── Riser (bars 29-32, building to climax) ──
    riser_dur = _BGM_BAR * 4
    riser = _bgm_riser(riser_dur)
    riser_start = 28 * bar_n
    riser_end = min(riser_start + len(riser), n)
    mix[riser_start:riser_end] += riser[: riser_end - riser_start]

    # ── Master ──
    # Normalize
    peak = np.max(np.abs(mix))
    if peak > 0:
        mix = mix / peak * 0.85

    # Gentle fade-in (first 2 bars) and fade-out (last bar)
    fade_in = min(2 * bar_n, n)
    mix[:fade_in] *= np.linspace(0, 1, fade_in)
    fade_out = min(bar_n, n)
    mix[-fade_out:] *= np.linspace(1, 0, fade_out)

    return mix


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
    "beat-tick": beat_tick,
    "beat-tick-accent": beat_tick_accent,
    "beat-tick-urgent": beat_tick_urgent,
    "correct-burst": correct_burst,
    "wrong-crack": wrong_crack,
    "nogo-dissolve": nogo_dissolve,
    "nogo-fail": nogo_fail,
    "switch-whoosh": switch_whoosh,
    "golden-chime": golden_chime,
    "streak-up": streak_up,
    "flux-bgm": flux_bgm,
}

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="  %(message)s")
    OUT.mkdir(parents=True, exist_ok=True)
    log.info("Writing to %s/\n", OUT)

    # Run optimization first (populates _MOVE_PARAMS, _CAPTURE_*, chains)
    _ensure_optimized()
    if _MOVE_PARAMS is None:
        msg = "_MOVE_PARAMS not initialized after optimization"
        raise RuntimeError(msg)
    if _MOVE_CHAIN is None:
        msg = "_MOVE_CHAIN not initialized after optimization"
        raise RuntimeError(msg)
    if _CAPTURE_CLACK is None:
        msg = "_CAPTURE_CLACK not initialized after optimization"
        raise RuntimeError(msg)
    if _CAPTURE_THUD is None:
        msg = "_CAPTURE_THUD not initialized after optimization"
        raise RuntimeError(msg)
    if _CAPTURE_CHAIN is None:
        msg = "_CAPTURE_CHAIN not initialized after optimization"
        raise RuntimeError(msg)

    # Verify metrics are in range
    for label, raw, chain, ref in [
        ("move", wood_hit(_MOVE_PARAMS), _MOVE_CHAIN, MOVE_REF),
        (
            "capture",
            np.concatenate([wood_hit(_CAPTURE_CLACK), wood_hit(_CAPTURE_THUD)]),
            _CAPTURE_CHAIN,
            CAPTURE_REF,
        ),
    ]:
        metrics = _quick_analyze(_process(raw, chain))
        log.info("  %s metrics:", label)
        for key, (lo, hi) in ref.items():
            val = metrics[key]
            in_range = lo <= val <= hi
            mark = "\u2713" if in_range else "\u2717"
            log.info("    %s %s: %.1f  [%.1f \u2013 %.1f]", mark, key, val, lo, hi)

    log.info("")
    # Chess sounds use their optimized chains; BGM bypasses MASTER entirely
    chess_chains = {"move": _MOVE_CHAIN, "capture": _CAPTURE_CHAIN}
    bgm_chain = Pedalboard(
        [
            Compressor(threshold_db=-12, ratio=3.0, attack_ms=5.0, release_ms=60),
            Limiter(threshold_db=-1.5, release_ms=80),
            Gain(gain_db=1.5),
        ],
    )
    for name, fn in SOUNDS.items():
        if name == "flux-bgm":
            # BGM: no reverb, no global LPF — clean limiter only
            samples = fn()
            samples = fadeout(samples)
            peak = np.max(np.abs(samples))
            if peak > 0:
                samples = samples / peak * _PRE_FX_HEADROOM
            buf = samples.astype(np.float32).reshape(1, -1)
            samples = bgm_chain(buf, SR).flatten().astype(np.float64)
            peak = np.max(np.abs(samples))
            if peak > 1.0:
                samples /= peak
            samples = fadeout(samples)
            data = (samples * 32767).astype(np.int16)
            path = OUT / f"{name}.wav"
            wavfile.write(str(path), SR, data)
            kb = path.stat().st_size / 1024
            log.info("%s.wav  (%.2fs, %.0f KB)", name, len(data) / SR, kb)
        else:
            write(name, fn(), chain=chess_chains.get(name))

    total = sum((OUT / f"{n}.wav").stat().st_size for n in SOUNDS) / 1024
    log.info("\n  Total: %.0f KB", total)
    log.info("Done!")
