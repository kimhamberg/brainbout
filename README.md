<p align="center">
  <img src="favicon.svg" alt="Brainbout" width="96" />
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

A daily brain workout. Train your brain, not your thumb scroll. No accounts, no ads, no internet required. Progress tracked locally.

- <img src="docs/icons/crown.svg" width="16" /> **Crown** — chess-themed mental rotation; spot the same/different position across rotations + mirrors
- <img src="docs/icons/flux.svg" width="16" /> **Flux** — adaptive rule-switching with inhibition (5 HP, lose HP on misses)
- <img src="docs/icons/book-open.svg" width="16" /> **Lex** — spaced-repetition vocabulary (30-word session, Anki-style)

No time limits — every session has a natural end state. Nothing greys out.

<p align="center"><img src="docs/screenshot.png" alt="Screenshot" width="280" /></p>

## Requirements

- [Bun](https://bun.sh) 1.3+
- [Android SDK](https://developer.android.com/studio) + [Gradle](https://gradle.org) (Android builds only)

## Quick start

```
bun install
bun run dev
```

## Build

| Target  | Command                  | Output                        |
| :------ | :----------------------- | :---------------------------- |
| Dev     | `bun run dev`            | `localhost:5173`              |
| Desktop | `bun run build:server`   | `brainbout`                   |
| Linux   | `bun run build:linux`    | `brainbout-linux-amd64`       |
| Windows | `bun run build:windows`  | `brainbout-windows-amd64.exe` |
| Android | `bun run build:android`  | `app-debug.apk`               |
| Clean   | `bun run clean`          |                               |

The desktop build embeds all web assets into a single binary — no runtime dependencies.

## Lint

```
bun run lint
```

Runs Biome (TS/JS/JSON), Stylelint (CSS), ktlint (Kotlin), SuperHTML (HTML), actionlint (CI), and taplo (TOML).

## Tests

```
bun test            # unit + happy-dom DOM tests
bun run test:e2e    # Playwright nav/UI smoke (Chromium + reduced-motion)
bun run test:fuzz   # fast-check at 100k runs
bun run test:mutation  # Stryker mutation testing
```

Unit tests cover position generation, chess clock, cognitive games, engine parsing, timer, progress tracking, and hub render. E2E covers hub → game navigation, deep links, theme persistence, back-nav, and asserts zero console errors / failed requests.

## Sound

20 synthesized sounds (modal wood synthesis for chess pieces, FM bells, additive warm tones). Generator lives in a separate offline tool — see `brainbout-sounds/`. Output WAVs are committed to `public/sounds/`.

## Stack

- [Chessground](https://github.com/lichess-org/chessground) — chess-board rendering (view-only, used as the stimulus for Crown's mental-rotation trials)
- [Catppuccin](https://github.com/catppuccin/catppuccin) — color theme (Frappe dark / Latte light)
- [Lucide](https://lucide.dev) — icons
- [Bun](https://bun.sh) — desktop server compiled to a single binary with embedded assets
- [Kotlin](https://kotlinlang.org) + [Android WebView](https://developer.android.com/develop/ui/views/layout/webapps/webview) — mobile wrapper

## Research

Each game targets a cognitive domain with peer-reviewed evidence behind it. The evidence varies in strength — spaced repetition is among the most replicated findings in psychology, while chess transfer claims face serious methodological challenges.

**Flux — task switching & inhibitory control**

Flux combines cued task switching with go/no-go inhibition. These target two of the three core executive functions identified by [Diamond (2013)](https://doi.org/10.1146/annurev-psych-113011-143750): cognitive flexibility and inhibitory control. Task switching produces a measurable "switch cost" — slower, more error-prone responses after a rule change — that reflects the time needed to reconfigure mental resources [(Monsell, 2003)](<https://doi.org/10.1016/S1364-6613(03)00028-7>). Go/no-go training produces immediate cognitive gains, but a meta-analysis found that go/no-go training alone does not sustain long-term benefits in healthy adults; combining it with other paradigms does [(Li et al., 2022)](https://doi.org/10.3389/fnins.2022.813975).

**Crown — mental rotation (spatial reasoning)**

The original Crown was a Stockfish chess client. Recent meta-analyses with active controls — most importantly [Sala & Gobet (2023)](https://doi.org/10.1177/17456916221091830) — concluded that chess training, like working-memory training and music training, shows essentially no far transfer to general cognition when properly controlled (corrected g ≈ 0.01). Brainbout's bar is "trains a sub-skill with replicated transfer evidence", so the chess game was retired. Crown is now a chess-themed mental-rotation drill: two boards are shown side by side under a stated transform (rot 90°/180°/270° or mirror); the player judges whether they are the same configuration or whether one piece has moved. Stage curriculum widens the transform set and the piece-count with progress. Per-trial budget 8 s; 20 trials per session.

The mental-rotation literature is the strongest evidence in cognitive-training game research today. Uttal et al.'s meta-analysis of 217 spatial-training studies reports an average Hedges's g of 0.47 (SE 0.04), with effects that are durable across delays and that transfer to untrained spatial tasks [(Uttal et al., 2013)](https://doi.org/10.1037/a0028446). A more recent meta-analysis of 89 effect sizes (N = 3,765) shows spatial training transfers to mathematics with g ≈ 0.28 — and, critically, the control-group type does not moderate the effect, ruling out a pure placebo explanation [(Hawes et al., 2022)](https://doi.org/10.1037/dev0001281). Long-term durability has been confirmed at 90 days post-training, accompanied by ERP changes [(npj Science of Learning 2025)](https://www.nature.com/articles/s41539-025-00309-2). Skeptics still dispute the size of far-transfer claims, so the framing here is honest: mental rotation training reliably improves the trained spatial sub-skill and likely transfers to mathematics; broader claims remain contested.

**Lex — spaced retrieval practice (FSRS-style scheduling)**

The spacing effect is the most-replicated finding in memory research. A meta-analysis of 317 experiments confirmed that distributed practice produces stronger retention than massed practice, with optimal inter-study intervals scaling with the target retention interval [(Cepeda et al., 2006)](https://doi.org/10.1037/0033-2909.132.3.354). Irregular spacing outperforms uniform intervals — Lex applies ±15 % jitter to each scheduled interval. The testing effect (active recall > passive restudy) is similarly robust, with Rowland's meta-analysis reporting g ≈ 0.50 [(Rowland, 2014)](https://doi.org/10.1037/a0037559); Pan & Rickard (2018) show free-recall transfers more strongly than recognition. Lex therefore defaults to typed-recall with 4-button grading (again / hard / good / easy), a simplified FSRS-style scheduler — closer to what Anki/FSRS does (~15-20 % fewer reviews than SM-2 for equivalent retention) than the original Leitner-box implementation. What's proven is *retention of the trained content*: spaced retrieval will durably consolidate the vocabulary you actually study; it is not a claim about general cognitive enhancement.

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

## License

[GPL-3.0](LICENSE)
