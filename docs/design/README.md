# Verdant Hollow — build-ready design

Companion specs for the cozy 2D-pixel solarpunk-ecology remake of Brainbout. This folder is the **build-ready** layer beneath the higher-level pitch in [`../REDESIGN-v2-solarpunk.md`](../REDESIGN-v2-solarpunk.md). (The original three-games study, [`../REDESIGN.md`](../REDESIGN.md), is superseded — only its cognitive-validity guardrails and "FSRS as conductor" carry forward.)

| Doc | Area |
| :-- | :-- |
| [01-art-pipeline.md](01-art-pipeline.md) | Build-time bakery, OKLCH palette, L-system plants, silhouette creatures, tiles, PixiJS runtime, curated-parametric workflow |
| [02-world-and-session.md](02-world-and-session.md) | Fiction, onboarding, the minute-by-minute Morning Round, regreening arc, seasons, the cohesion glue |
| [03-zone-mechanics.md](03-zone-mechanics.md) | The `withTrialClock` keystone, scene router, and the four zone adapters with their validity defenses |
| [04-content-and-taxonomy.md](04-content-and-taxonomy.md) | `(deckId, entryId)` model, word→species binding, recall ramp, greenhouse/wild cap, Almanac, deck-swap |
| [05-phase-0-spike.md](05-phase-0-spike.md) | The single combined validation spike + pass/fail gate criteria |
| [06-resolved-decisions.md](06-resolved-decisions.md) | The 11 deferred questions + the final 7 resolved; shared constants; scheduler + color/renderer corrections |
| [07-testing-and-ci.md](07-testing-and-ci.md) | Per-module test matrix, the corrected RT-timing centerpiece test, CI changes (bundle gate, bake determinism) |
| [08-reference-audit.md](08-reference-audit.md) | Code-grounded audit vs PixiJS/jsPsych/ts-fsrs/dual-grid; the 16-flaw register (`VH-1…16`) + what's validated |

## What this is

**Verdant Hollow** is a render/world rebuild behind the **unchanged** engine seam (`block.ts` `BlockFactory`/`BlockHandle`/`BlockOutcome`; `meta` is already `Record<string,unknown>`, so new fields need no type change). The sealed cores (`crown-rotation`, `flux-engine`, `lex-srs`) and spine (`rng`, `progress`, `stages`, `sounds`) are reused; **two** changes are now planned: (1) lex keying `(lang, word)` → `(deckId, entryId)`, back-compatible via an idempotent `migrateLexKeys()`; (2) the scheduler — the audit (VH-4) found `fsrs.ts` "FSRS-lite" has no retrievability term, so the plan is to **adopt ts-fsrs** (MIT) behind the superset-compatible `CardState` seam (or make FSRS-lite minimum-viable-real + soften copy to "FSRS-inspired"). This re-opens `recordReview` (the one place).

A single contiguous, dormant solarpunk valley the player wakes as **the Keeper**. It re-greens **only as FSRS cards genuinely stick** — the world's visual state *is* `CardState` through a pure presentation map. Four spatially distinct zones, one cognitive demand per moment (the *walk* between them is the transition and the context-switch):

- **Grove** — typed-recall to wake dormant residents (lex; per-instance `lex:<deck>:<entryId>`)
- **Propagation Bench** — SAME/DIFFERENT on a rotated/mirrored chiral specimen, committed *before* any cosmetic drag (crown; class-keyed)
- **Meadow** — harvest ripe / withhold on unripe + don't-swat pollinators (flux go/no-go; class-keyed)
- **Biome-crossing / Weather** — a telegraphed weather/season change is the cue that flips the rule (flux switch; class-keyed)

## The layered stack

```
CONTENT  (pure data)        deck / entryId / speciesFor → Species record, no DOM
   ↓
ART      (build-time bake)  Species → committed PNG atlas + JSON frame-map
   ↓
ZONE     (runtime keystone) trial-clock + adapters + sealed-engine seam
   ↓
WORLD    (cozy framing)     morning-round itinerary, walk transitions, regreening
```

## The seven cognitive guardrails (encode as tests — non-negotiable)

