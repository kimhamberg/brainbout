# 04 — Content & taxonomy model

Generalizes the sealed FSRS spine from `(lang, word)` to `(deckId, entryId)` **without touching** `fsrs.ts`/`rng.ts`/`stages.ts`. The species map is a pure function of `(deckId, entryId)`, so a new deck regenerates a whole fresh world.

## The `(deckId, entryId)` abstraction

A deck = a manifest + an entries array.

```ts
interface DeckManifest {
  deckId: string;        // slug, e.g. 'no'
  kind: 'vocab' | 'fact' | 'custom';
  label: string;
  lang?: string;
  version: number;
  entryCount: number;
  biomeSeed: string;
}
interface DeckEntry {
  entryId: string;       // immutable card identity — entryId = senseIdx===0 ? label : `${label}#${senseIdx}`
  label: string;         // surface form the player TYPES (the Norwegian word)
  pos: string;
  gloss: string;         // = definition
  example: string;       // '' preserved, never synthesized
  senseIdx: number;
  rank: number;          // baked seeding/promotion order — [lengthBand, opt freqTier, originalIndex] (Q1)
  aliases?: string[];
}
```

**Critical distinction:** `label` is what you type; `entryId` is the card identity. They differ only for homographs: the 923 multi-sense words in `dict-no` each own a distinct FSRS card + distinct species, while typing the same letters wakes either. `suggestGradeFromTyping(typed, entry.label)` grades against `label` (both senses accept the same spelling); the scheduler keys on `entryId`.

## Storage keys + migration

| Pool | Key | Status |
| :-- | :-- | :-- |
| Lex (per-instance) | `brainbout:lex:<deckId>:<entryId>` | **new** (default `deckId='no'` keeps `lex:no:` prefix) |
| Active-set list | `brainbout:lex:<deckId>:active` = `entryId[]` | new |
| Active deck pointer | `brainbout:lex:deck` | new (default `'no'`) |
| Migration sentinel | `brainbout:migrated:lex-entryid:v1` | new |
| Crown (class-keyed) | `brainbout:crown:<few\|mid\|many>:<transform>` | unchanged |
| Flux (class-keyed) | `brainbout:flux:<not_>?<rule>` | unchanged |
| Stage curriculum | `brainbout:stage:lex` | unchanged |

**`migrateLexKeys()`** — one-shot, idempotent: if the sentinel is set, return. Scan localStorage; for each `brainbout:lex:no:<X>` with no `#`, rewrite to `brainbout:lex:no:<X>#0` *only if* the target is absent, copying the `CardState` verbatim, then delete the old key. Skip keys already containing `#`. Set the sentinel. Lossless because today `dictByWord` collapses senses to the last occurrence and the SRS key is the bare word — every legacy card is semantically sense 0; mapping to `#0` preserves s/d/lastReview/nextDue/lapses/reps, so streaks + `getMasteredCountByPrefix('lex:no:')` keep working.

## Loading `dict-no.json` (build-time normalizer)

`normalizeVocabDeck(raw, deckId)` — pure, ideally baked into `public/decks/no.deck.json` (generate-once-commit), runtime fallback if absent. Over the 20,592 rows: (1) **NFC-normalize** each word so æøå are single code points (composed vs decomposed would yield different `hashString` → different species across devices); (2) group by NFC label, assign `senseIdx` in original array order; (3) emit `entryId` per the homograph rule; (4) `gloss=definition`, `example=example` (`''` preserved, never synthesized); (5) drop nothing — 1-char entries ('A', 'å') and multiword phrases ('ad hoc', 'anno Domini') are all valid. The 93.6% empty-example rate means the cloze stage must fall back to a **gloss-cloze**; examples are a bonus scaffold, never required.

## Word → species binding (deterministic, device-identical)

`speciesFor(deckId, entry): Species` — pure, **partitioned-RNG**, device-deterministic:
1. `seed = hashString(\`${deckId}:${entry.entryId}\`)` (FNV-1a, already in `rng.ts`).
2. Build a **local** `mulberry32(seed)` — never the global gameplay rng (guardrail 6).
3. `kingdom = KINGDOM_FOR_POS[entry.pos]` (taxonomy below).
4. `family = FAMILIES[kingdom][floor(r()*len)]`.
5. body-plan params (symmetry, limb/branch count, size class) — each a fresh `r()` draw so two words in a family still differ.
6. palette: OKLCH base hue + accent offset, warm-light/cool-shadow ramp.
7. animation curve id (gait for fauna, sway for flora) + reclamation density.

Because `hashString` + `mulberry32` are pure integer ops with no locale/float dependence, and labels are NFC-normalized, the species is byte-identical everywhere — the same property `daily.ts` already relies on. `Species` is a plain-data record (no DOM), consumed by the render layer to look up baked atlas frames.

### POS → kingdom (the trait IS the learnable meaning)

