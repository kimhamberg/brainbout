#!/usr/bin/env python3
"""Spectral analysis comparing our synthesized sounds vs Lichess & Chess.com.

Run:  .venv/bin/python scripts/spectral-analysis.py

Analyzes move and capture sounds from all three sources and prints
detailed spectral characteristics.
"""

import subprocess
import tempfile
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import spectrogram, welch

ROOT = Path(__file__).resolve().parent.parent


def load_wav(path: Path) -> tuple[int, np.ndarray]:
    """Load a WAV or MP3 file, returning (sample_rate, mono_float_samples)."""
    if path.suffix == ".mp3":
        # Convert MP3 to WAV using ffmpeg
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        tmp.close()
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(path), "-ar", "44100", "-ac", "1", tmp.name],
            capture_output=True,
            check=True,
        )
        sr, data = wavfile.read(tmp.name)
        Path(tmp.name).unlink()
    else:
        sr, data = wavfile.read(str(path))

    # Convert to float64 mono
    if data.dtype == np.int16:
        data = data.astype(np.float64) / 32768.0
    elif data.dtype == np.int32:
        data = data.astype(np.float64) / 2147483648.0
    elif data.dtype == np.float32:
        data = data.astype(np.float64)

    # Stereo -> mono
    if data.ndim == 2:
        data = data.mean(axis=1)

    return sr, data


