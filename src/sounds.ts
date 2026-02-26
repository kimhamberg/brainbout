const BASE = `${String(import.meta.env.BASE_URL)}sounds/`;

const cache = new Map<string, HTMLAudioElement>();

function load(name: string): HTMLAudioElement {
  const cached = cache.get(name);
  if (cached) return cached;
  const audio = new Audio(`${BASE}${name}.mp3`);
  cache.set(name, audio);
  return audio;
}

function play(name: string): void {
  const audio = load(name);
  audio.currentTime = 0;
  void audio.play();
}

export function playMove(): void {
  play('Move');
}
export function playCapture(): void {
  play('Capture');
}
export function playCheck(): void {
  play('Check');
}
export function playVictory(): void {
  play('Victory');
}
export function playDefeat(): void {
  play('Defeat');
}
export function playDraw(): void {
  play('Draw');
}
export function playNewGame(): void {
  play('GenericNotify');
}