The 15 POS classes collapse into a legible 4-kingdom ecology:

| Kingdom | POS (count) | Rendering — the trait encodes the meaning |
| :-- | :-- | :-- |
| **FLORA** | noun (13,354) | Standing plants/trees. Concrete-object nouns get fruiting bodies; abstract nouns get crystalline/airy forms. Family refined by hashing the gloss's first content keyword, so bird-words ('fugl'/'and'/'ørn') cluster into avian-ish forms → learnable semantic neighborhoods. |
| **FAUNA** | verb (2,621) | Creatures whose **gait/animation encodes the action** — motion verbs walk, stative verbs rest; naming the creature = recalling what it *does*. |
| **MODIFIER** | adj (3,521) + adv (601) | Fungi/lichen/mosses/flowering colour-variants that visibly *modify* a host ('rød' tints its neighbor red = "adjective qualifies a noun"). |
| **STRUCTURE** | the function-word tail (prep, conj, pron, det, article, num, particle, intj, phrase, proverb, prep_phrase; ~600) | The solarpunk skeleton: paths, joints, signage, standing stones — "the grammar that holds the valley together". |

Traits are presentation-only; the engine never sees them.

### Norwegian specifics

- **æøå** — NFC-normalized at build; `hashString` (charCodeAt) is then stable; the typed-input regex already includes `[a-zA-ZæøåÆØÅ]`; `levenshtein` is codepoint-based.
- **Multiple senses** (923) — disambiguated by `senseIdx` in `entryId`; each sense is a distinct species + card; the gloss/pos in the prompt tells the player which dormant sense they're naming; `suggestGradeFromTyping` accepts the shared spelling.
- **Empty examples** (93.6%) — cloze degrades to a gloss-cloze; example-cloze only for the 6.4% that have one.
- **Phrase/proverb entries** — legal labels with a relaxed typed charset (spaces/hyphens/digits) and a length-scaled `maxTypos` budget.

## The diegetic MCQ → cloze → typed ramp

Three Grove gestures gated by `stages.ts getStage('lex')` + `maxMasteryForStage` (stage1→0, stage2→1, stage3→2). The target is hidden until after the attempt in **all** stages; the dormant species shows greyed with only its trait/gloss legible.
- **Stage 1 — recognize the seedling (MCQ):** grey seedling + gloss; 4 name-glyphs (1 correct + 3 `pickDistractors`). Tap → seedling greens.
- **Stage 2 — fill the trait-cloze:** gloss/example with the name (or salient trait-word) blanked; type into the gap. Gloss-cloze when `example===''`.
- **Stage 3 — type the name to wake (keystone):** only the grey species + gloss + an empty field; type the full name from memory.

All stages: on submit, `suggestGradeFromTyping(typed, entry.label)` autogrades → reveal target + greening (or wilt-back on `again`) → 4 grade buttons with the suggestion pre-highlighted (overridable, preserved from current lex-block). `recordResult('lex', accuracy)` feeds the 5-session rolling history; `readiness('lex', threshold)` governs stage advance/retreat. No fail screen; `again` just leaves the resident dormant. Onset rAF-anchored; juice frozen until grade logged; the "plant the seed" cosmetic never carries the grade.

## Per-instance vs class-keyed + greenhouse-vs-wild cap

Lex is the **only** per-instance pool (20,592 potential cards). Crown/Flux stay class-keyed (15 + 8 cards total) — a due-event spawns a fresh random stimulus of that class, so no per-instance cap is needed.

The **greenhouse-vs-wild** graft bounds Lex daily load:
- An **active set** (the "greenhouse", `ACTIVE_SET_CAP ≈ 120`) is the only Lex subset FSRS-active for new learning, stored as an ordered `brainbout:lex:<deck>:active` (entryIds).
- `getDueWords(deck, candidateEntries, today)` is computed over `activeList ∪ sample(wildDue, WILD_DUE_PER_SESSION ≈ 5)` — **never** all 20,592 — bounding due-load to a humane round. (`getDueWords` keeps its existing 3-arg shape; the caller supplies the bounded list.)
- When a card hits `isMastered` (s≥30) it **migrates to the wild** (removed from the active list; a fresh unseen entry promoted in to refill). Wild cards still FSRS-tick, but the session samples only a small capped slice ("the wild mostly tends itself; occasionally a wild resident needs you").
- `buildQueue` (`lex-logic.ts`) is reused unchanged over the bounded candidate list.

**Implemented** (`src/games/greenhouse.ts`, 2026-05-29): `syncActiveSet(deck, deckId, cap=ACTIVE_SET_CAP)` seeds the lowest-`rank` unseen entries, drops mastered cards (migrate to wild) and refills, persisting `brainbout:lex:<deck>:active`. `sampleWildDue(...)` returns ≤`WILD_DUE_PER_SESSION` out-of-greenhouse, seen, FSRS-due entries, most-overdue first. `buildGroveQueue` now draws from `active ∪ wildDue` (never the whole 20k deck), order = greenhouse-due → wild → fresh-by-rank. 100% unit-covered.

