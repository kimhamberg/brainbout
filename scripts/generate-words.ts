import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..");
const SEEDS_DIR = join(ROOT, "scripts", "seeds");
const PUBLIC_DIR = join(ROOT, "public");

const DELAY_MS = 200;

interface WordEntry {
  word: string;
  definition: string;
  example: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readSeedWords(filename: string): string[] {
  const text = readFileSync(join(SEEDS_DIR, filename), "utf-8");
  return text
    .split("\n")
    .map((w) => w.trim())
    .filter(Boolean);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// English – Free Dictionary API
// ---------------------------------------------------------------------------

async function fetchEnglish(word: string): Promise<WordEntry | null> {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = (await res.json()) as Array<{
    meanings: Array<{
      partOfSpeech: string;
      definitions: Array<{ definition: string; example?: string }>;
    }>;
  }>;

  let definition = "";
  let example = "";

  for (const entry of data) {
    for (const meaning of entry.meanings) {
      for (const def of meaning.definitions) {
        if (!definition && def.definition) {
          definition = def.definition;
        }
        if (!example && def.example) {
          example = def.example;
        }
        if (definition && example) break;
      }
      if (definition && example) break;
    }
    if (definition && example) break;
  }

  if (!definition) return null;

  return { word, definition, example };
}

// ---------------------------------------------------------------------------
// Norwegian – Ordbok API (GraphQL)
// ---------------------------------------------------------------------------

const NO_QUERY = `
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

interface OrdArticle {
  dictionary: string;
  wordClass: string;
  definitions: Array<{
    content: Array<{ textContent: string }>;
    examples: Array<{ textContent: string }>;
  }>;
}

interface OrdResponse {
  data: {
    suggestions: {
      exact: Array<{
        word: string;
        articles: OrdArticle[];
      }>;
    };
  };
}

async function fetchNorwegian(word: string): Promise<WordEntry | null> {
  const res = await fetch("https://api.ordbokapi.org/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: NO_QUERY, variables: { word } }),
  });

  if (!res.ok) return null;

  const json = (await res.json()) as OrdResponse;
  const exactMatches = json.data?.suggestions?.exact ?? [];

  // Collect all articles, preferring Bokmaalsordboka
  const articles: OrdArticle[] = [];
  for (const match of exactMatches) {
    for (const article of match.articles) {
      articles.push(article);
    }
  }

  // Sort so Bokmaalsordboka articles come first
  articles.sort((a, b) => {
    const aIsBm = a.dictionary === "Bokmaalsordboka" ? 0 : 1;
    const bIsBm = b.dictionary === "Bokmaalsordboka" ? 0 : 1;
    return aIsBm - bIsBm;
  });

  let definition = "";
  let example = "";

  for (const article of articles) {
    for (const def of article.definitions) {
      // Build definition text from content pieces
      const defText = def.content
        .map((c) => c.textContent)
        .filter(Boolean)
        .join("; ");

      // Skip meta-definitions (ending with ":")
      if (!defText || defText.endsWith(":")) continue;

      if (!definition) {
        definition = defText;
      }

      // Pick first example found
      if (!example) {
        for (const ex of def.examples) {
          if (ex.textContent) {
            example = ex.textContent;
            break;
          }
        }
      }

      if (definition && example) break;
    }
    if (definition && example) break;
  }

  if (!definition) return null;

  return { word, definition, example };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function processLanguage(
  lang: string,
  seedFile: string,
  fetcher: (word: string) => Promise<WordEntry | null>,
  outputFile: string,
): Promise<void> {
  const words = readSeedWords(seedFile);
  const results: WordEntry[] = [];
  let hits = 0;
  let misses = 0;

  console.log(`\n=== ${lang} (${words.length} words) ===\n`);

  for (const word of words) {
    const entry = await fetcher(word);
    if (entry) {
      hits++;
      const exLabel = entry.example ? "with example" : "no example";
      console.log(`  HIT  ${word} (${exLabel})`);
      results.push(entry);
    } else {
      misses++;
      console.log(`  MISS ${word}`);
    }
    await sleep(DELAY_MS);
  }

  const outPath = join(PUBLIC_DIR, outputFile);
  writeFileSync(outPath, JSON.stringify(results, null, 2) + "\n");
  console.log(
    `\n${lang}: ${hits} hits, ${misses} misses -> ${outPath}`,
  );
}

async function main(): Promise<void> {
  await processLanguage("English", "en.txt", fetchEnglish, "words-en.json");
  await processLanguage(
    "Norwegian",
    "no.txt",
    fetchNorwegian,
    "words-no.json",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