1. **Post-paint-anchored RT onset** — owned by `src/scene/trial-clock.ts` (replaces today's non-monotonic `Date`-style wall-clock timestamp taken *before* `renderPlaying()`). Corrected per the audit ([08](08-reference-audit.md) VH-1/15/16): a single rAF fires *before* paint, so anchor onset on a **double-rAF / `requestPostAnimationFrame`** with a **continuously-running** rAF loop (`frozen` = no *cosmetic mutation*, never *stop the loop* — stopping it is the documented low-precision case). Sequence: stimulus committed → `frozen=true` → post-paint callback captures `onset=performance.now()` and arms input → response `RT = ev.timeStamp − onset` (same monotonic origin) captured as the handler's first statement → grade-decision → cosmetics → **deferred** `recordReview` persist (after unfreeze; mastered-count cached, not rescanned). The rAF scheduler is **injectable** so post-paint ordering is unit-assertable.
2. **Typed PRODUCTION is the keystone** (Roediger-Karpicke); MCQ→cloze→typed only as the stage-1→3 scaffold via `stages.ts`.
3. **One construct per moment** — enforced physically by the walk between pockets.
4. **Grade before cosmetics** — the draggable specimen isn't instantiated until after `recordReview`.
5. **Adaptive difficulty survives the reskin** — Wilson-85% (`BPM_UP=1`, `BPM_DOWN≈5.303`), `noGoRate` 0.1–0.2, switch cadence 3–7, NOT-variant. The deadline must stay **perceptible but diegetic** (closing bloom / pulse / audible beat) — the audit (VH-5) found that an *imperceptible* ambient tempo breaks the rule's felt-deadline + legible-error preconditions. A no-felt-deadline mode may not claim Wilson-85%.
6. **Partitioned RNG** — cosmetics run on `cosmeticRng = mulberry32(hashString('cosmetic:'+trialSeed))`, never the gameplay/daily stream.
7. **Empirical self-check** — log `rtByTransform`, `switchTrials`/`repeatTrials`, `falseAlarms`/`commissionRate` into `BlockOutcome.meta` so the Monsell switch cost and Shepard-Metzler angle effect can be *verified* to have survived the reskin.

## Eight cross-spec conflicts, resolved

The reconciliation pass found eight overlapping-ownership conflicts (not contradictions) and assigned single owners:

1. **RT-onset hook** — three runtime specs each claimed it. → `src/scene/trial-clock.ts` is the sole owner; art's `gate.ts` becomes a thin consumer that reads `stage.frozen`.
2. **Two scene-routers** — → one `src/scene/scene-router.ts` (mechanical orchestration) + `src/world/morning-round.ts` (itinerary). World owns cozy framing, not a second router.
3. **Three CardState→visual maps** — → one canonical **6-stage** `stabilityToStage(s)` table in `src/world/presentation-map.ts`, imported by *both* the runtime regreen and the art bake (frame count `N=6` locked to it). Content's `AlmanacState` is a separate, coarser collection map.
4. **`getDueWords` signature** — keep the existing 3-arg shape but feed it a **bounded** candidate list (active-set ∪ wild sample); add a new `getDueClassKeys(prefix)` wrapper for the class zones; keep `pickDueCrownTransform` for stimulus selection.
5. **Cosmetic RNG seed** — per-**trial** (`trialSeed`) wins over session-nonce, so cosmetics are reproducible *and* partitioned.
6. **Atlas frame-key grammar** — `pack.ts` is the canonical authority: `sp:<kingdom>:<family>:<bodyPlanHash>:<stage0-5>:<dormant|awake>`, `tile:<pair>:<corners0-15>`, `reclaim:<tpl>:<cov0-4>`, `fx:<role>`, `wx:<rule>`/`wx:not`.
7. **Bench specimens must be a *separate asymmetric* sprite set** — the cozy creature mirror-symmetry trick would defeat `mirrorV`/`mirrorH` detection. Bench plants are chiral and asymmetric.
8. **Species snapshot** — the atlas-manifest digest *transitively* pins `speciesFor` output (creatures are baked from it), so no separate species snapshot — just a cheap ~5-entry canary test to fail fast on a `hashString` change before the full re-bake digest churn.

## File / module layout

**New — build-time art bakery**
- `scripts/bake-atlas.ts` — orchestrator (`bun gen:art`), mirrors `gen-icons.ts` sharp usage; runs `bake/*` in fixed order.
- `scripts/bake/raster.ts` — dependency-free RGBA framebuffer (`Uint8ClampedArray`); `putPixel`/`line`/`fillRect`/`blit`/`mirrorX`/`outline`/`floodFill`/`bayerDither`. Plain Bun, **no happy-dom** (avoids the documented Worker+happy-dom segfault).
- `scripts/bake/palette.ts` — OKLCH engine; exports `ColorMatrix`/LUT builders reused at runtime.
- `scripts/bake/lsystem.ts` — pixel L-system plants; imports the canonical 6-stage `stabilityToStage`.
- `scripts/bake/creature.ts` — silhouette-first assembler; calls `speciesFor` per entry; vertical-mirror symmetry for cozy fauna only.
- `scripts/bake/bench-specimens.ts` — **separate** asymmetric/chiral plant set keyed by chess role so `mirrorV` *and* `mirrorH` are detectable.
- `scripts/bake/tiles.ts` — dual-grid 16-config autotiling + value-noise biomes + Art-Nouveau reclamation overlay (coverage 0–4).
- `scripts/bake/pack.ts` — bin-packer → `atlas-{tiles,plants,creatures,fx}.png`; owns the canonical frame-key grammar.
- `scripts/bake/manifest.ts` — SHA-256 per PNG + timestamp-free combined digest → `public/art/atlas-manifest.json`.
- `test/bake-atlas.test.ts` — golden gate: canary RGBA byte-match + `manifest.digest === EXPECTED_DIGEST`; re-reads committed artifacts, never re-runs the full encode.
- `art-src/*.json` — curated authoring inputs (`palette-anchors`, `lsystem-grammars`, `creature-parts`, `bench-roles`, `tile-templates`, `anim-curves`) + `overrides/<entryId>.png` escape hatch.
- `public/art/` — committed `atlas-*.png` + `*.frames.json` + `atlas-manifest.json`.
- `public/decks/no.deck.json` — baked normalized deck (generate-once-commit); raw `public/dict-no.json` kept as legacy source.

**New — content**
- `src/content/deck.ts` — `DeckManifest`/`DeckEntry` (incl. the baked `rank` field, Q1) types + `normalizeVocabDeck(raw, deckId)` (pure, writes `rank`).
- `src/content/species.ts` — `speciesFor(deckId, entry) → Species` (pure, **local** mulberry32); `KINGDOM_FOR_POS` + `FAMILIES` tables.
- `src/content/almanac.ts` — `AlmanacState(card)` (orthogonal collection map).
- `src/games/lex-active-set.ts` — greenhouse cap (`brainbout:lex:<deck>:active`), promotion / wild migration, bounded candidate set.
- `src/games/due-scan.ts` — `getDueClassKeys(prefix)` (router counts); `pickDueCrownTransform` kept for stimulus.

**New — scene / world**
- `src/world/limits.ts` — the shared constants module (`ACTIVE_SET_CAP`, `WILD_DUE_PER_SESSION`, `MAX_POCKET_VISITS`, `WALK_FLOOR_MS`, `GROVE_WALK_CAP`, `GROVE_CAP`, `BENCH_CAP`, `FLUX_CAP`, `CSI_MS`) — one source so `morning-round` and `scene-router` can't drift (see 06).
- `src/scene/guided-trial.ts` — one-time per-zone onboarding rehearsal (Q5); imports none of `fsrs`/`trial-clock`.
- `src/scene/trial-clock.ts` — sole owner of `armTrial`/`settle` (paint-anchored onset, frozen flag, same-clock RT); `renderMode: 'ticker' | 'manual'` (Q3).
- `src/scene/scene-router.ts` — generalizes `daily.ts`; single `activeHandle`; mounts one `BlockFactory` per pocket; `setRng`/`seededRng`/`resetRng`.
- `src/scene/pixi-stage.ts` — PixiJS v8 app; **primary `WebGLRenderer`** + an explicit opt-in **reduced mode** behind a `gl===null`-probed flag (the audit VH-2 found v8 has *no* WebGL→Canvas2D auto-fallback); `freeze()`/`start()`; loads committed atlas; owns the `cosmeticRng` instance. Per-entry colour = `sprite.tint`/cached `RenderTexture`, **never** N live filters (VH-3).
- `src/scene/zones/{grove,bench,meadow,biome}-adapter.ts` — the four pure theming adapters.
- `src/world/presentation-map.ts` — canonical `stabilityToStage(s)→0..5` + `cardStateToVisual` (imported by bake *and* runtime).
- `src/world/morning-round.ts` — `computeMorningRound(deck, today) → ordered Walk` + never-empty tails.
- `src/world/regreening.ts` — `getMasteredCountByPrefix` unlock ladder + wild-zone computation.
- `src/world/share-glyph.ts` — spoiler-free leaf-glyph daily share from `BlockOutcome[]` meta.

**Changed**
- `src/games/lex-srs.ts` — add `lexKey(deckId, entryId)` + `migrateLexKeys()` alongside the existing `(lang, word)` API.
- `src/games/crown-block.ts` / `flux-block.ts` / `lex-block.ts` — route onset through `trial-clock`; render via the zone adapters.
- `package.json` — add `pixi.js` (≥8.16) dep + `gen:art` script (`sharp` already present). **JS bundle budget ≤200 KB gzip** with a CI size-gate, and **lazy-load pixi after first paint** (it adds ~120 KB gzip; VH-6).

**Reused unchanged** — `src/engine/block.ts`, `src/shared/{fsrs,rng,progress,stages,sounds}.ts`, `crown-rotation.ts`, the `flux-engine.ts` core.

## Resolved decisions

All 11 originally-deferred questions are now resolved — full decisions, formulas, and consistency rules in [06-resolved-decisions.md](06-resolved-decisions.md). Summary:

1. **Active-set seeding** → hybrid baked `rank` = `[lengthBand, optional freqTier, originalIndex]`; no third-party frequency corpus committed by default (license-clean); frequency is an opt-in build flag that only re-sorts within bands.
2. **Atlas frame bloat** → 60 kingdom-partitioned body-plan templates (FLORA 24 / FAUNA 16 / MODIFIER 12 / STRUCTURE 8); per-entry identity is runtime palette + accessory + pattern over a shared luminance-mask template; ≤4 textures @2048px.
3. **Canvas2D fidelity + freeze** → single `globalCompositeOperation` tint per time-of-day (Skia-baseline modes only); the manual repaint loop shares the *one* `frozen` flag + *one* arming rAF, so onset stays paint-anchored.
4. **Walk duration** → fixed `WALK_FLOOR_MS=1500` cognitive floor, familiarity-scaled visual distance, `MAX_POCKET_VISITS=5`; overflow never dropped (stays due).
5. **Onboarding parity** → one-time guided trial per non-Grove zone on a separate code path that imports none of the engine/clock; excluded from grading + telemetry.
6. **Color-as-state accessibility** → presentation map emits 5 redundant channels (posture / silhouette size / sparkle / audio / optional glyph); WCAG 1.4.1-aligned; budget-neutral.
7. **Biome cue transparency** → `CSI_MS=700`, 1:1 cue↔rule, disjoint cue dimension; A/B {400,1200} against logged switch cost.
8. **Meadow no-go swap** → discriminator built inside the frozen pre-onset paint; 4 non-resolvability tests across both mount paths.
9. **STRUCTURE kingdom** → first-class Almanac residents (real cards, gloss-cloze + pos badge, own kingdom panel), not scenery.
10. **`maxTypos` for phrases** → `len>13 ? 2 + floor((len-13)/8)` (≤13 byte-identical to today); charset widened to space/hyphen/digit, gated on the active label.
11. **Wild shimmer** → enqueue-only into a bounded Grove queue (`GROVE_WALK_CAP=12`, `WILD_DUE_PER_SESSION=5`), most-overdue-first overflow, never interrupts.

**Shared constants** (one module, e.g. `src/world/limits.ts`): `ACTIVE_SET_CAP=120`, `WILD_DUE_PER_SESSION=5`, `MAX_POCKET_VISITS=5`, `WALK_FLOOR_MS=1500`, `GROVE_WALK_CAP=12`, `GROVE_CAP=8`, `BENCH_CAP=4`, `FLUX_CAP=15`, `CSI_MS=700`.

### Still genuinely open (next round)

Smaller tuning/copy items, not blockers: rest-well-vs-never-empty copy; study-ahead new-cards-per-day rule vs the active-set cap; a one-time "scheduler is season-blind" line; homograph prompt prominence; gloss-keyword clustering robustness for non-English decks; whether "dormant-grey" reads as *asleep* not *broken*; wind-sway as runtime shear vs baked flutter frames.
