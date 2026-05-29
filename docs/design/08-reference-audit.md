# 08 — Reference-code audit & flaw register

A code-grounded audit of the Verdant Hollow design against high-quality real source — PixiJS v8, jsPsych / lab.js / PsychoJS, ts-fsrs / Anki, dual-grid autotiling references, and the procedural-pixel-art canon. Two reviewers read the actual code/docs/papers and surfaced 16 flaws (`VH-1…VH-16`); a director deduped and dispositioned them. **All 16 are accept-fix this round** — none deferred or rejected.

The corrections here are reflected inline in docs 01–06; this doc is the record + the evidence + the cross-links.

## What the real code *confirms* we got right

- **Bake-and-commit all art** is the industry-safe answer to cross-device float nondeterminism (the GameDev float-determinism consensus; No Man's Sky PC/PS4 reproducibility). Generate offline, ship the artifact — not runtime regen.
- **Curated-parametric "authored mask + seeded variation + vertical mirror"** matches the canonical Bollinger / `zfedoran/pixel-sprite-generator` algorithm verbatim, and Vilmonic's shipping approach. This is how recognizable procedural pixel creatures are actually made.
- **Pixel L-systems** with bracketed turtle interpretation + per-archetype grammars + seeded jitter is the textbook Prusinkiewicz/ABOP method; growth-via-iteration-count is a standard valid lever.
- **Dual-grid 16-tile math** is correct for a *binary* terrain transition (2⁴ corners) with the half-tile display offset — a real ~65% asset reduction vs the 47-blob set (caveat VH-10: per-pair).
- **2048px as the universal-safe atlas floor** — WebGL2/GLES3 guarantees `MAX_TEXTURE_SIZE ≥ 2048`; Android drivers lie above 4096. ≤4 bound textures is a sound batching target.
- **A single global season/day-night `ColorMatrixFilter` on one container** is a cheap, correct use (`ColorMatrixFilter` is a core v8 filter importable from `pixi.js`). The *per-entry* use is the problem (VH-3).
- **PixiJS v8 lifecycle assumptions are v8-shaped** — async `await app.init`, ticker passes a `Ticker` instance, `scaleMode: 'nearest'`.
- **Partitioned cosmetic RNG** + species binding on a local mulberry32 is sound deterministic-PRNG practice and correctly isolates cosmetics from stimulus selection.
- **Freeze-the-world during the measured window** matches rhythm/action-game input-timing practice (remove render/animation contention from the RT path). Sound instinct (VH-16 only refines: keep *IO* off the path too).
- **Grade-before-cosmetics** + sealing RT/correctness to `meta` before any cosmetic reaction is correct.
- **`performance.now()`** (monotonic, same origin as `Event.timeStamp`) is the right clock *once onset is paint-anchored*; matches jsPsych (`rt_method:'performance'`) and PsychoJS (`MonotonicClock`).
- **Class-keyed scheduling** for Crown (15) and Flux (8) — scheduling difficulty *kinds*, spawning a fresh stimulus per due event — is a legitimate SRS adaptation that keeps the pool finite and the construct stable.
- **Wilson-85% algebra** is implemented correctly in the abstract (`ER*≈0.1587`, `BPM_DOWN/BPM_UP≈5.303`). The flaw (VH-5) is the reskin's perceptibility precondition, not the math.
- **Typed production recall** as the lex keystone is well-grounded (Roediger/Karpicke testing effect).
- **The `CardState` seam** (`s, d, lastReview, nextDue, lapses, reps`) is superset-compatible with ts-fsrs — it would drop in behind the seam (enables the VH-4 fix).

## Flaw register

Severity: **H** high · **M** med · **L** low. All status = accept-fix.

### VH-1 (H) — rAF onset is not paint-anchored; a single rAF fires *before* paint
The keystone claims "a single `requestAnimationFrame` callback fires *after* the browser commits the stimulus paint." **It fires before that frame's paint** (MDN; confirmed by both reviewers). Worse, *stopping* the ticker for the trial is the documented low-precision case — a continuously-running rAF loop yields "practically faultless" precision (Behavior Research Methods 2022; jsPsych). A systematic one-frame onset inflation corrupts every `deriveCrownGrade` (1800/3500), `deriveFluxGrade` (0.4/0.75), and FSRS difficulty.
**Fix:** (1) capture onset on a **double-rAF** (or feature-detect `requestPostAnimationFrame`, double-rAF fallback) so it lands at/after the paint boundary; (2) `frozen` means *no cosmetic mutation while a continuously-running rAF loop stays alive* — do **not** one-shot the loop; (3) make the rAF scheduler **injectable** (like `rng`) so post-paint ordering is unit-assertable; (4) document the irreducible compositor/scan-out lag (onset is near-paint, not photodiode-exact); (5) **delete** the Phase-0 "no-repaint-between-onset-rAF-and-rt-capture" assertion (it codifies the bug) → replace with a post-paint-boundary calibration test.

### VH-2 (H) — PixiJS v8 has no WebGL2→WebGL1→Canvas2D auto-fallback; the 3-tier contract is fiction
v8 *removed* the `CanvasRenderer`; `autoDetectRenderer` offers no canvas fallback. A canvas renderer landed only **experimental in 8.16.0** (sprites/graphics/text/basic-filters, opt-in `preference:'canvas'`). WebGL1-vs-WebGL2 is an internal degradation of `WebGLRenderer`, not a selectable design seam.
**Fix:** drop the 3-tier framing everywhere. New contract: **primary `WebGLRenderer`** + an **explicit opt-in reduced mode** behind a `canvas`-experimental flag (pin `pixi.js ≥8.16`, accept basic-filters + no-particles), selected *after probing `gl===null`*, not `autoDetect`. If true Canvas2D is required for a legacy WebView, pin `pixi.js-legacy`/v7. Remove the "common Android WebView, not edge" framing from 05.

### VH-3 (H) — per-entry `ColorMatrixFilter` recolor of 100+ sprites breaks batching
Q2 conflated two axes through one `ColorMatrixFilter` path. N live filters = N batch breaks + framebuffer ping-pongs (v8 perf guide: "bake into sprite sheets instead of runtime filters").
**Fix:** separate the axes. Season/day-night = **one** shared `ColorMatrixFilter` on **one** scene container (keep). Per-entry identity is **never** a live per-sprite filter — use `sprite.tint` (in-batch, near-free) for the dominant hue + 2–3 pre-baked shade variants, **or** bake the full per-entry OKLCH ramp once into a cached `RenderTexture` during the frozen pre-onset build (extend the accessory-compositing path) and draw it as a plain batched sprite.

### VH-4 (H) — FSRS-lite has no retrievability term; the retention claim is unimplemented
`recordReview(key, grade, today)` takes no elapsed days, computes no `R(t,S)`, and the interval is just `jitterInterval(updateStability(...))`. The forgetting curve `R(t,S)=(1+FACTOR·t/S)^DECAY` (DECAY=−0.5, FACTOR=19/81) and desired-retention interval-solving are absent, so no "schedule at 90% retention" claim is actually backed.
**Fix (fork, default a):** (a) **adopt ts-fsrs** (MIT, deterministic-testable) behind the existing `CardState` seam (superset-compatible) — gains real `R(t,S)`, retention-target intervals, trained weights, AND graduated fuzz (closes VH-13); or (b) keep FSRS-lite but make it minimum-viable-real: pass elapsed days into `recordReview`, compute `R(elapsed,S)`, derive the interval from a desired-retention solve, **and** soften the product/evidence copy to "FSRS-inspired Leitner+" so no claim outruns the code. This re-opens the one sealed spot in `recordReview`.

### VH-5 (H) — reskinning Wilson-85% as *imperceptible* ambient tempo breaks its preconditions
Wilson's 85% rule needs a **felt deadline** that modulates error rate + a legible error signal. `bpmToMs(bpm)` is already an enforced timeout (miss = −1 + HP loss), so the algebra holds *only if BPM genuinely modulates error* — i.e. the deadline must be perceptible.
**Fix:** keep the deadline **perceptible but diegetic** — ambient tempo must visibly/audibly cue the response window (closing bloom, pulsing light, audible beat) so a timeout failure reads as "the bloom closed", not an invisible-clock failure. Amend guardrail 5 + doc 03 §7. A no-felt-deadline mode may *not* claim Wilson-85%; instead adapt a perceptible axis (Crown piece-count, Flux switch-rate) to hold 85% and drive BPM cosmetically.

### VH-6 (M) — pixi.js v8 ~120 KB gzip (~476 KB min) on an ~85 KB-gzip PWA: >2× payload, no budget
**Fix:** explicit JS bundle budget **≤200 KB gzip** + a CI size-gate (mirrors the atlas-digest gate; owned by 07). Import only needed sub-paths, `preference:'webgl'`, verify WebGPU + unused filters tree-shake out, **lazy-load pixi after first paint** so the trainer shell boots without the 476 KB parse on cold Android start. Bound `sw.js` precache (the 6.2 MB `flux-bgm.wav` already strains it — VH cross-ref: the Flux audio rework deletes it).

### VH-7 (M) — Canvas reduced mode has no real recolor; `applyTint` understates the surface
A real Canvas path must manually draw the *whole* SpriteScene, not tint a finished WebGL frame (the experimental canvas renderer does basic filters only). Subordinate to VH-2/VH-3.
**Fix:** decide explicitly in 01/06 — **either** own a full manual Canvas2D SpriteScene draw (scope + test it) **or** declare Canvas a **reduced / no-recolor mode** and lean on the Q6 five redundant non-color channels (posture/size/sparkle/audio/glyph) so dormant/awake + season survive without color. Independently, route season via `sprite.tint` on a container (works on more paths) since VH-3 already moves identity color off filters.

### VH-8 (M) — mastery at fixed `s≥30d` is weaker than a retrievability threshold and gameable
`isMastered(s≥30)` gates hard-to-reverse re-greening; the ±15% fuzz + one lucky fast 2-AFC easy can mint it.
**Fix:** redefine mastery as `R(30d,S) ≥ 0.9` (≡ s≥30 under the FSRS curve but computed *through* R so it stays correct if weights change) **+ minReps + >1 successful recall after a real ≥N-day interval**. For 2-AFC Crown gate `easy` on RT **and** a cleared real spacing gap, not speed alone. Same change as VH-4.

### VH-9 (M) — richly-rendered cosmetic sprites inject RT variance the grades misread
Mental-rotation / go-no-go RT scales with figural complexity + clutter, not just the cognitive op; per-trial `cosmeticRng` deliberately varies sprite identity → variance the fixed 1800/3500 cliffs + FSRS difficulty misread as competence (Shepard-Metzler complexity studies).
**Fix:** hold perceptual complexity **constant within a difficulty class** — bake complexity-matched silhouettes per Crown bucket (equal part-count/contour/contrast) and per Flux go/no-go; restrict per-trial cosmetic variation to dimensions that don't move rotation RT (**hue/palette**, not part-count/contour). Log the template id into `meta` alongside `rtByTransform` (extends guardrail 7). Reconciled with VH-12.

### VH-10 (M) — dual-grid is per terrain *pair*; the 4-biome world has no 3-way-junction rule
16 tiles is correct for *one* binary transition; dual-grid has no defined behavior where 3+ terrains meet.
**Fix:** restate the budget as **16 tiles per ordered terrain pair**, and layer the world as a **stack of binary dual-grids** (base ground; grove-over-base; wetland-over-base; solar-over-base) drawn back-to-front by fixed biome priority, so 3-way corners resolve deterministically by layer order — no combinatorial tile set. Add the per-pair set count to the frame budget (still ≤2048px) + a 3-biome-junction test cell.

### VH-11 (M) — golden-hash digest is fragile across Bun/Node versions
The bake-once/commit contract is correct, but the digest *gate* re-runs `cbrt`/`pow`/`sin`/`cos` in-process to byte-compare — re-coupling CI to the JS-engine version (these are implementation-defined in ECMAScript and have changed across Node).
**Fix:** (1) **pin the exact Bun version** for baking in CI; document the digest as toolchain-coupled. (2) **Quantize/round** color math to fixed precision before rasterizing (round OKLab intermediates or use a committed integer sRGB-linear LUT) so sub-ULP transcendental drift can't reach the 8-bit pixel. (3) Treat **committed PNGs** as source of truth: strict in-process canary on the pinned toolchain + a separate **non-blocking** cross-version informational job. (Runtime per-device OKLCH LUT nondeterminism is cosmetic-only, never touches grading — acceptable.)

### VH-12 (L) — 60 shared masks for ~20.5k species rests on an unvalidated "distinct at 48px" assumption
Canonical generators get individuality from per-seed **silhouette** variation, not just color; sharing one mask risks palette-swapped clones across hundreds of Grove/Almanac residents.
**Fix (reconciled with VH-9):** at *bake* time let `templateIdx` select a **grammar** and the per-entry seed vary `branchAngle`/`iterations`/`leafShape` *within* it, baking a small handful of silhouette variants per template — **for non-RT zones only** (Grove/Almanac FLORA/FAUNA identity). Bench (crown) + Meadow (flux) stimuli stay complexity-matched within a difficulty class (VH-9). Validate 48px distinctness in the Phase-0 eyeball.

### VH-13 (L) — flat ±15% fuzz diverges from FSRS graduated fuzz
**Fix (folded into VH-4):** replace flat `0.85 + rand*0.30` with the graduated table — 15% for 2.5–7d, 10% for 7–20d, 5% for >20d, **no fuzz below 2.5d**. Free if ts-fsrs is adopted; ~6 lines if FSRS-lite stays.

### VH-14 (L) — shipped blocks already timestamp onset with `Date.now()` *before* `renderPlaying()`
Confirmation + interim guard, not a new axis. `crown-block.ts`/`flux-block.ts` set `trialStartMs = Date.now()` before `renderPlaying()` (incl. two Chessground board builds), and `Date.now()` is non-monotonic.
**Fix:** ship the VH-1-corrected keystone. **Interim** (before it lands): move the timestamp to *after* `renderPlaying()` and switch `Date.now()`→`performance.now()` in both blocks. With the Pixi atlas renderer, ensure stimulus reveal is a cheap texture swap, not a board build, off the measured path.

### VH-15 (M) — response RT uses `performance.now()` at handler entry, not the event's high-res `timeStamp`
`Event.timeStamp` is a `DOMHighResTimeStamp` on the *same* monotonic origin as `performance.now()`, so `RT = ev.timeStamp − onset` removes the uncalibratable event-dispatch / main-thread-contention delay for free. (Note: jsPsych + PsychoJS both use handler-entry timing, so this is "strictly better", not "everyone's wrong".)
**Fix:** in the armed handler compute `RT = ev.timeStamp − onset` for keyboard/pointer (feature-check; fall back to `performance.now()` if `ev.timeStamp` is 0/non-monotonic). Keep `onset` as the VH-1 double-rAF `performance.now()` value. Update the `readGesture(ev)` adapter contract in 03 to pass the event through.

### VH-16 (L) — freeze/grade/`recordReview` run on the main thread inside the measured window
`recordReview` does sync `localStorage` writes + a full `getMasteredCountByPrefix` O(n) scan per trial — inside the critical section.
**Fix:** capture the response timestamp (VH-15) as the **first** statement in the handler. **Defer** the `recordReview` write + mastery rescan to after unfreeze (or `requestIdleCallback`). Cache mastered counts **incrementally** (a counter bumped in `recordReview`) instead of re-scanning all of localStorage every trial. Guardrail 4 becomes: *timestamp → grade-decision → cosmetics → deferred-persist*.

## Sources read (selected)

**Render/art:** PixiJS Discussion #10682 (Canvas removed in v8) · PixiJS 8.16.0 blog (experimental Canvas) · PixiJS v8 Renderers + Filters/perf guides · PixiJS v8 migration (async init, ~120KB gzip) · MDN `requestAnimationFrame` (fires before paint) · Behavior Research Methods 2022 + jsPsych timing (continuous-loop precision) · Excalibur/Godot dual-grid (binary-pair only) · `zfedoran/pixel-sprite-generator` (Bollinger mask+mirror) · Prusinkiewicz ABOP (L-systems) · JS Math determinism threads (`cbrt/pow/sin/cos` impl-defined) · texture-size threads (2048 floor).

**Cognitive/timing:** MDN `requestAnimationFrame` + `Event.timeStamp` + Event Timing API · jsPsych KeyboardListener / html-keyboard-response / Timing-Accuracy · PsychoJS `core/Keyboard.js` · Bridges/Pitiot/MacAskill/Peirce 2020 (timing mega-study) · de Leeuw & Motz / Anwyl-Irvine (keystroke reliability) · FSRS algorithm wiki + free-spaced-repetition-scheduler (`R(t,S)`, interval solve) · ts-fsrs (MIT, `FUZZ_RANGES`) · Anki/FSRS4Anki (retention-target, dynamic fuzz, no fixed-S mastery) · Wilson et al. 2019 (85% rule preconditions) · Shepard-Metzler 1971 + figural-complexity studies · rhythm-game latency writeups (Rhythm Quest).
