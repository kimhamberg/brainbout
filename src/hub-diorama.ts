/**
 * Lazy living strip for the hub home screen (composition item 2). A pixi-bearing
 * module reached ONLY via a dynamic import() from hub.entry.ts, so pixi never
 * enters the hub's boot/static graph (the bundle-size BOOT gate proves it).
 * Mounts a small stage into a fixed bottom host and idle-bobs a handful of
 * residents on the shared living backdrop, turning the dashboard's empty footer
 * into a breathing garden. Honours prefers-reduced-motion (the caller skips the
 * mount entirely, leaving the static CSS ground band).
 *
 * The hub's WebGL context is freed by the browser on the full-page navigation to
 * the Walk, so no manual teardown-on-nav is needed; `destroy()` is exposed for
 * completeness. Render-only glue → coverage-ignored.
 */

import type { Sprite, Ticker } from "pixi.js";
import { normalizeVocabDeck, type RawEntry } from "./content/deck";
import { speciesFor } from "./content/species";
import { createStage } from "./scene/pixi-stage";
import { drawBackdrop } from "./scene/zones/backdrop";
import { seededRng } from "./shared/rng";

const H = 112;

// A small cross-kingdom spread so the strip shows varied residents (noun→FLORA,
// verb→FAUNA, adj→MODIFIER) — the same flavour as the Walk's real deck.
const RAW: RawEntry[] = [
  { word: "fugl", pos: "noun", definition: "a bird", example: "" },
  { word: "skog", pos: "noun", definition: "a forest", example: "" },
  { word: "blomst", pos: "noun", definition: "a flower", example: "" },
  { word: "bær", pos: "noun", definition: "a berry", example: "" },
  { word: "katt", pos: "verb", definition: "to prowl", example: "" },
  { word: "hoppe", pos: "verb", definition: "to hop", example: "" },
  { word: "frø", pos: "noun", definition: "a seed", example: "" },
  { word: "rød", pos: "adj", definition: "red", example: "" },
];

interface Bob {
  sprite: Sprite;
  baseY: number;
  amp: number;
  freq: number;
  phase: number;
}

export async function mountHubDiorama(
  host: HTMLElement,
): Promise<{ destroy(): void }> {
  const reduce =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  const W = Math.min(Math.max(window.innerWidth, 320), 720);
  const { app, atlas } = await createStage(host, {
    width: W,
    height: H,
    background: "#2c2a26",
  });
  const r = seededRng("hub-strip");
  const groundY = H - 30;

  const bd = drawBackdrop(app, atlas, {
    width: W,
    height: H,
    groundY,
    sky: [0x35424a, 0x3a4636],
    trees: Math.max(3, Math.round(W / 120)),
    rng: seededRng("hub-bd"),
    reduce,
  });

  const deck = normalizeVocabDeck(RAW, "no");
  const bobbers: Bob[] = [];
  const slot = (W - 48) / deck.entries.length;
  deck.entries.forEach((entry, i) => {
    const sp = atlas.speciesSprite(
      speciesFor("no", entry, deck.manifest),
      false,
    );
    sp.x = 24 + (i + 0.5) * slot + (r() - 0.5) * 10;
    sp.y = groundY + 16;
    app.stage.addChild(sp);
    bobbers.push({
      sprite: sp,
      baseY: sp.y,
      amp: 1 + r(),
      freq: 0.001 + r() * 0.0015,
      phase: r() * Math.PI * 2,
    });
  });

  let t = 0;
  app.ticker.add((tick: Ticker) => {
    t += tick.deltaMS;
    bd.tick(tick.deltaMS);
    if (!reduce) {
      for (const b of bobbers) {
        b.sprite.y = b.baseY + Math.sin(t * b.freq + b.phase) * b.amp;
      }
    }
  });

  return {
    destroy(): void {
      app.ticker.stop();
      app.destroy({ removeView: true }, { children: true });
    },
  };
}
