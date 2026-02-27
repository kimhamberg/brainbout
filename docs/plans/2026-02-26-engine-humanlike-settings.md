# Engine Humanlike Settings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Simplify engine settings to a single Elo slider, replace movetime with nodes-based search, add humanlike delay, remove unavailable Contempt option.

**Architecture:** Remove Skill Level and Think Time sliders from UI and code. Change engine search from `go movetime` to `go nodes` with a fixed budget (100,000 nodes — enough for any skill level, completes fast on all devices). After engine returns a move, add a random 1–3 second delay before playing it. UCI_Elo remains the sole user-facing difficulty control.

**Tech Stack:** TypeScript, Vite, Vitest, HTML/CSS

---

### Task 1: Update EngineOptions and DEFAULT_OPTIONS

**Files:**

- Modify: `src/engine.ts:9-25`
- Test: `test/engine.test.ts`

**Step 1: Write the failing test**

Add to `test/engine.test.ts`:

```typescript
import { DEFAULT_OPTIONS } from "../src/engine";

describe("DEFAULT_OPTIONS", () => {
  it("has no moveTime or contempt", () => {
    expect(DEFAULT_OPTIONS).not.toHaveProperty("moveTime");
    expect(DEFAULT_OPTIONS).not.toHaveProperty("contempt");
    expect(DEFAULT_OPTIONS).not.toHaveProperty("skillLevel");
  });

  it("has nodes budget", () => {
    expect(DEFAULT_OPTIONS.nodes).toBe(100000);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/engine.test.ts`
Expected: FAIL — DEFAULT_OPTIONS still has moveTime, contempt, skillLevel; no nodes property.

**Step 3: Update EngineOptions and DEFAULT_OPTIONS**

In `src/engine.ts`, replace the interface and defaults:

```typescript
export interface EngineOptions {
  chess960: boolean;
  elo: number; // 1320-3190
  limitStrength: boolean;
  nodes: number; // search budget
}

export const DEFAULT_OPTIONS: EngineOptions = {
  chess960: true,
  elo: 1500,
  limitStrength: true,
  nodes: 100000,
};
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run test/engine.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/engine.ts test/engine.test.ts
git commit -m "refactor: simplify EngineOptions, replace movetime with nodes"
```

---

### Task 2: Update applyOptions and go methods

**Files:**

- Modify: `src/engine.ts:94-139`

**Step 1: Update applyOptions**

