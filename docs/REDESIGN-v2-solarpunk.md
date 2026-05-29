# Brainbout v2 — "Verdant Hollow": a cozy solarpunk-ecology remake

> **Supersedes `REDESIGN.md`.** v1 assumed three minimalist games + a meta-shell under a no-WebGL/near-zero-dep constraint. This pivot is a **full remake** into **one** cozy 2D-pixel solarpunk-ecology world. Only two ideas carry over from v1: the **cognitive-validity guardrails** and **FSRS-as-conductor**.
>
> Produced from a second 8-agent research/design workflow (web-grounded, read the real source). Locked direction (chosen by the user): **cozy 2D pixel (Stardew vibe)** · **web/offline PWA, reuse the TS logic** · **full remake into one living world** where spaced-repetition + spatial rotation + go/no-go + rule-switching *emerge* from tending it.
>
> **Build-ready detail lives in [`design/`](design/README.md)** — art pipeline, world/session, zone mechanics, content/taxonomy, and the Phase-0 spike, reconciled into one buildable spec with the file/module layout. This doc is the high-level pitch; `design/` is the implementation plan.

## TL;DR — the verdict

**Build "Verdant Hollow": one contiguous, dormant solarpunk valley you wake as Keeper.** It starts greyed and re-greens **only as cards genuinely stick** — the world's visual state *is* `CardState`, read through a pure presentation map, so it can never show fake progress.

- **Winner among three framings** — garden/farm ("Sunhollow", 41), rewilding/ecosystem ("Verdige", 42), **grove/sanctuary ("Verdant Hollow", 43)**. Grove won as the *synthesis*: highest floor on all five axes (cozy-pull, cohesion, cognitive-validity, programmatic-art-fit, feasibility), no soft spot. It matches rewilding's emotional one-world cohesion *and* garden's validity rigor, and its fiction — *"species fell asleep when their names were forgotten; typing the name wakes them"* — makes **typed production recall the load-bearing diegetic verb**, not a tax. Best ideas from the other two are grafted in.
- **Renderer: PixiJS v8** (WebGL2) with a mandatory feature-detected **WebGL2 → WebGL1 → Canvas2D** fallback. *All art baked to committed PNG atlases at build time* (mirroring the existing `sounds.ts` "synth offline, commit the artifact" pattern) so **correctness never depends on a runtime shader** — critical because Chromium disables WebGL2 by default in many Android WebViews.
- **Content: real Norwegian vocabulary** from the verified 20,592-entry `public/dict-no.json`, each entry deterministically bound (`hashString(entryId)`) to a procedurally generated plant/creature — **naming the species *is* recalling the word**. The deck is a swappable `(deckId, entryId)` abstraction so other languages / fact decks plug in later (the concrete answer to the brain-trainer novelty wall: a new deck regenerates a fresh world to learn).
- **The architecture that makes it safe:** keep the cognitive cores (`crown-rotation.ts`, `flux-engine.ts`, `lex-srs.ts`) and the spine (`fsrs.ts`, `rng.ts`, `progress.ts`, `stages.ts`) as **sealed logic**; rebuild **only** a render/art/world layer behind the existing `block.ts` `BlockHandle`/`BlockOutcome` seam, with a thin per-construct theming adapter. *Verified against the repo:* `handleResponse()` in `crown-block.ts` already grades via the sealed engine **before** firing feedback/sound — "the engine never knows it's a garden" is real today, not aspirational.

## The world: four zones, one valley, one demand per moment

A single **contiguous** Hollow (explicitly *not* a hub of mini-games). The cognitive guardrail — **one construct per moment, alternation never concurrency** — is made *physical*: each construct lives in a spatially distinct zone with a distinct gesture, so go/no-go and rule-switching can't blur into one minigame.

| Zone | Construct | Mechanic (sealed engine reused) | FSRS keying |
| :--- | :--- | :--- | :--- |
| **Grove** | Spaced recall | A dormant resident needs you; **TYPE its Norwegian name** to wake it. Target hidden until after the attempt; autograded by `suggestGradeFromTyping`. | per-instance `lex:<deck>:<word>` |
| **Propagation Bench** | Mental rotation | A chiral, asymmetric grown specimen shown rotated/mirrored vs a parent footprint; commit **SAME/DIFFERENT under RT pressure** (`deriveCrownGrade` bands) *before* any cosmetic drag-to-pot. | class-keyed `crown:<bucket>:<transform>` (15) |
| **Meadow** | Go/no-go inhibition | Harvest the ripe / **withhold** on the unripe; welcome pollinators, don't swat them. Genuine `-1` withhold cost preserved. | class-keyed `flux:<not_>?<rule>` (8) |
| **Biome-crossing / Weather** | Rule-switching | A telegraphed season/weather change is the diegetic **cue** that flips which action is correct. Real Monsell switch cost, 3–7 cadence, NOT-variant. | class-keyed `flux:<not_>?<rule>` (8) |

