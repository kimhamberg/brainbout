# Repeatable Sessions + Inline Stats

## Goal

Change the app from "one session per day" to freely repeatable sessions, with an expandable stats section on the hub page. Remove skip buttons.

## Current State

- Progress model enforces one score per game per day (`brainbout:daily:<date>:<game>`)
- Hub shows "All done for today!" after completing all 4 games
- Skip button on every game page allows bypassing with SKIP_SCORE sentinel
- Streak counts consecutive days where all 4 games have a recorded score

## Design

### Data Model (progress.ts)

**Remove:** `brainbout:daily:<date>:<game>`, `SKIP_SCORE`, `isSkipped()`, `nextGame()` based on daily scores, `getDailyScore()`, `isDayComplete()`.

**Keep:** `brainbout:best:<game>` (all-time best per game).

**Add:**
- `brainbout:today-best:<date>:<game>` — best score for each game today (updates if beaten)
- `brainbout:sessions:<date>` — completed session count for a day
- `brainbout:total-sessions` — all-time session count

**New exports:**
- `recordSessionScore(game, score)` — saves to today-best (if higher) + all-time best (if higher)
- `completeSession()` — increments session counts
- `getTodayBest(game)` → number | null
- `getSessionsToday()` → number
- `getTotalSessions()` → number
- `getStreak(today)` — consecutive days with sessions >= 1

**Removed exports:** `SKIP_SCORE`, `isSkipped()`, `getDailyScore()`, `isDayComplete()`, `nextGame()`.

### Hub (hub.ts + hub.css)

**Session state (in-memory, not persisted):**
- `currentSession: Set<GameId>` tracks which games are complete this session
- The hub reads URL search params: when a game page navigates back with `?completed=rapid`, the hub adds it to the set
- When `currentSession.size === 4`: call `completeSession()`, show summary, offer "New Session"

**Layout:**
- Header: streak + sessions-today count
- Game list: shows current session progress (check mark for done, arrow for next, dim for upcoming)
- Button: "Start" / "Next" / "New Session" depending on state
- Collapsible stats section below: all-time bests, today's bests, total sessions

### Game Pages

- Remove skip button from all HTML and TS files
- Remove `.skip-btn` CSS from style.css
- Each game calls `recordSessionScore(game, score)` instead of `recordScore(game, score, todayString())`
- "Back to Hub" navigates to `../?completed=<game>` so the hub knows the game was played

### Files Changed

| File | Change |
|------|--------|
| `src/shared/progress.ts` | New data model, new exports, remove daily/skip |
| `test/progress.test.ts` | Rewrite for new model |
| `src/hub.ts` | Session state, stats section, new flow |
| `src/hub.css` | Stats styles, updated card states |
| `src/style.css` | Remove `.skip-btn` |
| `games/rapid.html` | Remove skip button |
| `games/reaction.html` | Remove skip button |
| `games/vocab.html` | Remove skip button |
| `games/math.html` | Remove skip button |
| `src/games/rapid.ts` | Remove skip handler, use recordSessionScore |
| `src/games/reaction.ts` | Remove skip handler, use recordSessionScore |
| `src/games/vocab.ts` | Remove skip handler, use recordSessionScore |
| `src/games/math.ts` | Remove skip handler, use recordSessionScore |
