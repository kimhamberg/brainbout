# Brainbout Daily Brain Workout — Design

## Goal

Transform Brainbout from a Chess960-vs-Stockfish app into a daily brain workout — a healthy alternative to doomscrolling. Four short, scientifically-grounded games that exercise different cognitive domains. Each session takes ~8 minutes.

## Architecture

Multi-page Vite app. Each game is its own HTML page with its own TypeScript entry point. A hub page manages the daily workout flow. Games are fully independent — no shared runtime state. Shared utilities (sounds, progress tracking, timer) are imported per page and tree-shaken by Vite.

### Removed

The full Chess960 vs Stockfish game is removed entirely:

- `src/main.ts`, `src/game.ts`, `src/engine.ts` — deleted
- `public/stockfish/` (Stockfish WASM ~1.7MB) — deleted
- `stockfish` npm dependency — removed

### File structure

```
index.html                — Hub: daily workout flow, progress, game launcher
games/
  puzzles.html            — Chess960 tactical puzzles
  nback.html              — Dual N-back
  stroop.html             — Stroop test
  math.html               — Quick math
src/
  hub.ts                  — Hub entry point
  games/
    puzzles.ts            — Puzzle game logic
    nback.ts              — Dual N-back logic
    stroop.ts             — Stroop logic
    math.ts               — Quick math logic
  shared/
    sounds.ts             — Sound effects (existing, reused)
    progress.ts           — localStorage: streaks, scores, daily completion
    timer.ts              — Countdown timer shared across games
  chess960.ts             — Position generator (existing, reused by puzzles)
public/
  puzzles.json            — Static puzzle set (~1000 puzzles from Lichess DB)
  sounds/                 — Existing sound files
```

## Daily workout flow

1. User opens app — hub shows today's 4 games as a vertical list with status (pending / completed / score).
2. User taps "Start" — navigates to first uncompleted game.
3. Game plays one round — saves result to localStorage — navigates back to hub.
4. Hub updates status — user taps "Next" — repeats until all 4 done.
5. All done — hub shows daily summary with scores and streak count.

## Progress tracking

All data in localStorage, no accounts, no cloud sync.

| Key | Value |
|---|---|
| `brainbout:streak` | Consecutive days completed (resets if a day is missed) |
| `brainbout:lastDate` | ISO date string of last completed workout |
| `brainbout:daily:{date}:{game}` | Score for that game on that date |
| `brainbout:best:{game}` | Personal best per game |

Each game saves its own score. The hub reads localStorage keys to determine completion and display scores.

## Game designs

### Chess960 Puzzles — spatial reasoning, calculation

- Static JSON file of ~1000 puzzles extracted from the Lichess puzzle DB (CC0), spread across 5 difficulty tiers.
- Each puzzle: `{ fen, moves: ["e2e4", "d7d5", ...], rating, themes }`.
- UI: Chessground board. Opponent plays the first move, player finds the correct response(s).
- Wrong move: board shakes, puzzle failed. Correct sequence: puzzle solved.
- Score: number of puzzles solved in 2 minutes.
- Dependencies: Chessground (board UI), chessops (move validation). No Stockfish.

### Dual N-back — working memory

- 3x3 grid. Each round: one square lights up + a letter is displayed.
- Player indicates if the current position or letter matches the one N steps back.
- Adaptive difficulty: starts at 2-back, >80% accuracy increases N, <50% decreases N.
- Score: highest N-level reached in 2 minutes.
- Dependencies: none (pure DOM + CSS animations).

### Stroop — inhibitory control

- Display a color word (e.g. "RED") rendered in a different ink color (e.g. blue text).
- Player taps the button matching the text color, not the word.
- Gets faster over time (shorter display duration).
- Score: correct answers in 60 seconds.
- Dependencies: none (pure DOM).

### Quick Math — processing speed

- Rapid arithmetic: two numbers with an operator (+, -, x).
- Player selects the answer from 4 choices.
- Difficulty scales: single digit -> double digit -> triple digit, operators get harder.
- Score: correct answers in 60 seconds.
- Dependencies: none (pure DOM).

## Hub UI

Single screen, no scrolling needed on most devices. Catppuccin Frappe theme.

```
+-----------------------------+
|  Brainbout                  |
|                             |
|  7-day streak               |
|                             |
|  Today's Workout            |
|  +---------------------+   |
|  | Chess960 Puzzles    | v  |
|  |   Score: 8          |    |
|  +---------------------+   |
|  | Dual N-back         | >  |
|  |                     |    |
|  +---------------------+   |
|  | Stroop              |    |
|  |                     |    |
|  +---------------------+   |
|  | Quick Math          |    |
|  |                     |    |
|  +---------------------+   |
|                             |
|  [ Start Next ]            |
|                             |
+-----------------------------+
```

- Completed games show a checkmark and score.
- Current/next game is highlighted with a play indicator.
- "Start Next" navigates to the next uncompleted game.

## Tech stack

- Chessground + chessops — puzzle board and move validation (existing deps)
- Vite multi-page — code-split per game, each page loads only what it needs
- localStorage — progress tracking
- Catppuccin Frappe — consistent theming (existing)
- CC0 sounds — existing sound files reused across games

## Platforms

No changes to platform wrappers. Go server and Android WebView serve whatever Vite builds — they don't care about the page structure. The hub becomes the new landing page.
