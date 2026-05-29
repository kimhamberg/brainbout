# 05 — Phase-0 spike & gate

**One combined vertical-slice spike** that fuses the four areas into a single go/no-go gate, ordered by dependency: **Content → Art → Zone → World**. It retires the two central risks simultaneously — *"procedural cozy pixel can look Stardew-charming"* and *"rAF-onset RT precision survives the GPU layer"* — before any full zone is built.

**Explicitly out of scope:** the full four-pocket valley, the regreening unlock ladder, seasons, festivals, the share grid. Those are validated only after the seam + presentation-map + never-empty + rAF-RT are proven sound.

## 1. Content slice

Implement `deck.ts` types + `normalizeVocabDeck` + `species.ts` over a 20-entry hand-picked `dict-no` subset that **deliberately includes** a homograph (e.g. both senses of 'være' or all four 'å'), an æøå word, a multiword phrase ('ad hoc'), and an empty-example word.

**Pass/fail:**
- `senseIdx` / `entryId` / NFC normalization correct.
- `speciesFor` byte-identical across two runs; the homograph's two senses yield **different** species; same `deckId+entryId` always yields the same species.
- Calling the **global** rng between `speciesFor` calls produces **no drift** (proves the local-mulberry32 partition).
- `migrateLexKeys()` turns a seeded `brainbout:lex:no:være` card into `...være#0` losslessly + idempotently.
- `getMasteredCountByPrefix('lex:no:')` / `getSeenKeys` still correct after migration.
- A canary pins the first-5 `rank`-ordered entryIds (Q1), so the seeding/promotion order is regression-locked alongside the atlas digest.

## 2. Art slice

Bake **one** atlas via `bake-atlas.ts` touching every sub-module minimally:
- `palette.ts` — one cohesive green+gold+teal OKLCH ramp set (real Ottosson matrices).
- `lsystem.ts` — one archetype at all 6 growth stages, driven by the canonical `stabilityToStage`.
- `creature.ts` — ~20–30 species from the real dict subset via `speciesFor` + a tiny curated 3-body / 3-head / 2-wing library (mirror + selout + Bayer dither).
- `bench-specimens.ts` — ~5 asymmetric chiral specimens.
- `tiles.ts` — one dual-grid 16-config pair + one reclamation tile at coverages 0–4.
- `pack.ts` → one atlas + frame-map using the locked key grammar.
- `manifest.ts` digest + a passing `test/bake-atlas.test.ts`.

**Pass/fail:**
- The 20–30 species read as **deliberate cozy animals, not noise** (eyeball against Stardew / Cozy Grove references).
- Regreening reads as growth across the 6 stages.
- The atlas digest is **identical across two clean bakes** on the **pinned Bun version** (VH-11); colour math is **quantized/rounded before raster** so transcendental drift can't reach the 8-bit pixel; a separate cross-version bake job is informational-only (non-blocking).
- **No per-entry frames are emitted** (Q2): the ~20–30 species resolve to a small fixed template set (`templateIdx = bodyPlanHash mod N[kingdom]`) recolored at runtime via `sprite.tint`/cached RT (not live filters, VH-3); the pack stays ≤4 textures @2048px. Two entryIds that collide on `bodyPlanHash` share a frame key but render byte-different runtime composites.
- **Two same-template species read as distinct at 48px** (VH-12) via per-entry palette + accessory + bake-time silhouette-grammar variation — eyeball this for the non-RT (Grove/Almanac) set.
- Bench specimens are visually distinguishable under **both** `mirrorV` and `mirrorH` (chirality proof).
- **If the cozy-charm eyeball fails:** exercise the Art fallback ladder (tighten knobs → add curated parts → hand-pixeled overrides) **before** proceeding to any full zone build.

## 3. Zone slice (the RT keystone)

Implement `trial-clock.ts` + a minimal `pixi-stage.ts` (primary `WebGLRenderer`; the opt-in reduced/canvas mode is exercised only behind its flag, VH-2) + `bench-adapter.ts` over the **unchanged** crown-rotation engine.

**Pass/fail (unit, injectable fake rAF + fake clock) — corrected per VH-1/15/16:**
- Onset is captured on the **second** rAF (or `requestPostAnimationFrame`), i.e. at/after the **post-paint boundary** — *not* the first rAF. The previously-specified "no-repaint-between-onset-rAF-and-rt-capture" assertion is **removed/inverted** (it codified the bug).
- The rAF loop stays **continuously running**; `frozen` suppresses cosmetic mutation but never stops the loop.
- `RT = ev.timeStamp − onset` (fall back to the injected clock if `ev.timeStamp` is 0); response timestamp is the handler's first statement; `recordReview` persistence is **deferred** past unfreeze (assert no `localStorage` write inside the measured window).

**Pass/fail (DOM/Playwright):**
- **No** draggable specimen node exists until **after** `recordReview` fires; verdict committed via Same/Moved buttons; `deriveCrownGrade` 1800/3500 bands intact; `rtByTransform` populated keyed on all 5 transforms.

**Pass/fail (renderer probe — VH-2):**
- `pixi-stage` selects `WebGLRenderer` by default; the experimental canvas/reduced mode is reached **only** behind the flag after a `gl===null` probe — there is no test asserting an automatic Canvas2D fallback.
- In reduced mode the day-night/season tint degrades to the single `globalCompositeOperation` pass (or no-recolor mode) and dormant/awake stays legible via the Q6 non-colour channels.
- If a Meadow stub is included: the go/no-go non-resolvability tests (Q8) hold under the reduced mount too.

## 4. World seam slice

Render the baked atlas in `pixi-stage` with nearest + `roundPixels` + the season/day-night `ColorMatrix` LUT (+ Canvas2D composite-tint fallback) + one frozen-gated idle-sway tween. Wire a **continuous-traversal** scene with **two pockets** (Grove + Bench) connected by a walkable transition through `scene-router.ts` (reusing `daily.ts` `setRng`/`resetRng` + the single-`activeHandle` invariant). Wire `presentation-map` **live** to real lex `CardState`.

**Pass/fail:**
- Typing a name colours the resident in and regreens surrounding tiles via the **pure map** (not a fake bar).
- An overdue card visibly **wilts and recovers** on tend.
- The **walk** physically enforces one-construct-per-moment (feels like one world, not a level-select).
- `computeMorningRound` clears to "rest well" **and** the never-empty tail (study-ahead or free-tend) is reachable.

## 5. Global gate (all must pass to retire risk)

1. **RNG partition** — same daily seed run twice → identical engine trial sequences even when `cosmeticRng` is reseeded differently.
2. **Freeze discipline** — no juice pixel moves before RT is logged on the Bench.
3. **Both central risks retired simultaneously** — Art eyeball (cozy charm) **and** Zone unit+DOM tests (rAF-onset RT precision survives the GPU layer).

If the cozy-charm eyeball fails, walk the Art fallback ladder before proceeding.

## Sequencing into the full migration

Phase-0 maps onto the v2 roadmap ([../REDESIGN-v2-solarpunk.md](../REDESIGN-v2-solarpunk.md)): once this combined spike passes, proceed Phase 1 (art bakery) → Phase 2 (port Lex/Grove first) → Phase 3 (Crown/Bench) → Phase 4 (Flux/Meadow+Weather) → Phase 5 (assemble world) → Phase 6 (meta + share) → Phase 7 (retire old surfaces, drop the two runtime deps). The `BlockOutcome` contract is the firewall that keeps the test suite green while presentation is swapped.
