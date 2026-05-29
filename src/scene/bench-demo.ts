/**
 * Phase-3 Propagation Bench demo: a playable mental-rotation session
 * (SAME/MOVED under RT) via createBenchBlock behind the BlockOutcome seam.
 */

import { createBenchBlock } from "./zones/bench-block";

const root = document.getElementById("bench");
if (!root) throw new Error("missing #bench");

createBenchBlock({
  container: root,
  stage: 1,
  today: "2026-05-29",
  maxTrials: 6,
  seed: "bench-demo",
  onComplete: (o) => {
    const s = document.getElementById("bench-summary");
    if (s) {
      s.textContent = `Cuttings taken — ${String(o.correct)}/${String(o.trials)} correct · ${String(o.points)} pts`;
    }
    (window as unknown as { __benchDone?: unknown }).__benchDone = o;
  },
});
