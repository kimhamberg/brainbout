# Flux Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Replace the clinical color/number Flux with a rhythm-driven, shape-sorting game that hits every addiction hook while preserving task-switching + inhibition training.

**Architecture:** Complete rewrite of `flux-engine.ts` (pure logic, no DOM), `flux.ts` (UI + rhythm loop), and `flux.css` (shapes, juice, streak). The engine is fully testable without DOM. The UI uses `AudioContext` for beat scheduling. All visuals are pure CSS.

**Tech Stack:** TypeScript, Vitest (happy-dom), CSS animations, Web Audio API, existing Catppuccin tokens, existing `gen-sounds.py` pipeline.

**Design doc:** `docs/plans/2026-03-09-flux-redesign-design.md`

---

### Task 0: New engine types, constants, and state factory

**Files:**
- Rewrite: `src/games/flux-engine.ts`
- Test: `test/flux.test.ts`

**Step 1: Write the failing tests for new types and constants**

Replace the entire `test/flux.test.ts` content. Start with stage params and state factory:

```typescript
// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import {
  STAGE_PARAMS,
  WARM_UP_TRIALS,
  DURATION,
  STREAK_THRESHOLDS,
  GOLDEN_BASE_POINTS,
  createFluxState,
} from "../src/games/flux-engine";

describe("constants", () => {
  it("DURATION is 75 seconds", () => {
    expect(DURATION).toBe(75);
  });

  it("WARM_UP_TRIALS is 5", () => {
    expect(WARM_UP_TRIALS).toBe(5);
  });

  it("GOLDEN_BASE_POINTS is 5", () => {
    expect(GOLDEN_BASE_POINTS).toBe(5);
  });
});

describe("STAGE_PARAMS", () => {
  it("stage 1: baseBpm 75, rules color+shape+size, noGoRate 0.15", () => {
    const p = STAGE_PARAMS[1];
    expect(p.baseBpm).toBe(75);
    expect(p.floorBpm).toBe(90);
    expect(p.rules).toEqual(["color", "shape", "size"]);
    expect(p.switchMin).toBe(5);
    expect(p.switchMax).toBe(7);
    expect(p.noGoRate).toBe(0.15);
    expect(p.goldenRate).toBe(0.1);
  });

  it("stage 2: baseBpm 90, adds fill rule", () => {
    const p = STAGE_PARAMS[2];
    expect(p.baseBpm).toBe(90);
    expect(p.floorBpm).toBe(110);
    expect(p.rules).toEqual(["color", "shape", "size", "fill"]);
    expect(p.switchMin).toBe(4);
    expect(p.switchMax).toBe(6);
    expect(p.noGoRate).toBe(0.2);
    expect(p.goldenRate).toBe(0.08);
  });

  it("stage 3: baseBpm 110, adds not variants", () => {
    const p = STAGE_PARAMS[3];
    expect(p.baseBpm).toBe(110);
    expect(p.floorBpm).toBe(135);
    expect(p.rules).toEqual(["color", "shape", "size", "fill"]);
    expect(p.notAllowed).toBe(true);
    expect(p.switchMin).toBe(3);
    expect(p.switchMax).toBe(5);
    expect(p.noGoRate).toBe(0.25);
    expect(p.goldenRate).toBe(0.08);
  });
});

describe("STREAK_THRESHOLDS", () => {
  it("maps streak ranges to multipliers", () => {
    expect(STREAK_THRESHOLDS).toEqual([
      { min: 15, multiplier: 5, label: "inferno" },
      { min: 10, multiplier: 3, label: "blaze" },
      { min: 5, multiplier: 2, label: "flame" },
      { min: 3, multiplier: 1.5, label: "spark" },
    ]);
  });
});

describe("createFluxState", () => {
  it("returns correct defaults for stage 1", () => {
    const state = createFluxState(1);
    expect(state.score).toBe(0);
    expect(state.streak).toBe(0);
    expect(state.peakStreak).toBe(0);
    expect(state.trialCount).toBe(0);
    expect(state.switchCount).toBe(0);
    expect(state.bpm).toBe(75);
    expect(state.rule).toBe("color");
    expect(state.isNot).toBe(false);
    expect(state.noGoUnlocked).toBe(false);
    expect(state.stage).toBe(1);
  });

  it("uses stage 2 base bpm", () => {
    const state = createFluxState(2);
    expect(state.bpm).toBe(90);
  });

  it("uses stage 3 base bpm", () => {
    const state = createFluxState(3);
    expect(state.bpm).toBe(110);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/flux.test.ts`
Expected: FAIL — old exports don't match new imports.

**Step 3: Write the new engine types and state factory**

Replace the top of `src/games/flux-engine.ts` (types, constants, state factory). Keep existing helper functions (`randInt`, `pick`):

```typescript
export type Rule = "color" | "shape" | "size" | "fill";
export type ButtonSide = "left" | "right";
export type ShapeColor = "red" | "peach" | "blue" | "lavender" | "yellow";
export type ShapeForm = "circle" | "pill" | "diamond" | "triangle" | "blob";
export type ShapeSize = "big" | "small" | "oscillating";
export type ShapeFill = "solid" | "hollow" | "striped";

export interface Trial {
  color: ShapeColor;
  shape: ShapeForm;
  size: ShapeSize;
  fill: ShapeFill;
  isNoGo: boolean;
  isGolden: boolean;
}

export interface FluxState {
  score: number;
  streak: number;
  peakStreak: number;
  trialCount: number;
  switchCount: number;
  bpm: number;
  rule: Rule;
  isNot: boolean;
  trialsUntilSwitch: number;
  noGoUnlocked: boolean;
  stage: number;
  unlockedRuleCount: number;
}

export interface StageParams {
  baseBpm: number;
  floorBpm: number;
  rules: Rule[];
  notAllowed: boolean;
  switchMin: number;
  switchMax: number;
  noGoRate: number;
  goldenRate: number;
}

export interface ResponseResult {
  correct: boolean;
  basePoints: number;
  multiplier: number;
  totalPoints: number;
  noGoFail?: boolean;
  isGolden?: boolean;
  feedback: string;
}

/* ---------- constants ---------- */

export const DURATION = 75;
export const WARM_UP_TRIALS = 5;
export const GOLDEN_BASE_POINTS = 5;
export const BPM_INCREASE_PERCENT = 0.05;
export const STREAK_TO_SPEED = 5;

export const STREAK_THRESHOLDS = [
  { min: 15, multiplier: 5, label: "inferno" },
  { min: 10, multiplier: 3, label: "blaze" },
  { min: 5, multiplier: 2, label: "flame" },
  { min: 3, multiplier: 1.5, label: "spark" },
] as const;

export const STAGE_PARAMS: StageParams[] = [
  { baseBpm: 75, floorBpm: 90, rules: ["color", "shape", "size"], notAllowed: false, switchMin: 5, switchMax: 7, noGoRate: 0.15, goldenRate: 0.1 }, // placeholder index 0
  { baseBpm: 75, floorBpm: 90, rules: ["color", "shape", "size"], notAllowed: false, switchMin: 5, switchMax: 7, noGoRate: 0.15, goldenRate: 0.1 },
  { baseBpm: 90, floorBpm: 110, rules: ["color", "shape", "size", "fill"], notAllowed: false, switchMin: 4, switchMax: 6, noGoRate: 0.2, goldenRate: 0.08 },
  { baseBpm: 110, floorBpm: 135, rules: ["color", "shape", "size", "fill"], notAllowed: true, switchMin: 3, switchMax: 5, noGoRate: 0.25, goldenRate: 0.08 },
];

/* ---------- helpers ---------- */

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rollSwitchCount(stage: number): number {
  const p = STAGE_PARAMS[stage];
  return randInt(p.switchMin, p.switchMax);
}

/* ---------- state factory ---------- */

export function createFluxState(stage: number): FluxState {
  const p = STAGE_PARAMS[stage];
  return {
    score: 0,
    streak: 0,
    peakStreak: 0,
    trialCount: 0,
    switchCount: 0,
    bpm: p.baseBpm,
    rule: p.rules[0],
    isNot: false,
    trialsUntilSwitch: rollSwitchCount(stage),
    noGoUnlocked: false,
    stage,
    unlockedRuleCount: 1,
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/flux.test.ts`
Expected: PASS for constants, STAGE_PARAMS, STREAK_THRESHOLDS, createFluxState.

