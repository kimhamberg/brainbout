# API-Sourced Word Lists Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Replace hand-curated word lists with definitions and examples fetched from official dictionary APIs at build time.

**Architecture:** A TypeScript build script reads seed word lists, fetches definitions + examples from Free Dictionary API (English) and Ordbok API (Norwegian), and writes static JSON files. The game code is simplified to use only `definition` and `example` cue types.

**Tech Stack:** TypeScript (tsx), Free Dictionary API (REST), Ordbok API (GraphQL), Vitest

---

### Task 1: Create seed word files

Extract the existing 50 words per language into plain-text seed files.

**Files:**
- Create: `scripts/seeds/en.txt`
- Create: `scripts/seeds/no.txt`

**Step 1: Create English seed file**

Extract words from `public/words-en.json` — one word per line, sorted alphabetically:

```
abrogate
acrimonious
ameliorate
capricious
cogent
contrite
didactic
diffident
enervate
ephemeral
equivocal
erudite
excoriate
garrulous
implacable
indefatigable
indigent
ineffable
inscrutable
intransigent
laconic
languid
limpid
lugubrious
magnanimous
mendacious
munificent
obstinate
obsequious
parsimonious
pellucid
penurious
perfunctory
pernicious
perspicacious
pragmatic
profligate
promulgate
propitious
pugnacious
querulous
quixotic
recalcitrant
sanguine
sycophant
taciturn
truculent
ubiquitous
vitriolic
vociferous
```

**Step 2: Create Norwegian seed file**

Extract words from `public/words-no.json` — one word per line, sorted alphabetically:

```
anstrengende
beklemmende
berettiget
betenkelig
etterrettelig
forkastelig
formildende
forbeholden
forsmedelig
fortrinnsvis
gjennomgripende
gjenstridig
graverende
iherdig
innbitt
medgjørlig
misunnelig
omhyggelig
opphøyet
overflod
overilt
prekær
prunkløs
påtrengende
redelig
ruvende
skjellsettende
snarrådig
stillferdig
storsinnet
tapper
tilforlatelig
tvetydig
uangripelig
ubestridelig
ubønnhørlig
ufravikelig
uforsonlig
ufortrøden
uforvarende
uhørt
undergrave
uoverkommelig
utilbørlig
utkrystallisere
utvetydig
vedvarende
vedholdende
veltalende
vemodig
```

**Step 3: Commit**

```bash
git add scripts/seeds/en.txt scripts/seeds/no.txt
git commit -m "feat: add seed word lists for EN and NO"
```

---

### Task 2: Write the word generation script

Build `scripts/generate-words.ts` that fetches from both APIs and writes JSON.

**Files:**
- Create: `scripts/generate-words.ts`

**Step 1: Write the script**

```typescript
import { readFileSync, writeFileSync } from "node:fs";

// --- Types ---

interface WordEntry {
  word: string;
  definition: string;
  example: string;
}

// --- Seed loading ---

function loadSeeds(path: string): string[] {
  return readFileSync(path, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// --- English: Free Dictionary API ---

interface FreeDictMeaning {
  partOfSpeech: string;
  definitions: { definition: string; example?: string }[];
}

async function fetchEnglish(word: string): Promise<WordEntry | null> {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    console.warn(`  [EN] MISS: ${word} (${String(resp.status)})`);
    return null;
  }
  const data = (await resp.json()) as { meanings: FreeDictMeaning[] }[];
  const entry = data[0];
  if (!entry?.meanings?.length) return null;

  let definition = "";
  let example = "";

  for (const meaning of entry.meanings) {
    for (const def of meaning.definitions) {
      if (!definition) definition = def.definition;
      if (!example && def.example) example = def.example;
    }
  }

  if (!definition) return null;
  return { word, definition, example };
}

// --- Norwegian: Ordbok API (GraphQL) ---

interface OrdbokResponse {
  data: {
    suggestions: {
      exact: {
        word: string;
        articles: {
          dictionary: string;
          wordClass: string;
          definitions: {
            content: { textContent: string }[];
            examples: { textContent: string }[];
          }[];
        }[];
      }[];
    };
  };
}

const ORDBOK_QUERY = `
  query ($word: String!) {
    suggestions(word: $word) {
      exact {
        word
        articles {
          dictionary
          wordClass
          definitions {
            content { textContent }
            examples { textContent }
          }
        }
      }
    }
  }