Remove Contempt and Skill Level lines (UCI_Elo handles Skill Level internally, Contempt doesn't exist in SF18):

```typescript
private applyOptions(options: EngineOptions): void {
  this.send(`setoption name UCI_Chess960 value ${options.chess960}`);
  this.send(`setoption name UCI_LimitStrength value ${options.limitStrength}`);
  this.send(`setoption name UCI_Elo value ${options.elo}`);
}
```

**Step 2: Update go method**

```typescript
go(fen: string, callback: EngineCallback, infoCallback?: InfoCallback): void {
  this.onBestMove = callback;
  this.onInfo = infoCallback ?? null;
  this.send('ucinewgame');
  this.send(`position fen ${fen}`);
  this.send(`go nodes ${this.options.nodes}`);
}
```

**Step 3: Update goWithMoves — remove moveTime parameter**

```typescript
goWithMoves(
  startFen: string,
  moves: string[],
  callback: EngineCallback,
  infoCallback?: InfoCallback,
): void {
  this.onBestMove = callback;
  this.onInfo = infoCallback ?? null;
  const movesStr = moves.length > 0 ? ` moves ${moves.join(' ')}` : '';
  this.send(`position fen ${startFen}${movesStr}`);
  this.send(`go nodes ${this.options.nodes}`);
}
```

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: PASS (parser tests don't depend on these methods)

**Step 5: Commit**

```bash
git add src/engine.ts
git commit -m "refactor: use go nodes, remove contempt and skill level UCI commands"
```

---

### Task 3: Add humanlike delay utility

**Files:**

- Modify: `src/engine.ts` (add at top of file)
- Test: `test/engine.test.ts`

**Step 1: Write the failing test**

```typescript
import { humanDelay } from "../src/engine";

describe("humanDelay", () => {
  it("returns a promise that resolves after 1-3 seconds", async () => {
    const start = Date.now();
    await humanDelay();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(900); // allow 100ms tolerance
    expect(elapsed).toBeLessThanOrEqual(3200);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/engine.test.ts`
Expected: FAIL — humanDelay not exported.

**Step 3: Implement humanDelay**

Add to `src/engine.ts`:

```typescript
export function humanDelay(): Promise<void> {
  const ms = 1000 + Math.random() * 2000;
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run test/engine.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/engine.ts test/engine.test.ts
git commit -m "feat: add humanDelay utility for natural response timing"
```

---

### Task 4: Update main.ts — simplify settings, add delay

**Files:**

- Modify: `src/main.ts`

**Step 1: Update imports**

```typescript
import { StockfishEngine, DEFAULT_OPTIONS, humanDelay } from "./engine";
```

**Step 2: Simplify getSettings**

```typescript
function getSettings(): {
  elo: number;
  positionId: number | undefined;
  playerColor: "white" | "black";
} {
  const elo = parseInt(
    (document.getElementById("elo-slider") as HTMLInputElement).value,
  );
  const posIdInput = (
    document.getElementById("position-id") as HTMLInputElement
  ).value;
  const positionId = posIdInput ? parseInt(posIdInput) : undefined;
  const colorSelect = (
    document.getElementById("color-select") as HTMLSelectElement
  ).value;
  const color =
    colorSelect === "random"
      ? Math.random() < 0.5
        ? "white"
        : "black"
      : (colorSelect as "white" | "black");
  return { elo, positionId, playerColor: color };
}
```

**Step 3: Simplify setupSliderLabels**

```typescript
function setupSliderLabels(): void {
  const slider = document.getElementById("elo-slider") as HTMLInputElement;
  const label = document.getElementById("elo-value")!;
  slider.addEventListener("input", () => {
    label.textContent = slider.value;
  });
}
```

**Step 4: Update engineMove to use delay and remove moveTime parameter**

```typescript
function engineMove(): void {
  engineThinking = true;
  updateStatus("Engine thinking...");

  api.set({
    movable: { color: undefined, dests: new Map() },
  });

  engine.goWithMoves(
    game.startFen,
    game.moves,
    async (bestMove: string) => {
      await humanDelay();
      engineThinking = false;
      const newGame = applyUciMove(game, bestMove);
      if (!newGame) return;

      game = newGame;

      if (game.lastMove) {
        api.move(game.lastMove[0] as Key, game.lastMove[1] as Key);
      }
      updateBoard();

      const status = getGameStatus(game);
      if (status.status !== "playing") {
        showResult(status);
        return;
      }

      updateStatus("Your move");
    },
    (info: EngineInfo) => {
      const evalText =
        info.score.type === "cp"
          ? (info.score.value / 100).toFixed(1)
          : `M${info.score.value}`;
      updateEval(`Depth ${info.depth}: ${evalText}`);
    },
  );
}
```

**Step 5: Update new-game click handler**

```typescript
document.getElementById("new-game")?.addEventListener("click", async () => {
  const settings = getSettings();
  playerColor = settings.playerColor;
  const options = {
    ...DEFAULT_OPTIONS,
    elo: settings.elo,
  };
  engine.destroy();
  engine = new StockfishEngine(sfScript);
  await engine.init(options);
  startNewGame(settings.positionId);
});
```

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: PASS

**Step 7: Commit**

```bash
git add src/main.ts
git commit -m "refactor: simplify main.ts to use elo-only settings with humanlike delay"
```

---

### Task 5: Update HTML — remove Skill Level and Think Time sliders

**Files:**

- Modify: `index.html`

**Step 1: Remove the Skill Level and Think Time labels**

Remove these two `<label>` blocks from the settings div:

```html
<!-- REMOVE this -->
<label>
  Skill Level
  <input type="range" id="skill-slider" min="0" max="20" value="10" />
  <span id="skill-value">10</span>
</label>
<!-- REMOVE this -->
<label>
  Engine Think Time (ms)
  <input
    type="range"
    id="time-slider"
    min="200"
    max="5000"
    value="1000"
    step="100"
  />
  <span id="time-value">1000</span>
</label>
```

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: PASS

**Step 3: Verify dev server**

Run: `npx vite` and check localhost:5173 — settings should show only Elo, Position ID, and Color.

**Step 4: Commit**

```bash
git add index.html
git commit -m "feat: remove skill level and think time sliders from UI"
```

---

### Task 6: Final verification and release

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All 26+ tests PASS

**Step 2: Verify build**

Run: `npx vite build`
Expected: Clean build, no errors

**Step 3: Commit any remaining changes and push**

```bash
git push
```

**Step 4: Tag release**

```bash
git tag v0.2.0
git push origin v0.2.0
```

Wait for release workflow to complete, download APK, test on device.