**Step 5: Commit**

```bash
git add src/games/flux-engine.ts test/flux.test.ts
git commit -m "feat(flux): new engine types, constants, and state factory"
```

---

### Task 1: Trial generation with shape properties

**Files:**
- Modify: `src/games/flux-engine.ts` (add `generateTrial`)
- Modify: `test/flux.test.ts` (add generation tests)

**Step 1: Write failing tests for trial generation**

Append to `test/flux.test.ts`:

```typescript
import {
  // ... existing imports ...
  generateTrial,
} from "../src/games/flux-engine";
import type { Trial } from "../src/games/flux-engine";

describe("generateTrial", () => {
  describe("shape properties", () => {
    it("generates valid colors (red, peach, blue, lavender)", () => {
      const state = createFluxState(1);
      const validGo: ShapeColor[] = ["red", "peach", "blue", "lavender"];
      for (let i = 0; i < 100; i++) {
        state.trialCount = 0;
        const trial = generateTrial(state);
        if (!trial.isNoGo) {
          expect(validGo).toContain(trial.color);
        }
      }
    });

    it("generates valid shapes (circle, pill, diamond, triangle)", () => {
      const state = createFluxState(1);
      const validGo: ShapeForm[] = ["circle", "pill", "diamond", "triangle"];
      for (let i = 0; i < 100; i++) {
        state.trialCount = 0;
        const trial = generateTrial(state);
        if (!trial.isNoGo) {
          expect(validGo).toContain(trial.shape);
        }
      }
    });

    it("generates valid sizes (big, small)", () => {
      const state = createFluxState(1);
      for (let i = 0; i < 100; i++) {
        state.trialCount = 0;
        const trial = generateTrial(state);
        if (!trial.isNoGo) {
          expect(["big", "small"]).toContain(trial.size);
        }
      }
    });

    it("generates valid fills (solid, hollow)", () => {
      const state = createFluxState(1);
      for (let i = 0; i < 100; i++) {
        state.trialCount = 0;
        const trial = generateTrial(state);
        if (!trial.isNoGo) {
          expect(["solid", "hollow"]).toContain(trial.fill);
        }
      }
    });
  });

  describe("warm-up (first 5 trials)", () => {
    it("never produces no-go trials during warm-up", () => {
      const state = createFluxState(1);
      for (let i = 0; i < WARM_UP_TRIALS; i++) {
        const trial = generateTrial(state);
        expect(trial.isNoGo).toBe(false);
      }
    });

    it("never produces golden shapes during warm-up", () => {
      const state = createFluxState(1);
      for (let i = 0; i < WARM_UP_TRIALS; i++) {
        const trial = generateTrial(state);
        expect(trial.isGolden).toBe(false);
      }
    });

    it("does not switch rules during warm-up", () => {
      const state = createFluxState(1);
      state.trialsUntilSwitch = 1;
      generateTrial(state);
      expect(state.rule).toBe("color");
    });
  });

  describe("rule switching", () => {
    it("switches rule when trialsUntilSwitch reaches 0", () => {
      const state = createFluxState(1);
      state.trialCount = WARM_UP_TRIALS;
      state.trialsUntilSwitch = 1;
      state.rule = "color";
      state.unlockedRuleCount = 2;
      generateTrial(state);
      expect(state.rule).not.toBe("color");
    });

    it("unlocks no-go after first switch", () => {
      const state = createFluxState(1);
      state.trialCount = WARM_UP_TRIALS;
      state.trialsUntilSwitch = 1;
      state.unlockedRuleCount = 2;
      generateTrial(state);
      expect(state.noGoUnlocked).toBe(true);
    });

    it("increments switchCount on each switch", () => {
      const state = createFluxState(1);
      state.trialCount = WARM_UP_TRIALS;
      state.trialsUntilSwitch = 1;
      state.unlockedRuleCount = 2;
      generateTrial(state);
      expect(state.switchCount).toBe(1);
    });

    it("unlocks third rule after 2 switches", () => {
      const state = createFluxState(1);
      state.trialCount = WARM_UP_TRIALS;
      state.switchCount = 1;
      state.trialsUntilSwitch = 1;
      state.unlockedRuleCount = 2;
      generateTrial(state);
      expect(state.unlockedRuleCount).toBe(3);
    });
  });

  it("increments trialCount each call", () => {
    const state = createFluxState(1);
    expect(state.trialCount).toBe(0);
    generateTrial(state);
    expect(state.trialCount).toBe(1);
    generateTrial(state);
    expect(state.trialCount).toBe(2);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/flux.test.ts`
Expected: FAIL — `generateTrial` not exported or wrong signature.

**Step 3: Implement generateTrial**

Add to `src/games/flux-engine.ts`:

