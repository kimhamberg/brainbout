# 03 — Zone mechanics, adapters & the RT/grade discipline

Four zones reskin the three sealed cores behind the existing `BlockFactory`/`BlockHandle` seam. Each zone is one diegetic verb on a spatially distinct gesture so constructs never blur. The grade **never** flows through the gesture-reader; the block factory keeps owning grade via the sealed engine — *"the engine never knows it's a garden."*

## 0. The keystone — `withTrialClock` (guardrails 1, 4, 6 made universal)

**Problem in the repo today:** `crown-block.ts` and `flux-block.ts` set the trial-start timestamp on the synchronous wall clock *before* `renderPlaying()`. The new Pixi/particle layer adds variable first-frame cost → polluted RT.

**Fix — `src/scene/trial-clock.ts`** is the **single owner** of post-paint-anchored onset. Corrected per audit [08](08-reference-audit.md) (VH-1/14/15/16): a single rAF fires *before* that frame's paint, and *stopping* the loop is the documented low-precision case. Per trial:
1. Build sprite display objects from the engine stimulus, add to stage.
2. Set `frozen=true` — the **continuously-running** rAF loop keeps ticking but emits **no cosmetic mutation** (no sway/particles/filter drift). Do *not* stop the ticker.
3. Anchor onset at the **post-paint boundary**: `requestPostAnimationFrame` if available, else a **double-rAF** (`rAF → rAF → { onset = scheduler.now(); armInput(onset); }`). The rAF scheduler + `now()` are **injectable** so post-paint ordering is unit-assertable.
4. The armed handler's **first statement** captures `rt = ev.timeStamp − onset` — the input event's `timeStamp` shares `performance.now()`'s monotonic origin (fall back to `scheduler.now()` if it's `0`/non-monotonic); strictly better than re-reading the clock at handler entry.
5. `engine.grade(...)` decides the grade — **still frozen**, no IO yet.
6. *Then* `frozen=false`, fire cosmetics (pop, particles, regreen tween).
7. **Deferred persist:** `recordReview(...)` (sync `localStorage` write + mastered-count bump) runs *after* unfreeze (or `requestIdleCallback`), off the measured path; mastered counts are cached incrementally, never rescanned per trial.

RT is logged before a single juice pixel moves. Two RNG streams: `gameplayRng` (seeded daily / `Math.random` solo) drives all `generateTrial` calls — unchanged; a separate per-trial `cosmeticRng = mulberry32(hashString('cosmetic:'+trialSeed))` drives particle counts, sway phase, dither jitter — never passed into the sealed engines, so cosmetics can't perturb which stimulus or due-card is chosen.

API: `armTrial(stage, render, onArm)` and `settle(stage)` (called by the block *only* after `recordReview`). Unit-testable with a fake rAF + fake `performance.now`.

> **Audit corrections threaded through the zones below ([08](08-reference-audit.md)).** §6 adapter contract: there is **no** WebGL→Canvas2D auto-fallback — primary `WebGLRenderer` + opt-in reduced mode (VH-2); per-entry colour is `sprite.tint`/cached RT, never N filters (VH-3). `readGesture(ev)` passes the event so RT can use `ev.timeStamp` (VH-15). **Bench & Meadow stimuli must be complexity-matched within a difficulty class** (equal part-count/contour/contrast); per-trial cosmetic variation is restricted to hue/palette, and the template id is logged to `meta` alongside `rtByTransform` — rich/variable sprites otherwise inject figural-complexity RT variance the fixed 1800/3500 cliffs misread (VH-9). §7's Wilson tempo must be a **perceptible diegetic** deadline (VH-5).

## 1. Scene router (`src/scene/scene-router.ts`)

A thin orchestrator built on the existing `daily.ts` pattern (`setRng`/`seededRng`/`resetRng` around the run; one step = a `BlockFactory({container, maxTrials, onComplete})`). It **never** runs two factories concurrently — the same single-slot `activeHandle` invariant `daily.ts` already enforces. Instead of a fixed `[lex,crown,flux]` list it builds a **Walk** — an ordered `[{zone, kind, count}]` derived from the FSRS due set: `getDueWords('no', candidates, today)` for Grove, and a new `getDueClassKeys('crown:'|'flux:')` (thin wrapper over `getSeenKeys` + `isDue`) for the class zones. The router pans the camera over the one contiguous valley, but each arrival mounts exactly one block. It bubbles `BlockOutcome` upward so `progress.ts`/`stages.ts` recording is unchanged.

