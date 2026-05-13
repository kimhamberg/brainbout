import { describe, expect, it } from "bun:test";
import process from "node:process";
import fc from "fast-check";
import { chess960Backrank, chess960Fen } from "../src/chess960";
import {
  bpmToMs,
  createFluxState,
  DURATION,
  evaluateResponse,
  generateTrial,
  getMultiplier,
  getRuleLabels,
  getSessionAct,
  getStreakLabel,
  STAGE_PARAMS,
  updateAdaptation,
} from "../src/games/flux-engine";
import { levenshtein, maxTypos } from "../src/games/lex-srs";
import { defined } from "../src/shared/assert";
import { readiness, recordResult } from "../src/shared/stages";
import { eloToNodes } from "../src/shared/think-time";

const NUM_RUNS = Number(process.env["FAST_CHECK_NUM_RUNS"] ?? 200);
const cfg = { numRuns: NUM_RUNS } as const;

describe("property: chess960", () => {
  const ids = fc.integer({ min: 0, max: 959 });

  it("backrank length is always 8", () => {
    fc.assert(
      fc.property(ids, (id) => chess960Backrank(id).length === 8),
      cfg,
    );
  });

  it("backrank piece composition is RRKBBQNN", () => {
    fc.assert(
      fc.property(ids, (id) => {
        const counts: Record<string, number> = {};
        for (const p of chess960Backrank(id)) {
          counts[p] = (counts[p] ?? 0) + 1;
        }
        return (
          counts["R"] === 2 &&
          counts["K"] === 1 &&
          counts["B"] === 2 &&
          counts["Q"] === 1 &&
          counts["N"] === 2
        );
      }),
      cfg,
    );
  });

  it("king is strictly between the two rooks", () => {
    fc.assert(
      fc.property(ids, (id) => {
        const r = chess960Backrank(id);
        const rooks = r.flatMap((p, i) => (p === "R" ? [i] : []));
        const king = r.indexOf("K");
        return defined(rooks[0]) < king && king < defined(rooks[1]);
      }),
      cfg,
    );
  });

  it("bishops on opposite-colour squares", () => {
    fc.assert(
      fc.property(ids, (id) => {
        const r = chess960Backrank(id);
        const bishops = r.flatMap((p, i) => (p === "B" ? [i] : []));
        return defined(bishops[0]) % 2 !== defined(bishops[1]) % 2;
      }),
      cfg,
    );
  });

  it("fen has 6 space-separated fields and side to move w", () => {
    fc.assert(
      fc.property(ids, (id) => {
        const { fen } = chess960Fen(id);
        const fields = fen.split(" ");
        return fields.length === 6 && fields[1] === "w";
      }),
      cfg,
    );
  });

  it("position 518 == standard chess", () => {
    expect(chess960Backrank(518).join("")).toBe("RNBQKBNR");
  });
});

describe("property: lex-srs.levenshtein", () => {
  const s = fc.string({ maxLength: 12 });

  it("identity: d(a,a) === 0", () => {
    fc.assert(
      fc.property(s, (a) => levenshtein(a, a) === 0),
      cfg,
    );
  });

  it("symmetry: d(a,b) === d(b,a)", () => {
    fc.assert(
      fc.property(s, s, (a, b) => levenshtein(a, b) === levenshtein(b, a)),
      cfg,
    );
  });

  it("bounded below by length difference", () => {
    fc.assert(
      fc.property(
        s,
        s,
        (a, b) => levenshtein(a, b) >= Math.abs(a.length - b.length),
      ),
      cfg,
    );
  });

  it("bounded above by max length", () => {
    fc.assert(
      fc.property(
        s,
        s,
        (a, b) => levenshtein(a, b) <= Math.max(a.length, b.length),
      ),
      cfg,
    );
  });

  it("triangle inequality: d(a,c) <= d(a,b) + d(b,c)", () => {
    fc.assert(
      fc.property(
        s,
        s,
        s,
        (a, b, c) => levenshtein(a, c) <= levenshtein(a, b) + levenshtein(b, c),
      ),
      cfg,
    );
  });
});

describe("property: lex-srs.maxTypos", () => {
  it("never exceeds word length", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 }), (n) => maxTypos(n) <= n),
      cfg,
    );
  });

  it("monotonic non-decreasing in word length", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 49 }),
        (n) => maxTypos(n + 1) >= maxTypos(n),
      ),
      cfg,
    );
  });
});

describe("property: think-time.eloToNodes", () => {
  it("positive for any sane elo", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3500 }),
        (elo) => eloToNodes(elo) > 0,
      ),
      cfg,
    );
  });

  it("monotonic non-decreasing in elo", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3499 }),
        (elo) => eloToNodes(elo + 1) >= eloToNodes(elo),
      ),
      cfg,
    );
  });
});