**Why only Lex is per-instance:** a word = a card (as today); the spatial/inhibition organisms are **class-keyed "chore stations" tended in batches**, so planting 200 plants never explodes the due-load into thousands of cards. The **greenhouse-vs-wild active-set cap** (grafted from Rewilding) bounds it further: only a curated set is FSRS-active at once; older masters migrate to a self-sustaining "wild" that emits occasional, not daily, due-events.

## FSRS is the literal world-state (the honesty guarantee)

There is no separate progress bar that could lie, because the world's appearance *is* `CardState` through a pure map:

```
never-reviewed → dormant/grey      again / low-S → wilting (recoverable, never dead)
good           → thriving          easy          → blooming
S ≥ 30d (isMastered) → perennial native scenery that LEAVES the active queue
```

`isDue(card, today)` *is* the "needs tending" sprite. Tending *is* the retrieval trial. The RT/typed grade feeds `recordReview`, which jitters the interval (±15%) and sets `nextDue` = exactly when that organism next thirsts. A lapse re-entering the queue sooner is just FSRS `again`-handling — visual and schedule can never diverge. The **Wilson-85% adaptive knob** survives untouched as *ambient world tempo*: struggling → the Hollow is patient and asks less; thriving → it asks for more. **No fail screen, ever.**

## Cognitive-validity guardrails (encode as tests — non-negotiable)

