# Hub Stats Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hidden stats collapsible with a centered header, expanded game cards showing taglines + per-game stats, and a minimal footer.

**Architecture:** Data layer first (checkmate tracking, mastered count), then Crown integration, then UI changes (header, cards, footer). TDD for data layer; visual changes verified manually + lint.

**Tech Stack:** TypeScript, Vite, Vitest, Catppuccin CSS custom properties, localStorage.

---

### Task 1: Add checkmate tracking to progress.ts

**Files:**
- Modify: `src/shared/progress.ts`
- Modify: `test/progress.test.ts`

**Step 1: Write the failing tests**

Add to `test/progress.test.ts`:

```ts
import {
  // ... existing imports ...
  recordCheckmate,
  getCheckmates,
} from "../src/shared/progress";

describe("checkmate tracking", () => {
  it("returns 0 for untracked elo", () => {
    expect(getCheckmates(600)).toBe(0);
  });

  it("increments checkmate count", () => {
    recordCheckmate(1200);
    recordCheckmate(1200);
    expect(getCheckmates(1200)).toBe(2);
  });

  it("tracks different elos independently", () => {
    recordCheckmate(600);
    recordCheckmate(1200);
    recordCheckmate(1200);
    expect(getCheckmates(600)).toBe(1);
    expect(getCheckmates(1200)).toBe(2);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- test/progress.test.ts`
Expected: FAIL — `recordCheckmate` and `getCheckmates` not exported

**Step 3: Write minimal implementation**

Add to `src/shared/progress.ts`:

```ts
export function getCheckmates(elo: number): number {
  const val = localStorage.getItem(key("checkmates", String(elo)));
  return val === null ? 0 : Number(val);
}

export function recordCheckmate(elo: number): void {
  const count = getCheckmates(elo);
  localStorage.setItem(key("checkmates", String(elo)), String(count + 1));
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- test/progress.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/progress.ts test/progress.test.ts
git commit -m "feat: track checkmate wins per Elo tier"
```

---

### Task 2: Add mastered word count to cipher-srs.ts

**Files:**
- Modify: `src/games/cipher-srs.ts`
- Modify: `test/cipher-srs.test.ts`

**Step 1: Write the failing test**

Add to `test/cipher-srs.test.ts`:

```ts
import {
  // ... existing imports ...
  getMasteredCount,
} from "../src/games/cipher-srs";

describe("getMasteredCount", () => {
  it("returns 0 with no data", () => {
    expect(getMasteredCount("no")).toBe(0);
  });

  it("counts words at max mastery", () => {
    // MAX_MASTERY is 2, MASTERY_THRESHOLD is 3 consecutive correct
    // So we need 6 correct answers (3 to reach mastery 1, 3 more to reach mastery 2)
    const today = "2026-03-05";
    for (let i = 0; i < 6; i++) recordAnswer("no", "hund", true, today);
    for (let i = 0; i < 6; i++) recordAnswer("no", "katt", true, today);
    recordAnswer("no", "bil", true, today); // only 1 correct, not mastered
    expect(getMasteredCount("no")).toBe(2);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- test/cipher-srs.test.ts`
Expected: FAIL — `getMasteredCount` not exported

**Step 3: Write minimal implementation**

Add to `src/games/cipher-srs.ts`:

```ts
export function getMasteredCount(lang: string): number {
  const prefix = `${PREFIX}:${lang}:`;
  let count = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k !== null && k.startsWith(prefix)) {
      const raw = localStorage.getItem(k);
      if (raw !== null) {
        const parsed = JSON.parse(raw) as Partial<WordState>;
        if ((parsed.mastery ?? 0) >= MAX_MASTERY) count++;
      }
    }
  }
  return count;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- test/cipher-srs.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/games/cipher-srs.ts test/cipher-srs.test.ts
git commit -m "feat: add getMasteredCount for Cipher word mastery"
```

---

### Task 3: Record checkmates in crown.ts

**Files:**
- Modify: `src/games/crown.ts`

**Step 1: Add import**

Add `recordCheckmate` to the import from `../shared/progress`:

```ts
import { recordSessionScore, recordCheckmate } from "../shared/progress";
```

**Step 2: Call recordCheckmate on player checkmate win**

In `checkGameEnd()` (~line 150), after `pos.isCheckmate()` is true and `winner === playerColor`, add the call:

```ts
if (pos.isCheckmate()) {
  const winner = pos.turn === "white" ? "black" : "white";
  clock.stop();
  engineClock.stop();
  gameOver = true;
  const result = winner === playerColor ? 1 : 0;
  if (result === 1) recordCheckmate(engineElo);
  finishGame(
    result,
    winner === playerColor ? "Checkmate — you win!" : "Checkmate — you lose",
  );
  return true;
}
```

**Step 3: Run tests**

Run: `npm test`
Expected: All 113 tests PASS (no new test needed — this is a wiring change)

**Step 4: Commit**

```bash
git add src/games/crown.ts
git commit -m "feat: record checkmate wins per Elo in Crown"
```

---

### Task 4: Redesign hub header to centered layout

**Files:**
- Modify: `index.html`
- Modify: `src/hub.css`
- Modify: `src/style.css`

**Step 1: Update index.html header**

Replace the current `<header>` block with a centered layout. The brain SVG icon gets `width="48" height="48"`. The theme toggle button moves inside header but is positioned absolutely.

```html
<header class="hub-header">
  <button
    class="theme-toggle"
    id="theme-btn"
    aria-label="Toggle theme"
  ></button>
  <svg
    class="hub-icon"
    width="48"
    height="48"
    viewBox="0 0 24 24"
    fill="none"
    stroke="url(#hub-grad)"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <defs>
      <linearGradient id="hub-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="var(--ctp-blue)" />
        <stop offset="100%" stop-color="var(--ctp-peach)" />
      </linearGradient>
    </defs>
    <path d="M12 18V5" />
    <path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" />
    <path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" />
    <path d="M17.997 5.125a4 4 0 0 1 2.526 5.77" />
    <path d="M18 18a4 4 0 0 0 2-7.464" />
    <path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" />
    <path d="M6 18a4 4 0 0 1-2-7.464" />
    <path d="M6.003 5.125a4 4 0 0 0-2.526 5.77" />
  </svg>
  <h1><span class="hub-title">Brainbout</span></h1>
</header>
```

**Step 2: Update hub.css for centered header**

Replace the `.hub-title` and `.hub-icon` rules and add `.hub-header`:

```css
.hub-header {
  position: relative;

  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;

  margin-bottom: 1rem;
  padding-top: 0.5rem;

  & h1 {
    font-size: 1.5rem;
  }

  & .theme-toggle {
    position: absolute;
    top: 0.5rem;
    right: 0;
  }
}
```

**Step 3: Update style.css header rules**

The global `header` rule in style.css uses `display: flex; justify-content: space-between`. The hub now uses `.hub-header` which overrides this. The game pages still use the old `<header>` layout, so keep the global rule but scope it so `.hub-header` wins.

**Step 4: Update hub.css badges to center**

```css
.hub-stats-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: center;
  margin-bottom: 1rem;
}
```

**Step 5: Verify visually**

Run: `make dev` and check the hub in browser.

**Step 6: Commit**

```bash
git add index.html src/hub.css src/style.css
git commit -m "feat: centered hub header with large brain icon"
```

---

### Task 5: Expand game cards with taglines and per-game stats

**Files:**
- Modify: `src/hub.ts`
- Modify: `src/hub.css`

**Step 1: Add imports and data maps to hub.ts**

Add imports:

```ts
import { getCheckmates } from "./shared/progress";
import { getMasteredCount } from "./games/cipher-srs";
```

Add new data maps after existing ones:

```ts
const GAME_TAGLINES: Record<string, string> = {
  crown: "Outsmart Stockfish",
  flux: "Think fast, switch faster",
  cipher: "Crack the Norwegian code",
};
```

Add a function to get per-game stat lines:

```ts
function getGameStat(game: string): string | null {
  if (game === "crown") {
    const stage = getStage(game);
    const eloByStage = [0, 600, 1200, 1600];
    const elo = eloByStage[stage] ?? 1200;
    const mates = getCheckmates(elo);
    return mates > 0 ? `${String(mates)} checkmate${mates === 1 ? "" : "s"} at ${String(elo)} Elo` : null;
  }
  if (game === "flux") {
    const best = getBest("flux");
    return best !== null ? `Best: ${String(best)} pts` : null;
  }
  if (game === "cipher") {
    const mastered = getMasteredCount("no");
    return mastered > 0 ? `${String(mastered)} word${mastered === 1 ? "" : "s"} mastered` : null;
  }
  return null;
}
```

