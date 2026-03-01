#!/usr/bin/env python3
"""Generate synthesised UI sound palette for Brainbout  (v6).

Run:  .venv/bin/python scripts/gen-sounds.py

Chess piece sounds (move/capture) are optimized via scipy differential
evolution so that every measured output metric falls between Lichess and
Chess.com reference values.  Metrics are 4 statistical moments × 2
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
# 8 metrics: 4 statistical moments × 2 domains.
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
    "f_centroid":  _ref_range(635.1, 744.3),
    "f_spread":    _ref_range(0.6374, 0.6454),
    "f_skewness":  _ref_range(-2.87, -0.68),
    "f_kurtosis":  _ref_range(0.93, 14.46),
    "t_centroid":  _ref_range(55.2, 62.1),
    "t_spread":    _ref_range(2.2, 3.5),
    "t_skewness":  _ref_range(5.10, 9.75),
    "t_kurtosis":  _ref_range(83.57, 166.04),
}

# ── CAPTURE reference measurements ──
# Lichess:
#   f_centroid=1231.8  f_spread=0.8339  f_skewness=-1.89  f_kurtosis=5.43
#   t_centroid=66.3    t_spread=9.6     t_skewness=2.82   t_kurtosis=6.74
# Chess.com:
#   f_centroid=1136.1  f_spread=0.9915  f_skewness=-0.47  f_kurtosis=1.70
#   t_centroid=63.0    t_spread=5.8     t_skewness=4.86   t_kurtosis=62.17

CAPTURE_REF = {
    "f_centroid":  _ref_range(1136.1, 1231.8),
    "f_spread":    _ref_range(0.8339, 0.9915),
    "f_skewness":  _ref_range(-1.89, -0.47),
    "f_kurtosis":  _ref_range(1.70, 5.43),
    "t_centroid":  _ref_range(63.0, 66.3),
    "t_spread":    _ref_range(5.8, 9.6),
    "t_skewness":  _ref_range(2.82, 4.86),
    "t_kurtosis":  _ref_range(6.74, 62.17),
}

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


# ── composite voices ─────────────────────────────────────────────────


def warm(freq: float, dur: float, decay: float = 15) -> np.ndarray:
    """Detuned pair + harmonics → warm, alive tone."""
    hi, lo = freq * DETUNE, freq / DETUNE
    osc = sine(hi, dur) + sine(lo, dur)
    osc += 0.28 * sine(freq * 2, dur)
    osc += 0.10 * sine(freq * 3, dur)
    osc /= np.max(np.abs(osc))
    return osc * env(dur, decay=decay)


def warm_tri(freq: float, dur: float, decay: float = 10) -> np.ndarray:
    """Detuned triangle pair — softer timbre for 'wrong' / 'defeat'."""
    hi, lo = freq * DETUNE, freq / DETUNE
    osc = triangle(hi, dur) + triangle(lo, dur)
    osc += 0.15 * sine(freq * 2, dur)
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
    index = mod_peak * np.exp(-t * 14)
    modulator = index * np.sin(2 * np.pi * mod_freq * t)
    carrier = np.sin(2 * np.pi * freq * t + modulator)
    return carrier * env(dur, decay=decay)


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
    onset: float = 0.05        # impact start time (seconds)
    decay_tau: float = 0.005   # Weibull scale (seconds)
    decay_beta: float = 0.5    # Weibull shape (< 1 = stretched exponential)


def wood_hit(p: WoodParams) -> np.ndarray:
    """Modal synthesis of wood-on-wood impact for chess pieces.

    Minimal chain: modal sines × lognormal envelope + filtered pink noise.
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
    """Compute 8 metrics: 4 statistical moments × 2 domains.

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
    f_centroid = 2 ** f_centroid_log                        # geometric mean (Hz)
    f_dev = log_freqs - f_centroid_log
    f_spread = np.sqrt(np.sum(f_dev**2 * psd) / total)     # octaves
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


_REVERB_TAIL_PAD = 0.2           # seconds — room for reverb decay (tonal sounds only)
_PRE_FX_HEADROOM = 0.75          # peak normalization before FX (–2.5 dBFS)
_SILENCE_FLOOR = 0.001           # –60 dBFS — trim trailing silence below this
_POST_TRIM_PAD = 0.01            # seconds — short guard after last audible sample


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
    samples = fadeout(samples)
    return samples


def write(name: str, samples: np.ndarray,
          chain: Pedalboard | None = None) -> None:
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
        samples = samples[max(0, first_loud - guard):]
    data = (samples * 32767).astype(np.int16)
    path = OUT / f"{name}.wav"
    wavfile.write(str(path), SR, data)
    kb = path.stat().st_size / 1024
    log.info("%s.wav  (%.2fs, %.0f KB)", name, len(data) / SR, kb)


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
    return Pedalboard([
        HighpassFilter(cutoff_frequency_hz=hpf),
        LowpassFilter(cutoff_frequency_hz=lpf_cut),
        Gain(gain_db=gn),
    ])


def _make_wood(x: np.ndarray, dur: float) -> WoodParams:
    """Unpack optimizer vector into WoodParams (7 synth params)."""
    bf, nl, br, ms, onset, tau, beta = x[:7]
    return WoodParams(
        body_freq=bf, dur=dur, noise_level=nl,
        brightness=br, mode_spread=ms,
        onset=onset, decay_tau=tau, decay_beta=beta,
    )


# Shared synth bounds (7 dims) — used by both move and capture optimizers
_SYNTH_BOUNDS = [
    (200, 1500),     # body_freq (Hz)
    (0.1, 0.95),     # noise_level
    (800, 10000),    # brightness (noise filter cutoff, Hz)
    (0.05, 0.99),    # mode_spread
    (0.01, 0.10),    # onset (impact start, 10-100ms)
    (0.0005, 0.02),  # decay_tau (Weibull scale, 0.5-20ms)
    (0.2, 0.8),      # decay_beta (Weibull shape, <1 = stretched exp)
]

# Chain bounds (3 dims)
_CHAIN_BOUNDS = [
    (40, 200),        # hpf_cutoff (Hz)
    (4000, 16000),    # lpf_cutoff (Hz)
    (0.5, 8.0),       # gain_db
]


# ── Analytical initial guesses ───────────────────────────────────────
# Derived from reference metrics to seed the optimizer near the solution.

# Neutral chain starting point (3 dims)
_CHAIN_X0 = [
    80,     # hpf_cutoff (Hz): rumble removal
    8000,   # lpf_cutoff (Hz): preserve detail
    2.0,    # gain_db
]

# Move: single wood_hit, dur=0.25s
_MOVE_X0 = np.array([
    # -- Synth params (7 dims) --
    690,    # body_freq: midpoint of ref f_centroid (635.1, 744.3) Hz
    0.2,    # noise_level: low noise → narrow f_spread
    1500,   # brightness: low → energy below centroid → negative f_skewness
    0.2,    # mode_spread: narrow → tight f_spread (~0.64 octaves)
    0.055,  # onset: ~55ms leading silence (matches ref t_centroid)
    0.002,  # decay_tau: 2ms Weibull scale → tight t_spread (~3ms)
    0.4,    # decay_beta: stretched exp → high skewness (~6) & kurtosis (~80)
    # -- Chain params (3 dims) --
    *_CHAIN_X0,
])

# Capture: clack (0.08s) + thud (0.20s) = 0.28s total
# Ref t_centroid 63–66ms → most energy in clack (0–80ms) + early thud
# Ref f_centroid 1136–1232 Hz → brighter than move
_CAPTURE_X0 = np.array([
    # -- Clack synth (7 dims) — bright, short impact --
    1400,   # body_freq: bright clack near ref f_centroid
    0.4,    # noise_level
    4000,   # brightness: bright noise
    0.4,    # mode_spread
    0.03,   # onset: 30ms into the 80ms clack
    0.003,  # decay_tau: slightly wider than move
    0.45,   # decay_beta: stretched exp
    # -- Thud synth (7 dims) — warm body resonance --
    600,    # body_freq: warm low thud
    0.3,    # noise_level
    1500,   # brightness
    0.2,    # mode_spread
    0.01,   # onset: 10ms into thud → total ~90ms from capture start
    0.004,  # decay_tau
    0.45,   # decay_beta
    # -- Chain params (3 dims) --
    *_CHAIN_X0,
])


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

    def _move_cb(xk, convergence=0.0):
        pbar.update(1)
        cost = objective(xk)
        if cost < best_cost[0]:
            best_cost[0] = cost
        pbar.set_postfix(cost=f"{best_cost[0]:.6f}")
        plateau_check.append(best_cost[0])
        if best_cost[0] < 0.01 or (time.monotonic() - t0) > 120:
            return True
        # Stop if <1% improvement over last 20 generations
        if len(plateau_check) >= 20:
            old = plateau_check[-20]
            if old > 0 and (old - best_cost[0]) / old < 0.01:
                log.info("    plateau detected (gen %d)", len(plateau_check))
                return True

    result = differential_evolution(
        objective, bounds, seed=960, maxiter=500, tol=1e-10, popsize=10,
        x0=_MOVE_X0,
        callback=_move_cb,
    )
    pbar.close()
    log.info("    cost=%.6f  nfev=%d  (%.0fs)", result.fun, result.nfev,
             time.monotonic() - t0)

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

    def _cap_cb(xk, convergence=0.0):
        pbar.update(1)
        cost = objective(xk)
        if cost < best_cost[0]:
            best_cost[0] = cost
        pbar.set_postfix(cost=f"{best_cost[0]:.6f}")
        plateau_check.append(best_cost[0])
        if best_cost[0] < 0.01 or (time.monotonic() - t0) > 120:
            return True
        # Stop if <1% improvement over last 20 generations
        if len(plateau_check) >= 20:
            old = plateau_check[-20]
            if old > 0 and (old - best_cost[0]) / old < 0.01:
                log.info("    plateau detected (gen %d)", len(plateau_check))
                return True

    result = differential_evolution(
        objective, bounds, seed=960, maxiter=500, tol=1e-10, popsize=10,
        x0=_CAPTURE_X0,
        callback=_cap_cb,
    )
    pbar.close()
    log.info("    cost=%.6f  nfev=%d  (%.0fs)", result.fun, result.nfev,
             time.monotonic() - t0)

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
    """Ascending major third  G3 → B3.  Warm, rewarding."""
    d = 0.09
    a = warm(196.00, d, decay=18)
    b = warm(246.94, d, decay=18)
    return np.concatenate([a, silence(0.02), b])


def wrong() -> np.ndarray:
    """Descending tritone  B3 → F3.  Instinctively 'off', but gentle."""
    d = 0.11
    a = warm_tri(246.94, d, decay=8)
    b = warm_tri(174.61, d, decay=8)
    return np.concatenate([a, silence(0.025), b])


def move() -> np.ndarray:
    """Wood-on-wood thud — parameters found by optimization."""
    _ensure_optimized()
    assert _MOVE_PARAMS is not None
    return wood_hit(_MOVE_PARAMS)


def capture() -> np.ndarray:
    """Piece-on-piece clack + board thud — parameters found by optimization."""
    _ensure_optimized()
    assert _CAPTURE_CLACK is not None and _CAPTURE_THUD is not None
    clack = wood_hit(_CAPTURE_CLACK)
    thud = wood_hit(_CAPTURE_THUD)
    return np.concatenate([clack, thud])


def check() -> np.ndarray:
    """FM bell double-pip at D4 — chess check alert."""
    d = 0.08
    pip = fm_bell(293.66, d, mod_ratio=1.41, mod_peak=3.5, decay=18)
    return np.concatenate([pip, silence(0.04), pip])


def victory() -> np.ndarray:
    """G major arpeggio → blooming chord.  Triumphant."""
    d, gap = 0.10, 0.035
    arp_notes = [196.00, 246.94, 293.66, 392.00]
    parts: list[np.ndarray] = []
    for i, f in enumerate(arp_notes):
        n = warm(f, d, decay=6 + i * 2)
        parts.append(n)
        parts.append(silence(gap))
    cd = 0.45
    chord = (
        warm(392.00, cd, decay=3)
        + 0.7 * warm(493.88, cd, decay=3)
        + 0.5 * warm(587.33, cd, decay=3)
    )
    parts.append(chord)
    return np.concatenate(parts)


def defeat() -> np.ndarray:
    """Descending  G3 → Eb3 → D3.  Gentle minor disappointment."""
    d, gap = 0.14, 0.035
    freqs = [196.00, 155.56, 146.83]
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
    a = warm(196.00, d, decay=6)
    b = warm(293.66, d, decay=6)
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

    # Run optimization first (populates _MOVE_PARAMS, _CAPTURE_*, chains)
    _ensure_optimized()
    assert _MOVE_PARAMS is not None and _MOVE_CHAIN is not None
    assert _CAPTURE_CLACK is not None and _CAPTURE_THUD is not None
    assert _CAPTURE_CHAIN is not None

    # Verify metrics are in range
    for label, raw, chain, ref in [
        ("move", wood_hit(_MOVE_PARAMS), _MOVE_CHAIN, MOVE_REF),
        ("capture", np.concatenate([
            wood_hit(_CAPTURE_CLACK), wood_hit(_CAPTURE_THUD)]),
         _CAPTURE_CHAIN, CAPTURE_REF),
    ]:
        metrics = _quick_analyze(_process(raw, chain))
        log.info("  %s metrics:", label)
        for key, (lo, hi) in ref.items():
            val = metrics[key]
            in_range = lo <= val <= hi
            mark = "\u2713" if in_range else "\u2717"
            log.info("    %s %s: %.1f  [%.1f \u2013 %.1f]", mark, key, val, lo, hi)

    log.info("")
    # Chess sounds use their optimized chains
    chess_chains = {"move": _MOVE_CHAIN, "capture": _CAPTURE_CHAIN}
    for name, fn in SOUNDS.items():
        write(name, fn(), chain=chess_chains.get(name))

    total = sum((OUT / f"{n}.wav").stat().st_size for n in SOUNDS) / 1024
    log.info("\n  Total: %.0f KB", total)
    log.info("Done!")
