# 07 — Testing & CI integration

How every new Verdant Hollow module slots into the existing discipline **without weakening it**. The firewall is the architecture: the cognitive cores stay sealed, and the new layer is mostly **pure data functions** (testable to the existing bar) plus a **thin Pixi draw** (browser-only, coverage-ignored, covered by Playwright).

## The existing bar (do not regress)

- **Bun unit + happy-dom** (`bunfig.toml` preloads `test/setup.ts`). happy-dom has **no WebGL**.
- **Coverage thresholds, enforced:** lines **0.99**, functions **1.0**, statements **0.99**. The DOM/entry/glue files are in `coveragePathIgnorePatterns` (`*-block.ts`, `games/{crown,flux,lex,cycle,daily}.ts`, `engine/block.ts`, `shared/pwa.ts`, `tools/stryke/*`).
- **fast-check** property/fuzz (`test/property.test.ts`; 10k in CI, 100k local). RNG injectable.
- **Mutation, two runners:** `stryke` (custom native mutator, in CI, **hard <30s wallclock**) + Stryker full (`workflow_dispatch`, command runner `FAST_CHECK_NUM_RUNS=10 bun test --bail`, 15 s timeout, 90/70/65 thresholds, `mutate` = the pure modules).
- **Playwright** e2e: chromium + reduced-motion projects, `webServer = bun scripts/dev.ts` on `:5173`.
- MEMORY constraints: don't re-run expensive jobs; **Bun Worker + happy-dom segfaults** (no Worker threads for DOM isolation); `mock.module` snapshots data exports.

## The centerpiece — the corrected RT-timing test

The single most important new test (`test/scene/trial-clock.test.ts`), encoding the VH-1/VH-14/VH-15/VH-16 fixes. Run with an **injectable fake rAF scheduler + fake `performance.now`**:

- **Onset is captured on the *second* rAF** (or `requestPostAnimationFrame`), i.e. at/after the post-paint boundary — **not** the first rAF. The old Phase-0 assertion "no repaint between the onset rAF and rt-capture" is **removed and inverted** (it codified the bug): assert instead that onset lands no earlier than the post-paint boundary and that a continuously-running rAF loop stays alive (the world is *frozen of cosmetic mutation*, not stopped).
- **`RT = ev.timeStamp − onset`** for keyboard/pointer (fall back to `performance.now()` if `ev.timeStamp` is 0/non-monotonic); both on the same monotonic origin.
- The **response timestamp is the first statement** in the handler, before any grade/IO.
- **`recordReview` persistence is deferred** past unfreeze (or `requestIdleCallback`); assert no `localStorage` write occurs inside the measured window.
- The injectable scheduler makes all of the above deterministically assertable in Bun+happy-dom (which *does* provide `requestAnimationFrame` + `performance`).

## Per-module test matrix

