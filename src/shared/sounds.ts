const BASE = `${import.meta.env.BASE_URL}sounds/`;

let ctx: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer>>();

function getCtx(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

async function fetchBuffer(name: string): Promise<AudioBuffer> {
  const inflight = loading.get(name);
  if (inflight) return inflight;
  const promise = fetch(`${BASE}${name}.wav`)
    .then(async (r) => r.arrayBuffer())
    .then(async (data) => getCtx().decodeAudioData(data))
    .then((buf) => {
      buffers.set(name, buf);
      return buf;
    });
  loading.set(name, promise);
  return promise;
}

const ALL = [
  "correct",
  "wrong",
  "move",
  "capture",
  "check",
  "victory",
  "defeat",
  "draw",
  "notify",
  "beat-tick",
  "beat-tick-accent",
  "beat-tick-urgent",
  "correct-burst",
  "wrong-crack",
  "nogo-dissolve",
  "nogo-fail",
  "switch-whoosh",
  "golden-chime",
  "streak-up",
];

let preloaded = false;
function preloadAll(): void {
  if (preloaded) return;
  preloaded = true;
  for (const n of ALL) void fetchBuffer(n);
}

function play(name: string): void {
  const actx = getCtx();
  preloadAll();
  const buf = buffers.get(name);
  if (!buf) {
    void fetchBuffer(name).then((b) => {
      const s = actx.createBufferSource();
      s.buffer = b;
      s.connect(actx.destination);
      s.start();
    });
    return;
  }
  const src = actx.createBufferSource();
  src.buffer = buf;
  src.connect(actx.destination);
  src.start();
}

// Brain-training games
export function playCorrect(): void {
  play("correct");
}
export function playWrong(): void {
  play("wrong");
}

// Chess
export function playMove(): void {
  play("move");
}
export function playCapture(): void {
  play("capture");
}
export function playCheck(): void {
  play("check");
}

// Outcomes
export function playVictory(): void {
  play("victory");
}
export function playDefeat(): void {
  play("defeat");
}
export function playDraw(): void {
  play("draw");
}

// UI
export function playNotify(): void {
  play("notify");
}

// Flux rhythm
export function playBeatTick(): void {
  play("beat-tick");
}
export function playBeatTickAccent(): void {
  play("beat-tick-accent");
}
export function playBeatTickUrgent(): void {
  play("beat-tick-urgent");
}
export function playCorrectBurst(): void {
  play("correct-burst");
}
export function playWrongCrack(): void {
  play("wrong-crack");
}
export function playNogoDissolve(): void {
  play("nogo-dissolve");
}
export function playNogoFail(): void {
  play("nogo-fail");
}
export function playSwitchWhoosh(): void {
  play("switch-whoosh");
}
export function playGoldenChime(): void {
  play("golden-chime");
}
export function playStreakUp(): void {
  play("streak-up");
}

// Flux background music
let bgmSource: AudioBufferSourceNode | null = null;

export function startBgm(): void {
  stopBgm();
  const actx = getCtx();
  preloadAll();

  const buf = buffers.get("flux-bgm");
  if (!buf) {
    void fetchBuffer("flux-bgm").then((b) => {
      if (bgmSource) return; // already started by retry
      const src = actx.createBufferSource();
      src.buffer = b;
      const gain = actx.createGain();
      gain.gain.value = 0.35;
      src.connect(gain);
      gain.connect(actx.destination);
      src.start();
      bgmSource = src;
    });
    return;
  }

  const src = actx.createBufferSource();
  src.buffer = buf;
  const gain = actx.createGain();
  gain.gain.value = 0.35;
  src.connect(gain);
  gain.connect(actx.destination);
  src.start();
  bgmSource = src;
}

export function stopBgm(): void {
  if (bgmSource) {
    try {
      bgmSource.stop();
    } catch {
      // already stopped
    }
    bgmSource = null;
  }
}
