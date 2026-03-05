import { createReadStream, createWriteStream, writeFileSync, existsSync, mkdirSync } from "fs";
import { createInterface } from "readline";
import { join } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

const ROOT = join(import.meta.dirname, "..");
const PUBLIC_DIR = join(ROOT, "public");
const CACHE_DIR = join(ROOT, ".dict-cache");

interface DictEntry {
  word: string;
  pos: string;
  definition: string;
  example: string;
}

interface KaikkiSense {
  glosses?: string[];
  tags?: string[];
  examples?: Array<{ text?: string }>;
}

interface KaikkiEntry {
  word: string;
  pos: string;
  lang_code: string;
  senses?: KaikkiSense[];
}

const FORM_OF_GLOSS = [
  /^alternative (form|spelling) of /i,
  /^obsolete (form|spelling) of /i,
  /^(plural|singular) of /i,
  /^(past|present) (tense |participle )?of /i,
  /^(comparative|superlative) of /i,
  /^(diminutive|augmentative) of /i,
  /^(feminine|masculine|neuter) of /i,
  /^inflection of /i,
  /^(misspelling|misconstruction) of /i,
  /^(nonstandard|eye) dialect (form |spelling )?of /i,
  /^(archaic|dated|rare) (form|spelling) of /i,
  /^alternative (letter-case form|version) of /i,
  /^(definite |indefinite )?(singular|plural) of /i,
  /^supine of /i,
  /^imperative of /i,
  /^gerund of /i,
  /^singular .+ form of /i,
  /^form removed /i,
  /^nonstandard spelling of /i,
  /^(abbreviation|initialism|acronym) of /i,
  /^clipping of /i,
  /^contraction of /i,
];

function isFormOf(sense: KaikkiSense): boolean {
  if (sense.tags?.includes("form-of")) return true;
  const gloss = sense.glosses?.[0] ?? "";
  return FORM_OF_GLOSS.some((p) => p.test(gloss));
}

function maskWord(text: string, word: string): string {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped, "gi"), "___");
}

async function download(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) {
    console.log(`  Cached: ${dest}`);
    return;
  }
  console.log(`  Downloading: ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed: ${String(res.status)}`);
  const nodeStream = Readable.fromWeb(res.body as import("stream/web").ReadableStream);
  await pipeline(nodeStream, createWriteStream(dest));
}

async function processJsonl(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  const results: DictEntry[] = [];
  let total = 0;
  let noSenses = 0;
  let allFormOf = 0;
  let kept = 0;

  const rl = createInterface({
    input: createReadStream(inputPath, "utf-8"),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    total++;

    let entry: KaikkiEntry;
    try {
      entry = JSON.parse(line) as KaikkiEntry;
    } catch {
      continue;
    }

    // Skip proper nouns, single-letter entries, and symbols
    if (entry.pos === "name" || entry.pos === "character" || entry.pos === "symbol") {
      continue;
    }

    const senses = entry.senses ?? [];
    if (senses.length === 0) {
      noSenses++;
      continue;
    }

    let bestSense: KaikkiSense | null = null;
    for (const sense of senses) {
      if (isFormOf(sense)) continue;
      if (!sense.glosses?.length || !sense.glosses[0]) continue;
      bestSense = sense;
      break;
    }

    if (!bestSense) {
      allFormOf++;
      continue;
    }

    const definition = bestSense.glosses![0];

    let example = "";
    if (bestSense.examples?.length) {
      for (const ex of bestSense.examples) {
        if (ex.text) {
          example = maskWord(ex.text, entry.word);
          break;
        }
      }
    }

    results.push({
      word: entry.word,
      pos: entry.pos,
      definition,
      example,
    });
    kept++;

    if (total % 10000 === 0) {
      console.log(`  ... ${total} parsed, ${kept} kept`);
    }
  }

  const json = JSON.stringify(results);
  writeFileSync(outputPath, json + "\n");
  const sizeMB = (Buffer.byteLength(json) / 1024 / 1024).toFixed(1);

  console.log(`\n  Results:`);
  console.log(`    Total parsed:  ${total}`);
  console.log(`    No senses:     ${noSenses}`);
  console.log(`    All form-of:   ${allFormOf}`);
  console.log(`    Kept:          ${kept}`);
  console.log(`    Output size:   ${sizeMB} MB`);
}

async function main(): Promise<void> {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

  const langs = [
    {
      name: "Norwegian Bokmal",
      url: "https://kaikki.org/dictionary/Norwegian%20Bokm%C3%A5l/kaikki.org-dictionary-NorwegianBokm%C3%A5l.jsonl",
      cache: "norwegian.jsonl",
      output: "dict-no.json",
    },
  ];

  for (const lang of langs) {
    console.log(`\n=== ${lang.name} ===`);
    const cached = join(CACHE_DIR, lang.cache);
    await download(lang.url, cached);
    await processJsonl(cached, join(PUBLIC_DIR, lang.output));
  }

  console.log("\nDone!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
