const BASE = `${import.meta.env.BASE_URL}sounds/`;

const cache = new Map<string, HTMLAudioElement>();

function load(name: string): HTMLAudioElement {
  const cached = cache.get(name);
  if (cached) return cached;
  const audio = new Audio(`${BASE}${name}.wav`);
  cache.set(name, audio);
  return audio;
}

function play(name: string): void {
  const audio = load(name);
  audio.currentTime = 0;
  void audio.play();
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