## 2. Grove — typed production recall (lex-srs adapter)

**Gesture:** type, on a letter-bank/typed hybrid. **Diegesis:** a greyed dormant resident shows its gloss + pos (the cue); the player must *produce* the Norwegian name; the species sprite + name are hidden until after the attempt (guardrail 2).

Stage-gated input mode via `stages.ts` + `maxMasteryForStage`:
- **Stage 1 — MCQ:** 4 species silhouettes (1 correct + 3 distractors from `pickDistractors`). Recognition floor for brand-new words.
- **Stage 2 — cloze letter-bank:** scrambled correct letters + 2–3 distractor letters as tap/drag tiles snapping to slots. Production-ish, no free-recall load.
- **Stage 3 — free typed:** on-screen capture input, no bank. Full Roediger-Karpicke production. A "reveal letters" affordance can drop to the letter-bank for one card without changing the grade ceiling (Viridi-style no-dead-end).

Autograde: on submit → freeze → capture rt → `suggestGradeFromTyping(typed, entry.label)` (exact→good, within `maxTypos`→hard, else→again) → reveal target + species + grade buttons (overridable, as `lex-block.ts` does today) → `recordReview('no', entryId, grade, today)`. A grade ≥ hard tweens the sprite greyscale→full OKLCH; the stability bucket selects the growth-stage frame.

Android keyboard ergonomics: reuse the hidden `#xw-capture` input pattern (`autocomplete=off`, `autocapitalize=none`, `autocorrect=off`, `spellcheck=false`); cue + slots in the **top half** of the viewport so the keyboard never occludes them; letter tiles ≥44px above the keyboard line; æøå first-class; submit on Enter or an explicit big button.

### Implemented (`grove-block.ts`) — divergences & post-review fixes (2026-05-29)

The shipped stage-2 cloze is a **first-letter + length mask then free typing** (`f···`), not the letter-bank tiles described above — simpler, same cued-recall intent. An adversarial review of the recall-ramp diff confirmed and fixed:

- **MCQ honesty:** correct pick grades `hard` (recognition < typed `good`), wrong → `again`; option order is salted with `today` so position-memorisation can't substitute for recognition.
- **Cloze leak guard:** the leading letter is shown only for labels ≥4 chars (the typo budget is 0 for ≤3, so a leaked letter on a short word = copying); shorter words get length-only dots.
- **Distractors:** `groveOptions` tops up across pos/length to a full 4-way choice on small/skewed decks and drops case/diacritic variants of the target; pos-purity is best-effort.
- **Real deck:** Grove + the Walk load the committed `public/dict-no.json` (~20k entries) via `loadVocabDeck` (fetch + `normalizeVocabDeck`), with a tiny built-in fallback if the fetch fails. `buildGroveQueue` now surfaces FRESH entries by `rank` (shortest/easiest first, Q1 seeding order) rather than file order. The 1.8MB dict is fetched at runtime — not bundled — so the JS budget is unaffected (verdant pages ≈166KB gz < 210KB).
- **Lifecycle:** per-block `AbortController` detaches listeners on the long-lived input/submit/next nodes; the Pixi app is `destroy()`-ed on abort/finish (frees the WebGL context, ~16 cap); an `ended` guard tears down a block aborted mid-`createStage`. Enter autorepeat is ignored (`ev.repeat`); input freezes on reveal; `#grove-next` is hidden until an answer is revealed.

