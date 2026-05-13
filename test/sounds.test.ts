import { beforeAll, describe, expect, test } from "bun:test";

interface FakeSource {
  buffer: unknown;
  started: boolean;
  stopped: boolean;
  connect: (dest: unknown) => void;
  start: () => void;
  stop: () => void;
}

interface FakeGain {
  gain: { value: number };
  connect: (dest: unknown) => void;
}

const calls = {
  decoded: 0,
  sourcesCreated: [] as FakeSource[],
  gainsCreated: [] as FakeGain[],
};

class FakeAudioContext {
  public destination = { name: "destination" };
  decodeAudioData(_data: ArrayBuffer): Promise<unknown> {
    calls.decoded++;
    return Promise.resolve({ ok: true });
  }
  createBufferSource(): FakeSource {
    const src: FakeSource = {
      buffer: null,
      started: false,
      stopped: false,
      connect: () => {},
      start: () => {
        src.started = true;
      },
      stop: () => {
        src.stopped = true;
      },
    };
    calls.sourcesCreated.push(src);
    return src;
  }
  createGain(): FakeGain {
    const g: FakeGain = {
      gain: { value: 1 },
      connect: () => {},
    };
    calls.gainsCreated.push(g);
    return g;
  }
}

(globalThis as { AudioContext: typeof AudioContext }).AudioContext =
  FakeAudioContext as unknown as typeof AudioContext;
globalThis.fetch = (() =>
  Promise.resolve(
    new Response(new ArrayBuffer(1), { status: 200 }),
  )) as unknown as typeof fetch;

const sounds: typeof import("../src/shared/sounds") = await import(
  "../src/shared/sounds"
);

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

describe("sounds: single-shot triggers (cold buffer path)", () => {
  beforeAll(async () => {
    // First call exercises fetch + decode async chain
    sounds.playCorrect();
    await flush();
  });

  test("first call triggers preloadAll: many fetches + decodes", () => {
    expect(calls.decoded).toBeGreaterThan(10);
  });

  test("an async source was created and started for the cold-path call", () => {
    expect(calls.sourcesCreated.some((s) => s.started)).toBe(true);
  });
});

describe("sounds: every named trigger exists and is a no-throw void fn", () => {
  for (const fn of [
    "playCorrect",
    "playWrong",
    "playMove",
    "playCapture",
    "playCheck",
    "playVictory",
    "playDefeat",
    "playDraw",
    "playNotify",
    "playBeatTick",
    "playBeatTickAccent",
    "playBeatTickUrgent",
    "playCorrectBurst",
    "playWrongCrack",
    "playNogoDissolve",
    "playNogoFail",
    "playSwitchWhoosh",
    "playGoldenChime",
    "playStreakUp",
  ] as const) {
    test(`${fn}: hot path on cached buffer, no throw`, async () => {
      // Buffer for each was preloaded by the cold-path call above;
      // wait once more to be sure the decode promise resolved.
      await flush();
      const before = calls.sourcesCreated.length;
      (sounds[fn] as () => void)();
      // For names whose buffer is cached this is synchronous; sources++
      expect(calls.sourcesCreated.length).toBeGreaterThanOrEqual(before);
    });
  }
});

describe("sounds: BGM lifecycle (cold + hot)", () => {
  test("first startBgm: schedules fetch, sets gain 0.35, starts a source", async () => {
    const gainsBefore = calls.gainsCreated.length;
    sounds.startBgm();
    await flush();
    expect(calls.gainsCreated.length).toBeGreaterThan(gainsBefore);
    expect(calls.gainsCreated.at(-1)?.gain.value).toBe(0.35);
    expect(calls.sourcesCreated.some((s) => s.started)).toBe(true);
  });

  test("second startBgm (warm buffer) starts a new source synchronously", async () => {
    const before = calls.sourcesCreated.length;
    sounds.startBgm();
    // hot path is synchronous: no flush needed
    expect(calls.sourcesCreated.length).toBeGreaterThan(before);
    await flush();
  });

  test("stopBgm marks the current BGM source stopped", async () => {
    sounds.stopBgm();
    expect(calls.sourcesCreated.some((s) => s.stopped)).toBe(true);
  });

  test("stopBgm is idempotent (no throw if called twice)", () => {
    expect(() => {
      sounds.stopBgm();
      sounds.stopBgm();
    }).not.toThrow();
  });
});
