import { describe, expect, test } from "bun:test";
import { type FrameScheduler, TrialClock } from "../src/scene/trial-clock";

function makeFake(start = 1000): {
  sched: FrameScheduler;
  tick: (dt?: number) => void;
  setNow: (v: number) => void;
  pending: () => number;
  now: () => number;
} {
  let t = start;
  const q: Array<(t: number) => void> = [];
  return {
    sched: {
      requestFrame: (cb) => {
        q.push(cb);
      },
      now: () => t,
    },
    tick: (dt = 16) => {
      t += dt;
      const cb = q.shift();
      if (cb) cb(t);
    },
    setNow: (v) => {
      t = v;
    },
    pending: () => q.length,
    now: () => t,
  };
}

describe("TrialClock — post-paint onset (VH-1)", () => {
  test("onset is anchored on the SECOND frame, not the first", () => {
    const fake = makeFake();
    const clock = new TrialClock(fake.sched);
    let armedOnset = Number.NaN;
    let renderCount = 0;

    clock.armTrial(
      () => {
        renderCount++;
      },
      (onset) => {
        armedOnset = onset;
      },
    );

    expect(renderCount).toBe(1); // stimulus committed synchronously
    expect(clock.frozen).toBe(true);
    expect(clock.armed).toBe(false);
    expect(Number.isNaN(clock.onsetTime)).toBe(true);

    fake.tick(); // frame 1 — paint happens this frame; onset NOT captured yet
    expect(clock.armed).toBe(false);
    expect(Number.isNaN(armedOnset)).toBe(true);

    fake.tick(); // frame 2 — post-paint → onset captured here
    expect(clock.armed).toBe(true);
    expect(armedOnset).toBe(fake.now());
    expect(clock.onsetTime).toBe(armedOnset);
  });

  test("loop is never stopped; frozen just suppresses cosmetics", () => {
    const fake = makeFake();
    const clock = new TrialClock(fake.sched);
    clock.armTrial(
      () => {},
      () => {},
    );
    // Frames keep being requestable (the loop is alive), and frozen holds
    // through arming → armed until settle.
    expect(clock.frozen).toBe(true);
    fake.tick();
    fake.tick();
    expect(clock.frozen).toBe(true); // still frozen while armed
  });
});

describe("TrialClock — response RT (VH-15/16)", () => {
  function arm(): { clock: TrialClock; fake: ReturnType<typeof makeFake> } {
    const fake = makeFake();
    const clock = new TrialClock(fake.sched);
    clock.armTrial(
      () => {},
      () => {},
    );
    fake.tick();
    fake.tick();
    return { clock, fake };
  }

  test("RT uses the event's high-res timeStamp", () => {
    const { clock } = arm();
    const onset = clock.onsetTime;
    expect(clock.recordResponse({ timeStamp: onset + 250 })).toBe(250);
  });

  test("RT falls back to the clock when timeStamp is absent/zero", () => {
    const { clock, fake } = arm();
    const onset = clock.onsetTime;
    fake.setNow(onset + 400);
    expect(clock.recordResponse({})).toBe(400);
    const a = arm();
    a.fake.setNow(a.clock.onsetTime + 99);
    expect(a.clock.recordResponse({ timeStamp: 0 })).toBe(99);
  });

  test("recordResponse before armed throws", () => {
    const fake = makeFake();
    const clock = new TrialClock(fake.sched);
    expect(() => clock.recordResponse({ timeStamp: 1 })).toThrow();
    clock.armTrial(
      () => {},
      () => {},
    );
    fake.tick(); // only one frame → not armed yet
    expect(() => clock.recordResponse({ timeStamp: 1 })).toThrow();
  });
});

describe("TrialClock — deferred persist (VH-16)", () => {
  test("persist runs deferred, never inside the measured window", () => {
    const fake = makeFake();
    const clock = new TrialClock(fake.sched);
    clock.armTrial(
      () => {},
      () => {},
    );
    fake.tick();
    fake.tick();
    clock.recordResponse({ timeStamp: clock.onsetTime + 10 });

    let persisted = 0;
    expect(clock.frozen).toBe(true); // responded but not settled → still frozen
    clock.settle(() => {
      persisted++;
    });
    expect(clock.frozen).toBe(false); // unfrozen immediately
    expect(persisted).toBe(0); // but persist NOT yet run (deferred)

    fake.tick(); // a frame later
    expect(persisted).toBe(1);
  });
});