```typescript
/* ---------- shape generation ---------- */

const GO_COLORS: ShapeColor[] = ["red", "peach", "blue", "lavender"];
const WARM_COLORS: ShapeColor[] = ["red", "peach"];
const COOL_COLORS: ShapeColor[] = ["blue", "lavender"];
const ROUND_SHAPES: ShapeForm[] = ["circle", "pill"];
const ANGULAR_SHAPES: ShapeForm[] = ["diamond", "triangle"];
const GO_SHAPES: ShapeForm[] = [...ROUND_SHAPES, ...ANGULAR_SHAPES];

function generateGoTrial(): Trial {
  return {
    color: pick(GO_COLORS),
    shape: pick(GO_SHAPES),
    size: Math.random() < 0.5 ? "big" : "small",
    fill: Math.random() < 0.5 ? "solid" : "hollow",
    isNoGo: false,
    isGolden: false,
  };
}

/* ---------- rule switching ---------- */

// How many switches needed to unlock the Nth rule
const UNLOCK_AT_SWITCH = [0, 0, 0, 2, 4, 6]; // index = unlockedRuleCount after unlock

function pickNextRule(state: FluxState): Rule {
  const p = STAGE_PARAMS[state.stage];
  const available = p.rules.slice(0, state.unlockedRuleCount);
  const others = available.filter((r) => r !== state.rule);
  return pick(others.length > 0 ? others : available);
}

/* ---------- trial generation ---------- */

export function generateTrial(state: FluxState): Trial {
  const isWarmUp = state.trialCount < WARM_UP_TRIALS;

  // Handle rule switching (only after warm-up)
  if (!isWarmUp) {
    state.trialsUntilSwitch--;
    if (state.trialsUntilSwitch <= 0) {
      state.rule = pickNextRule(state);
      state.isNot = false; // reset NOT on switch (NOT handled in Task 3)
      state.trialsUntilSwitch = rollSwitchCount(state.stage);
      state.noGoUnlocked = true;
      state.switchCount++;

      // Unlock rules progressively
      const p = STAGE_PARAMS[state.stage];
      const maxRules = p.rules.length;
      if (
        state.unlockedRuleCount < maxRules &&
        state.switchCount >= UNLOCK_AT_SWITCH[state.unlockedRuleCount + 1]
      ) {
        state.unlockedRuleCount++;
      }
    }
  }

  state.trialCount++;

  // Determine if golden (not during warm-up)
  const isGolden =
    !isWarmUp && Math.random() < STAGE_PARAMS[state.stage].goldenRate;

  // Determine if no-go (not during warm-up, must be unlocked)
  const isNoGo =
    !isWarmUp &&
    !isGolden && // golden and no-go are mutually exclusive
    state.noGoUnlocked &&
    Math.random() < STAGE_PARAMS[state.stage].noGoRate;

  if (isNoGo) {
    return generateNoGoTrial(state.rule);
  }

  const trial = generateGoTrial();
  trial.isGolden = isGolden;
  return trial;
}
```

The `generateNoGoTrial` function is a stub for now (returns a go trial) — it will be implemented in Task 2.

```typescript
function generateNoGoTrial(rule: Rule): Trial {
  // Stub — replaced in Task 2
  const trial = generateGoTrial();
  trial.isNoGo = true;
  return trial;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/flux.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/games/flux-engine.ts test/flux.test.ts
git commit -m "feat(flux): trial generation with shape properties and rule switching"
```

---

### Task 2: Rule-dependent no-go trials

**Files:**
- Modify: `src/games/flux-engine.ts` (implement `generateNoGoTrial`)
- Modify: `test/flux.test.ts`

**Step 1: Write failing tests**

Append to `test/flux.test.ts` inside the `generateTrial` describe:

```typescript
describe("no-go trials", () => {
  it("COLOR no-go: yellow color (neither warm nor cool)", () => {
    const state = createFluxState(1);
    state.trialCount = WARM_UP_TRIALS;
    state.noGoUnlocked = true;
    state.rule = "color";
    state.trialsUntilSwitch = 999;
    let sawNoGo = false;
    for (let i = 0; i < 300; i++) {
      const trial = generateTrial(state);
      if (trial.isNoGo) {
        expect(trial.color).toBe("yellow");
        sawNoGo = true;
      }
    }
    expect(sawNoGo).toBe(true);
  });

  it("SHAPE no-go: blob shape (neither round nor angular)", () => {
    const state = createFluxState(1);
    state.trialCount = WARM_UP_TRIALS;
    state.noGoUnlocked = true;
    state.rule = "shape";
    state.trialsUntilSwitch = 999;
    let sawNoGo = false;
    for (let i = 0; i < 300; i++) {
      const trial = generateTrial(state);
      if (trial.isNoGo) {
        expect(trial.shape).toBe("blob");
        sawNoGo = true;
      }
    }
    expect(sawNoGo).toBe(true);
  });

  it("SIZE no-go: oscillating size", () => {
    const state = createFluxState(1);
    state.trialCount = WARM_UP_TRIALS;
    state.noGoUnlocked = true;
    state.rule = "size";
    state.trialsUntilSwitch = 999;
    let sawNoGo = false;
    for (let i = 0; i < 300; i++) {
      const trial = generateTrial(state);
      if (trial.isNoGo) {
        expect(trial.size).toBe("oscillating");
        sawNoGo = true;
      }
    }
    expect(sawNoGo).toBe(true);
  });

  it("FILL no-go: striped fill", () => {
    const state = createFluxState(2); // fill rule available in stage 2
    state.trialCount = WARM_UP_TRIALS;
    state.noGoUnlocked = true;
    state.rule = "fill";
    state.trialsUntilSwitch = 999;
    let sawNoGo = false;
    for (let i = 0; i < 300; i++) {
      const trial = generateTrial(state);
      if (trial.isNoGo) {
        expect(trial.fill).toBe("striped");
        sawNoGo = true;
      }
    }
    expect(sawNoGo).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/flux.test.ts`
Expected: FAIL — no-go trials don't have correct rule-specific properties.

**Step 3: Replace the `generateNoGoTrial` stub**

```typescript
function generateNoGoTrial(rule: Rule): Trial {
  const base = generateGoTrial();
  base.isNoGo = true;

  switch (rule) {
    case "color":
      base.color = "yellow";
      break;
    case "shape":
      base.shape = "blob";
      break;
    case "size":
      base.size = "oscillating";
      break;
    case "fill":
      base.fill = "striped";
      break;
  }

  return base;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/flux.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/games/flux-engine.ts test/flux.test.ts
git commit -m "feat(flux): rule-dependent no-go trials (yellow, blob, oscillating, striped)"
```

---

### Task 3: NOT rule (inverted logic)

**Files:**
- Modify: `src/games/flux-engine.ts`
- Modify: `test/flux.test.ts`

**Step 1: Write failing tests**

