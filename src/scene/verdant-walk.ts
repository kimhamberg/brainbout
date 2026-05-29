/**
 * Phase-5 entry: the Walk — Grove → Bench → Meadow stitched into one continuous
 * session by the scene-router, behind the BlockOutcome seam.
 */

import { normalizeVocabDeck, type RawEntry } from "../content/deck";
import { runWalk } from "./scene-router";

const RAW: RawEntry[] = [
  { word: "fugl", pos: "noun", definition: "a bird", example: "" },
  { word: "skog", pos: "noun", definition: "a forest", example: "" },
  { word: "blomst", pos: "noun", definition: "a flower", example: "" },
];

const host = document.getElementById("walk");
if (!host) throw new Error("missing #walk");

runWalk({
  host,
  deck: normalizeVocabDeck(RAW, "no"),
  today: "2026-05-29",
  groveTrials: 2,
  benchTrials: 2,
  meadowTrials: 6,
});
