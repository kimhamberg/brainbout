# Word Recall v2 — Multiple Choice with Full Dictionary Data

## Problem

Word Recall currently uses 50 hand-curated words per language with no authoritative source. The game uses text input which is error-prone. We need a much larger word pool from official sources, multiple-choice gameplay, and a new/review word mix for optimal brain exercise.

## Data Source

**kaikki.org** (Wiktionary data dumps, CC-BY-SA + GFDL):

- English: ~145K words with real definitions, ~100K with examples (~121 MB filtered)
- Norwegian Bokmal: ~38K words with real definitions, ~5K with examples (~7.3 MB filtered)
- Norwegian words have English-language definitions (bilingual vocabulary exercise)

## Build-Time Script

`scripts/download-dictionaries.ts`:

1. Downloads kaikki.org JSONL dumps for English and Norwegian Bokmal
2. Parses line by line, filtering:
   - Remove entries with "form-of" tag in senses (e.g. "plural of X")
   - Remove entries with empty/missing glosses
   - Keep only the first non-form-of sense per word+pos combination
3. Extracts per entry: `{word, pos, definition, example}`
4. Masks target word in examples (replace with "\_\_\_")
5. Logs filtering stats (total parsed, kept, filtered by reason)
6. Validates output (no empty definitions, no unmasked words in examples)
7. Writes `public/dict-en.json` and `public/dict-no.json`

npm script: `"download:dict": "tsx scripts/download-dictionaries.ts"`

## Output Format

```json
[
  {
    "word": "ephemeral",
    "pos": "adj",
    "definition": "Lasting for a short period of time.",
    "example": "The ___ nature of fashion trends."
  }
]
```

## Game Flow

1. Load dictionary JSON for selected language (browser caches after first load)
2. Build session word list:
   - 70% SRS review words (due today per Leitner boxes)
   - 30% random new words (never seen before)
   - If fewer review words available, fill with new words
3. Each round:
   - Pick next word from session queue
   - Show definition as the cue
   - Present 4 multiple-choice buttons: correct word + 3 fuzzy distractors
4. Player taps the correct word
5. Visual feedback: correct (green) / wrong (red) with brief pause
6. 120s timed session, speed bonus + streak multiplier scoring
7. End screen with score, back to hub

## Distractor Selection

For the correct word, find 3 distractors that look similar:

1. Compute Levenshtein distance to all words in dictionary
2. Pick from the closest matches (lowest edit distance, excluding exact match)
3. Fallback: same word length, shared prefix/suffix
4. Pre-compute distractor pools at build time or lazily at runtime with caching

## UI Changes

- Replace text input with 4-button grid (2x2 on mobile, horizontal on desktop)
- Remove "close match" / Levenshtein typing logic
- Keep: timer, score, streak, language toggle, cue type label
- Add: correct/wrong color flash on buttons
- Buttons show the word options; clicking selects the answer

## SRS

Existing `vocab-srs.ts` Leitner box system unchanged. It tracks word strings, agnostic to data format.

## Files

- Create: `scripts/download-dictionaries.ts`
- Rewrite: `src/games/vocab.ts` (multiple choice, new data format, session building)
- Rewrite: `src/games/vocab.css` (button grid replacing text input)
- Update: `package.json` (new script)
- Update: `README.md` (reflect current app state)
- Update: `test/vocab-srs.test.ts`, create `test/words-json.test.ts`
- Delete: `public/words-en.json`, `public/words-no.json`
- Delete: `scripts/seeds/`, `scripts/generate-words.ts`

## Attribution

- Dictionary data: Wiktionary contributors, via kaikki.org/wiktextract
- License: CC-BY-SA 3.0 + GFDL