```typescript
describe("NOT rule", () => {
  it("stage 3 can activate NOT on a switch", () => {
    const state = createFluxState(3);
    state.trialCount = WARM_UP_TRIALS;
    state.switchCount = 6; // NOT available after 6 switches
    state.unlockedRuleCount = 4;
    state.trialsUntilSwitch = 1;
    // Run many switches to see if NOT ever activates
    let sawNot = false;
    for (let i = 0; i < 200; i++) {
      state.trialsUntilSwitch = 1;
      generateTrial(state);
      if (state.isNot) {
        sawNot = true;
        break;
      }
    }
    expect(sawNot).toBe(true);
  });

  it("stage 1 never activates NOT", () => {
    const state = createFluxState(1);
    state.trialCount = WARM_UP_TRIALS;
    state.switchCount = 100;
    state.unlockedRuleCount = 3;
    for (let i = 0; i < 200; i++) {
      state.trialsUntilSwitch = 1;
      generateTrial(state);
      expect(state.isNot).toBe(false);
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/flux.test.ts`
Expected: FAIL — `isNot` never set to `true`.

**Step 3: Add NOT logic to rule switching in `generateTrial`**

In the switch block inside `generateTrial`, after `state.switchCount++`:

```typescript
// Possibly activate NOT (stage 3 only, after 6 switches)
const p = STAGE_PARAMS[state.stage];
if (p.notAllowed && state.switchCount >= 6 && Math.random() < 0.3) {
  state.isNot = true;
} else {
  state.isNot = false;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/flux.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/games/flux-engine.ts test/flux.test.ts
git commit -m "feat(flux): NOT rule inversion for stage 3"
```

---

### Task 4: Response evaluation for all rules

**Files:**
- Modify: `src/games/flux-engine.ts` (rewrite `evaluateResponse`)
- Modify: `test/flux.test.ts`

**Step 1: Write failing tests**

```typescript
import {
  // ... existing ...
  evaluateResponse,
  getMultiplier,
} from "../src/games/flux-engine";

describe("getMultiplier", () => {
  it("returns 1 for streak 0-2", () => {
    expect(getMultiplier(0)).toBe(1);
    expect(getMultiplier(2)).toBe(1);
  });
  it("returns 1.5 for streak 3-4", () => {
    expect(getMultiplier(3)).toBe(1.5);
    expect(getMultiplier(4)).toBe(1.5);
  });
  it("returns 2 for streak 5-9", () => {
    expect(getMultiplier(5)).toBe(2);
    expect(getMultiplier(9)).toBe(2);
  });
  it("returns 3 for streak 10-14", () => {
    expect(getMultiplier(10)).toBe(3);
    expect(getMultiplier(14)).toBe(3);
  });
  it("returns 5 for streak 15+", () => {
    expect(getMultiplier(15)).toBe(5);
    expect(getMultiplier(100)).toBe(5);
  });
});

describe("evaluateResponse", () => {
  function goTrial(overrides?: Partial<Trial>): Trial {
    return {
      color: "red",
      shape: "circle",
      size: "big",
      fill: "solid",
      isNoGo: false,
      isGolden: false,
      ...overrides,
    };
  }

  describe("COLOR rule", () => {
    it("warm (red) → left is correct", () => {
      const r = evaluateResponse(goTrial({ color: "red" }), "color", false, 0, "left");
      expect(r.correct).toBe(true);
      expect(r.basePoints).toBe(1);
    });

    it("warm (peach) → left is correct", () => {
      const r = evaluateResponse(goTrial({ color: "peach" }), "color", false, 0, "left");
      expect(r.correct).toBe(true);
    });

    it("cool (blue) → right is correct", () => {
      const r = evaluateResponse(goTrial({ color: "blue" }), "color", false, 0, "right");
      expect(r.correct).toBe(true);
    });

    it("cool (lavender) → right is correct", () => {
      const r = evaluateResponse(goTrial({ color: "lavender" }), "color", false, 0, "right");
      expect(r.correct).toBe(true);
    });

    it("warm → right is wrong", () => {
      const r = evaluateResponse(goTrial({ color: "red" }), "color", false, 0, "right");
      expect(r.correct).toBe(false);
      expect(r.basePoints).toBe(-1);
    });
  });

  describe("SHAPE rule", () => {
    it("round (circle) → left is correct", () => {
      const r = evaluateResponse(goTrial({ shape: "circle" }), "shape", false, 0, "left");
      expect(r.correct).toBe(true);
    });

    it("round (pill) → left is correct", () => {
      const r = evaluateResponse(goTrial({ shape: "pill" }), "shape", false, 0, "left");
      expect(r.correct).toBe(true);
    });

    it("angular (diamond) → right is correct", () => {
      const r = evaluateResponse(goTrial({ shape: "diamond" }), "shape", false, 0, "right");
      expect(r.correct).toBe(true);
    });

    it("angular (triangle) → right is correct", () => {
      const r = evaluateResponse(goTrial({ shape: "triangle" }), "shape", false, 0, "right");
      expect(r.correct).toBe(true);
    });
  });

  describe("SIZE rule", () => {
    it("big → left is correct", () => {
      const r = evaluateResponse(goTrial({ size: "big" }), "size", false, 0, "left");
      expect(r.correct).toBe(true);
    });

    it("small → right is correct", () => {
      const r = evaluateResponse(goTrial({ size: "small" }), "size", false, 0, "right");
      expect(r.correct).toBe(true);
    });
  });

  describe("FILL rule", () => {
    it("solid → left is correct", () => {
      const r = evaluateResponse(goTrial({ fill: "solid" }), "fill", false, 0, "left");
      expect(r.correct).toBe(true);
    });

    it("hollow → right is correct", () => {
      const r = evaluateResponse(goTrial({ fill: "hollow" }), "fill", false, 0, "right");
      expect(r.correct).toBe(true);
    });
  });

  describe("NOT rule", () => {
    it("NOT COLOR: warm → right (inverted)", () => {
      const r = evaluateResponse(goTrial({ color: "red" }), "color", true, 0, "right");
      expect(r.correct).toBe(true);
    });

    it("NOT COLOR: cool → left (inverted)", () => {
      const r = evaluateResponse(goTrial({ color: "blue" }), "color", true, 0, "left");
      expect(r.correct).toBe(true);
    });
  });

  describe("no-go trials", () => {
    it("withholding on no-go is correct", () => {
      const trial = goTrial({ isNoGo: true, color: "yellow" });
      const r = evaluateResponse(trial, "color", false, 0, null);
      expect(r.correct).toBe(true);
      expect(r.basePoints).toBe(1);
    });

    it("pressing on no-go is wrong", () => {
      const trial = goTrial({ isNoGo: true, color: "yellow" });
      const r = evaluateResponse(trial, "color", false, 0, "left");
      expect(r.correct).toBe(false);
      expect(r.noGoFail).toBe(true);
    });
  });

  describe("golden shapes", () => {
    it("correct golden gives 5 base points", () => {
      const trial = goTrial({ isGolden: true, color: "red" });
      const r = evaluateResponse(trial, "color", false, 0, "left");
      expect(r.correct).toBe(true);
      expect(r.basePoints).toBe(5);
      expect(r.isGolden).toBe(true);
    });

    it("golden with x3 multiplier gives 15 total", () => {
      const trial = goTrial({ isGolden: true, color: "red" });
      const r = evaluateResponse(trial, "color", false, 10, "left"); // streak 10 = x3
      expect(r.totalPoints).toBe(15);
    });
  });

  describe("multiplier", () => {
    it("applies streak multiplier to base points", () => {
      const r = evaluateResponse(goTrial({ color: "red" }), "color", false, 5, "left"); // streak 5 = x2
      expect(r.totalPoints).toBe(2); // 1 * 2
    });
  });

  describe("timeout", () => {
    it("null press on go trial is wrong", () => {
      const r = evaluateResponse(goTrial(), "color", false, 0, null);
      expect(r.correct).toBe(false);
      expect(r.feedback).toBe("Too slow!");
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/flux.test.ts`
Expected: FAIL — `evaluateResponse` has wrong signature.

