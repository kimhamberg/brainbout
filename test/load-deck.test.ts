import { describe, expect, test } from "bun:test";
import type { RawEntry } from "../src/content/deck";
import { loadVocabDeck } from "../src/content/load-deck";

function resp(ok: boolean, body: unknown, status = ok ? 200 : 404): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const RAW: RawEntry[] = [
  { word: "fugl", pos: "noun", definition: "a bird", example: "" },
  { word: "skog", pos: "noun", definition: "a forest", example: "" },
];

describe("loadVocabDeck", () => {
  test("fetches dict-<id>.json off the base and normalises it", async () => {
    let requested = "";
    const deck = await loadVocabDeck("no", {
      base: "/sub/",
      fetchImpl: ((url: string) => {
        requested = url;
        return Promise.resolve(resp(true, RAW));
      }) as unknown as typeof fetch,
    });
    expect(requested).toBe("/sub/dict-no.json");
    expect(deck.manifest.deckId).toBe("no");
    expect(deck.entries.map((e) => e.label)).toEqual(["fugl", "skog"]);
  });

  test("throws on a non-OK response", async () => {
    let err: unknown;
    try {
      await loadVocabDeck("no", {
        fetchImpl: (() =>
          Promise.resolve(resp(false, null))) as unknown as typeof fetch,
      });
    } catch (e) {
      err = e;
    }
    expect((err as Error | undefined)?.message).toMatch(/failed to load: 404/u);
  });

  test("throws when the payload is not an array", async () => {
    let err: unknown;
    try {
      await loadVocabDeck("no", {
        fetchImpl: (() =>
          Promise.resolve(
            resp(true, { not: "an array" }),
          )) as unknown as typeof fetch,
      });
    } catch (e) {
      err = e;
    }
    expect((err as Error | undefined)?.message).toMatch(/not a RawEntry\[\]/u);
  });
});
