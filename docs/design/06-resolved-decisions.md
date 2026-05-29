# 06 — Resolved decisions

The 11 deferred open questions from [README](README.md), each resolved decisively and grounded. The area docs (01–05) carry these inline; this doc is the authoritative record + the cross-question consistency rules.

## Shared constants module

All session-shaping caps live in **one** module (e.g. `src/world/limits.ts`) so the two owners (`morning-round.ts`, `scene-router.ts`) can't drift:

```ts
ACTIVE_SET_CAP        = 120   // greenhouse size (Lex active learning set)
WILD_DUE_PER_SESSION  = 5     // max wild promotions surfaced per Morning Round
MAX_POCKET_VISITS     = 5     // Grove, Bench, Meadow+Weather, +1 optional 2nd Grove
WALK_FLOOR_MS         = 1500  // hard cognitive-cooldown floor per inter-pocket walk
GROVE_WALK_CAP        = 12    // absolute Grove ceiling/Morning Round (comeback days)
GROVE_CAP             = 8     // steady-state Grove batch target
BENCH_CAP             = 4     // due crown classes / visit
FLUX_CAP              = 15    // Meadow+Weather flux trials / visit
CSI_MS                = 700   // Biome cue→stimulus interval (A/B against {400,1200})
NEW_BASE              = 8     // new Lex cards admitted on a normal tended day
STUDY_AHEAD_NEW_MAX   = 20    // ceiling for new cards/day incl. wander-mode study-ahead
```

> **Standing invariants added by the reference audit ([08](08-reference-audit.md)).** (VH-1) RT onset is anchored on a **double-rAF / `requestPostAnimationFrame`** (post-paint), with a **continuously-running** rAF loop — `frozen` means *no cosmetic mutation*, never *stop the loop*; the scheduler is **injectable**. (VH-15) response `RT = ev.timeStamp − onset`. (VH-16) trial ordering is *timestamp → grade-decision → cosmetics → **deferred** persist* (`recordReview` writes after unfreeze; mastered-count is cached incrementally, not rescanned). These supersede the original single-rAF/stop-ticker keystone wording in 03/README.

---

## Q1 — Active-set seeding & promotion order → **hybrid `rank`**

Bake a single integer `rank` onto every `DeckEntry` at deck-build via a deterministic three-key sort `sortKey = [lengthBand(label), freqTier(label), originalIndex]` ascending:
- `lengthBand = clamp(floor((NFCLength(label) - 1) / 3), 0, 6)` — short words first; labels containing a space are forced to a **trailing band** so phrases never seed the greenhouse early.
- `freqTier = 0` for all entries **by default**; only populated when the build runs with `--freq=<path>` (quantile bucket 0–9 of matched single-token labels, 10 = absent). The path is **git-ignored** — no third-party corpus is committed by default.
- `originalIndex` — stable tiebreaker → byte-stable total order.

**Why not frequency-first:** the only open Norwegian lists are Leipzig (CC BY 4.0) and hermitdave/FrequencyWords (CC BY-SA 3.0); ShareAlike would virally relicense the committed deck. They're flat surface-form lemmas — can't disambiguate the 923 homograph senses and miss the 478 phrases. Length-grading is license-free, deterministic, joins perfectly, and well-distributed (label length p50=8/p90=12; 3,992 of 13,354 nouns ≤6 chars).

Greenhouse seeding takes the first `ACTIVE_SET_CAP` entries by ascending `rank`; promotion-refill pulls the lowest-`rank` not-yet-seen entry. `rank` is also the deterministic tiebreaker for Q11/Q4 overflow. Add a 5-entry canary test pinning the first-5 ranked entryIds.

*Residual:* length is a coarse difficulty proxy; FSRS adaptivity re-sorts by real difficulty within days. A future `--freq` build inherits the list's license — gate behind a flag + LICENSE note.

## Q2 — Atlas frame bloat → **60 kingdom-partitioned templates + runtime recolor**

