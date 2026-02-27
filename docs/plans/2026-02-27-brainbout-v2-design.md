# Brainbout v2 — Design

## Changes

Three changes to the daily brain workout:

1. **Chess960 Blitz** replaces Chess960 Puzzles — play a full 3+2 blitz game against Stockfish
2. **Skip button** on all games — skip records score 0, counts as played for streaks
3. **Memory Match** replaces Dual N-back — card-flip concentration game, more fun, still trains spatial memory

## Game 1: Chess960 Blitz

- 3+2 blitz (3 min base + 2 sec increment) against Stockfish WASM
- Random Chess960 starting position each game (Scharnagl generator already in `chess960.ts`)
- Stockfish at human-like level (~1500 Elo, depth-limited)
- Full chess clock — player clock ticks, Stockfish plays instantly (no clock for engine)
- Board via Chessground, logic via chessops, engine via Web Worker
- Score display: W (win), L (loss), D (draw)
- Hub shows "Won", "Lost", or "Draw" instead of a numeric score
- COOP/COEP headers needed for SharedArrayBuffer (re-add to vite dev server; Go server already has them)
- Duration: variable, up to ~6 min

### Engine setup

- Re-add `stockfish` npm dependency
- Copy WASM files to `public/stockfish/`
- Web Worker wrapper (`src/games/blitz-worker.ts` or inline)
- UCI commands: `uci`, `setoption name UCI_Chess960 value true`, `position fen ... moves ...`, `go depth 8`
- Depth 8 gives roughly 1500 Elo play

### Chess clock

- Player: 180 seconds + 2 sec increment per move
- Engine: no clock (plays instantly)
- Clock ticks every 100ms for smooth display
- Player flag = loss

## Game 2: Memory Match

- Classic card-flip concentration game
- 120 seconds total
- Grid progression: 3×4 (6 pairs) → 4×4 (8 pairs) → 4×5 (10 pairs)
- Cards show emoji symbols, briefly previewed face-up at start of each grid (~2 sec)
- Flip two cards: match = stay revealed + sound, mismatch = flip back after 0.5s
- Completing a grid immediately starts the next larger grid
- Score: total pairs found across all grids
- Pure DOM + CSS transitions, no dependencies

### Card symbols

Use simple distinct emoji: 🐶 🐱 🐸 🦊 🐻 🐼 🐵 🦁 🐔 🐧 🐙 🦋 🐢 🐝 🐠 (pool of 15, pick as needed per grid size)

## Skip button

- Every game page shows a "Skip" link/button in the header area
- Clicking skip: `recordScore(game, 0, today)` then navigate to hub
- Hub shows "Skipped" for score-0 games (distinguish from actually scoring 0 — use -1 as sentinel, or a separate skip flag)
- Actually: use `recordScore(game, -1, today)` as skip sentinel. Hub checks `score === -1` → "Skipped"
- Skipped games count as played for streak/completion purposes

## Hub updates

### Game order
1. Chess960 Blitz (`blitz`)
2. Memory Match (`memory`)
3. Stroop (`stroop`)
4. Quick Math (`math`)

### Labels
- blitz: "Chess960 Blitz"
- memory: "Memory Match"
- stroop: "Stroop"
- math: "Quick Math"

### Score display
- blitz: "Won" / "Lost" / "Draw" / "Skipped"
- memory/stroop/math: numeric score or "Skipped"

## Files

### New
- `src/games/blitz.ts` — Chess960 blitz game
- `src/games/blitz.css` — blitz styles
- `games/blitz.html` — blitz page
- `test/blitz.test.ts` — blitz logic tests
- `src/games/memory.ts` — Memory Match game
- `src/games/memory.css` — memory styles
- `games/memory.html` — memory page
- `test/memory.test.ts` — memory logic tests

### Delete
- `src/games/puzzles.ts`, `src/games/puzzles.css`, `games/puzzles.html`, `test/puzzles.test.ts`
- `src/games/nback.ts`, `src/games/nback.css`, `games/nback.html`, `test/nback.test.ts`
- `public/puzzles.json`
- `scripts/extract-puzzles.ts`

### Modify
- `src/shared/progress.ts` — GAMES = `["blitz", "memory", "stroop", "math"]`
- `src/hub.ts` — new labels, URLs, score display logic for blitz/skipped
- `vite.config.ts` — swap puzzles/nback entries for blitz/memory
- `package.json` — re-add stockfish dependency
- `vite.config.ts` — re-add COOP/COEP dev server headers
- All game HTML pages — add skip button markup
- `test/progress.test.ts` — update for new game IDs and skip sentinel

## Platforms

No changes to Go server (already has COOP/COEP) or Android WebView.
