# Repeatable Sessions + Inline Stats — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Change the app from "once per day" to freely repeatable sessions, remove skip buttons, add expandable inline stats on the hub.

**Architecture:** Replace the daily-score storage model with session-count + best-score tracking. Hub manages current session state in memory, reads `?completed=<game>` from URL to track progress. Collapsible stats section rendered below the game list.

**Tech Stack:** TypeScript, localStorage, vitest, Vite multi-page.

---

### Task 1: Rewrite progress module

**Files:**

- Modify: `src/shared/progress.ts`
- Modify: `test/progress.test.ts`

**Step 1: Write the failing tests**

Replace the entire contents of `test/progress.test.ts` with:

```typescript
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import {
  GAMES,
  recordSessionScore,
  completeSession,
  getBest,
  getTodayBest,
  getSessionsToday,
  getTotalSessions,
  getStreak,
  todayString,
} from "../src/shared/progress";

beforeEach(() => {
  localStorage.clear();
});

describe("recordSessionScore", () => {
  it("updates all-time best when higher", () => {
    recordSessionScore("math", 5);
    recordSessionScore("math", 8);
    recordSessionScore("math", 3);
    expect(getBest("math")).toBe(8);
  });

  it("updates today-best when higher", () => {
    recordSessionScore("math", 5);
    recordSessionScore("math", 8);
    recordSessionScore("math", 3);
    expect(getTodayBest("math")).toBe(8);
  });

  it("returns null for unplayed games", () => {
    expect(getBest("math")).toBeNull();
    expect(getTodayBest("math")).toBeNull();
  });
});

describe("completeSession", () => {
  it("increments sessions today", () => {
    expect(getSessionsToday()).toBe(0);
    completeSession();
    expect(getSessionsToday()).toBe(1);
    completeSession();
    expect(getSessionsToday()).toBe(2);
  });

  it("increments total sessions", () => {
    expect(getTotalSessions()).toBe(0);
    completeSession();
    completeSession();
    expect(getTotalSessions()).toBe(2);
  });
});

describe("getStreak", () => {
  it("returns 0 with no history", () => {
    expect(getStreak("2026-02-27")).toBe(0);
  });

  it("returns 1 when today has a session", () => {
    // Simulate a session on a specific date by writing directly
    localStorage.setItem("brainbout:sessions:2026-02-27", "1");
    expect(getStreak("2026-02-27")).toBe(1);
  });

  it("counts consecutive days", () => {
    localStorage.setItem("brainbout:sessions:2026-02-25", "2");
    localStorage.setItem("brainbout:sessions:2026-02-26", "1");
    localStorage.setItem("brainbout:sessions:2026-02-27", "3");
    expect(getStreak("2026-02-27")).toBe(3);
  });

  it("breaks on missed day", () => {
    localStorage.setItem("brainbout:sessions:2026-02-25", "1");
    localStorage.setItem("brainbout:sessions:2026-02-27", "1");
    expect(getStreak("2026-02-27")).toBe(1);
  });
});

describe("todayString", () => {
  it("returns YYYY-MM-DD format", () => {
    expect(todayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("GAMES", () => {
  it("has four games", () => {
    expect(GAMES).toEqual(["rapid", "reaction", "vocab", "math"]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/progress.test.ts`
Expected: FAIL — missing exports

**Step 3: Rewrite progress.ts**

Replace the entire contents of `src/shared/progress.ts` with:

```typescript
export const GAMES = ["rapid", "reaction", "vocab", "math"] as const;
export type GameId = (typeof GAMES)[number];

const PREFIX = "brainbout";

function key(...parts: string[]): string {
  return `${PREFIX}:${parts.join(":")}`;
}

function formatDate(d: Date): string {
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayString(): string {
  return formatDate(new Date());
}

export function getBest(game: GameId): number | null {
  const val = localStorage.getItem(key("best", game));
  return val === null ? null : Number(val);
}

export function getTodayBest(game: GameId): number | null {
  const today = todayString();
  const val = localStorage.getItem(key("today-best", today, game));
  return val === null ? null : Number(val);
}

export function recordSessionScore(game: GameId, score: number): void {
  const today = todayString();

  // Update today-best
  const prevToday = getTodayBest(game);
  if (prevToday === null || score > prevToday) {
    localStorage.setItem(key("today-best", today, game), String(score));
  }

  // Update all-time best
  const prevBest = getBest(game);
  if (prevBest === null || score > prevBest) {
    localStorage.setItem(key("best", game), String(score));
  }
}

export function getSessionsToday(): number {
  const today = todayString();
  const val = localStorage.getItem(key("sessions", today));
  return val === null ? 0 : Number(val);
}

export function getTotalSessions(): number {
  const val = localStorage.getItem(key("total-sessions"));
  return val === null ? 0 : Number(val);
}

export function completeSession(): void {
  const today = todayString();

  const todayCount = getSessionsToday();
  localStorage.setItem(key("sessions", today), String(todayCount + 1));

  const total = getTotalSessions();
  localStorage.setItem(key("total-sessions"), String(total + 1));
}

export function getStreak(today: string): number {
  let streak = 0;
  const d = new Date(today + "T00:00:00");
  while (true) {
    const val = localStorage.getItem(key("sessions", formatDate(d)));
    if (val === null || Number(val) < 1) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/progress.test.ts`
