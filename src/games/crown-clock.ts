export interface ClockOptions {
  initialMs: number;
  incrementMs: number;
  onTick: (remainingMs: number) => void;
  onFlag: () => void;
}

export interface ChessClock {
  start: () => void;
  stop: () => void;
  addIncrement: () => void;
  remaining: () => number;
}

export function createClock(options: ClockOptions): ChessClock {
  let remainingMs = options.initialMs;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let lastTick = 0;

  function stop(): void {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function start(): void {
    lastTick = Date.now();
    intervalId = setInterval(() => {
      const now = Date.now();
      remainingMs -= now - lastTick;
      lastTick = now;
      if (remainingMs <= 0) {
        remainingMs = 0;
        stop();
        options.onFlag();
      }
      options.onTick(remainingMs);
    }, 100);
  }

  function addIncrement(): void {
    remainingMs += options.incrementMs;
  }

  function remaining(): number {
    return remainingMs;
  }

  return { start, stop, addIncrement, remaining };
}

export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min)}:${String(sec).padStart(2, "0")}`;
}