**Resolved:**
- **Intra-session relearning.** A lapsed (`again`) resident is re-appended to the working queue for a spaced retry later the same session, capped at `MAX_RELEARN=2` per card (`canRelearn`) so it can't loop or be point-farmed. The FSRS lapse is still recorded. Accuracy/promotion denominators are ATTEMPTS, so a card that took two tries honestly drags the metrics down; the user-facing "woke X/Y" counts distinct residents (`meta.residents`).
- **Grade-quality-weighted stage promotion.** `BlockOutcome` now carries `promotionAccuracy`; the router feeds *that* (not raw `accuracy`) into `recordResult`. Grove weights each trial via `promotionCredit(mode, grade)`: exact answers full credit; a correct MCQ pick full (recognition gates the next rung); a typo-within-budget (`hard`) cloze/typed answer **half** — so you can't graduate to free production on consistently sloppy cued recall. Crown/Flux omit the field → raw `accuracy` (their `hard` is correct-under-pressure, not a scaffold). The stage = input-mode scaffold that fades as each rung is proven; the *mastery* claim (words known) stays FSRS-driven, separate from stage.
- **Systemic Pixi teardown** — `grove-block.ts`, `bench-block.ts` and `meadow-block.ts` all use the per-block `cleanup`/`AbortController` pattern (`app.destroy()` + listener detach on abort/finish, `ended` guard after `await createStage`, queued-frame guards; Meadow also clears its beat/switch timers).

## 3. Propagation Bench — mental rotation (crown adapter) — HARD CASE

**The trap:** a drag-to-rotate-until-it-fits UI lets the player solve by visual servoing instead of a single mental rotation — destroying the construct.

**Defense:** SAME/DIFFERENT is **committed first, under RT pressure, with no manipulable object on screen.** Two garden plots side by side: the **parent footprint** (`trial.a`) on the left, the **grown specimen** (`trial.b`) on the right, already rendered at its transformed orientation by the engine — the player *cannot* rotate it. `piecesToFen` maps directly: each of the 64 squares is an 8×8 raised-bed cell; each piece becomes a distinct chiral asymmetric plant keyed by role (q=tall fern, r=stone planter, b=climbing vine, n=curled shoot, p=sprout) and colour (w=sunlit/warm ramp, b=shade/cool ramp). Asymmetry + chirality is mandatory so a mirror is genuinely detectable and a rotation genuinely requires re-imagining orientation. The engine already guarantees asymmetric sprays + varied angles/mirrors per stage.

**Verdict input:** two big buttons "Same plant" / "Moved" (= same/different), framed as *"is the grown specimen the same arrangement, just turned — or has a plant moved?"* (the Jost-Jansen rotational-match framing preserves linear RT-by-angle). `classifyResponse` + `deriveCrownGrade(correct, rt)` with the existing bands (<1800=easy, <3500=good, else hard). For `perturbOnePiece` "different" trials, the moved piece renders as one plant in the wrong bed; a ghost-arrow showing where it should have been animates **only in the post-grade cosmetic phase**.

**The cosmetic drag (guardrail 4):** *after* the verdict is graded and logged, an optional drag-the-seedling-to-its-pot flourish plays — pure reward choreography, zero grade weight, skippable. It literally cannot happen earlier because the draggable sprite isn't instantiated until `ticker.start()`.

`meta`: `{ rtByTransform: Record<Transform, number[]>, peakStreak, avgResponseMs, newlyMastered }` (keyed on all 5 transforms: rot90/rot180/rot270/mirrorV/mirrorH).

## 4. Meadow — go/no-go inhibition (flux adapter) — HARD CASE

**Gesture:** tap-to-harvest (single action); withhold = do nothing. **Diegesis:** ripe produce (go) → tap to harvest; a pollinator (bee/butterfly) is the no-go stimulus → must NOT tap, let it work. The adapter swaps the sprite to a bee for no-go trials, ripe fruit for go.

**Coziness without softening the cost:** a correct withhold gets warm affirming feedback — the bee does a happy pollination loop, a flower blooms, "+restraint" praise, `sound.playNogoDissolve`. But the engine penalty is **untouched**: `evaluateResponse` returns `basePoints:-1, noGoFail:true` on a tap-on-no-go; the adapter renders the bee startling away (gentle *visual*) but the `-1` still lands, the streak resets via `updateAdaptation(state, false)`, and an HP heart is still lost in solo. The cost is real because (a) the prepotent harvest response is built by the go-dominant cadence the engine already produces (`noGoRate` 0.1–0.2, `WARM_UP_TRIALS=8` with no no-go during warm-up — exactly the Durston prepotency mechanism), and (b) the score/HP consequence is identical.