Expected: all tests PASS

**Step 5: Commit**

```bash
git add src/shared/progress.ts test/progress.test.ts
git commit -m "refactor: progress module for repeatable sessions"
```

---

### Task 2: Remove skip button from all pages

**Files:**

- Modify: `src/style.css` (remove `.skip-btn` styles)
- Modify: `games/rapid.html` (remove skip button + unwrap div if only theme-btn remains)
- Modify: `games/reaction.html` (same)
- Modify: `games/vocab.html` (remove skip button, keep lang-toggle + theme-btn in div)
- Modify: `games/math.html` (same as rapid)
- Modify: `src/games/rapid.ts` (remove skip event listener and SKIP_SCORE import)
- Modify: `src/games/reaction.ts` (remove skip event listener and SKIP_SCORE import)
- Modify: `src/games/vocab.ts` (remove skip event listener and SKIP_SCORE import)
- Modify: `src/games/math.ts` (remove skip event listener and SKIP_SCORE import)

**Step 1: Remove `.skip-btn` and `.skip-btn:hover` rules from `src/style.css`**

Delete lines containing `.skip-btn { ... }` and `.skip-btn:hover { ... }` blocks (currently lines 75-88).

**Step 2: Remove skip button from each HTML file**

In `games/rapid.html`, `games/reaction.html`, `games/math.html`: remove the `<button class="skip-btn" ...>` element. Since the `<div>` wrapper now only contains the theme-btn, unwrap it — just keep the theme-btn directly in the header (no wrapper div needed for a single button).

In `games/vocab.html`: remove only the skip button line, keep the `<div>` wrapper (it still has theme-btn + lang-btn).

**Step 3: Remove skip handler from each TS file**

In each game TS file, remove:

- The import of `SKIP_SCORE` from progress
- The import of `recordScore` and `todayString` (replace with `recordSessionScore` — done in Task 3)
- The `document.getElementById("skip-btn")?.addEventListener(...)` block

For now, just remove the skip-related code. Task 3 will update the score recording.

**Step 4: Run tests + lint**