`;

async function fetchNorwegian(word: string): Promise<WordEntry | null> {
  const resp = await fetch("https://api.ordbokapi.org/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: ORDBOK_QUERY, variables: { word } }),
  });

  if (!resp.ok) {
    console.warn(`  [NO] MISS: ${word} (${String(resp.status)})`);
    return null;
  }

  const json = (await resp.json()) as OrdbokResponse;
  const exact = json.data?.suggestions?.exact;
  if (!exact?.length) {
    console.warn(`  [NO] MISS: ${word} (no exact match)`);
    return null;
  }

  // Prefer Bokmaalsordboka articles
  const articles = exact[0].articles;
  const bokmaal = articles.filter((a) => a.dictionary === "Bokmaalsordboka");
  const pool = bokmaal.length > 0 ? bokmaal : articles;

  let definition = "";
  let example = "";

  for (const article of pool) {
    for (const def of article.definitions) {
      const text = def.content.map((c) => c.textContent).join("; ");
      // Skip meta-entries like "brukt som adverb:"
      if (!definition && text && !text.endsWith(":")) definition = text;
      if (!example && def.examples.length > 0) {
        example = def.examples[0].textContent;
      }
    }
  }

  if (!definition) return null;
  return { word, definition, example };
}

// --- Main ---

async function generate(
  lang: "en" | "no",
  seedPath: string,
  outPath: string,
): Promise<void> {
  const seeds = loadSeeds(seedPath);
  console.log(`[${lang.toUpperCase()}] Fetching ${String(seeds.length)} words...`);

  const results: WordEntry[] = [];
  const missed: string[] = [];

  for (const word of seeds) {
    // Rate-limit: small delay between requests
    await new Promise((r) => setTimeout(r, 200));

    const entry =
      lang === "en" ? await fetchEnglish(word) : await fetchNorwegian(word);

    if (entry) {
      results.push(entry);
      const ex = entry.example ? " ✓ ex" : " ✗ no ex";
      console.log(`  ✓ ${word}${ex}`);
    } else {
      missed.push(word);
    }
  }

  writeFileSync(outPath, JSON.stringify(results, null, 2) + "\n");
  console.log(
    `[${lang.toUpperCase()}] Wrote ${String(results.length)}/${String(seeds.length)} words to ${outPath}`,
  );

  if (missed.length > 0) {
    console.warn(
      `[${lang.toUpperCase()}] Missed: ${missed.join(", ")}`,
    );
  }
}

await generate("en", "scripts/seeds/en.txt", "public/words-en.json");
await generate("no", "scripts/seeds/no.txt", "public/words-no.json");
```

**Step 2: Add npm script to `package.json`**

Add to the `"scripts"` section:

```json
"generate:words": "tsx scripts/generate-words.ts"
```

**Step 3: Run the script and verify output**

```bash
npm run generate:words
```

Expected: Script prints progress for each word, writes `public/words-en.json` and `public/words-no.json`. Some words may miss examples — that's OK.

Manually inspect the output files to confirm definitions look correct.

**Step 4: Commit**

```bash
git add scripts/generate-words.ts package.json public/words-en.json public/words-no.json
git commit -m "feat: generate word lists from dictionary APIs"
```

---

### Task 3: Update game code for new WordEntry format

Simplify `vocab.ts` to use `definition` | `example` cue types, dropping `cloze` and `synonym`.

