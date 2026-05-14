import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  applyTransform,
  classifyResponse,
  fileRankToSquare,
  generatePieces,
  generateTrial,
  getStageParams,
  type Piece,
  perturbOnePiece,
  piecesToFen,
  renderResultHtml,
  STAGE_PARAMS,
  squareToFileRank,
  transformLabel,
  transformSquare,
} from "../src/games/crown-rotation";
import { resetRng, setRng } from "../src/shared/rng";

beforeEach(() => {
  setRng(() => 0.5);
});

// rng module is a singleton — reset after each test so pinned state cannot
// leak into other files sharing the same Bun process.
afterEach(() => {
  resetRng();
});

describe("square <-> file/rank round-trip", () => {
  test("a1 = 0, h1 = 7, a8 = 56, h8 = 63", () => {
    expect(fileRankToSquare(0, 0)).toBe(0);
    expect(fileRankToSquare(7, 0)).toBe(7);
    expect(fileRankToSquare(0, 7)).toBe(56);
    expect(fileRankToSquare(7, 7)).toBe(63);
  });
  test("round-trip for every square", () => {
    for (let sq = 0; sq < 64; sq++) {
      const { file, rank } = squareToFileRank(sq);
      expect(fileRankToSquare(file, rank)).toBe(sq);
    }
  });
});

describe("transformSquare", () => {
  test("rot180 is its own inverse", () => {
    for (let sq = 0; sq < 64; sq++) {
      expect(transformSquare(transformSquare(sq, "rot180"), "rot180")).toBe(sq);
    }
  });
  test("rot90 applied 4× is identity", () => {
    for (let sq = 0; sq < 64; sq++) {
      let s = sq;
      for (let i = 0; i < 4; i++) s = transformSquare(s, "rot90");
      expect(s).toBe(sq);
    }
  });
  test("rot270 is inverse of rot90", () => {
    for (let sq = 0; sq < 64; sq++) {
      expect(transformSquare(transformSquare(sq, "rot90"), "rot270")).toBe(sq);
    }
  });
  test("mirrorV is its own inverse", () => {
    for (let sq = 0; sq < 64; sq++) {
      expect(transformSquare(transformSquare(sq, "mirrorV"), "mirrorV")).toBe(
        sq,
      );
    }
  });
  test("mirrorH is its own inverse", () => {
    for (let sq = 0; sq < 64; sq++) {
      expect(transformSquare(transformSquare(sq, "mirrorH"), "mirrorH")).toBe(
        sq,
      );
    }
  });
  test("rot90 ∘ rot90 == rot180 (composition)", () => {
    for (let sq = 0; sq < 64; sq++) {
      expect(transformSquare(transformSquare(sq, "rot90"), "rot90")).toBe(
        transformSquare(sq, "rot180"),
      );
    }
  });
  test("transforms are bijections (every output unique)", () => {
    const ts = ["rot90", "rot180", "rot270", "mirrorV", "mirrorH"] as const;
    for (const t of ts) {
      const out = new Set<number>();
      for (let sq = 0; sq < 64; sq++) out.add(transformSquare(sq, t));
      expect(out.size).toBe(64);
    }
  });
  test("rot180 of a1 (0) is h8 (63)", () => {
    expect(transformSquare(0, "rot180")).toBe(63);
  });
  test("mirrorV swaps a-file with h-file at same rank", () => {
    expect(transformSquare(0, "mirrorV")).toBe(7); // a1 → h1
    expect(transformSquare(56, "mirrorV")).toBe(63); // a8 → h8
  });
});

describe("applyTransform", () => {
  test("preserves piece roles + colors", () => {
    const pieces: Piece[] = [
      { sq: 0, role: "k", color: "w" },
      { sq: 63, role: "n", color: "b" },
    ];
    const out = applyTransform(pieces, "rot180");
    expect(out).toHaveLength(2);
    expect(out[0]?.role).toBe("k");
    expect(out[0]?.color).toBe("w");
    expect(out[1]?.role).toBe("n");
    expect(out[1]?.color).toBe("b");
  });
  test("rot180 swaps a1 ↔ h8", () => {
    const out = applyTransform([{ sq: 0, role: "p", color: "w" }], "rot180");
    expect(out[0]?.sq).toBe(63);
  });
});

