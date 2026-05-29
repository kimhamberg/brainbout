import { expect, type Page, test } from "@playwright/test";

// Phase-2 + deferred polish: the Grove zone wakes dormant residents through a
// recall ramp — stage 1 MCQ (recognise) → stage 2 cloze → stage 3 typed — all
// behind the BlockOutcome seam, rendered with per-species hue-rotated templates.

interface GroveProbe {
  mode?: string;
  phase?: string;
  trial?: number;
  woke?: number;
  answer?: string;
}
interface GroveDone {
  points?: number;
  trials?: number;
  correct?: number;
  accuracy?: number;
  promotionAccuracy?: number;
  meta?: { mode?: string };
}

function probe(page: Page): Promise<GroveProbe | undefined> {
  return page.evaluate(
    () => (window as unknown as { __grove?: GroveProbe }).__grove,
  );
}
function done(page: Page): Promise<GroveDone | undefined> {
  return page.evaluate(
    () => (window as unknown as { __groveDone?: GroveDone }).__groveDone,
  );
}

// Wait until the named mode is mounted AND the first resident is rendered — the
// state object is published synchronously (answer still "") before the async
// createStage resolves, so gate on a non-empty answer to dodge that race.
async function waitMode(page: Page, mode: string): Promise<void> {
  await page.waitForFunction(
    (m) => {
      const g = (window as unknown as { __grove?: GroveProbe }).__grove;
      return (
        g?.mode === m && g.phase === "answering" && g.trial === 0 && !!g.answer
      );
    },
    mode,
    { timeout: 15_000 },
  );
}

function attachErrorSink(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

const DECK_SIZE = 5;

test("Grove MCQ (stage 1): wrong pick stays dormant (again) then RELEARNS this session", async ({
  page,
}) => {
  const errors = attachErrorSink(page);
  await page.goto("/games/verdant-grove.html", { waitUntil: "load" });
  await waitMode(page, "mcq"); // default stage

  // Miss the first resident, then answer everything correctly: the lapsed card
  // is re-queued and reappears later, so all 5 residents end woken (6 attempts).
  let i = 0;
  while (true) {
    const g = await probe(page);
    if (!g || g.phase === "done") break;
    if (i > 12) throw new Error("Grove MCQ session did not terminate");
    const rx = new RegExp(`^${g.answer ?? ""}$`, "u");
    if (i === 0) {
      await page
        .locator("#grove-options button", { hasNotText: rx })
        .first()
        .click();
      await expect(page.locator("#grove-reveal")).toHaveAttribute(
        "data-grade",
        "again",
      );
      await expect(page.locator("#grove-reveal")).toContainText("💤");
      expect((await probe(page))?.woke).toBe(0); // did NOT wake
      await page.screenshot({ path: "/tmp/grove-mcq.png" });
    } else {
      await page.locator("#grove-options button", { hasText: rx }).click();
      await expect(page.locator("#grove-reveal")).toHaveAttribute(
        "data-grade",
        "hard", // recognition grades below a typed "good"
      );
    }
    await page.locator("#grove-next").click();
    i++;
  }

  await expect(page.locator("#grove-summary")).toContainText("woke 5/5");
  const d = await done(page);
  expect(d?.correct).toBe(5); // every resident eventually woken
  expect(d?.trials).toBe(6); // 5 residents + 1 relearn retry of the miss
  expect(d?.points).toBe(10); // 5 woke × 2 (hard)
  expect(d?.meta?.mode).toBe("mcq");
  // 5 correct credits over 6 attempts — the miss honestly drags promotion down
  expect(d?.promotionAccuracy).toBeCloseTo(5 / 6, 5);
  expect(errors).toEqual([]);
});

test("Grove cloze (stage 2): masked first-letter hint, then typed completion", async ({
  page,
}) => {
  const errors = attachErrorSink(page);
  await page.goto("/games/verdant-grove.html", { waitUntil: "load" });
  await waitMode(page, "mcq");
  await page.locator("#grove-stage-2").click(); // aborts MCQ before any review → deck still fresh
  await waitMode(page, "cloze");

  // First resident: assert the EXACT cloze mask (first char + one dot/char),
  // proving the rest of the word is hidden — the cloze vs typed distinction.
  const first = (await probe(page))?.answer ?? "";
  const chars = [...first];
  const mask =
    chars.length >= 4
      ? `${chars[0] ?? ""}${"·".repeat(chars.length - 1)}`
      : "·".repeat(chars.length);
  await expect(page.locator("#grove-hint")).toHaveText(mask);

  const input = page.locator("#grove-input");
  for (let i = 0; i < DECK_SIZE; i++) {
    const answer = (await probe(page))?.answer ?? ""; // type the SHOWN resident
    await input.fill(answer);
    await input.press("Enter");
    await page.locator("#grove-next").click();
  }

  await expect(page.locator("#grove-summary")).toContainText("woke 5/5");
  const d = await done(page);
  expect(d?.meta?.mode).toBe("cloze");
  expect(d?.promotionAccuracy).toBeCloseTo(1, 5); // 5 exact answers → full credit
  expect(errors).toEqual([]);
});

test("Grove typed (stage 3): free production wakes; session completes cleanly", async ({
  page,
}) => {
  const errors = attachErrorSink(page);
  await page.goto("/games/verdant-grove.html", { waitUntil: "load" });
  await waitMode(page, "mcq");
  await page.locator("#grove-stage-3").click();
  await waitMode(page, "typed");

  const input = page.locator("#grove-input");
  for (let i = 0; i < DECK_SIZE; i++) {
    const answer = (await probe(page))?.answer ?? "";
    await input.fill(answer);
    await input.press("Enter"); // grade + reveal
    await expect(page.locator("#grove-reveal")).toContainText(answer);
    await expect(page.locator("#grove-reveal")).toHaveAttribute(
      "data-grade",
      "good",
    );
    if (i === 0) await page.screenshot({ path: "/tmp/grove-typed.png" });
    await page.locator("#grove-next").click();
  }

  await expect(page.locator("#grove-summary")).toContainText("woke 5/5");
  const d = await done(page);
  expect(d?.points).toBe(15); // 5 × 3 (good) — production scores above recognition
  expect(d?.meta?.mode).toBe("typed");
  expect(d?.promotionAccuracy).toBeCloseTo(1, 5); // 5 exact productions → full credit
  expect(errors).toEqual([]);
});