1. **rAF-anchored RT onset** *(the #1 risk — genuinely new work).* Today RT onset is `Date.now()` set right before `renderPlaying()`, **not** a paint callback. The new GPU/particle layer is exactly what could pollute the measured window. Anchor stimulus onset to a `requestAnimationFrame` **paint** callback, capture the response in the *same* clock, and **freeze all juice/particles/sway until after RT is logged**. Add a Playwright/timing regression test asserting *no paint mutation between onset and capture*.
2. **Typed PRODUCTION is the keystone.** The wake-gate is free-text typing (or a cloze of a defining trait), never tap-to-water recognition (Roediger & Karpicke: ~80% vs ~33% at one week). MCQ → cloze → typed exists only as the stage-1 → stage-3 scaffold, escalating on `stages.ts` 5-session rolling accuracy.
3. **One construct per moment** (alternation, never four-at-once concurrency).
4. **Grade before cosmetics.** Crown commits SAME/DIFFERENT before the drag-to-pot; the drag never carries the grade.
5. **Adaptive difficulty survives the reskin** — Wilson-85% (`BPM_UP=1`, `BPM_DOWN≈5.303`), `noGoRate` 0.1–0.2, switch cadence 3–7, NOT-variant all intact.
6. **Partitioned RNG.** Cosmetics run on a *separate* rng stream from gameplay so they can never desync a deterministic daily or pollute timing.
7. **Empirical self-check** *(grafted from Garden).* Log switch-vs-repeat RT and RT-by-rotation-angle into `BlockOutcome.meta` so the Monsell switch cost and the Shepard-Metzler angle effect can be *verified* to have survived — the cheapest insurance the cozy theme enhanced rather than diluted the construct.

## The programmatic art pipeline (no human artist)

Build **all** art programmatically **at build time** (`scripts/bake-atlas.ts`, sibling to `gen-icons.ts`, headless Bun + Canvas2D + `sharp`), commit atlases + JSON frame-maps, snapshot-test the **atlas hash**. Runtime only displays baked, seed-derived atlases + applies recolor/lighting/particles. Determinism is the killer argument: generation is a pure function of seed, runs in CI, byte-stable, and never pollutes RT.

**Generation order (palette first):**
1. **OKLCH seeded palette** → cohesive solarpunk ramps (warm-light / cool-shadow hue-shift). ~150 lines, deterministic. Single lever for the whole "warm optimistic" look; reused by season recolor + day-night.
2. **Pixel L-system plants** with N baked growth-stage frames — **FSRS stability maps to growth stage** (memory literally grows the plant); season = palette swap.
3. **Silhouette-first symmetric creature generator** (mirror + outline + ramp shading + Bayer dither) — the visible FSRS "species" that *are* your vocabulary. (Avoid GAN/AI gens: non-deterministic, online, heavy.)
4. **Dual-grid autotiling** (16 tiles, simpler than 47-blob) + value-noise biomes for seamless Stardew-grade terrain.
5. **Art-Nouveau "reclamation" overlay pass** *(grafted from Rewilding)* — vines/moss procedurally creeping over geometric solar-tech skeletons. The highest-leverage cue that reads as *solarpunk* not generic-green, and it makes the renewable-tech fiction load-bearing (the tech is the skeleton the biome reclaims).
6. **Runtime juice** — tween/squash-stretch, procedural idle sway/bob, particle pools (pollen, fireflies, leaves, sparkle), day-night + season via a small LUT/gradient-map filter (Canvas2D composite-tint fallback). *All confined to non-measured moments.*

**Audio** — generative Web Audio ambient bed + synthesized nature soundscape, day/season-reactive, no recorded musician (extends the existing offline-synth approach).

**Renderer rationale:** PixiJS v8 is the benchmarked leader for batched pixel sprites (1000s at 60fps), with nearest-neighbour `SCALE_MODE` + `roundPixels` for crisp pixels and cheap GLSL filters for LUT/wind/bloom. Three.js-ortho "HD-2D" buys per-light bloom/normal-maps a flat cozy farm doesn't need; raw WebGL2 reinvents batching; Canvas2D alone can't batch thousands of sprites on low-end Android. Adds ~350–450 KB gzipped — **partly offset by dropping both current runtime deps** (`@lichess-org/chessground`, `crossword-layout-generator`) once Crown moves to the bench and Lex to the field-journal.

## Migration roadmap (incremental; the green test suite never breaks in one step)

The `BlockOutcome` contract is the **firewall**: logic stays green while presentation is swapped.

- **Phase 0 — SPIKE / gate.** PixiJS shell + WebGL2→WebGL1→Canvas2D feature-detect; render ~10 prototype species + one full zone from a seeded OKLCH palette; **prove the rAF-paint-anchored onset hook** with a timing regression test. *This is the go/no-go gate: if pure procedural art can't reach Stardew-charm (even with a curated parametric component library), or RT precision can't be protected — STOP before committing the pipeline.*
- **Phase 1 — deterministic art bakery.** `scripts/bake-atlas.ts`; generate palette → L-system plants → creatures → dual-grid tiles → reclamation overlay; commit atlases; snapshot the atlas hash. Old surfaces untouched.
- **Phase 2 — port LEX first** (lowest risk, most reusable). Generalize `lex-srs.ts` keying `(lang, word)` → `(deckId, entryId)`; extend the closed `BlockKind` union; implement the Grove typed-recall block behind `BlockHandle`/`BlockOutcome`, running **alongside** the old DOM lex surface. Ships the vibe + the validity guardrail tests together, earliest.
- **Phase 3 — port CROWN** (propagation bench): map transforms to the chiral-specimen presenter; graded SAME/DIFFERENT-before-drag; log RT-by-angle.
- **Phase 4 — port FLUX** (meadow + biome-crossing): go/no-go = harvest/withhold; cued switch = season/weather; spatially distinct gestures; log switch-vs-repeat RT.
- **Phase 5 — assemble the world.** Scene-router *through* the `BlockHandle` seam (extend `daily.ts`'s `setRng`/`resetRng` wrapper) enforcing one-construct-per-moment; `CardState`→sprite life-cycle map; greenhouse-vs-wild cap; generative audio; day-night/season LUT; Almanac UI; regreening reveal.
- **Phase 6 — meta + social (all offline).** Seasons/festivals theme **only** non-due discovery (the clock never bends the scheduler); Wordle-style spoiler-free leaf-glyph share grid on the existing date-seeded daily; humane streaks/freezes reused verbatim; standardize the day boundary on `todayString()`.
- **Phase 7 — retire the old surfaces.** Delete `crown.ts`/`flux.ts`/`lex.ts` DOM renderers + CSS + `lex-board`/`lex-crossword`; drop the two runtime deps.

## Reuse vs rebuild

**Reuse verbatim (sealed):** `fsrs.ts` (world heartbeat), `rng.ts` (generation backbone), `progress.ts` (streaks/freezes/daily/best), `stages.ts` (curriculum), `sounds.ts` (synth approach); the cognitive cores as logic with only the stimulus skin changed (`crown-rotation.ts`, `flux-engine.ts`, `lex-srs.ts`); `dict-no.json` as the default deck; the `block.ts` seam as the integration boundary.

**Rebuild (everything below the seam):** the PixiJS world shell + fallback init; the build-time art bakery; the runtime art layer (frame selection, recolor, LUT, tween/sway, particle pool); the four zone scenes + scene-router; the per-construct theming adapters; the generative audio bed; the Almanac; the seasons/weather/day-night clock; the share grid.

## Open questions for the user (defaults recommended)

1. **Renderer sign-off** — all three designs (and the director) override your "Three.js/WebGPU" menu pick for **PixiJS v8 + Canvas2D fallback**. Adds ~350–450 KB gzipped. *Recommend: confirm PixiJS.* Is there a hard PWA bundle-size cap to design against?
2. **Art quality gate** — the #1 product risk is whether 100%-procedural generation hits Stardew-level charm with no artist. *Recommend: gate the whole remake on the Phase-0 10-species prototype, and allow a hand-tuned **parametric component library** (curated silhouettes/palettes/animation curves driving the generators) if pure generation falls short.* Is "fully algorithmic, take what the seed gives" a hard constraint, or is curated-parametric OK?
3. **Determinism scope** — *Recommend: gameplay/trial determinism mandatory; per-player cosmetic variety allowed via the separate cosmetic rng* (bounds how strict atlas-hash snapshots must be). Or must same-date-seed worlds be byte-identical across devices?
4. **Typing UX on Android** — typed production is the validity keystone but on-screen keyboards add friction. *Recommend: a letter-bank/typed hybrid that still demands production as the early-stage ramp*, full free-text later. OK?
5. **Telemetry** — log switch-vs-repeat RT + RT-by-angle to verify the constructs survived. Offline only. *Recommend: local self-review with an opt-in export.*
6. **Traversal** — *Recommend: start with a lighter zone-router that fast-travels between care rituals* (cheaper, ships sooner); free camera traversal later. Or free world-walking from the start?