Run: `npx vitest run && npx eslint src/ test/`
Expected: pass (skip code is removed, score recording may have temporary type errors — that's OK, fixed in Task 3)

**Step 5: Commit**

```bash
git add src/style.css games/*.html src/games/*.ts
git commit -m "refactor: remove skip button from all pages"
```

---

### Task 3: Update game pages to use new progress API

**Files:**

- Modify: `src/games/rapid.ts`
- Modify: `src/games/reaction.ts`
- Modify: `src/games/vocab.ts`
- Modify: `src/games/math.ts`

**Step 1: Update imports and score recording in each file**

In all 4 game TS files:

- Replace `import { recordScore, todayString, SKIP_SCORE } from "../shared/progress"` with `import { recordSessionScore } from "../shared/progress"`
- Replace all calls to `recordScore("game", score, todayString())` with `recordSessionScore("game", score)`

In `rapid.ts`: the `finishGame` function calls `recordScore("rapid", result, todayString())` — change to `recordSessionScore("rapid", result)`.

In `reaction.ts`: the `showResult` function calls `recordScore("reaction", score, todayString())` — change to `recordSessionScore("reaction", score)`.

In `vocab.ts`: the `showResult` function calls `recordScore("vocab", finalScore, todayString())` — change to `recordSessionScore("vocab", finalScore)`.

In `math.ts`: the `showResult` function calls `recordScore("math", score, todayString())` — change to `recordSessionScore("math", score)`.

**Step 2: Update "Back to Hub" navigation to pass completion**

In all 4 game files, the "Back to Hub" button navigates to `"../"`. Change to `"../?completed=<game>"`:

- rapid.ts: `window.location.href = "../?completed=rapid"`
- reaction.ts: `window.location.href = "../?completed=reaction"`
- vocab.ts: `window.location.href = "../?completed=vocab"`
- math.ts: `window.location.href = "../?completed=math"`

**Step 3: Run tests + lint + build**

Run: `npx vitest run && npx eslint src/ test/ && npx vite build`
Expected: all pass

**Step 4: Commit**

```bash
git add src/games/*.ts
git commit -m "refactor: game pages use new session score API"
```

---

### Task 4: Rewrite hub with session flow and inline stats

**Files:**

- Modify: `src/hub.ts`
- Modify: `src/hub.css`

**Step 1: Rewrite hub.ts**

Replace the entire contents of `src/hub.ts`:

```typescript
import { initTheme, wireToggle } from "./shared/theme";
import {
  GAMES,
  type GameId,
  todayString,
  getStreak,
  getSessionsToday,
  getTotalSessions,
  getBest,
  getTodayBest,
  completeSession,
} from "./shared/progress";

const GAME_LABELS: Record<string, string> = {
  rapid: "Chess960 Rapid",
  reaction: "Reaction Grid",
  vocab: "Word Recall",
  math: "Quick Math",
};

const GAME_URLS: Record<string, string> = {
  rapid: "games/rapid.html",
  reaction: "games/reaction.html",
  vocab: "games/vocab.html",
  math: "games/math.html",
};

function formatScore(game: string, score: number): string {
  if (game === "rapid") {
    if (score === 1) return "Won";
    if (score === 0.5) return "Draw";
    return "Lost";
  }
  return String(score);
}

// --- Session state (in-memory) ---

const session = new Set<GameId>();

// Read completed game from URL params
const params = new URLSearchParams(window.location.search);
const completedParam = params.get("completed");
if (
  completedParam !== null &&
  (GAMES as readonly string[]).includes(completedParam)
) {
  session.add(completedParam as GameId);
  // Restore previously completed games from sessionStorage
  const stored = sessionStorage.getItem("brainbout:current-session");
  if (stored !== null) {
    for (const g of JSON.parse(stored) as string[]) {
      if ((GAMES as readonly string[]).includes(g)) session.add(g as GameId);
    }
  }
  // Persist current session to sessionStorage (survives game-page navigations)
  sessionStorage.setItem(
    "brainbout:current-session",
    JSON.stringify([...session]),
  );
  // Clean URL
  window.history.replaceState({}, "", window.location.pathname);
} else {
  // Restore session from sessionStorage on plain hub load
  const stored = sessionStorage.getItem("brainbout:current-session");
  if (stored !== null) {
    for (const g of JSON.parse(stored) as string[]) {
      if ((GAMES as readonly string[]).includes(g)) session.add(g as GameId);
    }
  }
}

// Check if session just completed
let sessionJustCompleted = false;
if (session.size === GAMES.length) {
  completeSession();
  sessionJustCompleted = true;
}

function nextGame(): GameId | null {
  for (const game of GAMES) {
    if (!session.has(game)) return game;
  }
  return null;
}

function startNewSession(): void {
  session.clear();
  sessionStorage.removeItem("brainbout:current-session");
  render(); // eslint-disable-line @typescript-eslint/no-use-before-define -- called from event handler
}

// --- Render ---

function render(): void {
  const hub = document.getElementById("hub");
  if (!hub) return;

  const today = todayString();
  const streak = getStreak(today);
  const sessionsToday = getSessionsToday();
  const next = nextGame();

  let html = "";

  // Header stats
  html += `<div class="hub-stats-bar">`;
  if (streak > 0)
    html += `<span class="streak-badge">${String(streak)}-day streak</span>`;
  if (sessionsToday > 0)
    html += `<span class="sessions-badge">${String(sessionsToday)} session${sessionsToday === 1 ? "" : "s"} today</span>`;
  html += `</div>`;

  // Game list
  html += `<div class="game-list">`;
  for (const game of GAMES) {
    const done = session.has(game);
    const current = game === next;
    const cls = done ? "done" : current ? "current" : "";

    html += `<div class="game-card ${cls}">`;
    html += `<span class="game-name">${GAME_LABELS[game]}</span>`;
    if (done) {
      html += `<span class="game-check">✓</span>`;
    }
    html += `</div>`;
  }
  html += `</div>`;

  // Action button
  if (sessionJustCompleted) {
    html += `<button id="new-session-btn">New Session</button>`;
  } else if (next !== null) {
    html += `<button id="start-btn">${session.size === 0 ? "Start" : "Next"}</button>`;
  }

  // Collapsible stats
  html += `<details class="stats-panel">`;
  html += `<summary>Stats</summary>`;
  html += `<div class="stats-content">`;

  html += `<h3>All-time best</h3>`;
  html += `<div class="stats-grid">`;
  for (const game of GAMES) {
    const best = getBest(game);
    html += `<div class="stat-row"><span>${GAME_LABELS[game]}</span><span class="stat-value">${best !== null ? formatScore(game, best) : "—"}</span></div>`;
  }
  html += `</div>`;

  const hasTodayBests = GAMES.some((g) => getTodayBest(g) !== null);
  if (hasTodayBests) {
    html += `<h3>Today's best</h3>`;
    html += `<div class="stats-grid">`;
    for (const game of GAMES) {
      const todayBest = getTodayBest(game);
      html += `<div class="stat-row"><span>${GAME_LABELS[game]}</span><span class="stat-value">${todayBest !== null ? formatScore(game, todayBest) : "—"}</span></div>`;
    }
    html += `</div>`;
  }

  html += `<div class="stat-row stat-total"><span>Total sessions</span><span class="stat-value">${String(getTotalSessions())}</span></div>`;

  html += `</div></details>`;

  hub.innerHTML = html;

  // Wire buttons
  const startBtn = document.getElementById("start-btn");
  if (startBtn && next !== null) {
    startBtn.addEventListener("click", () => {
      window.location.href = GAME_URLS[next];
    });
  }

  const newBtn = document.getElementById("new-session-btn");
  if (newBtn) {
    newBtn.addEventListener("click", startNewSession);
  }
}