| Module | Kind | Strategy | Coverage | Mutation |
| :-- | :-- | :-- | :-- | :-- |
| `content/deck.ts` (`normalizeVocabDeck`, `rank`) | pure | unit + fast-check (NFC/senseIdx/entryId/rank determinism; phrase trailing-band) | 0.99/1.0 | stryke + Stryker `mutate` |
| `content/species.ts` (`speciesFor`, `clusterKey`) | pure | unit + property (byte-identical 2× runs; homograph→distinct; **no global-rng drift**; non-English `clusterBy` fallback) | 0.99/1.0 | stryke + Stryker |
| `content/almanac.ts` (`AlmanacState`) | pure | unit (state table incl. the VH-8 mastery predicate) | 0.99/1.0 | Stryker |
| `games/lex-active-set.ts` (cap, promotion, `newAdmissionBudget`) | pure | unit + property (cap never exceeded; NEW_BASE=8/STUDY_AHEAD_NEW_MAX=20 clamp; wild sub-cap) | 0.99/1.0 | stryke + Stryker |
| `games/due-scan.ts` (`getDueClassKeys`) | pure | unit | 0.99/1.0 | Stryker |
| `world/presentation-map.ts` (`stabilityToStage`, `StatePresentation`) | pure | unit + **grayscale snapshot** (≥2 non-color fields differ between any two states — VH-6/Q6) | 0.99/1.0 | stryke + Stryker |
| `world/morning-round.ts` (`computeMorningRound`) | pure | unit + property (≤5 visits; per-zone caps; 3-key overflow sort; overflow stays due) | 0.99/1.0 | Stryker |
| `world/regreening.ts` (unlock ladder, wild zone) | pure | unit | 0.99/1.0 | Stryker |
| `world/share-glyph.ts` | pure | unit (spoiler-free; no word text emitted) | 0.99/1.0 | Stryker |
| `world/limits.ts` (constants) | pure | imported by tests; no logic | n/a | n/a |
| `shared/fsrs.ts` (R(t,S), interval solve, graduated fuzz, mastery predicate, incremental mastered-count) | pure | unit + property (R(30d,S)=0.9 identity; desired-retention interval; graduated fuzz table; **single fast lucky 2-AFC can't mint mastery**; cache == full scan) — **or** ts-fsrs parity tests behind the `CardState` seam | 0.99/1.0 | stryke + Stryker (already in `mutate`) |
| `games/lex-srs.ts` (`maxTypos` len>13; `normForMatch`) | pure | unit + property (≤13 byte-identical to today; phrase round-trip grades `hard`) | 0.99/1.0 | stryke (native, already 100% kill) |
| `flux-engine.ts` adaptation | pure | unit (Wilson convergence still holds **AND** a cue fires within `bpmToMs` — perceptible diegetic deadline, VH-5; −1 no-go penalty stays) | 0.99/1.0 | Stryker (already) |
| `scene/trial-clock.ts` | timing | **the centerpiece test above** (fake rAF + fake `performance.now`) | 0.99/1.0 | Stryker (the scheduler logic is pure given injected clock) |
| `scene/scene-router.ts` | dom | unit on the pure parts (Walk assembly, `wildPending` enqueue-not-interrupt, single `activeHandle`); reuses `daily.ts` `setRng`/`resetRng` | mostly 0.99 (thin mount in ignore-list) | — |
| `scene/zones/{grove,bench,meadow,biome}-adapter.ts` | pure(layout)/dom(gesture) | `layout()` returns `SpriteScene` **data** → unit + property; `readGesture` returns the raw token + `ev.timeStamp` | layout 0.99/1.0; gesture wiring covered by Playwright | Stryker on layout |
| `scene/guided-trial.ts` | dom | **import-graph test**: must NOT import `shared/fsrs` or `scene/trial-clock`; asserts `BlockOutcome.trials` + `getCard().reps` unchanged across a guided trial | ignore-list (DOM) | — |
| `scene/pixi-stage.ts` | render | **coverage-ignored**; Playwright only. Assert `WebGLRenderer` by default + experimental canvas reached *only* behind the flag after a `gl===null` probe (VH-2); **no** test asserting auto Canvas2D fallback | ignore-list | — |
| recolor / atlas draw | render | Playwright perf/regression: per-entry color is `sprite.tint` or a cached RT (in-batch, ~2 draw calls for ~150 sprites), **not** N `ColorMatrixFilter`s (VH-3); reduced-mode test that dormant/awake + season survive color-stripped (rides Q6) | ignore-list | — |
| `scripts/bake-atlas.ts` + `scripts/bake/*` | bake | `test/bake-atlas.test.ts` golden gate (canary RGBA byte-match on the **pinned Bun** + `manifest.digest===EXPECTED_DIGEST`) + a **quantization test** (color math rounds before raster, VH-11); the pure `bake/*` sub-modules (`palette`, `lsystem`, `tiles`, `pack`) join the mutation set | sub-modules 0.99/1.0; orchestrator via the gate | stryke/Stryker on `bake/*` |

Note: **`recordReview` and the `*-block.ts` files leave the coverage-ignore list** once their logic changes (the keystone reorder + the FSRS signature change move real logic into testable territory).

## CI workflow changes (`.github/workflows/ci.yml`)

- **Keep** all current jobs: `lint` (incl. `tsc --noEmit`), `test` (`test:cov`, 0.99/1.0 thresholds), `fuzz` (fast-check 10k — add the new pure fns as property targets), `e2e` (Playwright), `mutation-fast` (`stryke`).
- **New — bundle-size gate (VH-6):** after `bun run build`, `scripts/bundle-size.ts` walks each HTML's JS chunk graph (gzipped) and asserts two budgets. **full** (whole transitive graph incl. lazy chunks): trainer pages ≤ 60 KB (pixi-free tripwire), verdant pages ≤ 210 KB. **boot** (static-import-only = the shell that ships before first paint): ≤ 60 KB — this proves pixi (~120 KB) loads lazily. **Lazy-load (VH-6) implemented:** pixi keeps tree-shaken *named* imports in `pixi-stage`; each verdant entry `await import()`s its render layer (zone block / scene-router / `verdant-diorama`), so pixi code-splits into a shared on-demand chunk. `build.ts` runs **two** `Bun.build` calls — trainers (no `splitting`, single-chunk, untouched) and verdant (`splitting: true`) — so splitting overhead never touches the trainer pages. Actuals: bench/grove/meadow/walk boot at **0.8–2.0 KB** (pixi lazy); `verdant.html` (the static Phase-0 showcase, renders pixi immediately, single-use render module bun merges into the entry) is BOOT-exempt.
- **New — bake determinism (VH-11):** a **pinned-Bun** job runs `bun gen:art` and asserts the working tree is clean (`git diff --quiet public/art`) — the "`bun gen:art && git add public/art`" contributor contract, enforced. Plus a **separate non-blocking** cross-version informational job that flags transcendental drift without failing CI.
- **New — fallback / reduced-motion e2e:** Playwright projects that (a) force the experimental canvas/reduced mode behind the flag and (b) run a WebGL2-disabled context to mimic a legacy Android WebView; assert the world still renders (reduced) and the RT-onset path still works.
- `mutation-fast` (`stryke`) **stays <30s**: add only the new *pure* modules; keep the native-mutator pattern (per the existing `lex-*` 100%-kill-in-~670ms precedent); scope per-file and parallelize. If the budget tightens, split the slowest files into their own native-mutator pass rather than raising the wallclock cap.

## New test files

`test/scene/trial-clock.test.ts` (centerpiece) · `test/content/deck.test.ts` · `test/content/species.test.ts` · `test/content/almanac.test.ts` · `test/games/lex-active-set.test.ts` · `test/games/due-scan.test.ts` · `test/world/presentation-map.test.ts` (+ grayscale snapshot) · `test/world/morning-round.test.ts` · `test/world/regreening.test.ts` · `test/world/share-glyph.test.ts` · `test/bake-atlas.test.ts` (golden gate + quantization) · `test/scene/scene-router.test.ts` · `test/scene/zones/*-adapter.test.ts` (layout data + meta) · `test/scene/guided-trial.test.ts` (import-graph) · extend `test/fsrs.test.ts` (R(t,S)/fuzz/mastery) · extend `test/property.test.ts` (new pure fns) · Playwright: `test/e2e/world.e2e.ts` + a fallback/reduced-mode project.

## Risks & mitigations

- **Pixi can't be unit-tested in-process** (no WebGL in happy-dom; Worker isolation segfaults). → Push *all* logic into pure `SpriteScene`-producing functions; keep `pixi-stage` thin + coverage-ignored; cover rendering via Playwright real-chromium only. This is why the adapter contract returns *data*.
- **Coverage 1.0 functions is demanding.** → Every new pure fn ships with a test; thin DOM/render files join the ignore-list with a one-line justification (matching the existing `crown.ts`-style exclusions).
- **stryke <30s as module count grows.** → Native-mutator pattern + per-file scoping + parallelism; never raise the cap.
- **Golden-hash flakiness.** → Pinned-Bun blocking gate + quantized color math + committed PNGs as source of truth + non-blocking cross-version job (VH-11).
- **RT-timing tests are subtle.** → Injectable rAF scheduler + fake `performance.now` make them deterministic; the centerpiece test explicitly *inverts* the previously-specified buggy assertion so the fix can't silently regress.

Every accepted flaw in [08](08-reference-audit.md) maps to at least one named test here; the corrected RT-timing test is the centerpiece.