Never bake per-entry frames. Bake a finite library of body-plan **templates**: **FLORA 24 / FAUNA 16 / MODIFIER 12 / STRUCTURE 8 = 60 base templates** (~326 frames with growth stages/poses), fitting in a fraction of one **2048px** atlas (the universal-safe floor; ~16 MB GPU/atlas; ≤4 bound textures).

- `templateIdx = bodyPlanHash mod N[kingdom]`, `bodyPlanHash` from `hashString(deckId:entryId)`.
- The bake emits a **luminance/shade-index mask** per frame (4–5-step OKLCH ramp position + 4×4 Bayer dither stored as *index* values, not final RGB) + 1px selout outline + alpha.
- Per-entry uniqueness is three **runtime** layers over the shared template: (1) **palette** — the per-entry OKLCH ramp via the same LUT path as seasons; (2) **accessory micro-parts** — 0–2 curated stamps blitted at sockets, pre-composited once into a cached RT during the frozen pre-onset build; (3) **pattern** — a seeded dither/stripe/spot overlay.
- `N=6` growth stages apply per FLORA template; **dormant = stage 0 under a desaturated LUT, awake = the saturated LUT at `stabilityToStage(card.s)`** — so dormant/awake is not a separate baked axis.
- Frame keys: `plant:<kingdom>:<templateIdx>:<stage0-5>`, `creature:<kingdom>:<templateIdx>:<pose>`, `modifier:<templateIdx>:<intensity0-2>`, `struct:<templateIdx>:<coverage0-4>`. Bench specimens stay a separate 10-frame chiral set (rotation/mirror are runtime transforms so `mirrorV`/`mirrorH` stay detectable).

*Residual:* ~556 nouns/template — uniqueness rests on palette+accessory+pattern reading distinct at 48px; the curated/override escape hatch covers hero species. Accessory compositing must run in the frozen pre-onset build, cached, never per-frame.

## Q3 — Canvas2D fallback fidelity & freeze/onset → **single composite-tint + shared frozen flag**

**Fidelity:** approximate the LUT with one full-frame `globalCompositeOperation` pass per time-of-day using only Skia-baseline modes (`multiply` + `screen`/`lighter` + `source-atop` + `globalAlpha`) — never the perceptual separable modes for correctness. Per state a flat tint `{color, mode, alpha}`: noon = none; evening = warm-amber multiply ~0.35α + low gold screen; night = teal-blue multiply ~0.5α + L drop; autumn = gold-orange multiply ~0.3α. Reads decisively because lightness + warm/cool hue + saturation are exactly what tint+alpha control; only fine per-channel mapping is lost (invisible at 48px). A one-time feature probe selects an enhanced 2-pass tint when available.

**Freeze/onset (the keystone interaction):** the Canvas2D manual repaint loop keeps the **identical** `withTrialClock` contract via the **same single `frozen` flag and same single arming rAF**. "Stop the ticker" becomes "do not schedule the next repaint rAF". Per trial: synchronous composite paint of the stimulus (with the go/no-go discriminator already in it) → `frozen=true` + cancel pending repaint → one `requestAnimationFrame` captures `onset = performance.now()` and arms input → response in the same clock → grade/`recordReview` (still frozen) → `settle()` resumes the loop (particles stay disabled on Canvas2D). Add `renderMode: 'ticker' | 'manual'` to `trial-clock.ts`; `trial-clock.test.ts` runs for **both**, asserting no repaint between the onset rAF and rt-capture.

## Q4 — Walk duration → **fixed 1500 ms cognitive floor, variable visual distance, ≤5 visits**

Every inter-pocket walk has a hard **`WALK_FLOOR_MS = 1500`** of unskippable forward motion (the cooldown); the on-screen camera distance scales down with familiarity (`panMs = lerp(2800, 1500, clamp01(visitsToZone/12))`) so it never *feels* padded, but the floor never compresses. Bound the session by **`MAX_POCKET_VISITS = 5`** (Meadow+Weather collapse into one flux visit) and per-zone batch caps (`GROVE_CAP=8`, `BENCH_CAP=4`, `FLUX_CAP=15`). Overflow beyond a cap is **never dropped** — surplus stays `isDue` for the next session, surfaced gently ("many are stirring — we'll wake a few each day"). `computeMorningRound` builds the Walk; the mount of the next `BlockFactory` is gated on `max(WALK_FLOOR_MS, panMs)`.

