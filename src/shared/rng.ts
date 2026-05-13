export type Rng = () => number;

let current: Rng = Math.random;

export function rng(): number {
  return current();
}

export function setRng(fn: Rng): void {
  current = fn;
}

export function resetRng(): void {
  current = Math.random;
}
