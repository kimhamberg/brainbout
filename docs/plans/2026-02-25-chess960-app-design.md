# Chess960 vs Stockfish App — Design Document

## Overview

A Chess960 (Fischer Random) app for playing against Stockfish locally on Linux, Windows, and Android. Polished UI with adjustable difficulty.

## Architecture

One shared web frontend, two deployment targets:

```
┌─────────────────────────────────────────┐
│              Web Frontend               │
│  Chessground (board) + chessops (logic) │
│  + Stockfish WASM (engine)              │
│  + Game UI (TypeScript)                 │
└──────────┬──────────────┬───────────────┘
           │              │
    ┌──────▼──────┐  ┌────▼────────────┐
    │ Go binary   │  │ Android APK     │
    │ (embed +    │  │ (WebView +      │
    │  localhost) │  │  bundled assets) │
    │             │  │                  │
    │ Linux/Win   │  │ Android          │
    └─────────────┘  └─────────────────┘
```

## Components

### 1. Web Frontend (shared across platforms)

- **Board UI:** `@lichess-org/chessground` — Lichess's board library. Drag-and-drop, animations, piece sets, touch support. 10 KB gzipped, zero dependencies.
- **Chess logic:** `chessops` — Chess960 castling rules, legal move generation, FEN/X-FEN/PGN support. Designed to work with Chessground.
- **Engine:** `stockfish.js` (nmrugg/stockfish.js, Stockfish 18 WASM).
  - Desktop: multi-threaded build (~6 MB) via SharedArrayBuffer + COOP/COEP headers.
  - Android: single-threaded lite build (~7 MB) — SharedArrayBuffer not available in Android WebView.
- **Game UI:** TypeScript. New game dialog, difficulty settings, move list, eval bar (optional), resign/draw buttons.

### 2. Go Binary (Linux/Windows desktop)

- Embeds all web assets via `//go:embed`
- Serves on `localhost:8960`
- Sets required HTTP headers:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
- Opens default browser automatically (`xdg-open` on Linux, `start` on Windows)
- Cross-compiles from one machine: `GOOS=linux go build` / `GOOS=windows go build`
- Single binary, ~10-15 MB

### 3. Android APK

- Minimal WebView app (Kotlin)
- Bundles web assets in `assets/` folder
- Loads from local assets — no internet required
- Uses single-threaded Stockfish WASM (no SharedArrayBuffer in WebView)
- APK size: ~15-20 MB

## Stockfish Configuration

UCI parameters for adjustable difficulty and human-like play:

```
setoption name UCI_Chess960 value true
setoption name Skill Level value 10        // 0 (weakest) to 20 (full strength)
setoption name UCI_LimitStrength value true
setoption name UCI_Elo value 1800          // 1320-3190
setoption name Contempt value 0            // -100 to 100, affects playing style
setoption name Move Overhead value 300     // simulates "thinking time"
```

Exposed to users via:
- **Difficulty slider:** Maps to `UCI_Elo` (1320-3190)
- **Settings panel:** One-time setup for personality tweaks (Contempt, Move Overhead, Skill Level)

## Game Flow

1. User opens app (double-click binary on desktop / open APK on Android)
2. "New Game" screen:
   - Random Chess960 position, or pick by position number (1-960)
   - Choose color: White / Black / Random
   - Difficulty already set via settings
3. Board renders with the selected Chess960 starting position
4. Stockfish initializes in a web worker with `UCI_Chess960 = true`
5. Play proceeds:
   - User makes a move (drag-and-drop or click-to-move)
   - App sends `position fen <fen> moves <moves>` + `go movetime <ms>` to Stockfish
   - Stockfish responds with `bestmove`
   - Board animates the engine's move
6. Move list panel updates in real-time
7. Optional: eval bar shows Stockfish's assessment of the position
8. Game ends (checkmate, stalemate, resignation, draw) → show result
9. Option for rematch (same position or new random)

## Key Libraries

| Library | Version | Purpose | License |
|---------|---------|---------|---------|
| `@lichess-org/chessground` | 9.x | Board rendering | GPL-3.0 |
| `chessops` | 0.14.x | Chess960 logic, move validation | GPL-3.0 |
| `stockfish.js` (nmrugg) | 18.x | WASM chess engine | GPL-3.0 |

Note: All key dependencies are GPL-3.0. This app must be open source.

## Out of Scope (YAGNI)

- No multiplayer / online play
- No opening book / endgame tablebase
- No PGN save/load
- No custom themes
- No move sounds
- No clock/time controls (Stockfish responds based on `movetime`)

These can all be added incrementally later.

## Technical Decisions

- **Why Go for the server binary?** Trivial `embed` package, cross-compilation built in, single static binary with zero dependencies. The server is ~50 lines of code.
- **Why not Tauri/Electron?** Unnecessary complexity for what is fundamentally a static file server. The browser provides all the UI capabilities we need.
- **Why single-threaded Stockfish on Android?** Android WebView does not support SharedArrayBuffer (no site isolation). The single-threaded lite build still plays at a strong level and is more than sufficient for adjustable difficulty play.
- **Why chessops over chess.js?** chessops has native Chess960 support, is maintained by the Chessground ecosystem, and handles X-FEN castling notation correctly.
