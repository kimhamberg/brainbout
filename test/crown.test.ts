import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";

// Set up the DOM before importing the module, since crown.ts
// runs document.getElementById("game") at the top level on import.
document.body.innerHTML = '<main id="game"></main>';

// Stub Worker so StockfishEngine.init() doesn't throw when the
// module-level main() fires during import.
function fakeWorker(): void {
  /* stub constructor */
}
fakeWorker.prototype.addEventListener = function addEventListener(): void {
  /* stub */
};
fakeWorker.prototype.postMessage = function postMessage(): void {
  /* stub */
};
fakeWorker.prototype.terminate = function terminate(): void {
  /* stub */
};
globalThis.Worker = fakeWorker as unknown as typeof Worker;

const { createClock } = await import("../src/games/crown");

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