describe("STAGE_PARAMS curriculum", () => {
  test("piece-count grows monotonically across stages", () => {
    expect(STAGE_PARAMS[1]!.pieceMax).toBeLessThan(STAGE_PARAMS[2]!.pieceMin);
    expect(STAGE_PARAMS[2]!.pieceMax).toBeLessThan(STAGE_PARAMS[3]!.pieceMin);
  });
  test("transform set grows monotonically across stages", () => {
    expect(STAGE_PARAMS[1]!.transforms.length).toBeLessThan(
      STAGE_PARAMS[2]!.transforms.length,
    );
    expect(STAGE_PARAMS[2]!.transforms.length).toBeLessThan(
      STAGE_PARAMS[3]!.transforms.length,
    );
  });
  test("stage 1 is rot180-only (beginner-friendly entry point)", () => {
    expect(STAGE_PARAMS[1]!.transforms).toEqual(["rot180"]);
  });
  test("stage 3 includes mirror transforms", () => {
    expect(STAGE_PARAMS[3]!.transforms).toContain("mirrorV");
    expect(STAGE_PARAMS[3]!.transforms).toContain("mirrorH");
  });
  test("differentRate is 0.5 at every stage (balanced same/different)", () => {
    for (const s of [1, 2, 3]) {
      expect(STAGE_PARAMS[s]!.differentRate).toBe(0.5);
    }
  });
  test("getStageParams: out-of-range falls back to stage 1", () => {
    expect(getStageParams(0)).toBe(STAGE_PARAMS[1]!);
    expect(getStageParams(99)).toBe(STAGE_PARAMS[1]!);
  });
});

describe("generatePieces", () => {
  test("returns the requested count", () => {
    const out = generatePieces(7);
    expect(out).toHaveLength(7);
  });
  test("all squares are distinct (no piece overlap)", () => {
    const out = generatePieces(12);
    const squares = new Set(out.map((p) => p.sq));
    expect(squares.size).toBe(out.length);
  });
  test("0 pieces returns empty array", () => {
    expect(generatePieces(0)).toEqual([]);
  });
});

describe("perturbOnePiece", () => {
  test("moves exactly one piece to a free square", () => {
    const pieces: Piece[] = [
      { sq: 0, role: "p", color: "w" },
      { sq: 5, role: "n", color: "w" },
      { sq: 10, role: "r", color: "b" },
    ];
    const out = perturbOnePiece(pieces, () => 0.6);
    const diff = out.filter((p, i) => p.sq !== pieces[i]!.sq);
    expect(diff).toHaveLength(1);
  });
  test("the perturbed square is not already occupied", () => {
    const pieces: Piece[] = [
      { sq: 0, role: "p", color: "w" },
      { sq: 1, role: "p", color: "b" },
    ];
    const out = perturbOnePiece(pieces, () => 0.5);
    expect(new Set(out.map((p) => p.sq)).size).toBe(out.length);
  });
  test("empty input returns empty output (no crash)", () => {
    expect(perturbOnePiece([])).toEqual([]);
  });
});

describe("generateTrial", () => {
  test("'same' trial: b is exactly applyTransform(a)", () => {
    // rng() = 0.0 → differentRate (0.5) check fails → kind = same
    setRng(() => 0);
    const trial = generateTrial(1);
    expect(trial.kind).toBe("same");
    expect(trial.b).toEqual(applyTransform(trial.a, trial.transform));
  });
  test("'different' trial: b differs from applyTransform(a) by one square", () => {
    // Make the differentRate check pass (rng() = 0.9 > 0.5)
    setRng(() => 0.9);
    const trial = generateTrial(1);
    expect(trial.kind).toBe("different");
    const expected = applyTransform(trial.a, trial.transform);
    const diff = trial.b.filter((p, i) => p.sq !== expected[i]?.sq);
    expect(diff.length).toBeGreaterThanOrEqual(1);
  });
  test("piece count respects stage's pieceMin..pieceMax", () => {
    for (const stage of [1, 2, 3]) {
      const params = STAGE_PARAMS[stage]!;
      for (const r of [0, 0.1, 0.5, 0.9]) {
        setRng(() => r);
        const trial = generateTrial(stage);
        expect(trial.a.length).toBeGreaterThanOrEqual(params.pieceMin);
        expect(trial.a.length).toBeLessThanOrEqual(params.pieceMax);
      }
    }
  });
  test("transform is drawn from the stage's allowed set", () => {
    for (const stage of [1, 2, 3]) {
      const allowed = new Set(STAGE_PARAMS[stage]!.transforms);
      for (const r of [0, 0.1, 0.3, 0.5, 0.7, 0.9]) {
        setRng(() => r);
        expect(allowed.has(generateTrial(stage).transform)).toBe(true);
      }
    }
  });
});

