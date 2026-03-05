# Brainbout v2 Design

Redesign from 4 games to 3, with a cross-cutting stage progression system.

## Games

### Crown (keep)

Chess960 rapid, 15+10 vs Stockfish. All stages are Chess960 — stages control Elo tiers only.

| Stage | Elo   | Notes                                    |
| :---- | :---- | :--------------------------------------- |
| 1     | ~600  | Beginner-friendly, engine blunders often |
| 2     | ~1200 | Intermediate, natural think time         |
| 3     | ~1600 | Advanced, faster responses               |

Readiness: win rate over last 5 games. 3/5 wins = green, 2/5 = amber, <2 = grey.

### Flux (new, replaces Spark + Tally)

Adaptive rule-switching game with inhibition. 60 seconds.

**Core mechanic**: A colored number appears center-screen. Two fixed buttons at bottom. Player classifies based on the active rule.

- **Rules**: COLOR (red or blue?) and NUMBER (odd or even?)
- **Rule cue**: Bold text label at top — "COLOR" or "NUMBER"
- **No-go trials**: ~20% of trials, the number appears in green. Player must not press.
- **Button labels**: Left = "Red / Odd", Right = "Blue / Even". Active pair is visually emphasized based on current rule.

**Warm-up (beginner-friendly)**:

- First 5 trials: COLOR-only, no rule switching, no no-go
- After warm-up: rule switching starts
- No-go trials introduced after first successful switch

**Rule switching**: Alternates every 4-6 trials (randomized). Brief "SWITCH" flash on transition.

**Scoring**: +1 correct, -1 wrong, -1 no-go fail. Speed bonus for fast correct answers.

**Adaptation (accuracy-gated)**:

- Starting interval: 2000ms
- 5 consecutive correct: speed up 75ms
- Wrong answer: slow down 150ms
- Floor: 800ms

**Feedback**: Correct = green flash + sound. Wrong = red flash + "It was [X]". No-go fail = "Don't press on green!"

**Stages**:

| Stage | Changes                                            |
| :---- | :------------------------------------------------- |
| 1     | 2000ms start, switches every 6 trials              |
| 2     | 1500ms start, switches every 4-6 trials            |
| 3     | 1200ms start, switches every 3-5 trials, 25% no-go |

Readiness: accuracy over last 5 sessions. 80%+ correct = green, 70-79% = amber, <70% = grey.

### Cipher (upgraded)

Norwegian vocabulary with per-word mastery progression. 120 seconds.

**Per-word mastery levels**:

| Level | Mode         | Input                                               |
| :---- | :----------- | :-------------------------------------------------- |
| 0     | MCQ          | Pick correct word from 4 choices (same as current)  |
| 1     | Hinted cloze | First 2 letters given, type the rest + autocomplete |
| 2     | Naked cloze  | Empty input, type from memory + autocomplete        |

**Mastery promotion**: 3 consecutive correct at same level promotes to next level. Wrong answer resets counter (no demotion).

**Session mix**: 30% new words (Level 0 MCQ), 70% review (at their current mastery level).

**Typed input with autocomplete**:

- Input auto-focuses on cloze rounds
- Floating dropdown appears after 2+ characters typed
- Shows up to 5 fuzzy matches (prefix match first, then Levenshtein distance <= 2)
- Arrow keys navigate, Enter or click selects
- Direct submission: Levenshtein <= 1 from answer = accept
- Visual: full-width input, bottom-bordered, `var(--ctp-surface1)` dropdown with matching prefix highlighted in `var(--ctp-blue)`, staggered slide-in animation

**Stages**:

| Stage | Changes                                         |
| :---- | :---------------------------------------------- |
| 1     | All words are MCQ regardless of mastery         |
| 2     | Per-word mastery unlocks hinted cloze (Level 1) |
| 3     | Per-word mastery unlocks naked cloze (Level 2)  |

Readiness: accuracy over last 5 sessions. 80%+ correct = green, 70-79% = amber, <70% = grey.

## Stage Progression System

Cross-cutting, per-game, manual advancement.

**Readiness indicator**: Colored dot on the game card.

- Grey: Stage 1 or not enough data
- Amber (pulse animation): Close to threshold but not there
- Green (glow): Ready to advance

**Advance action**: When green, an "Advance" button appears inline on the card. Player taps it to manually advance. No auto-advancement.

**Previous Stage**: Available when at stage 2+. Lets the player step back.

**Transparency**: Tapping the readiness dot shows a tooltip explaining the current state (e.g. "3/5 recent wins" or "Need 2 more correct sessions").

**Data storage**: `localStorage` per game:

```
brainbout:stage:<gameId> → { stage: 2, history: [1, 1, 0, 1, 1] }
```

## Hub Redesign

**3 games**: Crown, Flux, Cipher. Session = all 3 completed.

**Card layout** (inline stage display):

```
[icon] Crown · Stage 2  [amber dot]
[icon] Flux · Stage 1   [grey dot]
[icon] Cipher · Stage 3  [green dot] [Advance]
```

**Session time**: ~18 minutes (Crown 15min + Flux 60s + Cipher 120s).

## Removals

- Spark (reaction.ts, reaction.css, reaction.html) — replaced by Flux
- Tally (math.ts, math.css, math.html) — replaced by Flux
- Hub references to 4 games → 3 games
- `GAMES` array in progress.ts: `["rapid", "flux", "vocab"]`
- README updated with new game count and descriptions

## Implementation Order

1. Add Flux game (new files, new Vite entry)
2. Upgrade Cipher with per-word mastery and autocomplete input
3. Add stage progression system (shared module + hub integration)
4. Wire stages into Crown (Elo tiers)
5. Wire stages into Flux (interval/frequency params)
6. Wire stages into Cipher (gate mastery levels)
7. Remove Spark and Tally, update hub, README, vite config