**Step 3: Implement new `evaluateResponse` and `getMultiplier`**

```typescript
/* ---------- multiplier ---------- */

export function getMultiplier(streak: number): number {
  for (const t of STREAK_THRESHOLDS) {
    if (streak >= t.min) return t.multiplier;
  }
  return 1;
}

export function getStreakLabel(streak: number): string {
  for (const t of STREAK_THRESHOLDS) {
    if (streak >= t.min) return t.label;
  }
  return "";
}

/* ---------- correct side ---------- */

function getCorrectSide(trial: Trial, rule: Rule, isNot: boolean): ButtonSide {
  let leftMatch: boolean;

  switch (rule) {
    case "color":
      leftMatch = trial.color === "red" || trial.color === "peach";
      break;
    case "shape":
      leftMatch = trial.shape === "circle" || trial.shape === "pill";
      break;
    case "size":
      leftMatch = trial.size === "big";
      break;
    case "fill":
      leftMatch = trial.fill === "solid";
      break;
  }

  if (isNot) leftMatch = !leftMatch;
  return leftMatch ? "left" : "right";
}

/* ---------- rule labels ---------- */

export function getRuleLabels(rule: Rule, isNot: boolean): [string, string] {
  let left: string;
  let right: string;

  switch (rule) {
    case "color": left = "Warm"; right = "Cool"; break;
    case "shape": left = "Round"; right = "Angular"; break;
    case "size": left = "Big"; right = "Small"; break;
    case "fill": left = "Solid"; right = "Hollow"; break;
  }

  if (isNot) [left, right] = [right, left];
  return [left, right];
}

/* ---------- response evaluation ---------- */

export function evaluateResponse(
  trial: Trial,
  rule: Rule,
  isNot: boolean,
  streak: number,
  pressed: ButtonSide | null,
): ResponseResult {
  const multiplier = getMultiplier(streak);

  // No-go trial
  if (trial.isNoGo) {
    if (pressed !== null) {
      return {
        correct: false,
        basePoints: -1,
        multiplier: 1,
        totalPoints: -1,
        noGoFail: true,
        feedback: "Don't press!",
      };
    }
    return {
      correct: true,
      basePoints: 1,
      multiplier,
      totalPoints: Math.round(1 * multiplier),
      feedback: "",
    };
  }

  // Go trial, no press (timeout)
  if (pressed === null) {
    return {
      correct: false,
      basePoints: -1,
      multiplier: 1,
      totalPoints: -1,
      feedback: "Too slow!",
    };
  }

  // Check correctness
  const correctSide = getCorrectSide(trial, rule, isNot);
  const base = trial.isGolden ? GOLDEN_BASE_POINTS : 1;

  if (pressed === correctSide) {
    return {
      correct: true,
      basePoints: base,
      multiplier,
      totalPoints: Math.round(base * multiplier),
      isGolden: trial.isGolden || undefined,
      feedback: "",
    };
  }

  const [leftLabel, rightLabel] = getRuleLabels(rule, isNot);
  const correctLabel = correctSide === "left" ? leftLabel : rightLabel;
  return {
    correct: false,
    basePoints: -1,
    multiplier: 1,
    totalPoints: -1,
    feedback: `It was ${correctLabel}`,
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/flux.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/games/flux-engine.ts test/flux.test.ts
git commit -m "feat(flux): response evaluation for all rules, NOT inversion, golden multiplier"
```

---

### Task 5: BPM-based adaptive pacing

**Files:**
- Modify: `src/games/flux-engine.ts` (rewrite `updateAdaptation`)
- Modify: `test/flux.test.ts`

**Step 1: Write failing tests**

```typescript
import {
  // ... existing ...
  updateAdaptation,
  bpmToMs,
} from "../src/games/flux-engine";

describe("bpmToMs", () => {
  it("converts 75 BPM to 800ms", () => {
    expect(bpmToMs(75)).toBe(800);
  });

  it("converts 120 BPM to 500ms", () => {
    expect(bpmToMs(120)).toBe(500);
  });
});

describe("updateAdaptation", () => {
  it("increments streak on correct", () => {
    const state = createFluxState(1);
    updateAdaptation(state, true);
    expect(state.streak).toBe(1);
  });

  it("resets streak on wrong", () => {
    const state = createFluxState(1);
    state.streak = 10;
    updateAdaptation(state, false);
    expect(state.streak).toBe(0);
  });

  it("tracks peakStreak", () => {
    const state = createFluxState(1);
    for (let i = 0; i < 8; i++) updateAdaptation(state, true);
    expect(state.peakStreak).toBe(8);
    updateAdaptation(state, false);
    expect(state.peakStreak).toBe(8); // preserved
  });

  it("increases BPM by ~5% after streak of 5", () => {
    const state = createFluxState(1);
    state.bpm = 75;
    for (let i = 0; i < 5; i++) updateAdaptation(state, true);
    expect(state.bpm).toBe(79); // Math.round(75 * 1.05)
  });

  it("does not exceed floor BPM", () => {
    const state = createFluxState(1);
    state.bpm = 89; // close to floor of 90
    for (let i = 0; i < 5; i++) updateAdaptation(state, true);
    expect(state.bpm).toBe(90); // capped at floorBpm
  });

  it("resets BPM to base on wrong", () => {
    const state = createFluxState(1);
    state.bpm = 85;
    updateAdaptation(state, false);
    expect(state.bpm).toBe(75); // back to baseBpm
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/flux.test.ts`
Expected: FAIL.