RT/grade: go trials freeze→arm→capture rt on tap→`evaluateResponse`→`deriveFluxGrade(correct, rt, bpmToMs(bpm))`→`recordReview(fluxClassKey(rule, isNot))`. The no-go "don't tap" is graded on **timeout** (the beat elapses with no press = correct withhold). `meta`: `{ falseAlarms, commissionRate, withholds, correctWithholds, ... }`. **The `-1` must never be reskinned to 0.**

## 5. Biome-crossing / Weather — rule switching (flux cued switch + NOT) — HARD CASE

**Gesture:** two-sided sort (left/right basket) — distinct from Meadow's single tap and Grove's typing, so switch and inhibition never blur. **Diegesis:** you sort what the valley produces into two baskets; which feature decides left vs right is the active rule, and a season/weather change is the cue that flips it.

**Telegraphed cue design** (the crux, per the cue-transparency literature): the cue must be (a) **transparent** — the player instantly understands the *new* mapping, so the cost reflects task-set reconfiguration, not cue-decoding; yet (b) a **separate** symbolic dimension from the stimulus — the rule is not inferable from the fruit itself, else there is no real set to reconfigure. Solution: a banner weather-swap (sun→rain→snow→wind = color/shape/size/fill, one icon per rule) fills a **`CSI_MS=700`** prep interval (the animated sky *is* the cue-only interval — no separate blank frame; Q7 → [06](06-resolved-decisions.md)), then the new stimulus drops; a persistent sky-icon shows the current rule (transparent) while staying orthogonal to the produce sprite (asserted: sky-icon frames share no ids with produce frames; `getCorrectSide` never reads the sky-icon). 1:1 cue↔rule keeps cue-decoding cost ≈ 0. `CSI_MS` is A/B'd against {400, 1200}, logged as `meta.csiMs`, picking the smallest interval that keeps a reliably non-zero switch cost. The 3–7 cadence (`switchMin`/`switchMax`) surfaces as "the weather holds for a few items then turns" — randomized. **NOT-variant** surfaces as **night/eclipse**: an inverted-palette overlay means "everything is backwards tonight" (`getRuleLabels` swaps left/right when `isNot`).

**Switch-cost logging (guardrail 7):** tag each trial `isSwitch = (prevRule !== rule || prevIsNot !== isNot)` (already computed in `flux-block.ts`); push `{rt, isSwitch, correct}` → `meta.switchTrials[]` / `meta.repeatTrials[]` → mean switch cost = `E[rt|switch] − E[rt|repeat]` recoverable post-hoc. The prep interval is **excluded** from RT: the rAF onset anchors at the produce drop, *after* the weather animation, so the prep is real preparation time, not RT.

### Implemented (`meadow-block.ts`) — 2026-05-29

- **True-timeout no-go.** The "leave it" Hold button is gone: a no-go is withheld by NOT tapping — the beat times out (`beatTimer → respond(null)`) into a correct withhold. A dedicated withhold button would itself be a motor response and weaken the go/no-go inhibition construct (the prepotent press must be genuinely *suppressed*). Go trials still demand a timely L/R sort; a timeout on a go is a real miss (`-1`).
- **Time-bounded session.** The standalone Meadow defaults to a 75s timed challenge (`durationMs`, no beat-count cap); the session ends at the first beat boundary past the budget (or HP 0). A `maxTrials` cap is optional — the Walk leg uses one; the demo accepts `?n=`/`?ms=` for tests.

## 5b. Juice (`src/scene/juice.ts`) — 2026-05-29

Post-grade game-feel, **cosmetic only** — every flourish fires after the grade is recorded and is skipped during the measured RT window (frozen-ticker guardrail), so it can't contaminate response times. Pure math (`easeOutBack`, `easeOutCubic`, `makeBurst`, `integrate`, `particleAlpha`, `isDead`) is unit-tested to 100%; the Graphics drawing lives in the coverage-ignored blocks.

- **Grove** — a successful wake pops the sprite in with an overshoot (`easeOutBack`) and emits a gold (good) / green (hard) particle burst; a miss gives a gentle "still drowsing" wobble.
- **Bench** — a correct read sparks sun-gold over the specimen board; a miss shakes the bench.
- **Meadow** — a harvest sparkles gold, a correct *withhold* blooms green (the design §4 restraint reward), a miss red-shakes the screen.