def analyze(name: str, sr: int, data: np.ndarray) -> dict:
    """Full spectral analysis of a sound."""
    duration = len(data) / sr

    # Peak and RMS
    peak = np.max(np.abs(data))
    rms = np.sqrt(np.mean(data**2))
    peak_db = 20 * np.log10(peak + 1e-10)
    rms_db = 20 * np.log10(rms + 1e-10)
    crest_factor = peak_db - rms_db

    # PSD via Welch
    nperseg = min(2048, len(data))
    freqs, psd = welch(data, fs=sr, nperseg=nperseg)

    # Spectral centroid (brightness indicator)
    total_power = np.sum(psd)
    if total_power > 0:
        spectral_centroid = np.sum(freqs * psd) / total_power
    else:
        spectral_centroid = 0.0

    # Spectral bandwidth (spread around centroid)
    if total_power > 0:
        spectral_bw = np.sqrt(
            np.sum(((freqs - spectral_centroid) ** 2) * psd) / total_power
        )
    else:
        spectral_bw = 0.0

    # Spectral rolloff (95% energy cutoff)
    cumulative = np.cumsum(psd)
    rolloff_idx = np.searchsorted(cumulative, 0.95 * cumulative[-1])
    spectral_rolloff = freqs[min(rolloff_idx, len(freqs) - 1)]

    # Spectral flatness (how noise-like vs tonal)
    psd_pos = psd[psd > 0]
    if len(psd_pos) > 0:
        geo_mean = np.exp(np.mean(np.log(psd_pos + 1e-30)))
        arith_mean = np.mean(psd_pos)
        spectral_flatness = geo_mean / (arith_mean + 1e-30)
    else:
        spectral_flatness = 0.0

    # Energy in frequency bands
    def band_energy(lo: float, hi: float) -> float:
        mask = (freqs >= lo) & (freqs < hi)
        return np.sum(psd[mask]) / (total_power + 1e-30) * 100

    bands = {
        "sub_bass_0_100": band_energy(0, 100),
        "bass_100_300": band_energy(100, 300),
        "low_mid_300_800": band_energy(300, 800),
        "mid_800_2k": band_energy(800, 2000),
        "upper_mid_2k_5k": band_energy(2000, 5000),
        "high_5k_10k": band_energy(5000, 10000),
        "air_10k_plus": band_energy(10000, sr / 2),
    }

    # Peak frequencies (top 5)
    peak_indices = np.argsort(psd)[-5:][::-1]
    peak_freqs = [(freqs[i], 10 * np.log10(psd[i] + 1e-30)) for i in peak_indices]

    # Transient analysis — attack time (10% to 90% of peak amplitude)
    abs_data = np.abs(data)
    peak_val = np.max(abs_data)
    if peak_val > 0:
        above_10 = np.where(abs_data >= 0.1 * peak_val)[0]
        above_90 = np.where(abs_data >= 0.9 * peak_val)[0]
        if len(above_10) > 0 and len(above_90) > 0:
            attack_time = (above_90[0] - above_10[0]) / sr
        else:
            attack_time = 0.0
    else:
        attack_time = 0.0

    # Decay time (peak to -20dB below peak)
    peak_idx = np.argmax(abs_data)
    decay_threshold = peak_val * 0.1  # -20dB
    after_peak = abs_data[peak_idx:]
    below_thresh = np.where(after_peak < decay_threshold)[0]
    if len(below_thresh) > 0:
        decay_time = below_thresh[0] / sr
    else:
        decay_time = duration - peak_idx / sr

    # Spectrogram for temporal evolution (early vs late spectrum)
    if len(data) > 512:
        _, _, Sxx = spectrogram(data, fs=sr, nperseg=min(512, len(data) // 2))
        n_frames = Sxx.shape[1]
        if n_frames >= 4:
            early = np.mean(Sxx[:, : n_frames // 4], axis=1)
            late = np.mean(Sxx[:, n_frames // 2 :], axis=1)
            early_centroid = (
                np.sum(np.arange(len(early)) * early) / (np.sum(early) + 1e-30)
                * sr
                / (2 * len(early))
            )
            late_centroid = (
                np.sum(np.arange(len(late)) * late) / (np.sum(late) + 1e-30)
                * sr
                / (2 * len(late))
            )
        else:
            early_centroid = late_centroid = spectral_centroid
    else:
        early_centroid = late_centroid = spectral_centroid

    return {
        "name": name,
        "duration_ms": duration * 1000,
        "peak_db": peak_db,
        "rms_db": rms_db,
        "crest_factor_db": crest_factor,
        "spectral_centroid_hz": spectral_centroid,
        "spectral_bandwidth_hz": spectral_bw,
        "spectral_rolloff_hz": spectral_rolloff,
        "spectral_flatness": spectral_flatness,
        "bands_pct": bands,
        "peak_freqs": peak_freqs,
        "attack_ms": attack_time * 1000,
        "decay_ms": decay_time * 1000,
        "early_centroid_hz": early_centroid,
        "late_centroid_hz": late_centroid,
        "brightness_decay": early_centroid - late_centroid,
    }


def print_analysis(results: dict) -> None:
    """Pretty-print analysis results."""
    print(f"\n{'=' * 70}")
    print(f"  {results['name']}")
    print(f"{'=' * 70}")
    print(f"  Duration:           {results['duration_ms']:.1f} ms")
    print(f"  Peak:               {results['peak_db']:.1f} dBFS")
    print(f"  RMS:                {results['rms_db']:.1f} dBFS")
    print(f"  Crest factor:       {results['crest_factor_db']:.1f} dB")
    print(f"  Attack time:        {results['attack_ms']:.2f} ms")
    print(f"  Decay time (-20dB): {results['decay_ms']:.1f} ms")
    print()
    print(f"  Spectral centroid:  {results['spectral_centroid_hz']:.0f} Hz")
    print(f"  Spectral bandwidth: {results['spectral_bandwidth_hz']:.0f} Hz")
    print(f"  Spectral rolloff:   {results['spectral_rolloff_hz']:.0f} Hz")
    print(f"  Spectral flatness:  {results['spectral_flatness']:.4f}  (0=tonal, 1=noise)")
    print()
    print(f"  Temporal brightness:")
    print(f"    Early centroid:   {results['early_centroid_hz']:.0f} Hz")
    print(f"    Late centroid:    {results['late_centroid_hz']:.0f} Hz")
    print(f"    Brightness decay: {results['brightness_decay']:.0f} Hz")
    print()
    print("  Frequency band energy distribution:")
    for band, pct in results["bands_pct"].items():
        label = band.replace("_", " ").title()
        bar = "█" * int(pct / 2) + "░" * max(0, 50 - int(pct / 2))
        print(f"    {label:22s} {bar} {pct:5.1f}%")
    print()
    print("  Top 5 peak frequencies:")
    for freq, db in results["peak_freqs"]:
        print(f"    {freq:8.1f} Hz  ({db:+.1f} dB)")


def compare(label: str, ours: dict, lichess: dict, chesscom: dict) -> None:
    """Print side-by-side comparison."""
    print(f"\n{'#' * 70}")
    print(f"  COMPARISON: {label}")
    print(f"{'#' * 70}")

    metrics = [
        ("Duration (ms)", "duration_ms", ".1f"),
        ("Peak (dBFS)", "peak_db", ".1f"),
        ("RMS (dBFS)", "rms_db", ".1f"),
        ("Crest factor (dB)", "crest_factor_db", ".1f"),
        ("Attack (ms)", "attack_ms", ".2f"),
        ("Decay -20dB (ms)", "decay_ms", ".1f"),
        ("Centroid (Hz)", "spectral_centroid_hz", ".0f"),
        ("Bandwidth (Hz)", "spectral_bandwidth_hz", ".0f"),
        ("Rolloff 95% (Hz)", "spectral_rolloff_hz", ".0f"),
        ("Flatness", "spectral_flatness", ".4f"),
        ("Early centroid (Hz)", "early_centroid_hz", ".0f"),
        ("Late centroid (Hz)", "late_centroid_hz", ".0f"),
    ]

    print(f"\n  {'Metric':25s} {'Ours':>12s} {'Lichess':>12s} {'Chess.com':>12s}")
    print(f"  {'-' * 25} {'-' * 12} {'-' * 12} {'-' * 12}")
    for label_m, key, fmt in metrics:
        v1 = format(ours[key], fmt)
        v2 = format(lichess[key], fmt)
        v3 = format(chesscom[key], fmt)
        print(f"  {label_m:25s} {v1:>12s} {v2:>12s} {v3:>12s}")

    # Band comparison
    print(f"\n  Band energy (%):")
    print(f"  {'Band':25s} {'Ours':>12s} {'Lichess':>12s} {'Chess.com':>12s}")
    print(f"  {'-' * 25} {'-' * 12} {'-' * 12} {'-' * 12}")
    for band in ours["bands_pct"]:
        label_b = band.replace("_", " ").title()
        v1 = f"{ours['bands_pct'][band]:.1f}"
        v2 = f"{lichess['bands_pct'][band]:.1f}"
        v3 = f"{chesscom['bands_pct'][band]:.1f}"
        print(f"  {label_b:25s} {v1:>12s} {v2:>12s} {v3:>12s}")


def main() -> None:
    # Define sound files
    sounds = {
        "move": {
            "ours": ROOT / "public" / "sounds" / "move.wav",
            "lichess": ROOT / "ref-sounds" / "lichess" / "Move.mp3",
            "chesscom": ROOT / "ref-sounds" / "chesscom" / "move-self.mp3",
        },
        "capture": {
            "ours": ROOT / "public" / "sounds" / "capture.wav",
            "lichess": ROOT / "ref-sounds" / "lichess" / "Capture.mp3",
            "chesscom": ROOT / "ref-sounds" / "chesscom" / "capture.mp3",
        },
    }

    for sound_type, files in sounds.items():
        results = {}
        for source, path in files.items():
            if not path.exists():
                print(f"  SKIP: {path} not found")
                continue
            sr, data = load_wav(path)
            label = f"{source.upper()} {sound_type}"
            r = analyze(label, sr, data)
            print_analysis(r)
            results[source] = r

        if len(results) == 3:
            compare(
                sound_type.upper(),
                results["ours"],
                results["lichess"],
                results["chesscom"],
            )

    # Summary recommendations
    print(f"\n{'=' * 70}")
    print("  SYNTHESIS RECOMMENDATIONS")
    print(f"{'=' * 70}")
    print("""
  Based on the spectral comparison above, note these key differences
  between our synthesized sounds and the recorded reference sounds.
  The analysis covers: attack characteristics, spectral content,
  dynamic range, duration, and timbral evolution over time.
    """)


if __name__ == "__main__":
    main()
