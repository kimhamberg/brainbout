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

{{GAME_COUNT}} timed cognitive games in ~8 minutes. No accounts, no ads, no internet required. Progress tracked locally.

- <img src="docs/icons/crown.svg" width="16" /> **Chess960 Rapid** — 15+10 vs Stockfish
- <img src="docs/icons/zap.svg" width="16" /> **Reaction Grid** — fast-attention target clicking (60s)
- <img src="docs/icons/book-open.svg" width="16" /> **Word Recall** — vocabulary with spaced repetition (120s)
- <img src="docs/icons/calculator.svg" width="16" /> **Quick Math** — adaptive arithmetic (60s)

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
| Desktop | `make build-server`  | `chess960`                   |
| Linux   | `make build-linux`   | `chess960-linux-amd64`       |
| Windows | `make build-windows` | `chess960-windows-amd64.exe` |
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

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

## License

[GPL-3.0](LICENSE)
