#!/usr/bin/env python3
"""Measure 8-moment metrics (log-frequency + time) on reference sounds.

Run:  .venv/bin/python scripts/measure-refs.py
"""

import logging
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import welch

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
SR = 44100


def load_wav(path: Path) -> np.ndarray:
    """Load a WAV or MP3 file and return normalised float64 mono samples."""
    if path.suffix == ".mp3":
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
        subprocess.run(  # noqa: S603
            ["ffmpeg", "-y", "-i", str(path), "-ar", str(SR), "-ac", "1", tmp_path],  # noqa: S607
            capture_output=True,
            check=True,
        )
        _, data = wavfile.read(tmp_path)
        Path(tmp_path).unlink()
    else:
        _, data = wavfile.read(str(path))
    if data.dtype == np.int16:
        data = data.astype(np.float64) / 32768.0
    elif data.dtype == np.int32:
        data = data.astype(np.float64) / 2147483648.0
    elif data.dtype == np.float32:
        data = data.astype(np.float64)
    if data.ndim == 2:  # noqa: PLR2004
        data = data.mean(axis=1)
    return data


def analyze(samples: np.ndarray) -> dict:
    """Compute 8-moment metrics (log-frequency + time) for an audio signal."""
    eps = 1e-30

    # -- Frequency domain: moments on log2(freq) axis --
    nperseg = min(2048, len(samples))
    freqs, psd = welch(samples, fs=SR, nperseg=nperseg)

    # Skip DC bin (freq=0, log undefined)
    freqs = freqs[1:]
    psd = psd[1:]
    total = np.sum(psd) + eps

    log_freqs = np.log2(freqs)
    f_centroid_log = np.sum(log_freqs * psd) / total  # in log2(Hz)
    f_centroid_hz = 2**f_centroid_log  # geometric mean in Hz
    f_dev = log_freqs - f_centroid_log
    f_spread = np.sqrt(np.sum(f_dev**2 * psd) / total)  # in octaves
    f_skewness = np.sum(f_dev**3 * psd) / (total * f_spread**3 + eps)
    f_kurtosis = np.sum(f_dev**4 * psd) / (total * f_spread**4 + eps) - 3  # Fisher

    # -- Time domain: moments on energy envelope --
    energy = samples**2
    e_total = np.sum(energy) + eps
    t_ms = np.arange(len(samples)) / SR * 1000

    t_centroid = np.sum(t_ms * energy) / e_total
    t_dev = t_ms - t_centroid
    t_spread = np.sqrt(np.sum(t_dev**2 * energy) / e_total)
    t_skewness = np.sum(t_dev**3 * energy) / (e_total * t_spread**3 + eps)
    t_kurtosis = np.sum(t_dev**4 * energy) / (e_total * t_spread**4 + eps) - 3

    return {
        "f_centroid": round(f_centroid_hz, 1),
        "f_spread": round(f_spread, 4),
        "f_skewness": round(f_skewness, 2),
        "f_kurtosis": round(f_kurtosis, 2),
        "t_centroid": round(t_centroid, 1),
        "t_spread": round(t_spread, 1),
        "t_skewness": round(t_skewness, 2),
        "t_kurtosis": round(t_kurtosis, 2),
    }


REFS = {
    "lichess_move": ROOT / "ref-sounds" / "lichess" / "Move.mp3",
    "chesscom_move": ROOT / "ref-sounds" / "chesscom" / "move-self.mp3",
    "lichess_capture": ROOT / "ref-sounds" / "lichess" / "Capture.mp3",
    "chesscom_capture": ROOT / "ref-sounds" / "chesscom" / "capture.mp3",
}

if __name__ == "__main__":
    for name, path in REFS.items():
        if not path.exists():
            log.info("  SKIP: %s", path)
            continue
        data = load_wav(path)
        m = analyze(data)
        log.info("\n  %s:", name)
        log.info(
            "    f_centroid=%s  f_spread=%s  f_skewness=%s  f_kurtosis=%s",
            m["f_centroid"],
            m["f_spread"],
            m["f_skewness"],
            m["f_kurtosis"],
        )
        log.info(
            "    t_centroid=%s  t_spread=%s  t_skewness=%s  t_kurtosis=%s",
            m["t_centroid"],
            m["t_spread"],
            m["t_skewness"],
            m["t_kurtosis"],
        )

    # Print _ref_range calls for easy copy-paste
    log.info("\n\n  # --- Copy-paste for gen-sounds.py ---")
    for kind in ["move", "capture"]:
        li = f"lichess_{kind}"
        cc = f"chesscom_{kind}"
        li_path = REFS[li]
        cc_path = REFS[cc]
        if not li_path.exists() or not cc_path.exists():
            continue
        li_m = analyze(load_wav(li_path))
        cc_m = analyze(load_wav(cc_path))
        label = kind.upper()
        log.info("\n  %s_REF = {", label)
        for key in [
            "f_centroid",
            "f_spread",
            "f_skewness",
            "f_kurtosis",
            "t_centroid",
            "t_spread",
            "t_skewness",
            "t_kurtosis",
        ]:
            a, b = li_m[key], cc_m[key]
            log.info('      "%s":  _ref_range(%s, %s),', key, a, b)
        log.info("  }")
