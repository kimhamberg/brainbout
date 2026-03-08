# Flux Redesign — Design

Redesign Flux from a clinical task-switching exercise into an addictive, rhythm-driven cognitive game that competes with doomscrolling. Same scientific foundations (task switching + inhibition), dramatically more engaging.

## Research basis

Two rules is not optimal. With only 2 tasks, the brain prepares for "the other one" — specific task preparation, not general cognitive flexibility [(Contextual Adaptation, 2020)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7396276/). With 3+ tasks, switches genuinely test flexible readiness [(Task Switching & Cognitive Capacity, 2023)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10140903/). The brain uses "cognitive caching" — more tasks = stronger working memory demand [(Scientific Reports, 2015)](https://www.nature.com/articles/srep17502). An ideal training game should include maximal task diversity [(Game-based flexibility training, 2018)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5816121/).

Expanding from 2 rules to a rotating pool of 5 rules is both more fun and more scientifically sound.

## Design principles

1. **Training first** — task-switching and inhibition mechanics stay scientifically intact
2. **Rhythm creates flow** — trial interval IS the beat; the pulse is what makes 75 seconds vanish
3. **Juice everywhere** — every correct answer feels powerful, every mistake stings
4. **Streak is the addiction** — visible momentum that hurts to lose
5. **Variable reward** — unpredictable golden shapes trigger the compulsion loop
6. **One more try** — short session + near-miss framing + instant replay = "I can do better"

## Core mechanic

Two buttons: **Left** and **Right**. Shapes appear in the center. A cue word at top shows the active sorting rule. Sort the shape to the correct side.

### Stimuli

Each trial is a shape with 4 visual properties, all rendered in pure CSS:

| Property | Left value | Right value |
|----------|-----------|-------------|
| **Color** | Warm (`--ctp-red`, `--ctp-peach`) | Cool (`--ctp-blue`, `--ctp-lavender`) |
| **Shape** | Round (circle, pill) | Angular (diamond, triangle) |
| **Size** | Big (4rem) | Small (2rem) |
| **Fill** | Solid (filled background) | Hollow (stroke-only, min 3px border) |

All 4 properties are always visible. Only the active rule's property matters — the rest are random noise that forces selective attention.

### Shape rendering (pure CSS)

| Shape | CSS |
|-------|-----|
| Circle | `border-radius: 50%` on square element |
| Pill | `border-radius: 50%` on wide rectangle (aspect ratio ~1.8:1) |
| Diamond | `clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)` |
| Triangle | `clip-path: polygon(50% 0%, 0% 100%, 100% 100%)` |

Size: Big = `4rem`, Small = `2rem`. Hollow = `background: transparent` + thick `border` (min 3px, proportionally thicker at small size).

### Rule pool (5 rules)

| Rule | Cue | Left | Right |
|------|-----|------|-------|
| COLOR | `COLOR` | Warm | Cool |
| SHAPE | `SHAPE` | Round | Angular |
| SIZE | `SIZE` | Big | Small |
| FILL | `FILL` | Solid | Hollow |
| NOT | `NOT COLOR` etc. | Inverted previous rule | Inverted |

Button labels update dynamically per active rule: `Warm | Cool` during COLOR, `Round | Angular` during SHAPE, etc. Labels animate on switch (fade out old → fade in new).

### No-go trials (doesn't-belong stimulus)

No-go stimuli don't fit either side of the active rule. Don't press either button — let the shape dissolve. Rate: 15-25% depending on stage. Unlocked after first rule switch.

| Active rule | No-go stimulus | Visual |
|-------------|---------------|--------|
| COLOR | Yellow shape — neither warm nor cool | `--ctp-yellow` |
| SHAPE | Blob — amorphous, neither round nor angular | `border-radius: 40% 60% 55% 45%` |
| SIZE | Oscillating — rapidly pulses between big and small | CSS animation alternating scale |
| FILL | Striped — diagonal lines, neither solid nor hollow | `repeating-linear-gradient` |

This is rule-dependent inhibition: you must evaluate against the current rule before deciding to withhold. Much deeper training than a universal "don't touch" signal.

### Switch mechanic

Rules switch after 3-7 trials (adaptive range varies by stage). On switch:

1. Rule cue slides out, new rule slides in (150ms animation)
2. `SWITCH!` flash — shockwave ring expands from center in `--ctp-mauve`
3. Button labels fade to new values
4. Background shifts subtly to new rule's accent tone
5. Ambient pulse does one emphasized beat (heavier thump)
6. First post-switch trial gets +200ms grace period, starting AFTER cue animation completes

### NOT rule

NOT inverts the previous rule. If COLOR was active (warm→left, cool→right), NOT COLOR means cool→left, warm→right. The cue displays `NOT COLOR` with NOT in `--ctp-mauve`. The entire rule cue area gets an inverted background (light text on dark surface, or vice versa in Latte) for visceral instant readability.

## Rhythm & pulse

The trial interval IS the beat. Trials land on a steady pulse that creates flow state.

### BPM system

| Stage | Base BPM | Interval | Feel |
|-------|----------|----------|------|
| 1 | ~75 | 800ms | Relaxed, easy to lock into |
| 2 | ~90 | 667ms | Brisk, engaging |
| 3 | ~110 | 545ms | Intense, demanding |

- A subtle ambient pulse plays on every beat — a soft tick/thump (not music, not a metronome — a heartbeat)
- The shape appears exactly on the beat
- Response window is until the next beat
- Beat scheduling uses `AudioContext.currentTime` to prevent drift over the 75-second session

### Adaptive pacing through BPM

Instead of adjusting interval by fixed milliseconds, the game shifts BPM:

- **Streak of 5 correct:** BPM increases by ~5% of current BPM (proportional, feels natural at all speeds)
- **Wrong answer:** BPM drops back to stage base
- **BPM floor/ceiling per stage:**

| | Stage 1 | Stage 2 | Stage 3 |
|---|---------|---------|---------|
| Base (ceiling) | 75 BPM | 90 BPM | 110 BPM |
| Floor (max speed) | 90 BPM | 110 BPM | 135 BPM |

Going fast feels amazing. Losing speed feels like loss. Speed IS the reward — this is the Tetris principle.

### Streak-rhythm feedback loop

When on a streak:
1. BPM is climbing — you feel faster
2. The ambient pulse gets slightly richer (a faint harmonic layer joins at streak 5+)
3. Your thumb moves on the beat — motor rhythm is locked
4. Breaking the streak kills the rhythm — a silent beat gap creates genuine discomfort
5. You immediately want to rebuild it

The switch still happens unpredictably within the rhythm. You're in flow, locked on the beat, and then — SWITCH — new rule. Your body wants to keep the rhythm but your brain must reconfigure. This creates a stronger switch cost than the current design because you're fighting both cognitive inertia AND motor rhythm.

## Juice & feel

### Correct answer

- Shape bursts toward the correct side — fast `translate` + `scale(0)` + `opacity: 0` (CSS, ~150ms)
- Correct side does a brief glow pulse in the shape's color (`box-shadow` animation)
- 3-5 particle circles scatter from impact (CSS `@keyframes` with randomized directions)
- Ambient pulse tick is slightly brighter on that beat (audio confirmation of sync)
- Particles capped at 8 max active. Only `transform` + `opacity` used (GPU composited). `will-change` set on particle elements.

### Wrong answer

- Shape cracks in place — fracture line effect, then splits into two halves that fall with gravity animation
- Incorrect side does a brief shake (CSS `translate` jitter, ~200ms)
- Rhythm stutters — one silent beat. The gap IS the punishment
- Screen does a subtle dim flash (`opacity` dip, ~100ms)

### No-go correct (successfully withheld)

- Shape dissolves — slow fade + slight upward drift, like smoke
- Soft chime — distinct from the regular correct sound. Rewards restraint
- Subtle glow on center area where the shape was (`--ctp-green`)

### No-go fail (pressed when shouldn't have)

- Shape explodes — scattered fragments in wrong directions
- Both buttons reject with a push-back animation
- Low buzz sound — unmistakably different from regular wrong

### Switch moment

- Rule cue slides out old → slides in new (150ms)
- Flash ring expands from center (shockwave, `--ctp-mauve`)
- Emphasized beat — heavier thump
- Background color shifts subtly to new rule's accent tone

### Streak visuals

A compact streak indicator (max height 2rem) between stimulus and buttons:

| Streak | Visual | Multiplier |
|--------|--------|-----------|
| 0-2 | Empty, still | x1 |
| 3-4 | Spark — small ember glow (`--ctp-peach`) | x1.5 |
| 5-9 | Flame — animated flicker, warm glow (`--ctp-red`) | x2 |
| 10-14 | Blaze — larger, particles rising (`--ctp-red` → `--ctp-yellow`) | x3 |
| 15+ | Inferno — screen edges glow, pulse is rich (`--ctp-yellow`) | x5 |

Streak flame is a single compact line (e.g. `🔥 x3`) with colored `box-shadow` glow behind it. Keeps buttons above fold on small phones.

### Reduced motion

Under `prefers-reduced-motion`:
- All shape animations become instant opacity transitions
- No particles
- No screen shake/dim
- Streak glow is static color, no animation
- Rhythm/audio pulse continues (audio is the primary flow driver)
- Game remains fully playable

## Streak, variable reward & scoring

### Score multiplier

| Streak | Multiplier |
|--------|-----------|
| 0-2 | x1 |
| 3-4 | x1.5 |
| 5-9 | x2 |
| 10-14 | x3 |
| 15+ | x5 |

Multiplier is always visible next to streak flame. Watching it climb to x5 knowing one mistake kills it — that's the tension.

### Variable reward: Golden shapes

~8-10% of trials, a shape arrives with a golden ring (thick animated border using `--ctp-yellow`) + shimmer animation on background. Follows normal rules — sort correctly like any other shape.

- Correct: +5 base points instead of +1 (multiplied by streak)
- Correct at x3 or higher: bonus burst — screen flashes gold, extra particle explosion, distinct chime
- Wrong/miss: no extra penalty, but the lost potential stings

Golden ring ensures visibility on any color/fill combination.

This is variable ratio reinforcement — the most addictive reward schedule. You can't predict when gold appears. You can only be ready.

### Scoring table

| Action | Base points |
|--------|-----------|
| Correct sort | +1 |
| Correct no-go withhold | +1 |
| Golden shape correct | +5 |
| Wrong sort | -1, streak reset |
| No-go fail | -1, streak reset |
| Timeout (no press on go trial) | -1, streak reset |

Final score = sum of (base points × active multiplier at time of action).

### Near-miss psychology

On result screen, if score is within 10% of personal best: **"3 points from your best!"** in accent color. Near-miss framing drives replays harder than showing distance-to-goal.

## Session arc

### Duration: 75 seconds

- 60s (current) is too short for rhythm to fully develop
- 90s risks fatigue at highest BPM stages
- 75s gives ~15s warm-up, ~45s peak flow, ~15s climax tension

### Three acts

**Act 1 — Warm-up (0-15s):** First 5 trials. No switches, no no-go, no golden shapes. Just the beat and the first rule. Let the player lock into the rhythm. BPM starts at stage base. On-ramp to flow state.

**Act 2 — Flow (15-60s):** Full mechanics. Switches, no-go, golden shapes, adaptive BPM. Streak builds. Flame grows. Rhythm quickens. This is where you lose track of time.

**Act 3 — Climax (60-75s):** Timer turns red. Ambient pulse gets a subtle urgency layer (sharper tick). Switch frequency increases slightly. Golden shape probability doubles. Maximum tension, maximum reward potential.

### Timer

A depleting ring around the stimulus container (fixed-size, independent of shape size). The ring:
- Full and cool-colored (`--ctp-overlay0`) at start
- Shifts warm as time passes
- Pulses red (`--ctp-red`) in final 15s
- Depletes in sync with the beat — ticks down on rhythm, not continuously

### Result screen

Appears immediately — zero delay. Momentum carries into replay decision.

1. **Score** — big, center, animated count-up from 0 to final (~1.5s)
2. **Peak streak** — "Best streak: 17 (x5 Inferno)" with flame icon at peak stage
3. **Near-miss nudge** — within 10% of best: "Only 4 away from your best!" in accent color. If NEW best: celebratory burst + "NEW BEST" with golden shimmer
4. **Accuracy** — small, understated: "34/41 correct"
5. **Two buttons:**
   - **Play Again** — primary, large, prominent. Subtly pulses once after score count-up finishes. The default action
   - **Back to Hub** — secondary, smaller, muted

## Stage progression

### Stage parameters

| | Stage 1 (Relaxed) | Stage 2 (Brisk) | Stage 3 (Intense) |
|---|---|---|---|
| Base BPM | ~75 (800ms) | ~90 (667ms) | ~110 (545ms) |
| Rule pool | Color, Shape, Size | + Fill | + NOT variants |
| Switch range | Every 5-7 trials | Every 4-6 trials | Every 3-5 trials |
| No-go rate | 15% | 20% | 25% |
| Golden rate | 10% | 8% | 8% |
| BPM floor | 90 BPM | 110 BPM | 135 BPM |
| BPM increase | ~5% per streak-of-5 | ~5% | ~5% |

Stage advancement uses existing brainbout system — accuracy over last 5 results, 0.8 readiness threshold.

### Within-session rule unlocking

Rules don't all appear at once:

- **Trials 1-5 (warm-up):** First rule only, no switches
- **After warm-up:** Second rule enters rotation
- **After 2 switches:** Third rule enters (Stage 1 caps here)
- **After 4 switches:** Fourth rule enters (Stage 2 caps here)
- **After 6 switches:** NOT variants can appear (Stage 3 only)

Every session has its own mini difficulty curve. Never overwhelming.

## Visual identity

### Catppuccin color mapping

| Game concept | Token |
|---|---|
| Warm shape colors | `--ctp-red`, `--ctp-peach` |
| Cool shape colors | `--ctp-blue`, `--ctp-lavender` |
| No-go (color rule) | `--ctp-yellow` |
| Golden shape ring | `--ctp-yellow` + shimmer animation |
| Streak spark | `--ctp-peach` |
| Streak flame | `--ctp-red` |
| Streak blaze/inferno | `--ctp-yellow` |
| Switch flash | `--ctp-mauve` |
| NOT rule inversion | `--ctp-mauve` background |
| Timer ring (full) | `--ctp-overlay0` |
| Timer ring (final 15s) | `--ctp-red` |
| Rule cue text | `--ctp-subtext0` |
| Correct feedback | `--ctp-green` |
| Wrong feedback | `--ctp-maroon` |
| Background pulse | `--ctp-surface0` ↔ `--ctp-base` oscillation on beat |

All existing Catppuccin tokens — no new colors.

### Layout

```
┌─────────────────────────┐
│      75s  ←timer ring   │
│                         │
│    COLOR  ←rule cue     │
│                         │
│      ◆   ←shape         │
│                         │
│   🔥 x3  ←streak+mult  │
│                         │
│  ┌──────┐  ┌──────┐    │
│  │ Warm │  │ Cool │    │
│  └──────┘  └──────┘    │
│                         │
│   Score: 42             │
└─────────────────────────┘
```

Same vertical layout as current Flux. Timer is a ring around the stimulus container. Streak is a compact single line. Button labels are dynamic per rule.

## Sounds

New sounds to synthesize with existing `gen-sounds.py` pipeline (NumPy + SciPy + Pedalboard):

| Sound | Description |
|---|---|
| beat-tick | Soft ambient pulse. Low woody thump, ~50ms |
| beat-tick-accent | Slightly brighter tick for correct-on-beat |
| beat-tick-urgent | Sharper tick for climax phase (final 15s) |
| correct-burst | Quick bright pop. FM bell, ~80ms |
| wrong-crack | Short fracture snap + low thud, ~120ms |
| nogo-dissolve | Gentle airy chime, ~150ms |
| nogo-fail | Low buzz, ~100ms |
| switch-whoosh | Brief shockwave sweep, ~100ms |
| golden-chime | Bright sparkle arpeggio, ~200ms |
| streak-up | Rising pitch pip when multiplier tier increases, ~60ms |

All synthesizable. No samples needed.

## Performance constraints

- Particles: max 8 active, `will-change: transform, opacity`, GPU-composited properties only
- Beat timing: `AudioContext.currentTime` scheduling, not `setTimeout`
- Shape CSS: `clip-path` and `border-radius` only, no canvas/SVG
- Android WebView: test at Stage 3 BPM with inferno streak active (worst case)
- Disable particles + animations under `prefers-reduced-motion`

## Files

### Modify

- `src/games/flux-engine.ts` — new rule pool, BPM system, golden shapes, no-go per rule, NOT rule, session acts, within-session rule unlocking
- `src/games/flux.ts` — new rendering, rhythm loop with AudioContext, juice animations, streak visuals, result screen redesign, dynamic button labels
- `src/games/flux.css` — shape styles, particle keyframes, streak flame, timer ring, switch animations, no-go styles, golden shimmer, reduced-motion overrides
- `test/flux.test.ts` — tests for new rule pool, no-go per rule, NOT rule, BPM adaptation, golden shapes, scoring with multipliers, session acts, within-session rule unlocking

### New

- New synthesized sounds via `scripts/gen-sounds.py` additions

### No changes

- `games/flux.html` — same page structure
- `src/shared/progress.ts` — same progress API
- `src/shared/stages.ts` — same stage system
- Hub — same Flux card, same stage thresholds
