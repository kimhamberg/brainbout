/**
 * Phase-0 live-render slice + Q2 demo (design docs/design/05). Mounts the BOUNDED
 * template atlas in a real PixiJS v8 stage and composes a Verdant Hollow diorama
 * where every resident is a real dictionary entry → `speciesFor` → a hue-rotated
 * template sprite (atlas size is fixed regardless of deck size). A gentle idle
 * bob shows the loop is alive. Demo surface, not a game block.
 */

import type { Sprite, Ticker } from "pixi.js";
import { normalizeVocabDeck, type RawEntry } from "../content/deck";
import { speciesFor } from "../content/species";
import { seededRng } from "../shared/rng";
import { createStage, type Stage } from "./pixi-stage";

const W = 560;
const H = 320;

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

function setStatus(text: string): void {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

async function main(): Promise<void> {
  const host = document.getElementById("stage");
  if (!host) throw new Error("missing #stage");

  let stage: Stage;
  try {
    stage = await createStage(host, { width: W, height: H });
  } catch (e) {
    setStatus(`render failed: ${String(e)}`);
    throw e;
  }
  const { app, atlas, rendererKind } = stage;
  const r = seededRng("verdant-demo");
  const world = app.stage;
  const deck = normalizeVocabDeck(RAW, "no");

  interface Bob {
    sprite: Sprite;
    baseY: number;
    amp: number;
    freq: number;
    phase: number;
  }
  const bobbers: Bob[] = [];
  const groundY = H - 30;

  // ── ground band ──
  for (let gx = 0; gx <= W; gx += 24) {
    const a = atlas.sprite("tile:grass-soil:15", 0, 0);
    a.x = gx;
    a.y = groundY;
    world.addChild(a);
    const b = atlas.sprite("tile:grass-soil:15", 0, 0);
    b.x = gx;
    b.y = groundY + 24;
    world.addChild(b);
  }

  // ── growth-tree showcase, back row ──
  for (let s = 0; s <= 5; s++) {
    const sp = atlas.sprite(`plant:grove-tree:${String(s)}`);
    sp.x = 40 + s * 64;
    sp.y = groundY + 6;
    world.addChild(sp);
  }

  // ── residents: each dictionary entry → species → hue-rotated template ──
  deck.entries.forEach((entry, i) => {
    const species = speciesFor("no", entry, deck.manifest);
    const dormant = i % 7 === 3; // a few sleeping
    const sp = atlas.speciesSprite(species, dormant);
    sp.x = 36 + (i % 9) * 58 + (r() - 0.5) * 12;
    sp.y = groundY + 16 + Math.floor(i / 9) * 18;
    world.addChild(sp);
    if (!dormant) {
      bobbers.push({
        sprite: sp,
        baseY: sp.y,
        amp: 1.1 + r(),
        freq: 0.001 + r() * 0.0015,
        phase: r() * Math.PI * 2,
      });
    }
  });

  // ── chiral bench specimens, front ──
  for (const [i, role] of ["q", "r", "b", "n", "p"].entries()) {
    const sp = atlas.sprite(`bench:${role}`);
    sp.x = 70 + i * 96;
    sp.y = H - 4;
    world.addChild(sp);
  }

  let t = 0;
  app.ticker.add((tick: Ticker) => {
    t += tick.deltaMS;
    for (const b of bobbers) {
      b.sprite.y = b.baseY + Math.sin(t * b.freq + b.phase) * b.amp;
    }
  });

  setStatus(
    `${String(atlas.names().length)} baked templates · ${String(deck.entries.length)} residents recoloured · renderer: ${rendererKind}`,
  );
  (window as unknown as { __verdantReady?: boolean }).__verdantReady = true;
}

await main();