describe("property: flux-engine helpers", () => {
  it("bpmToMs is positive and strictly decreasing", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 30, max: 240 }),
        (bpm) => bpmToMs(bpm) > 0 && bpmToMs(bpm) > bpmToMs(bpm + 1),
      ),
      cfg,
    );
  });

  it("getMultiplier is non-decreasing in streak", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 199 }),
        (s) => getMultiplier(s + 1) >= getMultiplier(s),
      ),
      cfg,
    );
  });

  it("getStreakLabel returns string for any non-negative streak", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        (s) => typeof getStreakLabel(s) === "string",
      ),
      cfg,
    );
  });

  it("getRuleLabels returns 2 non-empty labels; isNot swaps them", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("color", "shape", "size", "fill" as const),
        (rule) => {
          const [a, b] = getRuleLabels(rule, false);
          const [a2, b2] = getRuleLabels(rule, true);
          return (
            a.length > 0 && b.length > 0 && a !== b && a === b2 && b === a2
          );
        },
      ),
      cfg,
    );
  });

  it("getSessionAct partitions [0, DURATION] into warmup/flow/climax", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: DURATION }), (r) => {
        const a = getSessionAct(r);
        return a === "warmup" || a === "flow" || a === "climax";
      }),
      cfg,
    );
  });
});

describe("property: flux-engine state invariants", () => {
  const stage = fc.integer({ min: 0, max: STAGE_PARAMS.length - 1 });
  const outcomes = fc.array(fc.boolean(), { minLength: 1, maxLength: 200 });

  it("updateAdaptation keeps bpm within [baseBpm, floorBpm]", () => {
    fc.assert(
      fc.property(stage, outcomes, (stg, results) => {
        const p = defined(STAGE_PARAMS[stg]);
        const st = createFluxState(stg);
        for (const r of results) {
          updateAdaptation(st, r);
        }
        return st.bpm >= p.baseBpm && st.bpm <= p.floorBpm;
      }),
      cfg,
    );
  });

  it("streak resets on incorrect; peakStreak monotonic", () => {
    fc.assert(
      fc.property(stage, outcomes, (stg, results) => {
        const st = createFluxState(stg);
        let prevPeak = 0;
        for (const r of results) {
          updateAdaptation(st, r);
          if (st.peakStreak < prevPeak) {
            return false;
          }
          prevPeak = st.peakStreak;
          if (!r && st.streak !== 0) {
            return false;
          }
        }
        return true;
      }),
      cfg,
    );
  });

  it("generateTrial produces shape with all properties set", () => {
    fc.assert(
      fc.property(stage, fc.integer({ min: 1, max: 50 }), (stg, n) => {
        const st = createFluxState(stg);
        for (let i = 0; i < n; i++) {
          const t = generateTrial(st);
          if (
            !(t.color && t.shape && t.size && t.fill) ||
            typeof t.isNoGo !== "boolean"
          ) {
            return false;
          }
        }
        return true;
      }),
      cfg,
    );
  });
});

describe("property: flux-engine.evaluateResponse", () => {
  it("no-go: pressing always fails", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("left", "right" as const),
        fc.integer({ min: 0, max: 50 }),
        (side, streak) => {
          const trial = {
            color: "red" as const,
            shape: "circle" as const,
            size: "big" as const,
            fill: "solid" as const,
            isNoGo: true,
            isGolden: false,
          };
          return !evaluateResponse(trial, "color", false, streak, side).correct;
        },
      ),
      cfg,
    );
  });

  it("no-go: not pressing always succeeds", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 }), (streak) => {
        const trial = {
          color: "red" as const,
          shape: "circle" as const,
          size: "big" as const,
          fill: "solid" as const,
          isNoGo: true,
          isGolden: false,
        };
        return evaluateResponse(trial, "color", false, streak, null).correct;
      }),
      cfg,
    );
  });

  it("go trial timeout always fails", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("color", "shape", "size", "fill" as const),
        fc.boolean(),
        fc.integer({ min: 0, max: 50 }),
        (rule, isNot, streak) => {
          const trial = {
            color: "red" as const,
            shape: "circle" as const,
            size: "big" as const,
            fill: "solid" as const,
            isNoGo: false,
            isGolden: false,
          };
          return !evaluateResponse(trial, rule, isNot, streak, null).correct;
        },
      ),
      cfg,
    );
  });
});

describe("unit: stages edge cases", () => {
  it("readiness returns grey if corrupt JSON in storage", () => {
    localStorage.setItem("brainbout:stage:flux", "{not-json");
    expect(readiness("flux", 0.8)).toBe("grey");
    localStorage.clear();
  });

  it("readiness returns amber when avg is within 0.1 below threshold", () => {
    localStorage.clear();
    for (let i = 0; i < 5; i++) {
      recordResult("flux", 0.72);
    }
    expect(readiness("flux", 0.8)).toBe("amber");
    localStorage.clear();
  });

  it("readiness returns grey when avg is more than 0.1 below threshold", () => {
    localStorage.clear();
    for (let i = 0; i < 5; i++) {
      recordResult("flux", 0.5);
    }
    expect(readiness("flux", 0.8)).toBe("grey");
    localStorage.clear();
  });
});

describe("unit: assert.defined", () => {
  it("returns value when defined", () => {
    expect(defined(42)).toBe(42);
    expect(defined("x")).toBe("x");
    expect(defined(0)).toBe(0);
    expect(defined(null)).toBeNull();
  });

  it("throws on undefined with default message", () => {
    expect(() => defined(undefined)).toThrow("unexpected undefined");
  });

  it("throws on undefined with custom message", () => {
    expect(() => defined(undefined, "boom")).toThrow("boom");
  });
});
