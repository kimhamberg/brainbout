/**
 * Phase-4 Meadow + Weather demo: a playable flux session (sort by the active
 * rule / withhold on no-go / rule switches) via createMeadowBlock behind the
 * BlockOutcome seam.
 */

import { createMeadowBlock } from "./zones/meadow-block";

const root = document.getElementById("meadow");
if (!root) throw new Error("missing #meadow");

createMeadowBlock({
  container: root,
  stage: 2, // includes the 'fill' rule + more switches
  today: "2026-05-29",
  // warmup (8) + two switch cycles before a 2nd rule unlocks → a real weather
  // switch lands ~trial 16-20, so 26 guarantees the player sees one.
  maxTrials: 26,
  onComplete: (o) => {
    const s = document.getElementById("meadow-summary");
    if (s) {
      s.textContent = `${o.endReason === "failed" ? "The meadow rests" : "Tidy harvest"} — ${String(o.correct)}/${String(o.trials)} · ${String(o.points)} pts`;
    }
    (window as unknown as { __meadowDone?: unknown }).__meadowDone = o;
  },
});