render();

initTheme();
wireToggle();
```

**Step 2: Rewrite hub.css**

Replace the entire contents of `src/hub.css`:

```css
.hub-stats-bar {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.streak-badge,
.sessions-badge {
  font-size: 0.85rem;
  color: var(--ctp-subtext0);
  padding: 0.2rem 0.6rem;
  background: var(--ctp-surface0);
  border-radius: 6px;
  box-shadow: var(--ctp-shadow);
  transition: background-color 0.25s ease;
}

.streak-badge {
  color: var(--ctp-peach);
}

.game-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.game-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: var(--ctp-surface0);
  border-radius: 6px;
  box-shadow: var(--ctp-shadow);
  transition:
    background-color 0.25s ease,
    box-shadow 0.25s ease,
    opacity 0.25s ease;
}

.game-card.done {
  opacity: 0.6;
}

.game-card.current {
  border-left: 3px solid var(--ctp-blue);
  box-shadow: var(--ctp-shadow-lg);
}

.game-name {
  font-size: 0.95rem;
}

.game-check {
  color: var(--ctp-green);
}

#start-btn,
#new-session-btn {
  width: 100%;
  padding: 0.75rem;
  background: var(--ctp-blue);
  color: var(--ctp-mantle);
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--ctp-shadow);
  transition:
    background-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.1s ease;
}

#start-btn:hover,
#new-session-btn:hover {
  box-shadow: var(--ctp-shadow-lg);
  transform: translateY(-1px);
}

#start-btn:active,
#new-session-btn:active {
  transform: translateY(0);
  box-shadow: none;
}

#start-btn:focus-visible,
#new-session-btn:focus-visible {
  outline: none;
  box-shadow: var(--ctp-focus-ring);
}

/* --- Stats panel --- */

.stats-panel {
  margin-top: 1.5rem;
}

.stats-panel summary {
  font-size: 0.9rem;
  color: var(--ctp-subtext0);
  cursor: pointer;
  padding: 0.5rem 0;
  transition: color 0.15s ease;
}

.stats-panel summary:hover {
  color: var(--ctp-text);
}

.stats-panel[open] summary {
  margin-bottom: 0.75rem;
}

.stats-content h3 {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ctp-subtext0);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.4rem;
  margin-top: 0.75rem;
}

.stats-content h3:first-child {
  margin-top: 0;
}

.stats-grid {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  padding: 0.3rem 0;
}

.stat-value {
  color: var(--ctp-text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.stat-total {
  margin-top: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--ctp-surface1);
  color: var(--ctp-subtext0);
}
```

**Step 3: Run full test suite + lint + build**

Run: `npx vitest run && npx eslint src/ test/ && npx vite build`
Expected: all pass

**Step 4: Commit**

```bash
git add src/hub.ts src/hub.css
git commit -m "feat: hub with repeatable sessions and inline stats"
```

---

### Task 5: Update tests for removed exports and final verification

**Files:**

- Modify: `test/progress.test.ts` (already done in Task 1, but verify no other test imports old APIs)
- Run: full test suite, lint, build

**Step 1: Search for stale imports**

Grep across `test/` and `src/` for removed exports: `SKIP_SCORE`, `getDailyScore`, `isDayComplete`, `isSkipped`, `nextGame`, `recordScore`.

If any remain, remove or update them.

**Step 2: Run full verification**

Run: `npx vitest run && npx eslint src/ test/ && npx vite build`
Expected: all pass, zero warnings

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: lint, test, and final verification"
```
