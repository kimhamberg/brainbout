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
    void fetchBuffer(name);
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
