export interface TimerOptions {
  seconds: number;
  onTick: (remaining: number) => void;
  onDone: () => void;
}

export interface Timer {
  start: () => void;
  stop: () => void;
}

export function createTimer(options: TimerOptions): Timer {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let remaining = options.seconds;

  function tick(): void {
    remaining--;
    options.onTick(remaining);
    if (remaining <= 0) {
      stop();
      options.onDone();
    }
  }

  function start(): void {
    remaining = options.seconds;
    intervalId = setInterval(tick, 1000);
  }

  function stop(): void {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  return { start, stop };
}