**Step 2: Update card rendering in render()**

Replace the game card HTML generation. Each card now has a multi-line layout:

```ts
// For both done and not-done cards, the inner content is:
const tagline = GAME_TAGLINES[game];
const stat = getGameStat(game);

// Line 1: icon + name + stage + readiness
let line1 = `<span class="game-icon">${GAME_ICONS[game]}</span>`;
line1 += `<span class="game-name">${GAME_LABELS[game]}</span>`;
line1 += `<span class="game-stage">\u00b7 Stage ${String(stage)}</span>`;
line1 += `<span class="readiness-dot readiness-${ready}"></span>`;
if (!done && ready === "green")
  line1 += `<button class="advance-btn" data-game="${game}">Advance \u25b8</button>`;
if (!done && stage > 1)
  line1 += `<button class="retreat-btn" data-game="${game}">\u25be</button>`;
if (done) line1 += `<span class="game-check">\u2713</span>`;

// Line 2: tagline
const line2 = `<span class="game-tagline">${tagline}</span>`;

// Line 3: stat (only if exists)
const line3 = stat !== null ? `<span class="game-stat">${stat}</span>` : "";

const inner = `<div class="game-card-top">${line1}</div>${line2}${line3}`;
```

Wrap in `<a>` or `<div>` as before based on done state.

**Step 3: Update hub.css for multi-line cards**

```css
.game-card {
  /* Change from single-row flex to column layout */
  flex-direction: column;
  align-items: stretch;
  gap: 0.25rem;

  /* ... keep existing border-left, background, shadow, transitions ... */
}

.game-card-top {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.game-tagline {
  font-size: 0.75rem;
  color: var(--ctp-subtext0);
  padding-left: 2.5rem; /* align with name after icon */
}

.game-stat {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent, var(--ctp-blue));
  padding-left: 2.5rem;
}
```

**Step 4: Remove "Play" hover slide effect**

The old hover effect slid icon+name right to reveal "Play" text. With multi-line cards, this gets awkward. Remove `.game-play` from the card HTML and its CSS rules. Keep the hover lift + accent wash.

**Step 5: Verify visually**

Run: `make dev` and check cards show taglines and stats.

**Step 6: Run tests**

Run: `npm test`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add src/hub.ts src/hub.css
git commit -m "feat: game cards with taglines and per-game stats"
```

---

### Task 6: Remove details panel, add footer

**Files:**
- Modify: `src/hub.ts`
- Modify: `src/hub.css`

**Step 1: Remove stats panel from render()**

Delete the entire block in `render()` that generates the `<details class="stats-panel">` (lines 165-191 approximately). Also remove the session summary block.

**Step 2: Add footer**

After the game list `</div>`, add:

```ts
const totalSessions = getTotalSessions();
if (totalSessions > 0) {
  html += `<div class="hub-footer">${String(totalSessions)} session${totalSessions === 1 ? "" : "s"} completed</div>`;
}
```

**Step 3: Remove stats panel CSS**

Delete from hub.css: `.stats-panel`, `.stats-panel summary`, `.stats-panel summary::before`, `.stats-panel[open]`, `.stats-content h3`, `.stats-grid`, `.stat-row`, `.stat-value`, `.stat-total`, `.session-summary`, `.session-scores`.

**Step 4: Add footer CSS**

```css
.hub-footer {
  margin-top: 1.5rem;

  font-size: 0.75rem;
  color: var(--ctp-subtext0);
  text-align: center;

  transition: color var(--dur-250) ease;
}
```

**Step 5: Verify visually**

Run: `make dev` — stats panel gone, footer visible.

**Step 6: Commit**

```bash
git add src/hub.ts src/hub.css
git commit -m "feat: replace stats panel with minimal footer"
```

---

### Task 7: Lint, test, commit, push

**Step 1: Run full lint suite**

```bash
npm run lint && npm run lint:css && npm run format:check
```

Fix any issues.

**Step 2: Run all tests**

```bash
npm test
```

Expected: All tests pass.

**Step 3: Format if needed**

```bash
npm run format
```

**Step 4: Commit and push**

```bash
git add -A
git commit -m "chore: lint and format fixes"
git push
```
