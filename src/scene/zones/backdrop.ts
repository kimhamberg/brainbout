/**
 * Shared living-backdrop primitive (composition: "make it feel alive").
 *
 * Draws a per-zone sky + the baked grass-over-soil ground band + a back row of
 * growth-stage trees into ONE persistent Container inserted at stage index 0
 * (always behind every actor), and returns a handle whose tick(dtMs) sways the
 * tree canopies in the wind and drifts pollen motes. Composed ENTIRELY from
 * frames the atlas already bakes (tile:grass-soil:* + plant:grove-tree:*), so it
 * needs no re-bake and the golden-hash gate is untouched. The particle motion
 * reuses the pure, unit-tested juice model.
 *
 * Cosmetic-only: callers in RT-measured zones (Bench/Meadow) gate tick() on
 * `!clock.frozen` so ambient motion never enters the response window
 * (frozen-ticker guardrail). The whole backdrop lives under app.stage, so each
 * block's existing `app.destroy({children:true})` tears it down — `destroy()` is
 * provided for callers that rebuild the backdrop without the app.
 *
 * Render-only glue (reaches pixi via pixi-stage types) → coverage-ignored, like
 * the zone blocks; exercised by the verdant/grove/bench/meadow e2e webgl checks.
 */

import { type Application, Container, Graphics, type Sprite } from "pixi.js";
import type { Rng } from "../../shared/rng";
import {
  integrate,
  isDead,
  makeBurst,
  type Particle,
  particleAlpha,
} from "../juice";
import type { Atlas } from "../pixi-stage";

const TILE = 24;
const TAU = Math.PI * 2;

export interface BackdropOptions {
  width: number;
  height: number;
  /** Y of the grass surface (top-left of the grass row). Default height - 2*TILE. */
  groundY?: number;
  /** Vertical sky gradient stops, top → bottom (0xRRGGBB). */
  sky: [number, number];
  /** Back-row growth-stage trees (0..). Default 6. */
  trees?: number;
  /** Drifting pollen motes. Default true. */
  pollen?: boolean;
  rng: Rng;
  /** prefers-reduced-motion: freezes sway + pollen (the band/trees still draw). */
  reduce: boolean;
}

export interface BackdropHandle {
  container: Container;
  /** Advance ambient motion (sway + pollen). Caller passes the ticker deltaMS. */
  tick(dtMs: number): void;
  destroy(): void;
}

interface Swayer {
  sprite: Sprite;
  amp: number;
  freq: number;
  phase: number;
}

/** A solarpunk living backdrop behind a zone's actors. Pure render glue. */
export function drawBackdrop(
  app: Application,
  atlas: Atlas,
  o: BackdropOptions,
): BackdropHandle {
  const groundY = o.groundY ?? o.height - TILE * 2;
  const c = new Container();
  c.label = "backdrop";
  app.stage.addChildAt(c, 0); // ALWAYS behind actors

  // ── sky: stacked lerped bands (renderer-agnostic — no gradient-API dep, works
  //    identically under the WebGL + experimental canvas renderers) ──
  const [top, bot] = o.sky;
  const tr = (top >> 16) & 0xff;
  const tg = (top >> 8) & 0xff;
  const tb = top & 0xff;
  const br = (bot >> 16) & 0xff;
  const bg = (bot >> 8) & 0xff;
  const bb = bot & 0xff;
  const bands = 12;
  const bandH = Math.ceil(o.height / bands);
  const sky = new Graphics();
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    const r = Math.round(tr + (br - tr) * t);
    const g = Math.round(tg + (bg - tg) * t);
    const b = Math.round(tb + (bb - tb) * t);
    sky
      .rect(0, i * bandH, o.width, bandH + 1)
      .fill({ color: (r << 16) | (g << 8) | b });
  }
  c.addChild(sky);

  // ── ground band: a row of full-grass over a row of all-soil (green → brown) ──
  for (let gx = 0; gx <= o.width; gx += TILE) {
    const grass = atlas.sprite("tile:grass-soil:15", 0, 0); // bits 15 = all grass
    grass.x = gx;
    grass.y = groundY;
    c.addChild(grass);
    const soil = atlas.sprite("tile:grass-soil:0", 0, 0); // bits 0 = all soil/dirt
    soil.x = gx;
    soil.y = groundY + TILE;
    c.addChild(soil);
  }

  // ── back-row trees: grown growth-stages, anchored at the base so a gentle
  //    rotation reads as canopy sway in the wind (no inter-tile seams) ──
  const swayers: Swayer[] = [];
  const n = o.trees ?? 6;
  if (n > 0) {
    const step = n > 1 ? (o.width - 32) / (n - 1) : 0;
    for (let s = 0; s < n; s++) {
      const stage = 2 + Math.floor(o.rng() * 4); // stages 2..5 (lush, never dormant)
      const sp = atlas.sprite(`plant:grove-tree:${String(stage)}`);
      sp.x = 16 + s * step;
      sp.y = groundY + 6;
      c.addChild(sp);
      swayers.push({
        sprite: sp,
        amp: 0.014 + o.rng() * 0.02,
        freq: 0.0005 + o.rng() * 0.0007,
        phase: o.rng() * TAU,
      });
    }
  }

  // ── pollen: gentle upward-drifting motes, recycled with a FRESH velocity so
  //    nothing accumulates over a long (or always-on hub) session ──
  const motes: { p: Particle; g: Graphics }[] = [];
  const respawn = (p: Particle, initial: boolean): void => {
    p.age = initial ? o.rng() * p.life : 0; // stagger the initial fade
    p.x = o.rng() * o.width;
    p.y = initial ? o.rng() * groundY : groundY; // initial air-column spread
    p.vx = (o.rng() - 0.5) * 0.008;
    p.vy = -(0.004 + o.rng() * 0.012); // constant gentle rise (no gravity)
  };
  if (o.pollen !== false && !o.reduce) {
    const burst = makeBurst(o.width / 2, groundY, 12, o.rng, {
      life: 6000,
      size: 1.4,
    });
    for (const p of burst) {
      respawn(p, true);
      const g = new Graphics().circle(0, 0, p.size).fill({ color: 0xe5c890 });
      g.alpha = 0.5;
      c.addChild(g);
      motes.push({ p, g });
    }
  }

  let t = 0;
  return {
    container: c,
    tick(dtMs: number): void {
      if (o.reduce) return;
      const dt = Math.min(dtMs, 64); // clamp hidden-tab deltaMS spikes
      t += dt;
      for (const s of swayers) {
        s.sprite.rotation = Math.sin(t * s.freq + s.phase) * s.amp;
      }
      for (const m of motes) {
        integrate(m.p, dt, 0); // constant drift — gravity 0, so vy never grows
        if (m.p.x < 0) m.p.x += o.width;
        else if (m.p.x > o.width) m.p.x -= o.width;
        m.g.position.set(m.p.x, m.p.y);
        m.g.alpha = 0.5 * particleAlpha(m.p);
        if (isDead(m.p) || m.p.y < -2) respawn(m.p, false); // dead or off-top → reseed
      }
    },
    destroy(): void {
      c.destroy({ children: true });
    },
  };
}
