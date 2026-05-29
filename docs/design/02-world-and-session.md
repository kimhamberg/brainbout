# 02 — World, narrative & session feel

The cohesion problem is the one Spiritfarer solves: **the gameplay IS the theme's feedback loop**, so mechanics never feel like a menu of chores. The four constructs are not four games but four kinds of *caretaking* in one contiguous valley.

## Fiction — the Keeper and the Long Quiet

The player is the Keeper: not a hero, a steward. Two diegetic lines at first launch, never a lore dump: *"The valley sleeps. It forgot its own names, and so did the world. You came back to remember it awake."*

Verdant Hollow is a former solarpunk research-garden — geometric solar-tech skeletons (the baked Art-Nouveau reclamation pass: vines/moss over panels, mirrors, trellises). Premise: a species' **name** is its anchor to wakefulness; when the last people who knew the names left, the valley fell into the **Long Quiet** — desaturated, still, breath held. The Keeper remembers it awake.

Tone register: gentle, second-person, present tense, plant-forward. **Never** "correct/wrong/score"; instead "it stirs", "it remembers you", "it's still drowsing — try again when it's ready". A woken resident gives a one-line definition-as-trait ("the fox-fern, *gratis* — it asks for nothing"), bound from `dict-no.json {word,pos,definition}` via `hashString(entryId)`. No villain, no clock pressure, no death — overdue cards **wilt** (desaturate, droop) and recover the instant you tend them.

Emotional arc: **loneliness** (week 1: grey valley, one or two waking residents, ambient synth-pad quiet) → **stewardship** (weeks 2–6: a routine forms, residents greet you, the Almanac fills) → **flourishing** (months: pollinators arrive, pockets unlock, the valley hums; the Keeper is no longer alone because the valley is company).

## The four constructs as one verb: CARE

No player-facing labels "Lex/Crown/Flux" ever — those are the dev `STEPS[].kind`. The player sees **places**:

| Pocket | Construct | Caretaking fiction |
| :-- | :-- | :-- |
| **Grove** | lex / spaced recall | A resident drowses under moss. Type its Norwegian name to wake it. *"It's almost awake. What was it called?"* |
| **Propagation Bench** | crown / rotation | Taking a cutting. Judge SAME/DIFFERENT vs the parent before you can pot it. *"Will this grow true to its parent, or is it mirrored?"* |
| **Meadow** | flux / go-no-go | Harvest the ripe, leave the unripe, welcome pollinators. *"Pick what's ready. Let the rest ripen."* |
| **Weather / Biome-crossing** | flux / rule-switch | A telegraphed sky/season shift flips which action is correct. *"The light changed — the rule of the meadow changed with it."* |

Meadow and Weather are two faces of the same flux engine and the same valley sky.

## Onboarding — the first 5 minutes, no tutorial wall

Teach through walking and curiosity (the *A Short Hike* model), not modals. Cold open: the Keeper at the valley gate in the Long Quiet — fully grey, still, one soft wind-chime. A single drowsing resident glows faintly nearby (the only colour-edged thing on screen = a curiosity landmark). No arrow. The player walks to it; it offers a 3-letter stage-1 **MCQ-scaffolded** word (`stages.ts` guarantees the first cards are recognition, not blind typing — the MCQ→cloze→typed curriculum *is* the onboarding ramp). Naming it: the resident un-furls in colour, a warm chord plays, colour bleeds outward two tiles — *remembering = waking the world*, learned in one action, zero text.

The next landmark is naturally a different pocket: the Bench appears with a cutting half-placed (*"same as its parent?"*); a few steps on, a Meadow tile with one obviously-ripe berry. Each first-encounter is a single trial at the easiest stage params. By minute 5 the player has done one of each gesture, woken ~3 residents, and learned the four pockets as *places they visited*. First-run silently seeds 8–12 stage-1 lex cards so day 2 has an honest due set.

## The Morning Round — a real ~8–12 min daily session

Built on the existing `daily.ts`/`cycle.ts` block-router seam, but instead of a stepper UI it's a continuous walk:

