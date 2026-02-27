import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTimer } from "../src/shared/timer";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createTimer", () => {
  it("calls onTick every second with remaining time", () => {
    const ticks: number[] = [];
    const timer = createTimer({
      seconds: 3,
      onTick: (remaining) => {
        ticks.push(remaining);
      },
      onDone: () => {
        /* noop */
      },
    });
    timer.start();

    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);

    expect(ticks).toEqual([2, 1, 0]);
  });

  it("calls onDone when time runs out", () => {
    const done = vi.fn<() => void>();
    const timer = createTimer({
      seconds: 2,
      onTick: () => {
        /* noop */
      },
      onDone: done,
    });
    timer.start();

    vi.advanceTimersByTime(2000);

    expect(done).toHaveBeenCalledOnce();
  });

  it("stops when stop() is called", () => {
    const ticks: number[] = [];
    const timer = createTimer({
      seconds: 10,
      onTick: (remaining) => {
        ticks.push(remaining);
      },
      onDone: () => {
        /* noop */
      },
    });
    timer.start();

    vi.advanceTimersByTime(2000);
    timer.stop();
    vi.advanceTimersByTime(5000);

    expect(ticks).toEqual([9, 8]);
  });
});
