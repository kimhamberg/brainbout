<p align="center">
  <img src="public/favicon.svg" alt="Brainbout" width="96" />
</p>

<h1 align="center">Brainbout</h1>

<p align="center">
  <a href="https://github.com/kimhamberg/brainbout/actions/workflows/ci.yml"><img src="https://github.com/kimhamberg/brainbout/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-blue.svg" alt="License: GPL-3.0" /></a>
  <a href="https://kimhamberg.github.io/brainbout/"><img src="https://img.shields.io/badge/Web-Play_Online-8caaee" alt="Web" /></a>
  <a href="https://github.com/kimhamberg/brainbout/releases/latest/download/brainbout-linux-amd64"><img src="https://img.shields.io/badge/Linux-Download-a6d189" alt="Linux" /></a>
  <a href="https://github.com/kimhamberg/brainbout/releases/latest/download/brainbout-windows-amd64.exe"><img src="https://img.shields.io/badge/Windows-Download-e5c890" alt="Windows" /></a>
  <a href="https://github.com/kimhamberg/brainbout/releases/latest/download/brainbout.apk"><img src="https://img.shields.io/badge/Android-APK-ef9f76" alt="Android" /></a>
</p>

A daily brain workout. Train your brain, not your scroll thumb.

{{GAME_COUNT}} timed cognitive games in ~18 minutes. No accounts, no ads, no internet required. Progress tracked locally.

- <img src="docs/icons/crown.svg" width="16" /> **Crown** — Chess960 rapid, 15+10 vs Stockfish
- <img src="docs/icons/flux.svg" width="16" /> **Flux** — adaptive rule-switching with inhibition (60s)
- <img src="docs/icons/book-open.svg" width="16" /> **Lex** — vocabulary with per-word mastery (120s)

<p align="center"><img src="docs/screenshot.png" alt="Screenshot" width="280" /></p>

## Requirements

- [Node.js](https://nodejs.org) 20+
- [uv](https://docs.astral.sh/uv/) (Python scripts)
- [Go](https://go.dev) 1.23+ (desktop builds only)
- [Android SDK](https://developer.android.com/studio) + [Gradle](https://gradle.org) (Android builds only)

## Quick start

```
npm install
make dev
```

## Build

| Target  | Command              | Output                       |
| :------ | :------------------- | :--------------------------- |
| Dev     | `make dev`           | `localhost:5173`             |
| Desktop | `make build-server`  | `brainbout`                   |
| Linux   | `make build-linux`   | `brainbout-linux-amd64`       |
| Windows | `make build-windows` | `brainbout-windows-amd64.exe` |
| Android | `make build-android` | `app-debug.apk`              |
| Clean   | `make clean`         |                              |

The desktop build embeds all web assets into a single binary — no runtime dependencies.

## Lint

```
make lint
```

Runs ESLint (TypeScript), Stylelint (CSS), Ruff (Python), staticcheck + go vet (Go), ktlint (Kotlin), and Prettier (all files).

## Tests

```
npm test
```

{{TEST_COUNT}} tests across {{TEST_FILES}} files covering position generation, chess clock, cognitive games, engine parsing, timer, and progress tracking.

## Sound

{{SOUND_COUNT}} synthesised sounds generated with NumPy + SciPy + Pedalboard — modal wood synthesis for chess pieces, FM bells, additive warm tones.

```
.venv/bin/python scripts/gen-sounds.py
```

## Stack

- [Chessground](https://github.com/lichess-org/chessground) — board UI
- [chessops](https://github.com/niklasf/chessops) — Chess960 move validation
- [Stockfish WASM](https://github.com/nicfab/stockfish.wasm) — chess engine
- [Vite](https://vite.dev) — multi-page build tooling
- [Catppuccin](https://github.com/catppuccin/catppuccin) — color theme (Frappe dark / Latte light)
- [Lucide](https://lucide.dev) — icons
- [Go](https://go.dev) — desktop server (single binary with embedded assets)
- [Kotlin](https://kotlinlang.org) + [Android WebView](https://developer.android.com/develop/ui/views/layout/webapps/webview) — mobile wrapper

## Research

Each game targets a cognitive domain with peer-reviewed evidence behind it. The evidence varies in strength — spaced repetition is among the most replicated findings in psychology, while chess transfer claims face serious methodological challenges.

**Flux — task switching & inhibitory control**

Flux combines cued task switching with go/no-go inhibition. These target two of the three core executive functions identified by [Diamond (2013)](https://doi.org/10.1146/annurev-psych-113011-143750): cognitive flexibility and inhibitory control. Task switching produces a measurable "switch cost" — slower, more error-prone responses after a rule change — that reflects the time needed to reconfigure mental resources [(Monsell, 2003)](<https://doi.org/10.1016/S1364-6613(03)00028-7>). Go/no-go training produces immediate cognitive gains, but a meta-analysis found that go/no-go training alone does not sustain long-term benefits in healthy adults; combining it with other paradigms does [(Li et al., 2022)](https://doi.org/10.3389/fnins.2022.813975).

**Crown — chess**

A prospective cohort study of 469 adults over 75 in the _New England Journal of Medicine_ found that cognitively stimulating leisure activities — including board games — were associated with reduced dementia risk (HR 0.93 per point of cognitive activity), while physical activities were not [(Verghese et al., 2003)](https://doi.org/10.1056/NEJMoa022252). A meta-analysis of 24 studies found chess instruction modestly improves mathematics (d = 0.38) and cognition (d = 0.34) in school-age children [(Sala et al., 2017)](https://doi.org/10.3389/fpsyg.2017.00238). However, the same authors found that these effects drop to near zero when studies use active control groups, and far transfer from chess to unrelated cognitive domains has not been reliably demonstrated [(Sala & Gobet, 2017)](https://doi.org/10.1177/0963721417712760).

**Lex — spaced repetition**

The spacing effect is one of the most robust findings in memory research, first demonstrated by Ebbinghaus (1885) and [replicated 130 years later](https://doi.org/10.1371/journal.pone.0120644) with comparable results (Murre & Dros, 2015). A meta-analysis of 317 experiments across 184 articles confirmed that distributed practice produces stronger retention than massed practice, with optimal inter-study intervals scaling with the target retention interval [(Cepeda et al., 2006)](https://doi.org/10.1037/0033-2909.132.3.354). At the neural level, spacing increases pattern similarity in the ventromedial prefrontal cortex across repetitions, and irregular spacing outperforms uniform intervals — a prediction from computational models validated experimentally [(Smolen et al., 2016)](https://doi.org/10.1038/nrn.2015.18).

## Roadmap

- [ ] Every game feels vital and polished — tight animations, satisfying sounds, zero rough edges
- [ ] Crown matches feel like playing a real human — natural move timing, personality, tension
- [ ] Lex actually trains vocabulary — spaced repetition that sticks, real progress over weeks

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

## License

[GPL-3.0](LICENSE)