```
0:00  OPEN. Valley at dawn. World computes today's HONEST due set:
      getDueWords(deck,today) [Grove] + pickDueCrownTransform(today) [Bench]
      + flux due-events [Meadow/Weather]. A wisp-trail lights a path
      visiting ONLY the pockets with due work. "Good morning, Keeper.
      A few are stirring."

0:20  GROVE leg (~3-4 min, ~6 trials). Type names; each woken resident
      colours in and regreens its tiles. Overdue residents droop grey;
      tending snaps them upright — recovery is the only feedback.

3:30  WALK to the Bench (a 2-3s stroll; ambient pad swells, no loading
      screen). The walk IS the cognitive cooldown between constructs.

3:35  PROPAGATION BENCH leg (~2 min, 2-4 due classes). Judge SAME/DIFFERENT
      under RT pressure, then drag-to-pot. The cutting becomes a baby plant
      you'll watch grow over days.

5:30  WALK to the Meadow. Sky is clear.

5:35  MEADOW leg (~2 min, ~12-15 flux trials). Harvest ripe, withhold
      unripe, welcome pollinators. Partway through, the SKY VISIBLY SHIFTS
      — the WEATHER cue firing a rule-switch in the same flux block
      (switch cost logged). Meadow+Weather are one continuous leg.

8:00  RESOLUTION. Slow camera pull-back over the day's regreening: new
      colour patches, the cutting tray, a pollinator or two. A leaf tally.

8:30  "REST WELL." Due set empty → warm dusk dim. The satisfying STOP —
      but NOT a locked door.

8:30+ OPTIONAL TAILS (the Cozy-Grove fix): (a) FREE-TENDING — wander,
      water, no scheduler effect, Viridi-calm; (b) STUDY-AHEAD — "meet a
      few who aren't due yet" = new lex cards, graded, never punished.
```

> **Session bounding (Q4/Q11 → [06](06-resolved-decisions.md)).** The wisp-trail visits at most `MAX_POCKET_VISITS=5` pockets; each leg is batch-capped (Grove ~8, ceiling 12 on comeback days). Wild-resident shimmers (from mastered cards in the "wild") **enqueue** into the Grove leg rather than interrupting it — tapping one leaves a leaf-mark on the trail and it's woken at the next leg boundary, most-overdue-first. A big backlog drains a few per day, by design.

## Regreening arc — pacing over days / weeks / months

Gated by `getMasteredCountByPrefix('lex:<deck>:')` + per-class mastery, **not** calendar or session count — the world opens only as recall genuinely sticks (`isMastered` = S≥30d). Tunable ladder:
- **Days 1–3** (0–5 mastered): Gate Clearing only — Grove + a hint of Bench. Loneliness register.
- **Week 1** (~8–15): Bench fully opens; first Meadow pocket; first pollinator. Colour reaches ~25% of the valley.
- **Weeks 2–4** (~30–60): the Weather/Biome-crossing ridge unlocks; a second grove across a now-flowing stream. Crown buckets escalate (3→5 pieces); flux NOT-variant rules appear (`stages.ts`).
- **Months** (100+): hidden pockets — a night-blooming glade (only colours at dusk), a wildflower terrace fed by the greenhouse→wild migration ("the valley tends itself now"). Harder stage variants keep the cognitive load real even as the world looks finished.

Months-long pull: (1) the **Almanac** (APICO-style) — every woken species gets a card; completionists chase the full bestiary across swappable decks. (2) Slow visual deltas you can't rush — a tree woken on day 3 is visibly bigger on day 30 (stability → growth-stage frame). (3) The wild zone is a living screensaver of your own past mastery.

## Day / season rhythm — never bends the scheduler

**Hard rule: the FSRS scheduler is blind to season.** Seasons + day-night theme *only* the non-due discovery layer — visual recolor, which decorative species appear in free-tending, festival cosmetics. Real-calendar date → season tint via the LUT (Canvas2D fallback = composite-tint). Day-night: dawn-open, warm-dusk "rest well", a true-night mode (after local sunset) revealing a night-blooming glade. **Festivals cost nothing to miss** (Animal Crossing principle): date-seeded via `seededRng('festival-'+date)`, change decor + offer an Almanac stamp; skipping forfeits nothing scheduled — the next day's due set is identical.

## The glue — one living world, not four mini-games