**Step 3: Implement BPM adaptation**

```typescript
/* ---------- BPM helpers ---------- */

export function bpmToMs(bpm: number): number {
  return Math.round(60000 / bpm);
}

/* ---------- adaptive difficulty ---------- */

export function updateAdaptation(state: FluxState, correct: boolean): void {
  const p = STAGE_PARAMS[state.stage];

  if (correct) {
    state.streak++;
    if (state.streak > state.peakStreak) {
      state.peakStreak = state.streak;
    }
    if (state.streak % STREAK_TO_SPEED === 0) {
      const newBpm = Math.round(state.bpm * (1 + BPM_INCREASE_PERCENT));
      state.bpm = Math.min(p.floorBpm, newBpm);
    }
  } else {
    state.streak = 0;
    state.bpm = p.baseBpm;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/flux.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/games/flux-engine.ts test/flux.test.ts
git commit -m "feat(flux): BPM-based adaptive pacing with proportional speed increase"
```

---

### Task 6: Session acts (warm-up, flow, climax)

**Files:**
- Modify: `src/games/flux-engine.ts` (add `getSessionAct`, `getClimaxGoldenRate`)
- Modify: `test/flux.test.ts`

**Step 1: Write failing tests**

```typescript
import {
  // ... existing ...
  getSessionAct,
} from "../src/games/flux-engine";

describe("getSessionAct", () => {
  it("returns 'warmup' for 0-15s remaining (60-75 elapsed)", () => {
    expect(getSessionAct(75)).toBe("warmup"); // 0s elapsed
    expect(getSessionAct(61)).toBe("warmup"); // 14s elapsed
  });

  it("returns 'flow' for 15-60s elapsed", () => {
    expect(getSessionAct(60)).toBe("flow"); // 15s elapsed
    expect(getSessionAct(16)).toBe("flow"); // 59s elapsed
  });

  it("returns 'climax' for final 15s", () => {
    expect(getSessionAct(15)).toBe("climax"); // 60s elapsed
    expect(getSessionAct(1)).toBe("climax");
    expect(getSessionAct(0)).toBe("climax");
  });
});
```

**Step 2: Run tests, verify fail**

Run: `npx vitest run test/flux.test.ts`

**Step 3: Implement**

```typescript
export type SessionAct = "warmup" | "flow" | "climax";

export function getSessionAct(remaining: number): SessionAct {
  const elapsed = DURATION - remaining;
  if (elapsed < 15) return "warmup";
  if (remaining > 15) return "flow";
  return "climax";
}
```

**Step 4: Run tests, verify pass**

Run: `npx vitest run test/flux.test.ts`

**Step 5: Commit**

```bash
git add src/games/flux-engine.ts test/flux.test.ts
git commit -m "feat(flux): session acts (warmup, flow, climax)"
```

---

### Task 7: CSS shape rendering and layout

**Files:**
- Rewrite: `src/games/flux.css`

No tests for CSS — this is visual. Verify manually with `make dev`.

**Step 1: Rewrite `flux.css` with shape styles**

Replace the entire `src/games/flux.css`. Key sections:

- Shape base styles (`.shape`) with size variants (`.shape-big`, `.shape-small`)
- Shape form variants (`.form-circle`, `.form-pill`, `.form-diamond`, `.form-triangle`, `.form-blob`)
- Color classes (`.color-red`, `.color-peach`, `.color-blue`, `.color-lavender`, `.color-yellow`)
- Fill variants (`.fill-solid`, `.fill-hollow`, `.fill-striped`)
- Size oscillation animation (`.size-oscillating`)
- Golden ring animation (`.golden`)
- Layout: timer ring container, rule cue, stimulus area, streak display, buttons, score
- Button label transition for rule switches
- Timer ring as SVG circle `stroke-dashoffset` animation

See design doc Section 7 for full Catppuccin color mapping.

Key CSS snippets for shapes:

```css
.shape {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--dur-150) ease;
  animation: stimulus-enter var(--dur-150) ease;
}

.shape-big { width: 4rem; height: 4rem; }
.shape-small { width: 2rem; height: 2rem; }

.form-circle { border-radius: 50%; }
.form-pill { border-radius: 50%; width: auto; aspect-ratio: 1.8; }
.form-diamond { clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%); border-radius: 0; }
.form-triangle { clip-path: polygon(50% 0%, 0% 100%, 100% 100%); border-radius: 0; }
.form-blob { border-radius: 40% 60% 55% 45%; }

.fill-solid { background: var(--shape-color); }
.fill-hollow { background: transparent; border: 3px solid var(--shape-color); }
.fill-striped {
  background: repeating-linear-gradient(
    45deg, var(--shape-color) 0 3px, transparent 3px 8px
  );
}
```

**Step 2: Verify visually**

Run: `make dev` and navigate to flux.html. Verify shapes render correctly at all sizes, fills, and colors.

**Step 3: Commit**

```bash
git add src/games/flux.css
git commit -m "feat(flux): CSS shape rendering, layout, and Catppuccin color mapping"
```

---

### Task 8: CSS juice animations and particles

**Files:**
- Modify: `src/games/flux.css`

**Step 1: Add juice animations**

Append to `flux.css`:

- `@keyframes burst-left` / `burst-right` — shape flies to correct side
- `@keyframes crack-split` — shape cracks and splits on wrong
- `@keyframes dissolve` — no-go correct fade + drift up
- `@keyframes explode` — no-go fail scatter
- `@keyframes particle` — small circles scatter from impact (3-5 variants with different end positions)
- `@keyframes switch-shockwave` — expanding ring from center
- `@keyframes golden-shimmer` — ring border pulse
- `@keyframes btn-shake` — button rejection shake
- `@keyframes btn-glow` — correct side glow pulse
- `@keyframes dim-flash` — screen dim on wrong

Particle container:

```css
.particles {
  pointer-events: none;
  position: absolute;
  inset: 0;
}

.particle {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  will-change: transform, opacity;
}
```

**Step 2: Add streak flame styles**

```css
.streak-display {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  height: 2rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  transition: color var(--dur-150) ease, text-shadow var(--dur-150) ease;
}

.streak-spark { color: var(--ctp-peach); }
.streak-flame { color: var(--ctp-red); text-shadow: 0 0 8px var(--ctp-red); }
.streak-blaze { color: var(--ctp-yellow); text-shadow: 0 0 12px var(--ctp-red); }
.streak-inferno { color: var(--ctp-yellow); text-shadow: 0 0 20px var(--ctp-yellow), 0 0 40px var(--ctp-red); }
```

