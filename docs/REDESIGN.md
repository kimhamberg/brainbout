# Brainbout — Redesign Brief: Cohesion, Programmatic Art, and Per-Game Rewrites

> Research + design study answering: (1) how to generate **all** game art/audio programmatically with no human artist; (2) how to make Crown, Flux, and Lex feel like **one** very-replayable product; (3) concrete rewrites of each game benchmarked against the most popular games in its cognitive domain. Produced from a 13-agent research/design workflow grounded in the actual source.

## TL;DR — the verdict

**Build the hybrid ("Concept C"): keep three distinct, individually-polished games, give them ONE shared visual + audio + feedback language, and add a single-game "Bout" (a WarioWare-paced gauntlet that splices all three into one escalating run).**

The decisive reason: this is the only direction that serves **both** stated goals with one investment. The three per-game rewrites *are* the early phases of the unified game — every polish lever (Crown's snap-reveal, Flux's live-tempo music, Lex's hidden autograde, the shared `juice.ts` + `genart/` layer) is reused verbatim as a Bout building block. Per-game enjoyment and unification stop competing for effort.

The two rejected alternatives and why:

| Concept | Verdict | Why |
| :--- | :--- | :--- |
| **A — three games + meta-shell** (orchestrator only, engines untouched) | Safest, but cohesion capped | Highest feasibility + validity, but leaves the games themselves dry. Crown's dryness gets *papered over* by an external shell, not *fixed at source*. |
| **B — one single game** (one trial stream, four "lenses" per beat) | Most cohesive, but the codebase fights it | Crown re-mounts two Chessground boards per trial → layout thrash on Android WebView; one beat-budget across a Flux glyph vs a Crown rotation vs a Lex definition is cognitively unfair and breaks the Wilson-85% convergence the tests pin; in-stream 2AFC collapses Lex's *production* recall into *recognition*, contradicting the evidence that justifies Lex. A near-rewrite of the most-tested, highest-determinism-risk surface. |
| **C — hybrid** ✅ | **Winner** | ~90% of B's cohesion (shared grammar, shared scorer, one seed→art system, one combo/HP) with A's safe alternation seam and untouched-engine validity. The only concept that improves the three games *at source* and reuses that work as the gauntlet. |

**Non-negotiable principle: alternation, never concurrency.** One cognitive demand per beat. Task-switching is trained by *fast alternation between* Crown/Flux/Lex/no-go beats — not by testing four things simultaneously (which overloads players and destroys the validity of each construct). This is the WarioWare lesson and the safe reading of the dual-n-back / executive-function literature.

---

## Part 1 — Programmatic asset generation (no human artist)

### Current state: Brainbout already lives in the "art is code" world

- **App icons** — `gen-icons.ts` rasterizes an inline brain SVG with a Catppuccin gradient via `sharp` (build-time baker).
- **Flux stimuli** — pure CSS (`form-*`/`color-*`/`fill-*`/`size-*` classes, clip-path triangles, repeating-linear-gradient stripes, radial-gradient inset shading). No images.
- **Crown pieces** — Chessground glyphs (the one place a runtime dep draws art).
- **Sounds** — synthesized WAVs (offline modal/FM/additive synth tool), committed to `public/sounds/`.
- **Palette** — 16 Catppuccin CSS custom properties, theme-swapped via `data-theme`.
- **Determinism** — a clean seeded-RNG layer already exists (`rng.ts`: mulberry32 + FNV-1a `hashString` + injectable global `rng`).

What's missing is **(a)** a shared, deterministic, theme-reactive generative-art primitive layer, and **(b)** using it to inject *variety* — the named weakness of Crown and the cohesion gap across all three games.

### The plan: one `src/shared/genart/` module + one `src/shared/juice.ts`

Everything is **SVG / Canvas2D / CSS with zero new runtime deps**, every generator takes an **injected `Rng`** and returns **strings/numbers (no DOM)** so it slots into the existing bun-unit + fast-check + <30s mutation discipline (same pattern as `lex-*`), with a `same seed → identical output` property test.

**Ranked by effort:payoff for this repo:**

| Technique | Effort | Payoff | What |
| :--- | :--- | :--- | :--- |
| **OKLCH-derived palette harmonies** | low | high | Treat the 14 Catppuccin accents as fixed anchors; derive tints/shades/analogous/glow/muted states in perceptually-uniform OKLCH. CSS-native and mostly **zero-JS**: `oklch(from var(--ctp-mauve) l c calc(h + 25))`, `color-mix(in oklch, …)`. Stays on-brand and contrast-predictable in *both* Frappe and Latte. ~30-line `sRGB→OKLCH` TS fallback for seeded/dynamic cases. |
| **Seeded SVG emblems / crests** | low | high | Reimplement the *jdenticon technique* (NOT the dep, ~40–60 lines) against `seededRng`: hash a seed (Daily date, mastered word, run id) → a symmetric radial crest. Gives every day / word / run a unique, deterministic, **collectible** badge — the cheapest cohesion + collectibility surface. |
| **Procedural geometry** (`shapes.ts`) | low | high | Pure functions returning SVG path `d` strings: n-gon, star, superellipse, rounded-poly, seeded blob (jittered radii + Catmull-Rom). Generalizes Flux's hand-tuned CSS shapes into a parametric family; renders crisp scalable Crown stimuli. |
| **Canvas2D flow-field / value-noise bg + particles** | med | med | Seeded value/simplex noise drives an ambient Hub/transition background and a generalized celebration particle system (replaces Flux's 5 hardcoded CSS keyframes). CPU, WebView-safe, deterministic. Cap particle count; honor `prefers-reduced-motion`. |
| **CSS-only shape/gradient art** (extend Flux) | low | med | conic-gradient (rotation dials, progress crowns), multi-layer gradients, `color-mix(in oklch)`, `@property`-typed animatable custom props. Scales for decoration/single shapes; does **not** scale to data-driven per-element variety — that's where the SVG/Canvas generators win. |
| Truchet tiles / L-system growth | med | low/med | Endless non-repeating deterministic backgrounds/emblems. Nice-to-have. |

**Hard rejections (for *runtime*):**
- **All libraries** — rough.js, two.js, zdog, p5, regl, ogl, canvas-sketch. They violate the near-zero-dep/single-binary ethos and each duplicates a ~40-line helper you can own and test. *Borrow the algorithm inline* (jdenticon technique, IQ's SDF formulas, Shiffman flow-field). The only defensible library use is **build-time-only** in a `scripts/gen-*.ts` baker that emits committed assets (exactly like `gen-icons.ts`).
- **WebGL / GLSL / raymarching** — risks Android-WebView GL availability, breaks GPU-float-precision determinism your screenshot/e2e tests rely on, and is hard to fuzz/mutation-test. If a hero shader is ever wanted, **bake it to a static PNG/APNG at build time**.
- **Houdini Paint API (`paintWorklet)`** — no Firefox/Safari, unreliable in WebView. Out of scope.

### Audio: replace the biggest asset with generative sound

- **Flagship:** delete `flux-bgm.wav` (**6.6 MB**) and synthesize the BGM at runtime with a **Chris-Wilson lookahead scheduler** (25 ms poll, ~100 ms lookahead, events on `AudioContext.currentTime`) whose beat times derive from the **live adaptive BPM** in Flux state — so the music literally accelerates as the player improves. Fold the beat-tick WAVs into the same scheduler. Add **intensity layers** keyed to existing state (bass/pad always on; add hat/arp in `climax` act and high streak; thin to bass when HP ≤ 1). Fixed pentatonic over a Catppuccin-themed root so notes are always consonant.
- **Vendor a ~40-line ZzFX-derived micro-synth** (`src/shared/synth.ts`, as *code*, MIT, not a dep) for state-varying SFX: correct-chime pitch rises with combo, wrong/no-go timbre differs. Keep static one-shots (victory/defeat) as WAVs.
- **Reject** Tone.js (overkill, ~70–90 KB), Howler/Wad (you already own decode+play).
- Scheduler clock and noise source are **injectable** → stays deterministic and mutation-tested.

---

## Part 2 — Cohesion: how the three become one product

Cohesion is a **shell + shared-language** property, not a rules-merge property (the NYT Games lesson). The concrete unification layers:

1. **One feedback grammar** — `src/shared/juice.ts` exposing `flash(el,color)`, `shake(el,intensity)`, `pop(el)`, `burst(x,y,count,color)`, `hitStop(ms)`. Every game calls the *same* helpers so a "correct" looks and sounds identical everywhere. All gated behind the existing `@media (--motion-reduce)`.
   - CORRECT = green flash + number-pop + rising synth chime (+15 ms haptic).
   - WRONG = red flash + small shake + low buzz (+40/40 haptic).
   - NO-GO SUCCESS = subtle blue pulse + hit-stop (**make restraint feel rewarded** — it's the hardest cognitive act).
   - STREAK MILESTONE / NEW BEST = the reserved "climax stack" (hit-stop + particle shower + rising arpeggio) so it stays special.
2. **One seed→art identity** — `genart/` emblems on every Daily date, mastered Lex word, and run. A growing collection turns invisible FSRS progress into a visible trophy case.
3. **One scorer + threaded run-state** — a shared "Bout score", a combo multiplier, and an HP pool that **thread across block boundaries** (a hot streak in Lex makes your next Crown judgement worth more). Held in the orchestrator, never per-block.
4. **One input vocabulary** — LEFT / RIGHT / withhold (press nothing). Makes a remix finale legible at speed.
5. **One mastery surface** — a read-only Hub map lighting the 8 Flux contexts + 15 Crown classes + Lex tiers from FSRS stability (the "panel of skills lighting up" — Peak/The-Witness lesson).

---

## Part 3 — Per-game rewrites

Each rewrite is a **presentation/juice layer + a handful of small pure functions** over an **untouched cognitive engine**. The trained construct, FSRS classes, due-bias generation, grading, stage curriculum, and `BlockOutcome` contract are preserved byte-for-byte — so Cycle/Daily and the test suite keep working and each engine drops straight into the Bout.

### Crown → "Rotation Duel" (the biggest per-trial ROI in the whole study)

**Problem:** a bare binary same/different press with a dry 600 ms text verdict, an *invisible* point bonus, a static result card that never surfaces the personal best, and a Chessground board (`viewOnly`) that *blocks* the per-piece animation the juice needs.

**Fixes (highest ROI first):**
- **Snap-and-settle reveal** — after the answer, board B *physically rotates/mirrors to overlay board A* (CSS transform from the existing `transformSquare` math, ease-out with a tiny overshoot "settle"); the moved piece pulses, matched pieces glow green; particle burst + "seat/click" stinger + number-pop. **Converts the flattest moment in the app into the dopamine hook.** Ship it first.
- **Expose the moved-piece index** — `perturbOnePiece` already computes the moved index and discards it; return it on the `Trial` (a confirmed ~2-line change). Unlocks the snap-reveal pulse *and* the future active mode.
- **Port Flux's juice + score-chase** — visible streak/Zone meter (reuse `STREAK_THRESHOLDS`/`getMultiplier`), tiered praise ("Sharp!"→"Locked in!"→"Unreal!"), golden trials, and a live `getBest('crown')` "Best: N — beat it!" with a NEW BEST / near-miss card (port Flux's `computeResultVm`). The wiring already exists; the card just never shows it.
- **Pure-CSS/SVG glyph board replaces Chessground** — each glyph an asymmetric inline-SVG path from `shapes.ts`, filled `var(--ctp-*)`. Drops a runtime dep, removes chess recognition-noise, and unlocks per-piece glow/pulse/**tap**.
- **Active mode (medium-term)** — on "different" trials, *tap the piece that moved* (Monument Valley lesson: active rotation is more engaging and trains harder). Still yields correctness + RT for FSRS. Binary mode stays as the stage-1 on-ramp.
- **Aesthetic build-up** — a `--streak-heat` custom property blooms the background across Catppuccin accents as the run heats up (Lumines).

**Validity preserved:** varied transforms + mirrors (Shepard-Metzler/Uttal), asymmetric sprays, single-piece perturbation, RT-banded `deriveCrownGrade`, the 15-class FSRS pool, `pickDueCrownTransform`. Juice magnitude must **not** bleed into RT measurement (measure at button-press, before the reveal animation).

### Flux → "The Pulse" (already best-in-class mechanically; close the feel gap)

Three confirmed gaps between what Flux *computes* and what the player *feels*:

- **Dead BGM** — `state.bpm` adapts toward 85%, the deadline *is* `bpmToMs(state.bpm)`, but the 6.6 MB `flux-bgm.wav` plays at a fixed tempo and never reads it. **The biggest asset in the repo actively lies about the player's tempo.**
- **The climax is computed but inert** — `getSessionAct` defines warmup/flow/climax but *nothing consumes it*. A flat 75 s with no arc.
- **No replay-per-asset variety** — no daily modifiers, no uncued "blind switch", best only shown post-run, FSRS contexts invisible.

**Fixes (all strictly additive to an untouched engine):**
- **(A) Live generative BGM** — the flagship audio change above; bass/arp accelerate with `state.bpm`, intensity layers keyed to act/streak/HP. The 85% controller is untouched (tempo-tracking is free because every beat time derives from current BPM).
- **(B) Shaped climax / boss finale** — make `getSessionAct` load-bearing: in the final 15 s apply a climax overlay (`goldenRate +0.10`, `switchMin/Max −1` for a final flurry) + a one-time `+1` HP refund + distinct visual bloom + synth lead — **without touching `baseBpm`/`floorBpm`/the BPM deltas**, so intensity is real, not faked.
- **(C) Date-seeded daily mutators** (`flux-mutators.ts`, pure `StageParams→StageParams`) — Inverted Day, No-Go Storm, Speed Demon, Golden Rush, and the advanced unlock **Blind Switch** (gamified Wisconsin Card Sort: rule changes *without* the cue, inferred from feedback). 1–2/day, banner-announced. Combinatorial freshness from zero new content — defeats the Lumosity week-4-6 novelty wall.
- **(D) Self-vs-self ghost + mastery map** — a live "BEST PASSED" pulse mid-run, "beat your best by N" after, and an 8-cell Hub grid (4 rules × NOT) tinted by FSRS stability.

**Validity preserved:** cued switch every 3–7 trials, go/no-go, NOT-inversion, the Wilson-2019 controller verbatim (`BPM_UP=1`, `BPM_DOWN≈5.303`, deadline `bpmToMs`). Blind Switch *adds* an inference load (a stronger flexibility assay), never removes the switch. Hit-stop excluded from RT grading.

### Lex → "Ordbout" (hide the chore; make the crossword load-bearing)

Lex has *outgrown* the "30-item MCQ→cloze→typed" description — it's already a real interlocking crossword with Scrabble-tile scoring, streak multiplier, FSRS-derived grade suggestion, and mastery counting. The gaps are specific:

- **FSRS leaks** — `renderReveal` dumps the bare again/hard/good/easy panel — exactly the "review queue" chore the vocab research says *never* to surface.
- The crossword skin is **half-load-bearing** — intersection letters from solved words fill cells but are never *surfaced as free hints*.
- **Fixed 30-item framing** = a finite chore, not Spelling-Bee's "always one more word".
- No per-word mastery seal, binary fail (shame spiral), no shareable Daily, no genart, no juice.

**Five moves:**
- **(A) Hide FSRS** — replace the 4-button panel with a single **autograde**: `suggestGradeFromTyping` (Levenshtein, already built) + reaction time (`promptShownAt`, already tracked) → silent `recordReview`. The player only ever sees "locked in" / "reveal". The word "review" disappears. *This is strictly more honest and matches what Crown/Flux already do.*
- **(B) Make the skin load-bearing** — render intersection letters from solved words as **visible locked-green pre-fills** in the active word; on correct submit, animate the word locking in cell-by-cell with a synth tick. Turns naked typed-recall (the dryest, highest-evidence step) into the Wordscapes "grid fills up" aha.
- **(C) Percentage mastery meter** — replace "30 items" with a Spelling-Bee-style "recall reclaimed" meter (% of the day's attainable strength) with named Norwegian rungs (Lærling→Kjenner→Mester→Ordmester). Hard due-stacks stay fair; always "one more word".
- **(D) Per-word mastery seal + hint-for-partial-credit** — a mastery bar from FSRS stability; graduating a word past 30 d fires a seeded crest emblem + bonus. On a stuck word, a "reveal a letter" button trades a hint for reduced credit (caps grade at "hard") instead of a binary fail — keeps flow, can't be farmed.
- **(E) Daily as ritual** — a spoiler-free copy-to-clipboard result grid (Wordle-style per-word green/yellow/grey from the autograde) + 1–2 date-seeded modifiers (Naked Day / Synonym Day / Speed Bee / Long-word Day).

**Validity preserved:** typed active recall stays the *only* way to fill a cell (production > recognition — Roediger & Karpicke); FSRS called exactly as before — only *who supplies the grade* changes (autograde, not self-rate). Hints are partial scaffolds gated by real credit cost. Rewards tie to *retrieval quality*, never attendance — structurally avoiding Duolingo's goal-displacement.

---

## Part 4 — The unified experience: "The Bout"

A single-game default headline, built by **refactoring the ~95%-identical `cycle.ts` + `daily.ts` into one shared orchestrator core first**, then forking it into slice-mode.

- A **run = ~7–9 short rounds**, each a tightened slice of one game's existing block (Lex ~4 words / Crown ~5 trials / Flux ~12 beats), fed a tighter `maxTrials` and a new additive **`intensity`** knob.
- A persistent top bar: live **Bout score** (one number), **5-pip shared HP**, **rolling combo** (spans all three games), **intensity meter**, the run's **seed-emblem**.
- Between rounds: a 600 ms accent-flip "gear-shift" whoosh; intensity ratchets up (Flux `floorBpm +`, Crown `TRIAL_BUDGET_MS −`, Lex MCQ→cloze→typed).
- A wrong/miss/no-go-fail costs shared HP and resets combo. HP 0 ends an Endless run; otherwise you survive to the climax.
- The final round is a **REMIX**: a rapid medley alternating one beat of each discipline at peak intensity — the cognitively-valid task-switching payoff (Rhythm Heaven remix / WarioWare boss).
- One summary: total, combo peak, per-game contribution tiles (reuse Cycle's grid), new-best, run emblem, currency earned.

**`intensity` is additive** — each engine honors it in a few lines; solo modes and every existing test stay untouched.

---

## Part 5 — FSRS as the conductor (grafted from Concept B)

Generalize `pickDueFluxContext` into **`pickDueDiscipline`** over the union of due cards across all three kinds (Flux contexts + Crown transforms + Lex words), sorted by overdue distance, so **the most-overdue domain drives what the Bout throws next**. This is the cleanest expression of "spaced repetition schedules the whole experience". Add **per-domain quotas** so a backlog of thousands of due Lex words can't starve Crown/Flux. ~1-day pure function with fuzz tests.

Also graft from B: **no-go as a property any beat can carry** — a "don't judge the glitched/illegal board" Crown beat and a "don't answer the flagged non-word" Lex beat. Trains inhibition against *every* domain.

---

## Part 6 — Replayability levers (the "one more run" economy)

- **Personal-best chase, no leaderboard** — surface `getBest` live in every game + NEW BEST/near-miss cards. Block Blast hit D1 26.7% retention with zero social. Fits offline-first perfectly.
- **Date-seeded daily modifiers** per game and per Bout — combinatorial variety from existing content (Balatro). The single biggest replay-per-asset lever; defeats the brain-trainer novelty wall.
- **Endless mode** with an unbounded intensity ramp — the canonical "one more run" tail, distinct from the bounded Daily.
- **Collectible emblems** — per day / run / mastered word; a growing Hub trophy case.
- **Spoiler-free share grids** (Wordle) — ritual + water-cooler pull with zero network.
- **Hades-rule meta-currency** (deferred) — earned on *every* run *including failures*, spent on opt-in Endless mutators + generative themes. Defer, but reserve the `brainbout:meta:*` namespace now.

---

## Part 7 — Cognitive guardrails (encode as tests — non-negotiable)

- **Alternation, never concurrency** — exactly one discipline per beat.
- The **Wilson-85% adaptive BPM** stays live and unmodified under every mutator and intensity level.
- The **climax overlay** raises `goldenRate`/switch cadence but **never** touches `baseBpm`/`floorBpm`/the up-down deltas.
- **No mutator** may remove no-go, the cued switch, or the rotation transforms.
- **Lex stays typed production recall** — never collapse to in-stream 2AFC/recognition.
- **Hit-stop / juice timing is excluded from RT measurement** so it never skews FSRS grading.
- All motion gated behind `--motion-reduce`; reduced-motion swaps shake/particles for an instant flash + static glyph, keeps the identical task.

---

## Part 8 — Roadmap (incremental, lowest-risk first)

> Per-game polish and unification are the **same** investment: phases 1–4 make each game better *and* produce the Bout's building blocks.

- **Phase 0 — plumbing (no user-visible change).** (a) Return the moved-piece index from `perturbOnePiece` on the `Trial`. (b) Add additive `intensity?: number` to `BlockOptions` (no engine reads it yet). (c) Create `src/shared/juice.ts` by lifting Flux's particle/flash/shake vocabulary into shared, reduced-motion-gated, RNG-injected pure helpers with snapshot tests.
- **Phase 1 — Crown at source (~1 day).** Snap-and-settle reveal + moved-piece pulse + `juice.ts` burst/number-pop; live `getBest('crown')` + NEW BEST/near-miss (port `computeResultVm`); visible streak/Zone meter. Zero engine-math changes.
- **Phase 2 — Lex hide-the-chore (~1–2 days).** Replace the 4-button panel with autograde (`suggestGradeFromTyping` + RT, silent `recordReview`); surface intersection letters as free green pre-fills; cell-by-cell lock-in + number-pop; percentage "recall reclaimed" rung meter; "reveal a letter" partial credit.
- **Phase 3 — Flux make-the-inert-real (~1 day).** Thread `getSessionAct` into `generateTrial` for the climax overlay (+golden, faster switches, +1 HP refund, bloom) without touching the BPM controller; escalate juice with the streak tier; live self-vs-self ghost.
- **Phase 4 — shared genart + cohesion surfaces (~2 days).** `genart/{palette,shapes,emblem}.ts`; per-mastered-word / per-run / per-day emblems; read-only Hub mastery map over the FSRS cells. All pure, same-seed property tests.
- **Phase 5 — orchestrator refactor.** Merge `cycle.ts` + `daily.ts` into one shared core (stepper/transition/slot/abort/summary/seeded-RNG). No behavior change; the seam the Bout needs.
- **Phase 6 — shared scorer + threaded run-state.** `bout-score.ts` (pure fn + combo state in the orchestrator); teach each engine to honor `BlockOptions.intensity`; weight HP loss by severity; exclude Lex "again" from HP.
- **Phase 7 — the GAUNTLET headline.** Fork the shared core into slice-mode (ordered `{discipline, maxTrials, intensity}`, threaded score/HP/combo, gear-shift transition, remix finale). Reuse the due-bias selectors. New `games/gauntlet.html` + Hub "Start Bout" CTA. Encode the guardrail tests here.
- **Phase 8 — unified due-selector.** `pickDueDiscipline` over all three kinds + per-domain quotas; drives the slice order.
- **Phase 9 — replay depth.** Date-seeded Daily mutators (pure overrides, banner-announced) + Endless intensity-ramp. Each mutator gets a guardrail test.
- **Phase 10 — Flux flagship audio (LAST, behind toggle + reduced-motion).** Vendor `synth.ts` + Chris-Wilson `scheduler.ts` (injectable clock); delete `flux-bgm.wav`; drive beats from live `state.bpm` with intensity layers. Highest-risk timing code, fully deferrable.
- **Phase 11 — deferred meta (optional).** Hades-rule Focus currency (`brainbout:meta:*`); Crown active "tap the moved piece" mode; Wordle-style Daily share grid.

---

## Appendix — games & evidence referenced

- **Rotation:** Tetris Effect (Zone fill-then-spend), Block Blast (#1 mobile 2024; personal-best chase, escalating praise), Lumines (aesthetic build-up), Monument Valley (active rotation), The Witness (legible mastery), Tangram/Shape-Fit (the literal snap), Lumosity/Peak/Elevate (daily appointment).
- **Rule-switch / inhibition:** WarioWare (boss beat, cosmetic-disguise of one task), Rhythm Heaven (beat-synced juice, remix finale), Lumosity Color Match (Stroop) & Ebb and Flow (dramatize the switch), Simon/Bop It (self-vs-self), Piano Tiles (fair instant-fail), gamified Wisconsin Card Sort (uncued blind switch), Peak/Elevate (mastery map).
- **Vocab / spaced-rep:** NYT Wordle (daily seed + share), Spelling Bee (percentage meter), Connections/Strands (habit-stack), Wordscapes/WordBrain (mechanical grid fill), Vocabulary.com (hint-for-credit, mastery seal, hidden review), Duolingo (humane freezes, reject attendance-rewards), Anki/FSRS (keep the engine, hide the queue).
- **Cohesion / replay:** NYT Games hub (cohesion is a shell property), Lumosity/Peak/Elevate (unified index, beware week-4-6 wall), WarioWare (fast alternation, not concurrency), Hades/Slay-the-Spire/Balatro (roguelike meta, currency on every run), Rhythm Heaven (shared input + audio language, remix climax).
- **Cognitive basis (already cited in README):** Uttal 2013 (mental rotation g≈0.47), Hawes 2022 (transfer to math), Wilson 2019 (85% optimal-error-rate, drives Flux's adaptive BPM), Diamond 2013 (executive functions), Monsell 2003 (switch cost), Cepeda 2006 (spacing effect), Rowland 2014 / Roediger & Karpicke (testing effect, production > recognition).
