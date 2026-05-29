/**
 * Reaction-time keystone (design docs/design/03 §0, corrected by audit VH-1/14/15/16).
 *
 * The cognitive validity of Crown/Flux depends on a clean stimulus-onset
 * timestamp. Two facts from the browser-timing literature (jsPsych; Behavior
 * Research Methods 2022) drive the design:
 *   • a SINGLE requestAnimationFrame callback runs BEFORE that frame's paint —
 *     anchoring onset there is one frame too early. Use a DOUBLE rAF (or
 *     requestPostAnimationFrame) so onset lands at/after the paint boundary.
 *   • STOPPING the rAF loop for the trial is the documented low-precision case;
 *     keep it running. "frozen" means *no cosmetic mutation*, never *stop*.
 *
 * The frame scheduler + clock are INJECTED (like rng) so the post-paint ordering
 * is deterministically unit-testable without a real browser.
 */

export interface InputEvent {
  /** DOMHighResTimeStamp — same monotonic origin as performance.now(). */
  timeStamp?: number;
}

export interface FrameScheduler {
  /** rAF-like: invoke cb on the next animation frame. The loop never stops. */
  requestFrame(cb: (t: number) => void): void;
  /** Monotonic clock (performance.now-like). */
  now(): number;
}

/** Browser-backed scheduler (used in the app; tests inject a fake). */
export function browserScheduler(): FrameScheduler {
  return {
    requestFrame: (cb) => {
      requestAnimationFrame(cb);
    },
    now: () => performance.now(),
  };
}

type Phase = "idle" | "arming" | "armed" | "responded" | "settled";

export class TrialClock {
  private phase: Phase = "idle";
  private onset = Number.NaN;

  constructor(private readonly scheduler: FrameScheduler) {}

  /** Cosmetics check this: no sway/particle/filter mutation while true. */
  get frozen(): boolean {
    return (
      this.phase === "arming" ||
      this.phase === "armed" ||
      this.phase === "responded"
    );
  }

  get armed(): boolean {
    return this.phase === "armed";
  }

  /** The post-paint onset timestamp (NaN until armed). */
  get onsetTime(): number {
    return this.onset;
  }

  /**
   * Commit a stimulus, then anchor onset at the POST-PAINT boundary via a double
   * rAF. `render` must synchronously add the stimulus to the stage; `onArmed`
   * fires once input is live, with the onset timestamp.
   */
  armTrial(render: () => void, onArmed: (onset: number) => void): void {
    render();
    this.phase = "arming";
    this.scheduler.requestFrame(() => {
      // frame 1: the browser paints the just-committed stimulus this frame.
      this.scheduler.requestFrame(() => {
        // frame 2: that paint is now on screen → a safe onset anchor.
        this.onset = this.scheduler.now();
        this.phase = "armed";
        onArmed(this.onset);
      });
    });
  }

  /**
   * RT from the input event's high-res timeStamp (removes handler-dispatch
   * jitter; same clock as onset). Falls back to now() if the event lacks a
   * usable timeStamp. Call this as the FIRST statement of the input handler,
   * before any grading or IO (VH-16).
   */
  recordResponse(ev?: InputEvent): number {
    if (this.phase !== "armed") {
      throw new Error("recordResponse() before trial armed");
    }
    const ts = ev?.timeStamp;
    const t =
      typeof ts === "number" && Number.isFinite(ts) && ts > 0
        ? ts
        : this.scheduler.now();
    this.phase = "responded";
    return t - this.onset;
  }

  /**
   * Unfreeze (cosmetics may now run) and run persistence DEFERRED — off the
   * measured window — on the next frame (or pass a requestIdleCallback shim).
   */
  settle(persist?: () => void): void {
    this.phase = "settled";
    if (persist) {
      this.scheduler.requestFrame(() => {
        persist();
      });
    }
  }
}