**Step 3: Add `prefers-reduced-motion` overrides**

All juice animations become instant opacity fades. No particles. Streak glow is static.

**Step 4: Verify visually**

Run: `make dev`. Test correct/wrong/nogo animations manually.

**Step 5: Commit**

```bash
git add src/games/flux.css
git commit -m "feat(flux): CSS juice animations, particles, streak flame, reduced-motion"
```

---

### Task 9: CSS timer ring and result screen

**Files:**
- Modify: `src/games/flux.css`

**Step 1: Add timer ring styles**

The timer is an SVG circle with `stroke-dashoffset` animated by JS. CSS handles the color transitions:

```css
.timer-ring {
  position: relative;
  width: 6rem;
  height: 6rem;
}

.timer-ring svg {
  transform: rotate(-90deg);
}

.timer-ring circle {
  fill: none;
  stroke-width: 4;
  stroke-linecap: round;
  transition: stroke var(--dur-250) ease;
}

.timer-ring .track { stroke: var(--ctp-surface1); }
.timer-ring .progress { stroke: var(--ctp-overlay0); }
.timer-ring.low .progress { stroke: var(--ctp-red); }
.timer-ring.climax .progress {
  stroke: var(--ctp-red);
  animation: timer-pulse var(--dur-1000) ease infinite;
}
```

**Step 2: Add result screen styles**

Keep existing `.result` styles but add:
- Score count-up animation (driven by JS, CSS handles the number display)
- Near-miss nudge styling
- Play Again pulse animation
- Peak streak display with flame icon

**Step 3: Commit**

```bash
git add src/games/flux.css
git commit -m "feat(flux): CSS timer ring and result screen styling"
```

---

### Task 10: Sound synthesis additions

**Files:**
- Modify: `scripts/gen-sounds.py`

**Step 1: Add new sound functions to gen-sounds.py**

Add these new sounds to the script, following the existing synthesis patterns (FM synthesis, additive, pedalboard FX):

| Sound | Technique | Duration |
|-------|-----------|----------|
| `beat-tick` | Low wood thump (modal synthesis like move.wav but shorter, quieter) | 50ms |
| `beat-tick-accent` | Same but brighter (add high harmonic) | 50ms |
| `beat-tick-urgent` | Sharper, more attack | 50ms |
| `correct-burst` | FM bell pop (like correct.wav but punchier) | 80ms |
| `wrong-crack` | Noise burst + low thud | 120ms |
| `nogo-dissolve` | Airy chime, high soft tone | 150ms |
| `nogo-fail` | Low buzz (square wave, heavily filtered) | 100ms |
| `switch-whoosh` | Filtered noise sweep (high → low) | 100ms |
| `golden-chime` | Rising FM arpeggio (3 quick notes) | 200ms |
| `streak-up` | Quick rising pitch pip | 60ms |

Add each to the `ALL` list in `sounds.ts` and add corresponding `play*` exports.

**Step 2: Generate sounds**

Run: `.venv/bin/python scripts/gen-sounds.py`

**Step 3: Add exports to sounds.ts**

```typescript
// Flux rhythm
export function playBeatTick(): void { play("beat-tick"); }
export function playBeatTickAccent(): void { play("beat-tick-accent"); }
export function playBeatTickUrgent(): void { play("beat-tick-urgent"); }
export function playCorrectBurst(): void { play("correct-burst"); }
export function playWrongCrack(): void { play("wrong-crack"); }
export function playNogoDissolve(): void { play("nogo-dissolve"); }
export function playNogoFail(): void { play("nogo-fail"); }
export function playSwitchWhoosh(): void { play("switch-whoosh"); }
export function playGoldenChime(): void { play("golden-chime"); }
export function playStreakUp(): void { play("streak-up"); }
```

Add all new names to the `ALL` array for preloading.

**Step 4: Commit**

```bash
git add scripts/gen-sounds.py src/shared/sounds.ts public/sounds/
git commit -m "feat(flux): synthesize rhythm and juice sounds"
```

---

### Task 11: UI — Rhythm loop and game rendering

**Files:**
- Rewrite: `src/games/flux.ts`

This is the largest task. The UI needs:

1. **Beat scheduler** using `AudioContext.currentTime`
2. **Render function** that builds the shape + timer ring + streak + buttons
3. **Input handler** for left/right buttons + keyboard (ArrowLeft/ArrowRight)
4. **Trial lifecycle** tied to the beat

**Step 1: Write the beat scheduler**

```typescript
// Beat scheduling with AudioContext for drift-free rhythm
let audioCtx: AudioContext | null = null;
let nextBeatTime = 0;
let schedulerTimer: ReturnType<typeof setInterval> | null = null;

function getAudioCtx(): AudioContext {
  audioCtx ??= new AudioContext();
  return audioCtx;
}

function startBeatLoop(): void {
  const ctx = getAudioCtx();
  nextBeatTime = ctx.currentTime + 0.1; // small initial delay
  schedulerTimer = setInterval(() => {
    while (nextBeatTime < ctx.currentTime + 0.1) {
      scheduleBeat(nextBeatTime);
      nextBeatTime += bpmToMs(state.bpm) / 1000;
    }
  }, 25); // check every 25ms
}
```

**Step 2: Write the render function**

Replace `renderPlaying()` with new layout:
- SVG timer ring (circle with `stroke-dashoffset`)
- Rule cue (with NOT styling if active)
- Shape div with CSS classes for form/color/size/fill
- Streak display (flame label + multiplier)
- Two buttons with dynamic labels from `getRuleLabels()`
- Score display

**Step 3: Write the trial lifecycle**

Each beat:
1. If previous trial had no response → handle as timeout
2. Generate new trial
3. Render
4. Set response window = until next beat

On response:
1. Lock input
2. Evaluate via `evaluateResponse()`
3. Update score and adaptation via `updateAdaptation()`
4. Play sound
5. Trigger juice animation (CSS class toggles)
6. Wait for next beat to show next trial

**Step 4: Write the input handler**

Click handler on `.flux-btn[data-side]` + keydown for ArrowLeft/ArrowRight.

**Step 5: Wire up timer**

Use existing `createTimer` with `DURATION` (75s). On each tick update the SVG ring `stroke-dashoffset`. On done, call `showResult()`.

**Step 6: Verify manually**

Run: `make dev`. Play through a full 75s session. Verify:
- Shapes render with correct properties
- Rules switch and buttons update
- No-go trials show correct stimuli
- Golden shapes have ring
- Streak flame builds
- BPM accelerates on streaks
- Timer ring depletes
- Beat rhythm feels consistent