describe("classifyResponse", () => {
  test("returns correct=true on matching press", () => {
    setRng(() => 0);
    const trial = generateTrial(1);
    expect(classifyResponse(trial, trial.kind).correct).toBe(true);
  });
  test("returns correct=false on opposite press", () => {
    setRng(() => 0);
    const trial = generateTrial(1);
    const opposite = trial.kind === "same" ? "different" : "same";
    expect(classifyResponse(trial, opposite).correct).toBe(false);
  });
});

describe("piecesToFen", () => {
  test("empty board renders as 8/8/8/8/8/8/8/8", () => {
    expect(piecesToFen([])).toBe("8/8/8/8/8/8/8/8 w - - 0 1");
  });
  test("white king on a1, black king on h8 → standard corners FEN", () => {
    const fen = piecesToFen([
      { sq: 0, role: "k", color: "w" },
      { sq: 63, role: "k", color: "b" },
    ]);
    expect(fen).toBe("7k/8/8/8/8/8/8/K7 w - - 0 1");
  });
  test("uppercase = white, lowercase = black", () => {
    const fen = piecesToFen([{ sq: 0, role: "n", color: "w" }]);
    expect(fen).toContain("N");
    const fen2 = piecesToFen([{ sq: 0, role: "n", color: "b" }]);
    expect(fen2).toContain("n");
  });
  test("multiple pieces and empty runs are encoded correctly", () => {
    // a1 = white pawn, c1 = black pawn → rank-1 string is "P1p5"
    const fen = piecesToFen([
      { sq: 0, role: "p", color: "w" },
      { sq: 2, role: "p", color: "b" },
    ]);
    expect(fen).toBe("8/8/8/8/8/8/8/P1p5 w - - 0 1");
  });
});

describe("transformLabel", () => {
  test("emits human-readable label for each transform", () => {
    expect(transformLabel("rot90")).toMatch(/90/u);
    expect(transformLabel("rot180")).toMatch(/180/u);
    expect(transformLabel("rot270")).toMatch(/270/u);
    expect(transformLabel("mirrorV")).toMatch(/mirror/iu);
    expect(transformLabel("mirrorH")).toMatch(/mirror/iu);
  });
});

describe("STAGE_PARAMS exact membership", () => {
  test("stage 2 transforms are rot90/180/270 in exact order", () => {
    expect(STAGE_PARAMS[2]!.transforms).toEqual(["rot90", "rot180", "rot270"]);
  });
  test("stage 3 transforms are exactly 5 rotations + mirrors", () => {
    expect(STAGE_PARAMS[3]!.transforms).toEqual([
      "rot90",
      "rot180",
      "rot270",
      "mirrorV",
      "mirrorH",
    ]);
  });
});

describe("generatePieces literal role/color selection", () => {
  test("rng=0 produces white queen (ROLES[0]='q', COLORS[0]='w')", () => {
    const out = generatePieces(1, () => 0);
    expect(out[0]?.role).toBe("q");
    expect(out[0]?.color).toBe("w");
  });
  test("rng=0.6 produces a black piece (COLORS[1]='b')", () => {
    const out = generatePieces(1, () => 0.6);
    expect(out[0]?.color).toBe("b");
  });
});

describe("perturbOnePiece probe semantics", () => {
  test("rng selects an occupied square → probes forward to next free", () => {
    // sq 0 and 1 occupied; rng=0 → initial pick 0, probe +1 → 1 (occupied),
    // probe +1 → 2 (free). idx=0 → first piece moved from 0 to 2.
    const out = perturbOnePiece(
      [
        { sq: 0, role: "p", color: "w" },
        { sq: 1, role: "p", color: "b" },
      ],
      () => 0,
    );
    expect(out[0]?.sq).toBe(2);
    expect(out[1]?.sq).toBe(1);
  });
  test("moved piece is at a different square than its origin", () => {
    const pieces: Piece[] = [
      { sq: 0, role: "p", color: "w" },
      { sq: 1, role: "p", color: "b" },
    ];
    const out = perturbOnePiece(pieces, () => 0);
    const diff = out.filter((p, i) => p.sq !== pieces[i]!.sq);
    expect(diff).toHaveLength(1);
  });
});

