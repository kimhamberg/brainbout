# API-Sourced Word Lists for Word Recall

## Problem

The current `words-en.json` and `words-no.json` are hand-curated static files with no authoritative source. We need definitions and examples sourced from official dictionary APIs to guarantee correctness.

## Design

### Pipeline

A **build-time TypeScript script** (`scripts/generate-words.ts`) that:

1. Reads seed word lists (plain string arrays) from `scripts/seeds/`
2. Fetches definitions + examples from official APIs
3. Writes `public/words-en.json` and `public/words-no.json`

The game continues to load static JSON at runtime — no live API calls.

### Simplified word entry format

```json
{
  "word": "ephemeral",
  "definition": "Lasting for a very short time",
  "example": "The ephemeral nature of fashion trends"
}
```

Dropped fields: `cloze`, `synonyms` (not reliably available from APIs).

### APIs

| Language  | API                                               | Endpoint                                                     | Auth |
| --------- | ------------------------------------------------- | ------------------------------------------------------------ | ---- |
| English   | [Free Dictionary API](https://dictionaryapi.dev/) | `GET https://api.dictionaryapi.dev/api/v2/entries/en/{word}` | None |
| Norwegian | [Ordbok API](https://github.com/ordbokapi/api)    | GraphQL at `https://api.ordbokapi.org/graphql`               | None |

### Seed word sources

- **English**: [wordnik/wordlist](https://github.com/wordnik/wordlist) (MIT) — filter to vocabulary-level words
- **Norwegian**: [Norsk ordbank](https://github.com/Ondkloss/norwegian-wordlist) (CC-BY 4.0) — filter to interesting vocabulary words

The existing 50 words per language serve as the initial seed lists. Over time, seeds can be expanded from the open-licensed word game lists above.

### Game code changes

- `WordEntry` interface: drop `cloze` and `synonyms`, add `example`
- `CueType`: keep `"definition"`, replace `"cloze"`/`"synonym"` with `"example"`
- Update `pickCue`, `getCueText`, `getCueLabel` accordingly
- Update SRS test if it references old fields

### Attribution

- Norwegian dictionary data: Spraakraadet and Universitetet i Bergen (via ordbokene.no)
- English dictionary data: Free Dictionary API (Wiktionary-sourced)
- Seed words (Norwegian): Norsk ordbank, National Library of Norway (CC-BY 4.0)