**Step 7: Commit**

```bash
git add src/games/flux.ts
git commit -m "feat(flux): rhythm-driven UI with beat scheduler and juice"
```

---

### Task 12: UI — Result screen and one-more-try loop

**Files:**
- Modify: `src/games/flux.ts`

**Step 1: Implement `showResult()`**

```typescript
function showResult(): void {
  gameOver = true;
  stopBeatLoop();

  const finalScore = state.score;
  recordSessionScore("flux", finalScore);

  const accuracy = totalTrials > 0 ? correctTrials / totalTrials : 0;
  recordResult("flux", accuracy);

  const best = getBest("flux");
  const isNewBest = best === null || finalScore > best;
  const nearMiss = !isNewBest && best !== null && finalScore >= best * 0.9;
  const diff = best !== null ? best - finalScore : 0;

  const streakLabel = getStreakLabel(state.peakStreak);
  const streakMult = getMultiplier(state.peakStreak);

  game.innerHTML = `
    <div class="result">
      <div class="final-score" data-target="${finalScore}">0</div>
      ${isNewBest ? '<div class="new-best">NEW BEST</div>' : ""}
      ${nearMiss ? `<div class="near-miss">Only ${diff} from your best!</div>` : ""}
      <div class="result-label">points in ${DURATION} seconds</div>
      <div class="peak-streak">Best streak: ${state.peakStreak}${streakLabel ? ` (x${streakMult} ${streakLabel})` : ""}</div>
      <div class="accuracy">${correctTrials}/${totalTrials} correct</div>
      <div class="result-actions">
        <button id="again-btn">Play Again</button>
        <button id="back-btn" class="secondary">Back to Hub</button>
      </div>
    </div>
  `;

  // Animated score count-up
  animateCountUp(game.querySelector(".final-score")!, finalScore);

  sound.playVictory();
}
```

**Step 2: Implement score count-up**

```typescript
function animateCountUp(el: HTMLElement, target: number): void {
  const duration = 1500;
  const start = performance.now();
  function frame(now: number): void {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = String(Math.round(target * eased));
    if (progress < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
```

**Step 3: Add Play Again button pulse**

After count-up completes, add `.pulse` class to the Play Again button.

**Step 4: Verify manually**

Play a full game, verify result screen shows correctly with near-miss or new-best messages. Test Play Again flow.

**Step 5: Commit**

```bash
git add src/games/flux.ts
git commit -m "feat(flux): result screen with count-up, near-miss, and one-more-try loop"
```

---

### Task 13: Update flux.html duration label

**Files:**
- Modify: `games/flux.html` — no structural changes needed, the HTML is minimal

Verify the page still loads correctly. The `<main id="game">` is populated by JS.

**Step 1: Commit (if any changes)**

```bash
git add games/flux.html
git commit -m "chore(flux): verify flux.html loads redesigned game"
```

---

### Task 14: Integration test — full engine round-trip

**Files:**
- Modify: `test/flux.test.ts` (add integration-style test)

**Step 1: Write integration test**

```typescript
describe("full session simulation", () => {
  it("runs 50 trials through the engine without errors", () => {
    const state = createFluxState(2);
    let score = 0;

    for (let i = 0; i < 50; i++) {
      const prevRule = state.rule;
      const trial = generateTrial(state);
      const rule = state.rule;
      const isNot = state.isNot;

      // Simulate correct response for go trials, withhold for no-go
      const pressed = trial.isNoGo ? null : (
        // Determine correct side
        (() => {
          // Use evaluateResponse to check both sides
          const leftResult = evaluateResponse(trial, rule, isNot, state.streak, "left");
          return leftResult.correct ? "left" as const : "right" as const;
        })()
      );

      const result = evaluateResponse(trial, rule, isNot, state.streak, pressed);
      expect(result.correct).toBe(true);
      score += result.totalPoints;
      updateAdaptation(state, true);
    }

    expect(score).toBeGreaterThan(0);
    expect(state.streak).toBeGreaterThan(0);
    expect(state.bpm).toBeGreaterThanOrEqual(STAGE_PARAMS[2].baseBpm);
  });

  it("handles wrong answers gracefully", () => {
    const state = createFluxState(1);

    for (let i = 0; i < 20; i++) {
      const trial = generateTrial(state);
      const rule = state.rule;
      const isNot = state.isNot;

      // Always press left (will be wrong ~50% of the time)
      const result = evaluateResponse(trial, rule, isNot, state.streak, "left");
      if (result.correct) {
        updateAdaptation(state, true);
      } else {
        updateAdaptation(state, false);
      }
    }

    // State should still be valid
    expect(state.bpm).toBeGreaterThan(0);
    expect(state.trialCount).toBe(20);
  });
});
```

**Step 2: Run all tests**

Run: `npx vitest run test/flux.test.ts`
Expected: ALL PASS.

**Step 3: Run full test suite**

Run: `npm test`
Expected: ALL PASS. No regressions in other test files.

**Step 4: Commit**

```bash
git add test/flux.test.ts
git commit -m "test(flux): integration tests for full session simulation"
```

---

### Task 15: Final manual verification

**No files to commit — manual testing checklist.**

Run: `make dev` and play through all 3 stages.

Verify:
- [ ] Shapes render with all 4 properties visible
- [ ] Color rule sorts warm left, cool right
- [ ] Shape rule sorts round left, angular right
- [ ] Size rule sorts big left, small right
- [ ] Fill rule sorts solid left, hollow right
- [ ] NOT rule inverts the mapping
- [ ] Button labels update on rule switch
- [ ] No-go trials: yellow (color), blob (shape), oscillating (size), striped (fill)
- [ ] Golden shapes have visible ring + chime on correct
- [ ] Streak flame builds through spark → flame → blaze → inferno
- [ ] Multiplier displays correctly
- [ ] BPM accelerates on streaks (shapes come faster)
- [ ] BPM resets on wrong answer (noticeable slowdown)
- [ ] Beat rhythm feels consistent (no drift at 75s mark)
- [ ] Switch moment has shockwave + emphasized beat
- [ ] Timer ring depletes and turns red in final 15s
- [ ] Result screen shows score count-up, peak streak, accuracy
- [ ] Near-miss message appears when within 10% of best
- [ ] NEW BEST celebration when applicable
- [ ] Play Again works instantly
- [ ] Sounds play for all events
- [ ] `prefers-reduced-motion` disables particles and shake
- [ ] Works on mobile viewport (320px width)
- [ ] No console errors

**Final commit if any tweaks needed:**

```bash
git add -A
git commit -m "fix(flux): polish from manual verification"
```
