import { describe, expect, test } from "bun:test";
import type { Trial } from "../src/games/flux-engine";
import {
  computeResultVm,
  RING_CIRCUMFERENCE,
  renderResultHtml,
  ringClass,
  ringOffset,
  shapeClasses,
  shapeHtml,
  streakBadgeHtml,
} from "../src/games/flux-render";

function trial(over: Partial<Trial> = {}): Trial {
  return {
    shape: "circle",
    color: "red",
    fill: "solid",
    size: "small",
    isGolden: false,
    ...over,
  } as Trial;
}

describe("shapeClasses", () => {
  test("emits shape + size + form + color + fill in order", () => {
    expect(
      shapeClasses(
        trial({ shape: "diamond", color: "blue", fill: "hollow", size: "big" }),
      ),
    ).toBe("shape shape-big form-diamond color-blue fill-hollow");
  });
  test("respects sizeOverride", () => {
    expect(
      shapeClasses(trial({ size: "big" }), "small").includes("shape-small"),
    ).toBe(true);
  });
  test("appends 'golden' when isGolden=true", () => {
    expect(shapeClasses(trial({ isGolden: true }))).toContain(" golden");
  });
});

describe("shapeHtml", () => {
  test("non-dual renders a single shape div", () => {
    const html = shapeHtml(trial());
    expect((html.match(/<div/gu) ?? []).length).toBe(1);
    expect(html).toContain("shape-small");
  });
  test("dual renders a wrapper + 2 inner shapes (small)", () => {
    const html = shapeHtml(trial({ size: "dual" }));
    expect(html).toContain('shape shape-dual"');
    const inner = html.match(/<div class="shape shape-small/gu) ?? [];
    expect(inner.length).toBe(2);
  });
});

describe("streakBadgeHtml", () => {
  test("empty when streak < 3", () => {
    expect(streakBadgeHtml(0, 1, "")).toBe("");
    expect(streakBadgeHtml(2, 1, "")).toBe("");
  });
  test("renders class and label at streak >= 3", () => {
    expect(streakBadgeHtml(3, 2, "hot")).toBe(
      '<div class="streak-display streak-hot">x2 hot</div>',
    );
  });
});

describe("ringClass", () => {
  test("'climax' act overrides remaining-time class", () => {
    expect(ringClass(60, "climax")).toBe("timer-ring climax");
    expect(ringClass(5, "climax")).toBe("timer-ring climax");
  });
  test("remaining <= 15 outside climax → 'low'", () => {
    expect(ringClass(15, "flow")).toBe("timer-ring low");
    expect(ringClass(10, "warmup")).toBe("timer-ring low");
    expect(ringClass(0, "flow")).toBe("timer-ring low");
  });
  test("remaining > 15 outside climax → base 'timer-ring'", () => {
    expect(ringClass(16, "warmup")).toBe("timer-ring");
    expect(ringClass(60, "flow")).toBe("timer-ring");
  });
});

describe("ringOffset", () => {
  test("full ring at remaining=0 (offset = circumference)", () => {
    expect(ringOffset(0, 60)).toBeCloseTo(RING_CIRCUMFERENCE, 5);
  });
  test("zero offset at remaining = duration", () => {
    expect(ringOffset(60, 60)).toBeCloseTo(0, 5);
  });
  test("half offset at half progress", () => {
    expect(ringOffset(30, 60)).toBeCloseTo(RING_CIRCUMFERENCE / 2, 5);
  });
});

describe("computeResultVm", () => {
  const base = {
    finalScore: 100,
    previousBest: 90,
    duration: 60,
    peakStreak: 7,
    peakStreakLabel: "hot",
    peakStreakMult: 2,
    correctTrials: 14,
    totalTrials: 20,
  } as const;

  test("isNewBest true when no previous best", () => {
    expect(computeResultVm({ ...base, previousBest: null }).isNewBest).toBe(
      true,
    );
  });
  test("isNewBest true when finalScore > previousBest", () => {
    expect(
      computeResultVm({ ...base, finalScore: 100, previousBest: 90 }).isNewBest,
    ).toBe(true);
  });
  test("isNewBest false when finalScore == previousBest (strict >)", () => {
    const vm = computeResultVm({ ...base, finalScore: 90, previousBest: 90 });
    expect(vm.isNewBest).toBe(false);
  });
  test("nearMiss when within 10% of previous best (finalScore >= 0.9 * best)", () => {
    const vm = computeResultVm({ ...base, finalScore: 81, previousBest: 90 });
    expect(vm.nearMiss).toEqual({ gap: 9 });
  });
  test("no nearMiss when below 90% of previous best", () => {
    expect(
      computeResultVm({ ...base, finalScore: 80, previousBest: 90 }).nearMiss,
    ).toBe(false);
  });
  test("no nearMiss when isNewBest", () => {
    expect(
      computeResultVm({ ...base, finalScore: 100, previousBest: 90 }).nearMiss,
    ).toBe(false);
  });
  test("no nearMiss when no previousBest", () => {
    expect(
      computeResultVm({ ...base, finalScore: 100, previousBest: null })
        .nearMiss,
    ).toBe(false);
  });
});

describe("renderResultHtml", () => {
  const base = computeResultVm({
    finalScore: 42,
    previousBest: 30,
    duration: 60,
    peakStreak: 7,
    peakStreakLabel: "hot",
    peakStreakMult: 2,
    correctTrials: 14,
    totalTrials: 20,
  });

  test("renders final score, NEW BEST badge, peak-streak with suffix", () => {
    const html = renderResultHtml(base);
    expect(html).toContain('class="final-score"');
    expect(html).toContain('data-target="42"');
    expect(html).toContain("NEW BEST");
    expect(html).toContain("Best streak: 7 (x2 hot)");
    expect(html).toContain("14/20 correct");
    expect(html).toContain("Play Again");
    expect(html).toContain("Back to Hub");
  });

  test("no NEW BEST when previous best higher", () => {
    const vm = computeResultVm({
      finalScore: 20,
      previousBest: 100,
      duration: 60,
      peakStreak: 1,
      peakStreakLabel: "",
      peakStreakMult: 1,
      correctTrials: 1,
      totalTrials: 5,
    });
    expect(renderResultHtml(vm)).not.toContain("NEW BEST");
  });

  test("renders near-miss banner with exact gap", () => {
    const vm = computeResultVm({
      finalScore: 95,
      previousBest: 100,
      duration: 60,
      peakStreak: 0,
      peakStreakLabel: "",
      peakStreakMult: 1,
      correctTrials: 0,
      totalTrials: 0,
    });
    expect(renderResultHtml(vm)).toContain("Only 5 from your best!");
  });

  test("peak-streak suffix omitted when no label", () => {
    const vm = computeResultVm({
      finalScore: 5,
      previousBest: null,
      duration: 60,
      peakStreak: 2,
      peakStreakLabel: "",
      peakStreakMult: 1,
      correctTrials: 0,
      totalTrials: 0,
    });
    expect(renderResultHtml(vm)).toContain("Best streak: 2</div>");
  });
});