## Almanac — states computed from FSRS, never faked

> **Scheduler corrections ([08](08-reference-audit.md) VH-4/VH-8).** `fsrs.ts` "FSRS-lite" had no retrievability term; the plan is to **adopt ts-fsrs** (MIT) behind the superset-compatible `CardState` seam (or make FSRS-lite minimum-viable-real: pass elapsed days into `recordReview`, compute `R(t,S)`, solve the interval for a desired retention) — the one place `recordReview` re-opens; `migrateLexKeys()` stays lossless. **`perennial` / `isMastered` below is redefined** from raw `s≥30d` to `R(30d,S) ≥ 0.9` **+ `minReps` + a successful recall after a real ≥N-day spacing gap**, so a single lucky fast trial cannot mint mastery (and for 2-AFC Crown, `easy` needs RT *and* a cleared spacing gap).

A per-deck collection screen; each discovered species' state is a pure function of its `CardState`:

| State | Condition |
| :-- | :-- |
| undiscovered | no card / not in `getSeenKeys` (blank silhouette) |
| discovered | card exists, `reps ≥ 1` |
| named | `reps ≥ 1 && lastReview !== ''` and typed at stage 3 |
| thriving | `7 ≤ s < 30` |
| perennial | `isMastered` (s ≥ 30) — migrated to wild |

A **wilting** flag overlays any state when `isDue && nextDue < today` (diegetic "needs you", recoverable, no penalty). Counts read straight off storage (`getSeenKeys` = discovered total; `getMasteredCountByPrefix` = perennial total) so progress **cannot inflate** — the only way to advance a state is to genuinely raise stability via real reviews. Unlocks (honest, never time-gated): N perennials in a kingdom unlocks that kingdom's biome theming + new families in discovery; a fully-perennial semantic neighborhood lights a landmark. Unlocks gate only discovery cosmetics + non-due flavor, never the scheduler.

## Deck-swap — other languages / facts / custom

Any deck conforming to `{manifest, entries}` drops a fresh world because `speciesFor(deckId, entryId)` is pure in the deck id — a new `deckId` reseeds every hash, so Spanish 'gato' and a trivia deck's 'Krebs Cycle' each generate a brand-new valley (answers the novelty wall). Three kinds, **identical** cognitive grading:
1. **Vocab** (any language) — same `{label, pos, gloss, example}`; pos drives the kingdom taxonomy; typed recall in the target language.
2. **Fact** — `label=answer term`, `gloss=question`, `pos` defaults to a single `'fact'` class (or a small custom kingdom enum the manifest declares), `example=optional mnemonic`. Recall ramp + `suggestGradeFromTyping` unchanged.
3. **Custom** — user-imported JSON, same shape; `deckId` a content-hash slug so re-import is idempotent and shareable.

Each deck owns isolated storage (`lex:<deckId>:*`) and an isolated Almanac. Crown/Flux are deck-agnostic, so swapping decks only reskins/reseeds the Grove + Almanac.

## Resolved (see [06](06-resolved-decisions.md))

- **Active-set seeding (Q1)** — hybrid baked `rank = [lengthBand, optional freqTier, originalIndex]`; greenhouse seeds the lowest-`rank` `ACTIVE_SET_CAP` entries, promotion pulls the lowest-`rank` unseen entry. No third-party frequency corpus committed by default (license-clean); `--freq` is an opt-in build flag re-sorting only *within* bands. Phrases (space in label) forced to a trailing band so they seed last.
- **STRUCTURE kingdom (Q9)** — first-class Almanac residents: real `lex:<deck>:<entryId>` cards, same ramp + lifecycle + five states, rendered as the valley skeleton (each a tappable hotspot + card). Stage-2 cloze is always **gloss-cloze** with the **pos badge** shown (disambiguates the dense 'de'/'en' homograph tail). Grouped in their own Almanac kingdom panel.
- **`maxTypos` for phrases (Q10)** — `len>13 ? 2 + floor((len-13)/8) : <existing>` (every threshold ≤13 byte-identical to today, so single-word rigor + tests are untouched). Charset widened to space/hyphen/digit, **gated on the active label** so single-word trials still reject strays. `suggestGradeFromTyping` adds a private `normForMatch` (whitespace-collapse).
- **Byte-freeze the species map** — the atlas-manifest digest transitively pins `speciesFor` (creatures bake from it) + a ~5-entry canary test.

## Still open

- Homograph prompt design must make the dormant sense's gloss/pos prominent so the player knows *which* 'være' they're naming (sharpened by Q9's pos badge, not closed).
- Gloss-keyword extraction for FLORA clustering is heuristic (first English content word); needs a per-deck opt-out for non-English fact decks.
