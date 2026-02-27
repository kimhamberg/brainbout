# Brainbout v3 — Design

## Changes

Three changes to the daily brain workout:

1. **Chess960 Rapid** replaces Chess960 Blitz — 15+10 time control instead of 3+2
2. **Reaction Grid** replaces Memory Match — fast-attention target-clicking game
3. **Word Recall** replaces Stroop — cue-recall vocabulary with spaced repetition

Quick Math stays as-is.

## Game order

1. Chess960 Rapid (`rapid`)
2. Reaction Grid (`reaction`)
3. Word Recall (`vocab`)
4. Quick Math (`math`)

## Game 1: Chess960 Rapid

Rename from Blitz to Rapid with new time control.

- 15+10 rapid (15 min base + 10 sec increment) against Stockfish WASM
- Everything else unchanged: random Chess960 position, Chessground board, same engine settings
- Score: W/L/D (same encoding: 1=win, 0.5=draw, 0=loss)
- Hub shows "Won", "Lost", or "Draw"
- Game ID changes from `blitz` to `rapid`

### Changes

- `INITIAL_MS`: 180000 → 900000
- `INCREMENT_MS`: 2000 → 10000
- Rename all labels: "Blitz" → "Rapid"
- Rename files: `blitz.ts` → `rapid.ts`, `blitz.css` → `rapid.css`, `blitz.html` → `rapid.html`
- Update progress GAMES array: `"blitz"` → `"rapid"`
- Update hub labels and URLs
- Update vite.config.ts input entry
- "Low time" warning threshold: 30s → 60s (more appropriate for rapid)

## Game 2: Reaction Grid

Fast-attention target-clicking game. Targets appear one at a time in random grid cells.

- 60 seconds total
- 4×4 grid (16 cells)
- One target lit at a time in a random cell
- Target visible for 1200ms initially
- Speed ramp: visibility shrinks by 50ms every 3 successful hits (floor: 400ms)
- Hit: +1 point, play sound, next target immediately
- Miss (timeout): target moves to new position, no penalty
- Don't repeat the same cell consecutively
- Score: total hits in 60 seconds
- Pure DOM + CSS transitions, no dependencies

### Visual

- Grid cells: subtle background (`--ctp-surface0`)
- Active target: bright highlight (`--ctp-blue`) with scale-in animation
- Hit feedback: brief flash (`--ctp-green`, 100ms)

## Game 3: Word Recall

Cue-recall vocabulary game with Leitner spaced repetition. Timed 120-second session.

### Core loop

Each round:
1. Show a cue (definition, cloze sentence, or synonym)
2. Player types the word
3. Feedback: correct (green), close (yellow, retype), wrong (red, show answer)
4. Next cue

### Cue types (randomly rotated)

1. **Definition → word** — "Feeling of unease or worry" → `angst`
2. **Cloze sentence → word** — "Hun var ___ til å godta." → `villig`
3. **Synonym → word** — "Synonym: modig" → `tapper`

### Scoring

- +10 exact correct
- +5 close (Levenshtein distance ≤ 2), must retype correctly
- 0 wrong (show answer, 2s pause)
- Speed bonus: under 5s = +5, under 10s = +3, under 15s = +1, over 15s = +0
- Streak multiplier: ×1.5 after 3 consecutive correct, ×2 after 5
- Daily score: total points earned in 120 seconds

### Spaced repetition (Leitner)

State stored in localStorage per word: `brainbout:vocab:{lang}:{word}` → `{ box, nextDue }`

Boxes and intervals:
- Box 0: new/reset (due immediately)
- Box 1: 1 day
- Box 2: 3 days
- Box 3: 7 days
- Box 4: 14 days
- Box 5: 30 days (mastered)

Correct answer → advance to next box, set `nextDue = today + interval`
Wrong answer → reset to box 0

### Word selection per session

1. Pull all due words (nextDue ≤ today), shuffle
2. If fewer than needed, introduce new words from the pool
3. Words from lower boxes prioritized

### Word data

Two curated JSON files:
- `public/words-no.json` — ~300 advanced Norwegian words
- `public/words-en.json` — ~300 advanced English words

Format:
```json
[
  {
    "word": "tapper",
    "definition": "Som viser mot i farlige situasjoner",
    "cloze": "Soldaten var ___ i kamp.",
    "synonyms": ["modig", "djerv"]
  }
]
```

### Language setting

- Stored as `brainbout:vocab-lang` in localStorage (`"no"` or `"en"`)
- Default: `"no"` (Norwegian)
- Toggle button in the game page header (next to Skip)
- Switching language loads the other word file and uses that language's spaced repetition state

### Input

- Text input field, auto-focused
- Submit on Enter
- Case-insensitive matching
- Trim whitespace

## Game 4: Quick Math (unchanged)

- 60 seconds, adaptive difficulty (3 levels)
- +, −, ×, ÷ with 4-choice answers
- Level up on 5 consecutive correct, down on wrong
- Score = total correct

## Hub updates

### Game order
1. Chess960 Rapid (`rapid`)
2. Reaction Grid (`reaction`)
3. Word Recall (`vocab`)
4. Quick Math (`math`)

### Labels
- rapid: "Chess960 Rapid"
- reaction: "Reaction Grid"
- vocab: "Word Recall"
- math: "Quick Math"

### Score display
- rapid: "Won" / "Lost" / "Draw" / "Skipped"
- reaction/vocab/math: numeric score or "Skipped"

## Files

### New
- `src/games/reaction.ts` — Reaction Grid game
- `src/games/reaction.css` — reaction styles
- `games/reaction.html` — reaction page
- `test/reaction.test.ts` — reaction tests
- `src/games/vocab.ts` — Word Recall game
- `src/games/vocab.css` — vocab styles
- `games/vocab.html` — vocab page
- `test/vocab.test.ts` — vocab tests
- `public/words-no.json` — Norwegian word list
- `public/words-en.json` — English word list

### Rename
- `src/games/blitz.ts` → `src/games/rapid.ts`
- `src/games/blitz.css` → `src/games/rapid.css`
- `games/blitz.html` → `games/rapid.html`
- `test/blitz.test.ts` → `test/rapid.test.ts`

### Delete
- `src/games/memory.ts`, `src/games/memory.css`, `games/memory.html`, `test/memory.test.ts`
- `src/games/stroop.ts`, `src/games/stroop.css`, `games/stroop.html`, `test/stroop.test.ts`

### Modify
- `src/shared/progress.ts` — GAMES = `["rapid", "reaction", "vocab", "math"]`
- `src/hub.ts` — new labels, URLs, rapid score format
- `vite.config.ts` — swap entries for new pages