All particles retire on the next re-render and on block teardown, and the whole layer is gated by `prefers-reduced-motion` (the recolour/reveal feedback stays; the motion drops).

## 6. The adapter contract

```ts
interface ZoneAdapter<Stimulus, Response> {
  layout(stim: Stimulus, cosmeticRng: Rng): SpriteScene;   // gameplay-independent visuals
  readGesture(ev: GestureEvent): Response;                  // raw engine token, NEVER a grade
}
```

`SpriteScene` is a description (atlas frame ids + grid positions + ramp keys), rendered by `pixi-stage.ts` (which owns the WebGL2→WebGL1→Canvas2D fallback and the frozen-ticker). `piecesToFen` output is parsed by the bench adapter into an 8×8 plant grid — no new engine math. The presentation map (`src/world/presentation-map.ts`, the canonical 6-stage `stabilityToStage`) is the single source binding memory→world.

## 7. Wilson-85% as ambient world tempo

The adaptation math is sealed and unchanged (`BPM_UP=1`, `BPM_DOWN≈5.303`, `updateAdaptation`). Per-zone reskin of `state.bpm` / the deadline:
- **Meadow** — bpm IS the rate produce ripens and pollinators arrive (higher = busier meadow).
- **Biome** — bpm modulates the produce conveyor speed and how fast weather turns.
- **Bench** — crown has no bpm but `TRIAL_BUDGET_MS` is the "daylight window" before the bed shades over (cosmetic); the speed bonus is "caught in good light".
- **Grove** — no time pressure (rushing typed recall harms validity); its "tempo" is purely the count of due residents queued.

Ambient visuals are frozen during the RT window — the meadow speeds up *between* trials, never during the measured response — so the Wilson loop adapts difficulty without ever contaminating RT.

## Validity defenses to encode as tests

- **Bench** — DOM assertion: no draggable specimen node exists until after `recordReview`; `rtByTransform` populated keyed on all 5 transforms.
- **Meadow** — tapping a no-go yields `totalPoints === -1` and `streak === 0`; the cozy reskin path doesn't branch the penalty.
- **Biome** — `meta.switchTrials` and `meta.repeatTrials` both non-empty; `isSwitch` matches `prevRule !== rule`.
- **Grove** — no DOM node containing the answer before submit.
- **All** — onset originates in an rAF callback, not a synchronous pre-render call; ticker stopped between onset and grade.
- **RNG partition** — same daily seed twice → identical engine trial sequences even when `cosmeticRng` is reseeded differently.

## Resolved (see [06](06-resolved-decisions.md))

- **Canvas2D manual-loop freeze/onset (Q3)** — "stop the ticker" = "don't schedule the next repaint rAF"; the manual loop shares the *one* `frozen` flag + *one* arming rAF, so onset stays paint-anchored. `trial-clock.ts` gains `renderMode: 'ticker' | 'manual'`; `trial-clock.test.ts` runs for both, asserting no repaint between the onset rAF and rt-capture.
- **Meadow no-go swap timing (Q8)** — `layout()` builds *either* the bee *or* the produce into the stage **during the frozen pre-onset paint** (identical position/bbox/no entrance), so the discriminator is only resolvable at the onset frame. Four tests: zero discriminative nodes before the onset rAF, present-ts === onset-ts, byte-identical pre-onset side-effect log for go vs no-go (same cosmetic seed), and `totalPoints===-1`+streak-reset on both branches. Run under both mount paths.
- **Wild shimmer (Q11)** — enqueue-only into a `wildPending` Set on the router (never touches `activeHandle`); merged into the Grove leg at the leg boundary, capped `GROVE_WALK_CAP=12` with ≤`WILD_DUE_PER_SESSION=5` wild, most-overdue-first (`(today−nextDue)` desc, `rank` asc, `entryId`).

## Still open / standing invariants

- Grove grade is **not** derived from RT (typed recall is self-paced) — confirmed; the rAF harness still applies for any "time-to-first-keystroke" telemetry.
- The Bench cosmetic drag never touches `recordReview` — keep the explicit test; Q5 adds a parallel guided-trial-exclusion test.
