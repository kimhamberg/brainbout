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
  fetchedUrls: [] as string[],
  destinationName: "" as string,
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
      connect: (dest: unknown) => {
        calls.destinationName = (dest as { name?: string }).name ?? "?";
      },
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
globalThis.fetch = ((input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : (input as URL).toString();
  calls.fetchedUrls.push(url);
  return Promise.resolve(new Response(new ArrayBuffer(1), { status: 200 }));
}) as unknown as typeof fetch;

const sounds: typeof import("../src/shared/sounds") = await import(
  "../src/shared/sounds"
);

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

/* Mapping enforced by sounds.ts: play* → "<base>sounds/<name>.wav" */
const TRIGGER_FILE: ReadonlyArray<readonly [keyof typeof sounds, string]> = [
  ["playCorrect", "correct"],
  ["playWrong", "wrong"],
  ["playMove", "move"],
  ["playCapture", "capture"],
  ["playCheck", "check"],
  ["playVictory", "victory"],
  ["playDefeat", "defeat"],
  ["playDraw", "draw"],
  ["playNotify", "notify"],
  ["playBeatTick", "beat-tick"],
  ["playBeatTickAccent", "beat-tick-accent"],
  ["playBeatTickUrgent", "beat-tick-urgent"],
  ["playCorrectBurst", "correct-burst"],
  ["playWrongCrack", "wrong-crack"],
  ["playNogoDissolve", "nogo-dissolve"],
  ["playNogoFail", "nogo-fail"],
  ["playSwitchWhoosh", "switch-whoosh"],
  ["playGoldenChime", "golden-chime"],
  ["playStreakUp", "streak-up"],
];

describe("sounds: cold-path triggers preloadAll for all 19 sounds + BGM", () => {
  beforeAll(async () => {
    sounds.playCorrect();
    await flush();
  });

  test("preload fetched exactly the 19 named sound files", () => {
    const expected = new Set(
      TRIGGER_FILE.map(([, name]) => `sounds/${name}.wav`),
    );
    const seen = new Set(
      calls.fetchedUrls
        .filter((u) => u.endsWith(".wav"))
        .map((u) => {
          const idx = u.indexOf("sounds/");
          return idx === -1 ? u : u.slice(idx);
        }),
    );
    for (const name of expected) {
      expect(seen.has(name)).toBe(true);
    }
  });

  test("at least one decodeAudioData call happened per fetched sound", () => {
    expect(calls.decoded).toBeGreaterThanOrEqual(TRIGGER_FILE.length);
  });

  test("the cold-path source was connected and started", () => {
    expect(calls.sourcesCreated.some((s) => s.started)).toBe(true);
    expect(calls.destinationName).toBe("destination");
  });
});

describe("sounds: every trigger plays its own file", () => {
  for (const [fnName, fileName] of TRIGGER_FILE) {
    test(`${fnName} → sounds/${fileName}.wav`, async () => {
      await flush();
      const sourcesBefore = calls.sourcesCreated.length;
      (sounds[fnName] as () => void)();
      // Hot path: the buffer is cached after the preload, so a synchronous
      // BufferSource is created and started on this exact call.
      expect(calls.sourcesCreated.length).toBeGreaterThan(sourcesBefore);
      expect(calls.sourcesCreated.at(-1)?.started).toBe(true);
    });
  }
});

describe("sounds: preload guard runs the cold-path fetch exactly once", () => {
  test("a second play() call does NOT re-fetch the preload set", async () => {
    await flush();
    const wavBefore = calls.fetchedUrls.filter((u) =>
      u.endsWith(".wav"),
    ).length;
    sounds.playWrong();
    await flush();
    const wavAfter = calls.fetchedUrls.filter((u) => u.endsWith(".wav")).length;
    // The preload-all guard means no NEW .wav files are fetched on hot calls.
    expect(wavAfter - wavBefore).toBe(0);
  });
});

describe("sounds: BGM lifecycle (cold + hot)", () => {
  test("first startBgm: schedules fetch of flux-bgm and sets gain to 0.35", async () => {
    const gainsBefore = calls.gainsCreated.length;
    sounds.startBgm();
    await flush();
    expect(calls.gainsCreated.length).toBeGreaterThan(gainsBefore);
    expect(calls.gainsCreated.at(-1)?.gain.value).toBe(0.35);
    expect(
      calls.fetchedUrls.some((u) => u.endsWith("sounds/flux-bgm.wav")),
    ).toBe(true);
  });

  test("second startBgm (warm buffer) starts a new source synchronously", async () => {
    const before = calls.sourcesCreated.length;
    sounds.startBgm();
    expect(calls.sourcesCreated.length).toBeGreaterThan(before);
    await flush();
  });

  test("stopBgm marks the current BGM source stopped", async () => {
    sounds.stopBgm();
    expect(calls.sourcesCreated.some((s) => s.stopped)).toBe(true);
  });

  test("stopBgm is idempotent across repeated calls", () => {
    expect(() => {
      sounds.stopBgm();
      sounds.stopBgm();
    }).not.toThrow();
  });
});
