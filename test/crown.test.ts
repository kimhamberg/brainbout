import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import { createClock, formatClock } from "../src/games/crown-clock";

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("createClock", () => {
  it("starts at the given time and counts down", () => {
    const ticks: number[] = [];
    const clock = createClock({
      initialMs: 3000,
      incrementMs: 0,
      onTick: (ms: number) => {
        ticks.push(ms);
      },
      onFlag: () => {
        /* noop */
      },
    });
    clock.start();

    jest.advanceTimersByTime(100);
    jest.advanceTimersByTime(100);

    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks[0]).toBeLessThan(3000);
    clock.stop();
  });

  it("calls onFlag when time runs out", () => {
    const onFlag = jest.fn<() => void>();
    const clock = createClock({
      initialMs: 500,
      incrementMs: 0,
      onTick: () => {
        /* noop */
      },
      onFlag,
    });
    clock.start();

    jest.advanceTimersByTime(600);

    expect(onFlag).toHaveBeenCalledTimes(1);
  });

  it("remaining() reflects elapsed time", () => {
    const clock = createClock({
      initialMs: 5000,
      incrementMs: 0,
      onTick: () => {
        /* noop */
      },
      onFlag: () => {
        /* noop */
      },
    });
    expect(clock.remaining()).toBe(5000);
    clock.start();
    jest.advanceTimersByTime(1500);
    clock.stop();
    expect(clock.remaining()).toBeLessThan(5000);
    expect(clock.remaining()).toBeGreaterThanOrEqual(0);
  });

  it("stop is idempotent (no throw if called twice)", () => {
    const clock = createClock({
      initialMs: 1000,
      incrementMs: 0,
      onTick: () => {
        /* noop */
      },
      onFlag: () => {
        /* noop */
      },
    });
    clock.start();
    clock.stop();
    expect(() => clock.stop()).not.toThrow();
  });

  it("clamps remaining to 0 on flag (never negative)", () => {
    let lastMs = -1;
    const clock = createClock({
      initialMs: 100,
      incrementMs: 0,
      onTick: (ms) => {
        lastMs = ms;
      },
      onFlag: () => {
        /* noop */
      },
    });
    clock.start();
    jest.advanceTimersByTime(1000);
    expect(lastMs).toBeGreaterThanOrEqual(0);
    expect(clock.remaining()).toBe(0);
  });

  it("adds increment on addIncrement()", () => {
    let lastMs = 0;
    const clock = createClock({
      initialMs: 3000,
      incrementMs: 2000,
      onTick: (ms: number) => {
        lastMs = ms;
      },
      onFlag: () => {
        /* noop */
      },
    });
    clock.start();

    jest.advanceTimersByTime(1000);
    clock.stop();
    clock.addIncrement();
    // Should be roughly 2000 (3000 - 1000) + 2000 increment = 4000
    clock.start();
    jest.advanceTimersByTime(100);
    expect(lastMs).toBeGreaterThan(3500);
    clock.stop();
  });
});

describe("formatClock", () => {
  it("formats whole minutes", () => {
    expect(formatClock(60_000)).toBe("1:00");
    expect(formatClock(15 * 60_000)).toBe("15:00");
  });
  it("formats sub-minute correctly", () => {
    expect(formatClock(45_000)).toBe("0:45");
    expect(formatClock(5_000)).toBe("0:05");
  });
  it("ceils to the next second (in-game timer presentation)", () => {
    expect(formatClock(999)).toBe("0:01");
    expect(formatClock(1)).toBe("0:01");
  });
  it("zero and negative values clamp to 0:00", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(-1000)).toBe("0:00");
  });
  it("pads seconds with leading zero", () => {
    expect(formatClock(63_000)).toBe("1:03");
    expect(formatClock(125_000)).toBe("2:05");
  });
});