**Files:**
- Modify: `src/games/vocab.ts:7-14` (interface + CueType)
- Modify: `src/games/vocab.ts:47-63` (pickCue, getCueText, getCueLabel)

**Step 1: Update `WordEntry` interface and `CueType`**

Replace lines 7-14 in `src/games/vocab.ts`:

```typescript
interface WordEntry {
  word: string;
  definition: string;
  example: string;
}

type CueType = "definition" | "example";
```

**Step 2: Update `pickCue`**

Replace `pickCue` (line 47-51):

```typescript
function pickCue(entry: WordEntry): CueType {
  if (entry.example) {
    const types: CueType[] = ["definition", "example"];
    return types[Math.floor(Math.random() * types.length)];
  }
  return "definition";
}
```

**Step 3: Update `getCueText`**

Replace `getCueText` (line 53-57):

```typescript
function getCueText(entry: WordEntry, cue: CueType): string {
  if (cue === "example") return entry.example;
  return entry.definition;
}
```

**Step 4: Update `getCueLabel`**

Replace `getCueLabel` (line 59-63):

```typescript
function getCueLabel(cue: CueType): string {
  if (cue === "example") return "Example";
  return "Definition";
}
```

**Step 5: Verify the app builds**

```bash
npx vite build
```

Expected: Build succeeds with no type errors.

**Step 6: Commit**

```bash
git add src/games/vocab.ts
git commit -m "refactor: simplify Word Recall to definition+example cues"
```

---

### Task 4: Update tests

The existing `test/vocab-srs.test.ts` tests the SRS module which does NOT reference `WordEntry` fields — it only deals with word strings. Verify tests still pass, and add a basic smoke test for the new JSON shape.

**Files:**
- Modify: `test/vocab-srs.test.ts` (verify existing tests pass)
- Create: `test/words-json.test.ts`

**Step 1: Run existing tests**

```bash
npx vitest run
```

Expected: All tests pass (SRS tests don't reference `cloze`/`synonyms`).

**Step 2: Write JSON shape validation test**

Create `test/words-json.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface WordEntry {
  word: string;
  definition: string;
  example: string;
}

function loadWords(lang: string): WordEntry[] {
  const path = resolve(__dirname, `../public/words-${lang}.json`);
  return JSON.parse(readFileSync(path, "utf-8")) as WordEntry[];
}

describe.each(["en", "no"])("words-%s.json", (lang) => {
  const words = loadWords(lang);

  it("has at least 30 entries", () => {
    expect(words.length).toBeGreaterThanOrEqual(30);
  });

  it("every entry has word and definition strings", () => {
    for (const entry of words) {
      expect(typeof entry.word).toBe("string");
      expect(entry.word.length).toBeGreaterThan(0);
      expect(typeof entry.definition).toBe("string");
      expect(entry.definition.length).toBeGreaterThan(0);
    }
  });

  it("every entry has example as a string (may be empty)", () => {
    for (const entry of words) {
      expect(typeof entry.example).toBe("string");
    }
  });

  it("has no duplicate words", () => {
    const wordSet = new Set(words.map((w) => w.word));
    expect(wordSet.size).toBe(words.length);
  });
});
```

**Step 3: Run tests**

```bash
npx vitest run
```

Expected: All tests pass, including the new JSON shape tests.

**Step 4: Commit**

```bash
git add test/words-json.test.ts
git commit -m "test: add word list JSON shape validation"
```

---

### Task 5: Final verification and cleanup

**Step 1: Run full lint + test + build**

```bash
npm run lint && npm test && npx vite build
```

Expected: All pass.

**Step 2: Manual smoke test**

```bash
npm run dev
```

Open the Word Recall game in browser. Verify:
- Definitions appear as cues
- Examples appear as cues (for words that have them)
- Typing the correct word works
- Score tracking works
- Language toggle (EN/NO) works

**Step 3: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: final cleanup for API-sourced word lists"
```