1. **Spatial contiguity** — one camera, one tilemap, no level-select screen. The `STEPS[]` router hides behind a continuous-traversal layer that just changes which `BlockHandle` is active on arrival.
2. **The walk as transition** — the 2–3s stroll replaces the cycle-stepper and *is* the one-construct-per-moment buffer.
3. **Shared presentation system** — every pocket draws from the same atlas, OKLCH palette, reclamation overlay, day-night LUT.
4. **One state source** — `CardState` drives every visual (wilt/wake/grow), so Grove residents, Bench cuttings, and Meadow ripeness all belong to the same memory model.
5. **Humane streak framing** — `progress.ts` `getStreak` + 2 freezes/week, reskinned as "days you visited the valley"; a missed day auto-bridged as "a neighbor watered for you", never a broken-flame shame mechanic.
6. **Wordle-style share** — the date-seeded daily emits a spoiler-free leaf-glyph string (e.g. 🌿🍂🌱🌿 = woke / wilted-recovered / cutting-took / woke) from `BlockOutcome` meta — shows the *kind* of tending, never the words.

## Challenge ↔ cozy reconciliation — difficulty hidden in wilt/recover

> **Two audit corrections ([08](08-reference-audit.md)).** (VH-5) "invisibly clothed" cannot mean *imperceptible*: Wilson-85% needs a felt deadline that modulates error, so the tempo must stay a **perceptible diegetic** cue (a closing bloom / pulse / audible beat) — a timeout reads as "the bloom closed", not an invisible-clock failure. (VH-8) the re-greening **perennial / `isMastered`** trigger is no longer raw `s≥30d` but `R(30d,S)≥0.9` + `minReps` + a recall after a real spacing gap, so a lucky fast trial can't mint mastery and force an unearned world reveal.

All the rigorous adaptivity stays (Wilson-85%, `noGoRate` 0.1–0.2, switch cadence 3–7, NOT-variant, `stages.ts` ramp) but is invisibly clothed:
- A failed lex attempt → "it's still drowsing"; FSRS schedules it sooner (`again`→S×0.2); next time it's a wilted resident to re-tend.
- A failed crown/flux trial → "the cutting didn't take" / "that one wasn't ripe" — a soft wilt, `-1` where the engine demands it (withhold cost preserved), no red X.
- Rising adaptive difficulty reads as the valley "coming more alive" (harder weather, more chiral cuttings), not a difficulty slider.
- **Overdue = wilt** is the only negative visual, and it's instantly reversible — gentle pressure without punishment.
- The rigor lives one frame *before* the cozy: stimulus onset is rAF-anchored and all juice frozen until RT is logged (guardrail 1).

## Resolved (see [06](06-resolved-decisions.md))

- **Walk duration (Q4)** — a fixed `WALK_FLOOR_MS=1500` cognitive-cooldown floor (never compresses) with familiarity-scaled *visual* distance (`panMs = lerp(2800, 1500, clamp01(visits/12))`); the session is bounded by `MAX_POCKET_VISITS=5` + per-zone batch caps (`GROVE_CAP=8`/`BENCH_CAP=4`/`FLUX_CAP=15`). Overflow is **never dropped** — surplus stays due and surfaces next session, gently ("many are stirring — we'll wake a few each day").
- **Onboarding parity (Q5)** — each non-Grove zone gets one guided rehearsal (`src/scene/guided-trial.ts`) on a separate code path that imports none of `fsrs`/`trial-clock`; excluded from `BlockOutcome` + telemetry; gated by a persisted `guidedSeen[zone]` in `progress.ts`.
- **Accessibility (Q6)** — the presentation map emits five redundant channels (posture / silhouette size / sparkle / audio / optional glyph); state is legible with colour stripped (WCAG 1.4.1). Audio state-change cues (wake/wilt/recover) fire post-grade in the cohesion "one state source" glue.

## Still open

- "Rest well" vs never-empty tension — tail prompt must read as a gentle open door, not a Duolingo nag.
- Study-ahead pacing vs the active-set cap — rule for how many new cards/day before pushing the cap (adjacent to Q1/Q11 but not resolved by them).
- A one-time gentle line clarifying "residents wake on their own rhythm, not the season's" to pre-empt season-blind confusion.
