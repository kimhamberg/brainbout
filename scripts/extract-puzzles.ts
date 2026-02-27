import { readFileSync, writeFileSync } from "fs";

interface Puzzle {
  fen: string;
  moves: string[];
  rating: number;
}

const TIERS = [
  { min: 800, max: 1200, count: 200 },
  { min: 1200, max: 1600, count: 200 },
  { min: 1600, max: 2000, count: 200 },
  { min: 2000, max: 2400, count: 200 },
  { min: 2400, max: 3000, count: 200 },
];

const csv = readFileSync(process.argv[2] ?? "lichess_db_puzzle.csv", "utf-8");
const lines = csv.split("\n").slice(1);

const byTier: Puzzle[][] = TIERS.map(() => []);

for (const line of lines) {
  if (!line.trim()) continue;
  const cols = line.split(",");
  const fen = cols[1];
  const moves = cols[2].split(" ");
  const rating = parseInt(cols[3], 10);
  const popularity = parseInt(cols[5], 10);

  if (popularity < 80 || moves.length < 2 || moves.length > 6) continue;

  for (let i = 0; i < TIERS.length; i++) {
    if (
      rating >= TIERS[i].min &&
      rating < TIERS[i].max &&
      byTier[i].length < TIERS[i].count
    ) {
      byTier[i].push({ fen, moves, rating });
      break;
    }
  }

  if (byTier.every((t, i) => t.length >= TIERS[i].count)) break;
}

const puzzles = byTier.flat();
writeFileSync("public/puzzles.json", JSON.stringify(puzzles));
console.log(`Extracted ${String(puzzles.length)} puzzles`);
for (let i = 0; i < TIERS.length; i++) {
  console.log(
    `  ${String(TIERS[i].min)}-${String(TIERS[i].max)}: ${String(byTier[i].length)}`,
  );
}