## Q5 — Onboarding parity → **one-time guided trial per non-Grove zone, off the engine path**

Each of Bench/Meadow/Biome gets exactly one guided rehearsal on a **separate code path** (`src/scene/guided-trial.ts`) that **imports none of** `fsrs.recordReview` / `updateAdaptation` / `trial-clock`, never logs RT, never enters `BlockOutcome`. Stimuli are maximally unambiguous: Bench = a blatant SAME pair (identity transform, hand-authored FENs — does **not** call `generateTrial`, so crown's daily seed isn't advanced); Meadow = one obvious ripe berry, then one lone bee ("let it work"); Biome = a blatant sun→rain flip with the sky-icon huge. Gated by a persisted `guidedSeen: Record<zone, boolean>` in `progress.ts` (alongside streaks/freezes). Enforce with an **import-graph test** (the module must not import `shared/fsrs` or `scene/trial-clock`) + assertions that `BlockOutcome.trials` and `getCard(...).reps` are unchanged across a guided trial.

## Q6 — Color-as-state accessibility → **five redundant channels in the presentation map**

`presentation-map.ts` returns a `StatePresentation` record, not just a tint, so state is fully legible with color stripped (WCAG 1.4.1):
1. **Posture** — `'drooped' | 'upright'` (drooped iff overdue / `again`), a runtime rotation/baseline transform **orthogonal** to the stage frame.
2. **Growth-stage silhouette size** — the existing `N=6` stages give a monotonic area ramp → stability reads as size independent of color (**zero extra atlas frames** — rides Q2's stages).
3. **Sparkle presence** — thriving/freshly-woken emit ambient sparkle (binary cue), on the cosmetic RNG, **frozen during the RT window**, post-grade only.
4. **Audio cue** — `wake` (warm chord) / `wilt` (low detune) / `recover` (rising glissando) via `sounds.ts`, post-grade.
5. **Optional explicit state glyph** — a settings toggle ("Show state marks") overlays a tiny badge (bud / half-leaf / full-leaf / bloom), monotonic with stage.

Test: a grayscale snapshot asserts any two states differ in ≥2 non-color fields. Budget-neutral against Q2 (size = stages, posture = transform, glyph = a few fx frames).

## Q7 — Biome cue transparency → **CSI = 700 ms, 1:1 cue↔rule, A/B {400, 1200}**

Default cue→stimulus interval **`CSI_MS = 700`**: the sky-weather swap animation fills the full 700 ms before the produce drops (the animated sky *is* the cue-only interval — no separate blank frame). **1:1 cue↔rule** (sun=color, rain=shape, snow=size, wind=fill; night/eclipse overlay = NOT-variant) so cue-decoding cost ≈ 0 and the residual reflects genuine task-set reconfiguration (Monsell). The sky-icon persists in a fixed top band on a **disjoint** symbolic dimension from the produce (asserted: sky-icon frames share no ids with produce frames; `getCorrectSide` never reads the sky-icon). The onset rAF arms only at the produce drop *after* the 700 ms, so the CSI is excluded from RT. Log `meta.csiMs` per arm; A/B {400, 700, 1200} against `mean(rt|switch) − mean(rt|repeat)`; pick the smallest CSI that keeps a reliably non-zero switch cost without depressing switch-trial accuracy.

## Q8 — Meadow no-go swap timing → **discriminator built inside the frozen pre-onset paint**

`generateTrial` resolves `isNoGo`; `layout()` builds **either** the bee **or** the ripe produce into the stage **during the frozen pre-onset build**, at identical position / bounding box / (absent) entrance choreography — the only divergence is the frame id, committed in the same frozen paint that the onset rAF anchors to. The discriminative sprite is never in the stage before that frame, so pre-deciding is physically impossible. Tests: (1) before the onset rAF fires, querying the stage for any bee/produce frame finds **zero** discriminative nodes; exactly one after; (2) the present-timestamp === the onset timestamp; (3) the side-effect event log (sounds/particles) between generation and onset is **byte-identical** for a go vs a no-go trial of the same cosmetic seed (any divergence = a pre-onset tell); (4) tapping a no-go yields `totalPoints === -1` + streak reset on both cosmetic branches. Run under both WebGL and Canvas2D mount paths.

## Q9 — STRUCTURE kingdom → **first-class Almanac residents**

The ~495 function-words (+ 153 phrase-likes) are real `lex:<deck>:<entryId>` cards — same MCQ→cloze→typed ramp, same active-set/wild lifecycle, same five Almanac states. The "skeleton" rendering (paths/joints/signage/standing stones) is their **species sprite**, not a demotion: each owns a discrete tappable hotspot + Almanac card. A second visual-only class would be exactly the "fake progress" the design outlaws, and function words are the highest-leverage vocabulary. Two presentation rules: (1) stage-2 cloze for STRUCTURE is **always gloss-cloze** (most have empty examples) with the **pos badge shown** to disambiguate the dense homograph tail ('de' = article+pron, 'en' = article+num); (2) the Almanac groups them in their own kingdom panel ("the grammar that holds the valley together"). Their trailing length-band means they seed late — correct: learn concrete nouns before particles.

## Q10 — `maxTypos` for long phrases → **extend past 13 chars + widen charset**

```ts
function maxTypos(len: number): number {
  if (len <= 3)  return 0;
  if (len <= 7)  return 1;
  if (len <= 13) return 2;
  return 2 + Math.floor((len - 13) / 8);   // 21→3, 29→4, 50→6
}
```

Every threshold ≤13 is **byte-identical to today**, so single-word rigor and the existing test table are untouched; only labels longer than any single Norwegian word (the 478 phrases) get slack. This is the **only** `lex-srs.ts` function that changes. Inside `suggestGradeFromTyping` add a private `normForMatch(s) = s.trim().toLowerCase().replace(/\s+/g,' ')` applied to both typed and target (no effect on single-token words). Input charset (render layer, `lex-block.ts`): the gate `/^[a-zA-ZæøåÆØÅ]$/` becomes `/^[a-zA-ZæøåÆØÅ0-9 -]$/`, **gated on whether the active label contains** space/hyphen/digit so single-word Grove trials still reject strays and the shared crossword handler is unaffected.

## Q11 — Wild shimmer → **enqueue-only, bounded, most-overdue-first**

A wild shimmer **never mounts a block on tap**. Tapping appends the entryId to a `wildPending: Set` on the scene-router (no-op if the slot is active; plays a tiny "noted" cosmetic on the cosmetic RNG). At the next Walk-leg boundary the router merges `wildPending` into the Grove leg:

```
due = dedupe([...activeDue, ...wildPending])
sort by (today − nextDue) desc, then rank asc, then entryId      // deterministic
groveQueue = due.slice(0, GROVE_WALK_CAP)                         // 12 ceiling
  with count(wild in queue) ≤ WILD_DUE_PER_SESSION (5)
overflow (due beyond the cap) is NOT scheduled today — stays isDue, resurfaces tomorrow
```

Wild promotions count **against** the same Grove cap (active-due fills first; wild fills remaining slots up to `min(5, capRemaining)`) — "extend the visit" and "wild sub-cap 5" are one mechanism, not additive headroom.

---

## Cross-question consistency rules (from reconciliation)

1. **One Grove queue, one slice point.** `morning-round.ts` builds the leg to the `GROVE_CAP=8` steady target; `scene-router.ts`'s `GROVE_WALK_CAP=12` is the absolute ceiling the wild-merge can't exceed (reached only on comeback days). Not two independent slices.
2. **Identical overflow tiebreaker in Q4 and Q11** — `(today − nextDue) desc, rank asc, entryId`. `morning-round` uses the same three-key sort as the router so date-seeded dailies are reproducible. (This is why Q1's baked `rank` exists.)
3. **Q5 sits outside `trial-clock`; Q7/Q8 sit inside it.** The guided trial never arms an onset (import-graph test); the CSI prep (Q7) and the no-go discriminator (Q8) are both anchored at the paint-onset.
4. **Q6 is budget-neutral against Q2** — size = the `N=6` stages, posture = a runtime transform, glyph = a few fx frames; nothing demands new per-state baked art. Sparkle stays on the cosmetic RNG, frozen during RT.
5. **Q3 + Q8 tests run under both mount paths** — `renderMode='ticker'` and `'manual'` share the fake-rAF + fake-`performance.now` harness.

## The final 7 (resolved)

The smaller items left after Q1–Q11 — now all decided.

- **R1 Rest-well vs never-empty.** Two distinct moments. (A) The **completion** screen fires once when the day's due-load hits zero (`dueRemainingToday()===0`): a dusk wash, *"The valley's tended. Rest well, Keeper. / Everything that needed you today is cared for."* + a primary **"Done for today"** and **one** low-contrast open-gate link *"The gate's open if you'd like to wander"* (~40% the visual weight, never a CTA). (B) Tapping it enters wander-mode: *"Wandering — nothing's due, this is just for the joy of it."* with a persistent soft *"Head home whenever."* Hard rules: no counters, no "X left", no streak/XP pressure, no re-prompt; `completeSession()` is called once at the STOP **before** wander, so wandering can never advance or jeopardize the streak — the absence of counters *is* the honest signal. Copy lives in a content/strings module.
- **R2 Study-ahead = headroom, not a flat quota.** Active set = cards **not yet meeting the mastery predicate** (see *Scheduler*, below) ; `ACTIVE_SET_CAP=120` ceilings it. `NEW_TODAY = clamp(0, NEW_BASE − newAdmittedToday, ACTIVE_SET_CAP − activeCount)` normally (`NEW_BASE=8`); wander-mode raises the per-day ceiling to `STUDY_AHEAD_NEW_MAX=20`, never past 120 active. `newAdmittedToday` persists per-day (`brainbout:new-admitted:<deck>:<today>`), shared across normal + wander. Anchors below Anki's 20/day default (cozier); mastered cards leaving the set reopen headroom organically. Pure `newAdmissionBudget(...)` helper; never touches the engine seam.
- **R3 Season-blind line** (a journal margin note, not a modal, fired once the first time a weather change is witnessed *with* something due): *"The almanac says: a creature wakes when it's ready, not when the weather wills it. Winter won't slow who's due to stir, and summer won't rush them. Tend to whoever's stirring — the seasons are only the sky's mood."* Recorded `brainbout:hint:season-blind`; never during a trial/freeze window.
- **R4 Homograph prompt** = a 3-line stacked card giving a unique fingerprint of *this* sense while withholding the spelling: (1) **this sense's gloss** (largest); (2) **pos badge** (muted); (3) optional **micro-context chip** — a 2–4-word usage frame with the target **blanked** (`to ___ a guest`). The shared spelling never appears in any line, distractor, or silhouette. Same-spelling dormant species are forced **non-adjacent** in the Grove walk order. On wake, a soft footnote teaches the homograph honestly. Curated fields `{ senseGloss, pos, contextFrame }`; a **bake-time digest-gated assert** that no prompt field contains the target lemma.
- **R5 Gloss-keyword clustering = opt-in per deck.** Manifest carries `clusterBy: 'gloss-keyword' | 'entryId'` (default **`'entryId'`**) + `glossLang`. `gloss-keyword` applies only when `glossLang==='en'`, extracting the first content keyword (frozen stop-word list) → `hashString` → body-plan family (so 'oak'/'birch'/'maple' cluster). Any non-English/fact deck, or an entry whose gloss yields an empty keyword, **degrades gracefully to `hashString(entryId)`** — varied but unclustered (correct: no semantic neighborhood to express). Resolved at build time, digest-gated.
- **R6 Dormant = redundant multi-signal "asleep", never desaturation alone.** (1) **Color:** cool-teal low-alpha twilight via the LUT — chroma ×~0.4, hue → ~200° teal, lightness preserved (**pure greyscale rejected** — reads as broken/missing-asset). (2) **Posture:** a distinct dormant pose per archetype (flora furl/droop, fauna curl) — a *separate baked frame per template*, so the state survives greyscale/colorblind. (3) **Motion/icon:** a slow breathing-scale + occasional drifting "Zzz" (cosmetic RNG, **frozen during RT**). Wake animates twilight→full chroma + posture unfurl, strictly after grade.
- **R7 Wind-sway by structural rigidity.** (A) Low/flexible (grasses, fronds, Meadow flora) → runtime **vertical-gradient shear** (0 at root, max at tip; slow sine on cosmetic time). (B) Tall/rigid (L-system trees, structures) → trunk **never** deforms; only the **canopy** sways via 2–3 baked flutter frames (per-instance phase) or a shear above a per-template `trunkStiffLine` — no rubber-hose trunk. (C) **Reduced-mode / `prefers-reduced-motion`** → baked flutter frames for all, or fully static. Phase/amp from the per-trial cosmetic RNG; all sway **frozen** the instant a stimulus commits. Each template declares `swayMode: 'shear' | 'canopy-flutter' | 'static'`.

## Scheduler decision (added by the audit — VH-4/VH-8/VH-13)

`fsrs.ts` "FSRS-lite" has **no retrievability term**, so it can't schedule at a target recall probability — the retention claim was unimplemented. Resolution (default = adopt the real algorithm):

- **Prefer ts-fsrs** (MIT, deterministic-testable) behind the existing `CardState` seam (which is superset-compatible). Gains real `R(t,S)=(1+FACTOR·t/S)^DECAY`, desired-retention interval solving, trained weights, and the **graduated fuzz** table (15% for 2.5–7d, 10% for 7–20d, 5% for >20d, none <2.5d). *Or* keep FSRS-lite but make it minimum-viable-real (pass elapsed days into `recordReview`, compute `R(elapsed,S)`, solve the interval for a desired retention) **and** soften product copy to "FSRS-inspired Leitner+".
- **Mastery** is redefined as `R(30d,S) ≥ 0.9` **+ `minReps` + >1 successful recall after a real ≥N-day interval** (computed *through* R so it stays correct if weights change). For 2-AFC Crown, gate `easy` on RT **and** a cleared real spacing gap — one lucky fast trial can't mint mastery. This is the membership predicate R2's active-set uses and the trigger 02/04's re-greening/`isMastered` reference.
- `recordReview` is the **one** sealed spot that re-opens (additive elapsed-days arg, or the ts-fsrs swap); `migrateLexKeys()` stays lossless.

## Color & renderer corrections (audit — VH-2/VH-3/VH-7)

These amend Q2/Q3 above:
- **Renderer:** there is **no** WebGL2→WebGL1→Canvas2D auto-fallback in PixiJS v8. Contract = **primary `WebGLRenderer`** + an **explicit opt-in reduced mode** (`pixi.js ≥8.16` experimental canvas, basic-filters/no-particles) selected after a `gl===null` probe, *not* `autoDetect`.
- **Per-entry colour (Q2) is never a live per-sprite filter** — it's `sprite.tint` (in-batch) or a per-entry OKLCH ramp baked once into a cached `RenderTexture` during the frozen build. **Season/day-night is the *only* `ColorMatrixFilter`**, applied once to one container. Route season via `sprite.tint`-on-container too so it degrades on more paths.
- **Reduced mode (Q3/Q7)** either owns a full manual Canvas2D `SpriteScene` draw or is declared **no-recolor**, leaning on R6/Q6's five non-color channels so dormant/awake + season survive without colour. The `applyTint` shim alone is insufficient.

Full evidence + the other 11 flaws: [08-reference-audit.md](08-reference-audit.md). Test coverage for every fix: [07-testing-and-ci.md](07-testing-and-ci.md).
