/**
 * Phase-0 live-render slice (design docs/design/05): mount the baked atlas in a
 * real PixiJS v8 stage and compose a small Verdant Hollow diorama — proof that
 * the 100%-procedural art renders in-engine via WebGL (not just as a sheet).
 * Deterministic layout via the seeded RNG; a gentle idle bob shows the loop is
 * alive. This is a demo surface, not a game block.
 */

import type { Container, Sprite, Ticker } from "pixi.js";
import { seededRng } from "../shared/rng";
import { createStage, type Stage } from "./pixi-stage";

const W = 520;
const H = 320;

function setStatus(text: string): void {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

interface Bobber {
  sprite: Sprite;
  baseY: number;
  amp: number;
  freq: number;
  phase: number;
}

function place(
  world: Container,
  sprite: Sprite,
  x: number,
  y: number,
  scale = 1,
): Sprite {
  sprite.x = x;
  sprite.y = y;
  sprite.scale.set(scale);
  world.addChild(sprite);
  return sprite;
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
  const names = atlas.names();
  const awake = names.filter(
    (n) => n.startsWith("sp:") && !n.endsWith(":dormant"),
  );
  const dormant = names.filter((n) => n.endsWith(":dormant"));
  const bench = names.filter((n) => n.startsWith("bench:")).sort();
  const growth = names.filter((n) => n.startsWith("plant:grove-tree:")).sort();

  const world = app.stage;
  const bobbers: Bobber[] = [];
  const addBob = (s: Sprite, amp: number): void => {
    bobbers.push({
      sprite: s,
      baseY: s.y,
      amp,
      freq: 0.001 + r() * 0.0015,
      phase: r() * Math.PI * 2,
    });
  };

  // ── ground band: grass tiles (config 15 = all-grass) across two rows ──
  const groundY = H - 30;
  for (let gx = 0; gx <= W; gx += 24) {
    place(world, atlas.sprite("tile:grass-soil:15", 0, 0), gx, groundY);
    place(world, atlas.sprite("tile:grass-soil:15", 0, 0), gx, groundY + 24);
  }

  // ── back row: the growth-tree progression (sprout → tree) ──
  growth.forEach((n, i) => {
    place(world, atlas.sprite(n), 40 + i * 70, groundY + 6, 1);
  });

  // ── mid scatter: awake species across the grass, gently bobbing ──
  const cols = 8;
  awake.slice(0, 16).forEach((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 40 + col * 58 + (r() - 0.5) * 14;
    const y = groundY + 14 + row * 16 + (r() - 0.5) * 6;
    addBob(place(world, atlas.sprite(n), x, y), 1.2 + r());
  });

  // ── dormant residents tucked at the left (moonlit + Zzz, baked) ──
  dormant.slice(0, 3).forEach((n, i) => {
    place(world, atlas.sprite(n), 24 + i * 30, groundY + 40, 1);
  });

  // ── bench specimens lined up at the front (chiral) ──
  bench.forEach((n, i) => {
    place(world, atlas.sprite(n), 60 + i * 90, H - 6, 1);
  });

  let t = 0;
  app.ticker.add((tick: Ticker) => {
    t += tick.deltaMS;
    for (const b of bobbers) {
      b.sprite.y = b.baseY + Math.sin(t * b.freq + b.phase) * b.amp;
    }
  });

  setStatus(
    `rendered ${String(names.length)} frames · renderer: ${rendererKind} · ${String(awake.length)} species`,
  );
  // Signal for the e2e harness.
  (window as unknown as { __verdantReady?: boolean }).__verdantReady = true;
}

await main();
