import {
  createReadStream,
  createWriteStream,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import process from "node:process";

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
  /^alternative (form|spelling) of /iu,
  /^obsolete (form|spelling) of /iu,
  /^(plural|singular) of /iu,
  /^(past|present) (tense |participle )?of /iu,
  /^(comparative|superlative) of /iu,
  /^(diminutive|augmentative) of /iu,
  /^(feminine|masculine|neuter) of /iu,
  /^inflection of /iu,
  /^(misspelling|misconstruction) of /iu,
  /^(nonstandard|eye) dialect (form |spelling )?of /iu,
  /^(archaic|dated|rare) (form|spelling) of /iu,
  /^alternative (letter-case form|version) of /iu,
  /^(definite |indefinite )?(singular|plural) of /iu,
  /^supine of /iu,
  /^imperative of /iu,
  /^gerund of /iu,
  /^singular .+ form of /iu,
  /^form removed /iu,
  /^nonstandard spelling of /iu,
  /^(abbreviation|initialism|acronym) of /iu,
  /^clipping of /iu,
  /^contraction of /iu,
];

function isFormOf(sense: KaikkiSense): boolean {
  if (sense.tags?.includes("form-of")) { return true; }
  const gloss = sense.glosses?.[0] ?? "";
  return FORM_OF_GLOSS.some((p) => p.test(gloss));
}

function maskWord(text: string, word: string): string {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return text.replace(new RegExp(escaped, "giu"), "___");
}

async function download(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) {
    return;
  }
  const res = await fetch(url);
  if (!(res.ok && res.body)) {
    throw new Error(`Download failed: ${String(res.status)}`);
  }
  const nodeStream = Readable.fromWeb(
    res.body as import("stream/web").ReadableStream,
  );
  await pipeline(nodeStream, createWriteStream(dest));
}

async function processJsonl(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  const results: DictEntry[] = [];
  let total = 0;
  let _noSenses = 0;
  let _allFormOf = 0;
  let _kept = 0;

  const rl = createInterface({
    input: createReadStream(inputPath, "utf-8"),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  for await (const line of rl) {
    if (!line.trim()) { continue; }
    total++;

    let entry: KaikkiEntry;
    try {
      entry = JSON.parse(line) as KaikkiEntry;
    } catch {
      continue;
    }

    // Skip proper nouns, single-letter entries, symbols, and affixes
    if (
      [
        "name",
        "character",
        "symbol",
        "suffix",
        "prefix",
        "affix",
        "interfix",
      ].includes(entry.pos)
    ) {
      continue;
    }

    // Skip hyphenated fragments (affixes not caught by POS)
    if (entry.word.startsWith("-") || entry.word.endsWith("-")) {
      continue;
    }

    const senses = entry.senses ?? [];
    if (senses.length === 0) {
      _noSenses++;
      continue;
    }

    let bestSense: KaikkiSense | null = null;
    for (const sense of senses) {
      if (isFormOf(sense)) { continue; }
      if (!(sense.glosses?.length > 0&& sense.glosses[0])) { continue; }
      bestSense = sense;
      break;
    }

    if (!bestSense) {
      _allFormOf++;
      continue;
    }

    const definition = bestSense.glosses?.[0];

    // Skip definitions with Wiktionary editorial markers
    if (/\(to be confirmed\)|\(please verify\)/iu.test(definition)) {
      continue;
    }

    let example = "";
    if (bestSense.examples?.length > 0) {
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
    _kept++;

    if (total % 10_000 === 0) {
    }
  }

  const json = JSON.stringify(results);
  writeFileSync(outputPath, `${json}\n`);
  const _sizeMB = (Buffer.byteLength(json) / 1024 / 1024).toFixed(1);
}

async function main(): Promise<void> {
  if (!existsSync(CACHE_DIR)) { mkdirSync(CACHE_DIR, { recursive: true }); }

  const langs = [
    {
      name: "Norwegian Bokmal",
      url: "https://kaikki.org/dictionary/Norwegian%20Bokm%C3%A5l/kaikki.org-dictionary-NorwegianBokm%C3%A5l.jsonl",
      cache: "norwegian.jsonl",
      output: "dict-no.json",
    },
  ];

  for (const lang of langs) {
    const cached = join(CACHE_DIR, lang.cache);
    await download(lang.url, cached);
    await processJsonl(cached, join(PUBLIC_DIR, lang.output));
  }
}

main().catch((_err) => {
  process.exit(1);
});
