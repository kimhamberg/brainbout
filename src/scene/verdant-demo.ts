/**
 * Phase-0 live-render slice entry — a thin boot shell. It builds the (pixi-free)
 * demo deck statically, then pulls the pixi-bearing render layer
 * (verdant-diorama.ts) in via a dynamic import(), so pixi code-splits out of
 * this entry's boot graph (audit VH-6). Mirrors the grove/bench/meadow demos:
 * real static setup + a dynamic render import keeps the split from collapsing.
 */

import {
  normalizeVocabDeck,
  type RawEntry,
  type VocabDeck,
} from "../content/deck";

// A small spread across all four kingdoms (noun→FLORA, verb→FAUNA,
// adj/adv→MODIFIER, function-words→STRUCTURE), incl. æøå.
const RAW: RawEntry[] = [
  { word: "fugl", pos: "noun", definition: "a bird", example: "" },
  { word: "skog", pos: "noun", definition: "a forest", example: "" },
  { word: "blomst", pos: "noun", definition: "a flower", example: "" },
  { word: "tre", pos: "noun", definition: "a tree", example: "" },
  { word: "eng", pos: "noun", definition: "a meadow", example: "" },
  { word: "bær", pos: "noun", definition: "a berry", example: "" },
  { word: "busk", pos: "noun", definition: "a bush", example: "" },
  { word: "frø", pos: "noun", definition: "a seed", example: "" },
  { word: "sjø", pos: "noun", definition: "a lake", example: "" },
  { word: "katt", pos: "verb", definition: "to prowl", example: "" },
  { word: "hoppe", pos: "verb", definition: "to hop", example: "" },
  { word: "fly", pos: "verb", definition: "to fly", example: "" },
  { word: "krype", pos: "verb", definition: "to crawl", example: "" },
  { word: "rød", pos: "adj", definition: "red", example: "" },
  { word: "gul", pos: "adj", definition: "yellow", example: "" },
  { word: "og", pos: "conj", definition: "and", example: "" },
  { word: "på", pos: "prep", definition: "on", example: "" },
];

const host = document.getElementById("stage");
if (!host) throw new Error("missing #stage");
const stageHost = host;
const deck: VocabDeck = normalizeVocabDeck(RAW, "no");

void (async () => {
  const { renderDiorama } = await import("./verdant-diorama");
  await renderDiorama(stageHost, deck);
})();
