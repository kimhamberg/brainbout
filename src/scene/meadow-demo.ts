/**
 * Phase-4 Meadow + Weather demo: a playable flux session (sort by the active
 * rule / withhold on a no-go by NOT tapping / rule switches) via
 * createMeadowBlock behind the BlockOutcome seam.
 *
 * Defaults to the standalone TIMED challenge (75s). Query overrides for tests:
 *   ?n=<beats>  → beat-count bound (the switch test pins 26 so a real weather
 *                 switch is guaranteed); ?ms=<millis> → shorter time bound.
 */

export {}; // module scope (the only imports are dynamic, inside the IIFE below)

const root = document.getElementById("meadow");
if (!root) throw new Error("missing #meadow");
const host = root;

const params = new URLSearchParams(location.search);
const n = params.get("n");
const ms = params.get("ms");
const bounds: { maxTrials?: number; durationMs?: number } = {};
if (n !== null) bounds.maxTrials = Number(n);
if (ms !== null) bounds.durationMs = Number(ms);

// pixi loads lazily via this dynamic import (kept out of the boot shell).
void (async () => {
  const { createMeadowBlock } = await import("./zones/meadow-block");
  createMeadowBlock({
    container: host,
    stage: 2, // includes the 'fill' rule + more switches
    today: "2026-05-29",
    ...bounds,
    onComplete: (o) => {
      const s = document.getElementById("meadow-summary");
      if (s) {
        s.textContent = `${o.endReason === "failed" ? "The meadow rests" : "Tidy harvest"} — ${String(o.correct)}/${String(o.trials)} · ${String(o.points)} pts`;
      }
      (window as unknown as { __meadowDone?: unknown }).__meadowDone = o;
    },
  });
})();
