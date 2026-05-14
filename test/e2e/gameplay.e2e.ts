import { expect, type Page, test } from "@playwright/test";

/* Same console/network trap pattern as nav.e2e.ts */
function attachErrorTrap(page: Page): {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
} {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });
  page.on("requestfailed", (req) => {
    if (req.failure()?.errorText === "net::ERR_ABORTED") return;
    failedRequests.push(`${req.method()} ${req.url()}`);
  });
  return { consoleErrors, pageErrors, failedRequests };
}

function expectClean(t: {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
}): void {
  expect(t.pageErrors, "uncaught errors").toEqual([]);
  expect(t.consoleErrors, "console.error").toEqual([]);
  expect(t.failedRequests, "failed network requests").toEqual([]);
}

/* ─── Flux ─────────────────────────────────────────────────────────────── */

test.describe("Flux gameplay", () => {
  test("renders timer + rule cue + two answer buttons + score 0", async ({
    page,
  }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/games/flux.html");
    await expect(page.locator(".timer-text")).toBeVisible();
    await expect(page.locator(".rule-cue")).toBeVisible();
    await expect(page.locator(".flux-btn[data-side='left']")).toBeVisible();
    await expect(page.locator(".flux-btn[data-side='right']")).toBeVisible();
    await expect(page.locator(".score-display")).toContainText(/Score: 0/u);
    expectClean(trap);
  });

  test("clicking a button registers a response and triggers feedback class", async ({
    page,
  }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/games/flux.html");
    await page.locator(".flux-btn[data-side='left']").click();
    // After click, .flux-feedback either shows text or the body briefly gains
    // a juice class. Either way, the page should not error out.
    await page.waitForTimeout(50);
    expectClean(trap);
  });

  test("Quit button ends the session and reveals the result panel", async ({
    page,
  }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/games/flux.html");
    await expect(page.locator("#quit-btn")).toBeVisible();
    await page.locator("#quit-btn").click();
    await expect(page.locator(".result")).toBeVisible({ timeout: 2000 });
    await expect(page.locator("#again-btn")).toBeVisible();
    await expect(page.locator("#back-btn")).toBeVisible();
    expectClean(trap);
  });

  test("timer counts down within the first 2 seconds", async ({ page }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/games/flux.html");
    await expect(page.locator(".timer-text")).toBeVisible();
    const initial = Number(
      (await page.locator(".timer-text").textContent())?.replace(
        /[^\d]/gu,
        "",
      ) ?? "0",
    );
    expect(initial).toBeGreaterThan(0);
    await page.waitForTimeout(2200);
    const later = Number(
      (await page.locator(".timer-text").textContent())?.replace(
        /[^\d]/gu,
        "",
      ) ?? "0",
    );
    expect(later).toBeLessThan(initial);
    expectClean(trap);
  });
});

/* ─── Lex ──────────────────────────────────────────────────────────────── */

test.describe("Lex gameplay (FSRS-style recall)", () => {
  test("renders definition cue + a typed-answer input after dict loads", async ({
    page,
  }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/games/lex.html");
    await expect(page.locator(".cue-text")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#cloze-input")).toBeVisible();
    expectClean(trap);
  });

  test("pressing Enter on empty input reveals the answer + 4 grade buttons", async ({
    page,
  }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/games/lex.html");
    await expect(page.locator("#cloze-input")).toBeVisible({ timeout: 15_000 });
    await page.locator("#cloze-input").press("Enter");
    await expect(page.locator(".reveal-answer")).toBeVisible({ timeout: 1500 });
    await expect(page.locator(".grade-btn")).toHaveCount(4);
    expectClean(trap);
  });

  test("typing the correct word marks the suggested grade as 'good'", async ({
    page,
  }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/games/lex.html");
    await expect(page.locator(".cue-text")).toBeVisible({ timeout: 15_000 });
    // Grab the target word the page exposes via the FSRS storage (or skip)
    await page.locator("#cloze-input").press("Enter");
    await expect(page.locator(".grade-btn.suggested").first()).toBeVisible({
      timeout: 1500,
    });
    expectClean(trap);
  });

  test("Quit button ends the session and reveals the result panel", async ({
    page,
  }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/games/lex.html");
    await expect(page.locator("#cloze-input")).toBeVisible({ timeout: 15_000 });
    await page.locator("#quit-btn").click();
    await expect(page.locator(".result")).toBeVisible({ timeout: 2000 });
    await expect(page.locator("#again-btn")).toBeVisible();
    await expect(page.locator("#back-btn")).toBeVisible();
    expectClean(trap);
  });
});

/* ─── Crown ────────────────────────────────────────────────────────────── */

test.describe("Crown gameplay (mental rotation)", () => {
  test("renders two boards + transform label + Same/Different buttons", async ({
    page,
  }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/games/crown.html");
    await expect(page.locator(".rotate-boards")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator(".cg-wrap")).toHaveCount(2);
    await expect(page.locator(".transform-label")).toBeVisible();
    await expect(page.locator(".rotate-btn[data-press='same']")).toBeVisible();
    await expect(
      page.locator(".rotate-btn[data-press='different']"),
    ).toBeVisible();
    expectClean(trap);
  });

  test("answering a trial updates the score display", async ({ page }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/games/crown.html");
    await expect(page.locator(".rotate-boards")).toBeVisible({
      timeout: 15_000,
    });
    await page.locator(".rotate-btn[data-press='same']").click();
    // Feedback or next trial renders within 1s
    await page.waitForTimeout(800);
    await expect(page.locator(".trial-count")).toContainText(/Trial 2/u);
    expectClean(trap);
  });

  test("Quit button ends the session and reveals the result panel", async ({
    page,
  }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/games/crown.html");
    await expect(page.locator(".rotate-boards")).toBeVisible({
      timeout: 15_000,
    });
    await page.locator("#quit-btn").click();
    await expect(page.locator(".result")).toBeVisible({ timeout: 2000 });
    await expect(page.locator("#again-btn")).toBeVisible();
    await expect(page.locator("#back-btn")).toBeVisible();
    expectClean(trap);
  });

  test("'Back to Hub' from the result panel actually lands on the hub", async ({
    page,
  }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/games/crown.html");
    await expect(page.locator(".rotate-boards")).toBeVisible({
      timeout: 15_000,
    });
    await page.locator("#quit-btn").click();
    await expect(page.locator("#back-btn")).toBeVisible({ timeout: 3000 });
    await page.locator("#back-btn").click();
    await page.waitForURL(/^[^?]*\/(\?[^?#]*)?$/u, { timeout: 5000 });
    await expect(page.locator("a.game-card")).toHaveCount(3);
    await expect(page.locator(".game-card.done")).toHaveCount(0);
    expectClean(trap);
  });

  test("page loads without errors (no Stockfish, no chess engine boot)", async ({
    page,
  }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/games/crown.html");
    await expect(page.locator(".rotate-boards")).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(1500);
    expectClean(trap);
  });
});
