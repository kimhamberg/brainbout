# Human-Like Engine Experience Design

## Goal

Make playing Chess960 rapid feel like playing a real human opponent, not a machine.

## Approach

UCI_Elo for human-like move errors + node cap derived from Elo for computational realism + synthetic think delay + real opponent clock.

## 1. Engine Personality System

**Per-game Elo selection:**
- Random Elo in [1200, 1800] (uniform)
- `UCI_LimitStrength true` + `UCI_Elo {elo}`
- Base node cap from Duhamel formula: `nodes = Math.round(Math.exp((elo + 839) / 243))`
  - ~1,500 nodes at 1200 Elo, ~25,000 nodes at 1800 Elo

**Per-move variance:**
- Multiplier on base node cap: `actualNodes = baseNodes * (0.7 + random * 0.6)` (0.7x-1.3x)
- Time trouble (<60s on engine clock): cap nodes at 50% of base
- Engine searches with `go nodes {actualNodes}`

## 2. Think Time Model (Chess960-aware)

No opening theory in Chess960 -- early moves need real thought, not autopilot.

**Time budget allocation:**
- Early game (moves 1-8): 8-15s. Figuring out piece development from scratch.
- Middlegame (moves 9-30): 10-25s. Critical decisions.
- Endgame (moves 31+): 5-15s. Positions simplify.
- Time trouble (<60s): 1-3s. Panic mode.

**Per-move formula:**
1. `baseTime = remainingTime / max(10, 40 - moveNumber)`
2. Complexity factor from Stockfish eval swing between depths:
   - Large eval swing = complex = 1.5-2x
   - Stable eval = simple = 0.5-0.8x
   - Recapture/forced = very fast = 0.3x
3. Save increment awareness for later moves
4. Clamp to [1s, min(30s, remainingTime - 5s)]
5. Add +/-20% jitter

**Implementation:** Engine search completes fast (<1s WASM). Synthetic delay fills the rest. During delay, engine clock ticks.

**Complexity detection:** Parse `info` lines for `score cp` at different depths. Large swings = complex position.

## 3. Engine Clock System

**Architecture:**
- Engine clock starts at 15:00, same as player
- Ticks during engine's think phase (synthetic delay)
- +10s increment after engine moves
- Can flag (engine clock hits 0 = player wins)

**Think time safety:** Clamped to `remainingTime - 5s`. Won't intentionally flag, but can in extreme time trouble.

**UI:**
- Engine clock at top of board, player clock at bottom
- Active clock = normal color, paused clock = dimmed
- Same styling and low-time warning (<60s turns red)

## 4. Files Changed

| File | Change |
|------|--------|
| `src/shared/engine.ts` | `go nodes X` instead of `go depth 8`. Parse `info` eval lines. UCI_Elo/UCI_LimitStrength setup. |
| `src/games/rapid.ts` | Engine clock state, think time computation, synthetic delay, engine flag detection, per-game Elo selection. |
| `src/main.ts` / rapid UI | Render engine clock display. |
| CSS | Engine clock styling, active/paused states. |
| `src/shared/think-time.ts` (new) | Think time model: remaining time + move number + complexity + Elo -> think duration ms. |

**Unchanged:** Sounds, Chess960 position generation, Chessground board, progress/scoring.
