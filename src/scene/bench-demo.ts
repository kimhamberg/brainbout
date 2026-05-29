/**
 * Phase-3 Propagation Bench demo: a playable mental-rotation session
 * (SAME/MOVED under RT) via createBenchBlock behind the BlockOutcome seam.
 */

import { initTheme } from "../shared/theme";

const root = document.getElementById("bench");
if (!root) throw new Error("missing #bench");
const host = root;
initTheme(); // honour the theme chosen on the hub

// pixi loads lazily: the render layer (block → pixi-stage → pixi) is pulled in
// only via this dynamic import, so it code-splits out of the boot shell.
void (async () => {
  const { createBenchBlock } = await import("./zones/bench-block");
  createBenchBlock({
    container: host,
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
})();