describe("piecesToFen role chars", () => {
  test("white queen renders as 'Q'", () => {
    expect(piecesToFen([{ sq: 0, role: "q", color: "w" }])).toContain("Q");
  });
  test("black queen renders as 'q'", () => {
    expect(piecesToFen([{ sq: 0, role: "q", color: "b" }])).toContain("q");
  });
});

describe("ROLES distribution", () => {
  test("each ROLES index produces the expected role char", () => {
    // ROLES = ["q","r","b","n","p","p","p"] — pickInt(rng, 7) = floor(rng*7).
    // Use rng = (i + 0.5) / 7 so floor lands exactly on index i.
    const cases: [number, "q" | "r" | "b" | "n" | "p"][] = [
      [0, "q"],
      [1, "r"],
      [2, "b"],
      [3, "n"],
      [4, "p"],
      [5, "p"],
      [6, "p"],
    ];
    for (const [i, expected] of cases) {
      const out = generatePieces(1, () => (i + 0.5) / 7);
      expect(out[0]?.role).toBe(expected);
    }
  });
});

describe("generatePieces probe direction", () => {
  test("linear probe steps +1 (not -1) when initial pick is occupied", () => {
    // rng=0 → every pickInt returns 0. First piece lands on sq 0.
    // Second iteration: initial pick = 0 (occupied) → probe must reach sq 1.
    // A -1 probe would yield 63 (-1 & 63), distinguishing the mutant.
    const out = generatePieces(2, () => 0);
    const squares = out.map((p) => p.sq).sort((a, b) => a - b);
    expect(squares).toEqual([0, 1]);
  });
});

describe("generateTrial pieceCount range hits both ends", () => {
  test("rng→0 yields pieceMin pieces (stage 1)", () => {
    setRng(() => 0);
    expect(generateTrial(1).a.length).toBe(STAGE_PARAMS[1]!.pieceMin);
  });
  test("rng→0.999 yields pieceMax pieces (stage 1) — kills `pieceMax-pieceMin-1`", () => {
    setRng(() => 0.999);
    expect(generateTrial(1).a.length).toBe(STAGE_PARAMS[1]!.pieceMax);
  });
});

describe("generateTrial differentRate boundary", () => {
  test("rng() = differentRate (0.5) → kind 'different' (>= boundary)", () => {
    // First call → piece-count, second → first sq pick, etc. With constant
    // rng = 0.5, the differentRate check `rng() >= 0.5` is true → "different".
    setRng(() => 0.5);
    expect(generateTrial(1).kind).toBe("different");
  });
});

describe("piecesToFen role chars: r and b", () => {
  test("rook (white) → 'R'", () => {
    expect(piecesToFen([{ sq: 0, role: "r", color: "w" }])).toContain("R");
  });
  test("rook (black) → 'r'", () => {
    expect(piecesToFen([{ sq: 0, role: "r", color: "b" }])).toContain("r");
  });
  test("bishop (white) → 'B'", () => {
    expect(piecesToFen([{ sq: 0, role: "b", color: "w" }])).toContain("B");
  });
  test("bishop (black) → 'b'", () => {
    expect(piecesToFen([{ sq: 0, role: "b", color: "b" }])).toContain("b");
  });
});

describe("transformLabel specific phrasing", () => {
  test("mirrorV says 'vertical'", () => {
    expect(transformLabel("mirrorV")).toBe("mirrored (vertical)");
  });
  test("mirrorH says 'horizontal'", () => {
    expect(transformLabel("mirrorH")).toBe("mirrored (horizontal)");
  });
});

describe("renderResultHtml", () => {
  const base = {
    finalScore: 100,
    correctTrials: 5,
    totalTrials: 10,
    avgResponseMs: 800,
    peakStreak: 4,
  };
  test("zero trials → 0% accuracy (avoids division by zero)", () => {
    expect(
      renderResultHtml({ ...base, correctTrials: 0, totalTrials: 0 }),
    ).toContain("0% accuracy");
  });
  test("computes accuracy as correct/total × 100", () => {
    expect(
      renderResultHtml({ ...base, correctTrials: 5, totalTrials: 10 }),
    ).toContain("50% accuracy");
  });
  test("exactly 1 trial uses singular 'trial' (no trailing s)", () => {
    expect(renderResultHtml({ ...base, totalTrials: 1 })).toContain("1 trial<");
  });
  test("> 1 trial uses plural 'trials'", () => {
    expect(renderResultHtml({ ...base, totalTrials: 2 })).toContain(
      "2 trials<",
    );
  });
});
