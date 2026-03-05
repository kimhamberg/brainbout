# Hub Stats Redesign

## Problem

The hub stats are hidden behind a plain `<details>` collapsible that looks like an afterthought. Per-game "best scores" are generic numbers that don't reflect what each game actually measures. Over half the phone viewport is empty space.

## Design

### Header — centered brand moment

Large brain icon (~48px) centered above "Brainbout" title. Theme toggle absolute-positioned top-right. Streak and sessions-today badges centered below. ~120px total height.

### Game cards — expanded with personality

Each card grows from 1 line to 3 lines:

- **Line 1:** Icon + game name + stage + readiness dot (right-aligned)
- **Line 2:** Tagline in subdued text (--ctp-subtext0)
- **Line 3:** Key stat in the game's accent color (hidden until first play)

Taglines:
- Crown: "Outsmart Stockfish"
- Flux: "Think fast, switch faster"
- Cipher: "Crack the Norwegian code"

Per-game stats:
- Crown: "X checkmates at Y Elo" — tracks checkmate wins at each Elo tier
- Flux: "Best: X pts" — existing best score
- Cipher: "X words mastered" — count of words with mastery >= threshold

Cards start shorter (2 lines) on fresh install and grow to 3 lines once stats exist — feels like progression.

### Footer

Total sessions as a quiet centered line below cards. No interaction needed.

### Removed

- `<details class="stats-panel">` and all its contents
- All-time best / today's best grids
- Session completion summary modal (scores are now visible on cards)

## Data changes

### New: Crown checkmate tracking

`progress.ts` gets `recordCheckmate(elo: number)` and `getCheckmates(elo: number): number`. Key format: `brainbout:checkmates:{elo}`. Called from `crown.ts` when game ends in checkmate (not just win — distinguish from resignation/timeout).

### New: Cipher mastered word count

`cipher-srs.ts` gets `getMasteredCount(lang: string): number`. Iterates localStorage keys with the cipher prefix and counts entries where mastery >= threshold. Called from hub to display stat.

### Existing: Flux best score

Already tracked via `getBest("flux")` in `progress.ts`. No changes needed.

## Viewport budget (Pixel 8a, ~412x732 usable)

- Header (centered icon + title + toggle): ~120px
- Badges (streak + sessions): ~32px
- 3 game cards at ~96px each with gaps: ~300px
- Footer (total sessions): ~32px
- **Total: ~484px** — leaves ~248px breathing room
