// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import {
  getStage,
  getHistory,
  recordResult,
  advance,
  retreat,
  readiness,
  MAX_STAGE,
} from "../src/shared/stages";

beforeEach(() => {
  localStorage.clear();
});

describe("getStage", () => {
  it("returns 1 for unknown game", () => {
    expect(getStage("flux")).toBe(1);
  });
});

describe("recordResult", () => {
  it("appends to history", () => {
    recordResult("flux", 0.85);
    recordResult("flux", 0.72);
    expect(getHistory("flux")).toEqual([0.85, 0.72]);
  });

  it("keeps only last 5 results", () => {
    for (let i = 0; i < 7; i++) {
      recordResult("flux", i * 0.1);
    }
    expect(getHistory("flux")).toHaveLength(5);
  });
});

describe("advance", () => {
  it("increments stage up to MAX_STAGE", () => {
    advance("flux");
    expect(getStage("flux")).toBe(2);
    advance("flux");
    expect(getStage("flux")).toBe(3);
    advance("flux");
    expect(getStage("flux")).toBe(MAX_STAGE);
  });

  it("clears history on advance", () => {
    recordResult("flux", 0.9);
    advance("flux");
    expect(getHistory("flux")).toEqual([]);
  });
});

describe("retreat", () => {
  it("decrements stage down to 1", () => {
    advance("flux");
    advance("flux");
    expect(getStage("flux")).toBe(3);
    retreat("flux");
    expect(getStage("flux")).toBe(2);
    retreat("flux");
    expect(getStage("flux")).toBe(1);
    retreat("flux");
    expect(getStage("flux")).toBe(1);
  });
});

describe("readiness", () => {
  it("returns grey with no history", () => {
    expect(readiness("flux", 0.8)).toBe("grey");
  });

  it("returns grey with insufficient history", () => {
    recordResult("flux", 0.9);
    recordResult("flux", 0.9);
    expect(readiness("flux", 0.8)).toBe("grey");
  });

  it("returns green when threshold met over 5 sessions", () => {
    for (let i = 0; i < 5; i++) recordResult("flux", 0.85);
    expect(readiness("flux", 0.8)).toBe("green");
  });

  it("returns amber when close to threshold", () => {
    recordResult("flux", 0.85);
    recordResult("flux", 0.85);
    recordResult("flux", 0.85);
    recordResult("flux", 0.65);
    recordResult("flux", 0.65);
    // avg = 0.77, below 0.8 but above 0.7
    expect(readiness("flux", 0.8)).toBe("amber");
  });

  it("returns grey at max stage", () => {
    advance("flux");
    advance("flux");
    for (let i = 0; i < 5; i++) recordResult("flux", 0.95);
    expect(readiness("flux", 0.8)).toBe("grey");
  });
});
