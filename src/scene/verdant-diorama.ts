/**
 * Phase-0 live-render slice + Q2 diorama (design docs/design/05). The render
 * layer for verdant.html — statically imports pixi-stage (→ pixi), so loading
 * it via a dynamic import() from the thin verdant-demo shell keeps pixi out of
 * the boot graph. Mounts the BOUNDED template atlas in a real PixiJS v8 stage
 * and composes a Verdant Hollow diorama where every resident is a real
 * dictionary entry → `speciesFor` → a hue-rotated template sprite. A gentle
 * idle bob shows the loop is alive. Demo surface, not a game block.
 */

import type { Sprite, Ticker } from "pixi.js";
import type { VocabDeck } from "../content/deck";
import { speciesFor } from "../content/species";
import { seededRng } from "../shared/rng";
import { createStage, type Stage } from "./pixi-stage";
import { drawBackdrop } from "./zones/backdrop";

const W = 560;
const H = 320;

function setStatus(text: string): void {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

export async function renderDiorama(
  host: HTMLElement,
  deck: VocabDeck,
): Promise<void> {
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

  interface Bob {
    sprite: Sprite;
    baseY: number;
    amp: number;
    freq: number;
    phase: number;
  }
  const bobbers: Bob[] = [];
  const groundY = H - 30;
  const reduce =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── living backdrop: sky + grass-over-soil ground band + drifting pollen.
  //    trees:0 here — the diorama keeps its own growth-stage showcase below ──
  const bd = drawBackdrop(app, atlas, {
    width: W,
    height: H,
    groundY,
    sky: [0x35424a, 0x3a4636],
    trees: 0,
    rng: seededRng("verdant-bd"),
    reduce,
  });

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
    bd.tick(tick.deltaMS);
    for (const b of bobbers) {
      b.sprite.y = b.baseY + Math.sin(t * b.freq + b.phase) * b.amp;
    }
  });

  setStatus(
    `${String(atlas.names().length)} baked templates · ${String(deck.entries.length)} residents recoloured · renderer: ${rendererKind}`,
  );
  (window as unknown as { __verdantReady?: boolean }).__verdantReady = true;
}
