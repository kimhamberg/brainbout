import { describe, it, expect, beforeEach, afterEach, jest } from "bun:test";
import { createTimer } from "../src/shared/timer";

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
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

    jest.advanceTimersByTime(1000);
    jest.advanceTimersByTime(1000);
    jest.advanceTimersByTime(1000);

    expect(ticks).toEqual([2, 1, 0]);
  });

  it("calls onDone when time runs out", () => {
    const done = jest.fn<() => void>();
    const timer = createTimer({
      seconds: 2,
      onTick: () => {
        /* noop */
      },
      onDone: done,
    });
    timer.start();

    jest.advanceTimersByTime(2000);

    expect(done).toHaveBeenCalledTimes(1);
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

    jest.advanceTimersByTime(2000);
    timer.stop();
    jest.advanceTimersByTime(5000);

    expect(ticks).toEqual([9, 8]);
  });
});
