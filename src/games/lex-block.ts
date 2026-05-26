import type { BlockFactory, BlockHandle, BlockOutcome } from "../engine/block";
import { defined } from "../shared/assert";
import { BASE } from "../shared/base";
import { todayString } from "../shared/progress";
import * as sound from "../shared/sounds";
import { boardLayout, letterValue, turnScore } from "./lex-board";
import {
  buildLayout,
  type Cell,
  type CellKey,
  type CrosswordLayout,
  cellKey,
  cellMap,
  cellsFor,
  type Placement,
} from "./lex-crossword";
import { buildQueue, shuffleArray } from "./lex-logic";
import {
  type Grade,
  getDueWords,
  getMasteredCount,
  getSeenWords,
  recordReview,
  suggestGradeFromTyping,
} from "./lex-srs";

interface DictEntry {
  word: string;
  pos: string;
  definition: string;
  example: string;
}

interface LexBlockMeta extends Record<string, unknown> {
  solved: number;
  totalPlacements: number;
  newlyMastered: number;
  totalScore: number;
}

const NEW_WORD_RATIO = 0.3;
const DEFAULT_SESSION_CAP = 30;

type Direction = "across" | "down";

export const createLexBlock: BlockFactory = (opts): BlockHandle => {
  const { container, onComplete } = opts;
  const sessionCap = opts.maxTrials ?? DEFAULT_SESSION_CAP;
  const startedAt = Date.now();
  const lang = "no";

  let dict: DictEntry[] = [];
  let dictByWord = new Map<string, DictEntry>();
  let allWords: string[] = [];

  let layout: CrosswordLayout = {
    rows: 0,
    cols: 0,
    placements: [],
    unplaced: [],
  };
  let cells = new Map<
    CellKey,
    { letter: string; wordIdxs: number[]; intersection: boolean }
  >();
  let solved = new Set<number>();
  let filledCells = new Set<CellKey>();
  let bonusQueue: DictEntry[] = [];

  let activePlacementIdx: number | null = null;
  let cursorX = 0;
  let cursorY = 0;
  let cursorDir: Direction = "across";
  let activeTyped = new Map<CellKey, string>();

  let activeBonus: DictEntry | null = null;
  let revealed = false;
  let suggestedGrade: Grade = "good";
  let inputLocked = false;
  let ended = false;

  let totalReviews = 0;
  let totalAgain = 0;
  let totalScore = 0;
  let streak = 0;
  let promptShownAt = 0;
  let masteredAtStart = 0;

  function finish(reason: BlockOutcome["endReason"]): void {
    if (ended) return;
    ended = true;
    container.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKeydown);
    const masteredNow = getMasteredCount(lang);
    const newlyMastered = Math.max(0, masteredNow - masteredAtStart);
    const correct = totalReviews - totalAgain;
    const accuracy = totalReviews === 0 ? 0 : correct / totalReviews;
    const meta: LexBlockMeta = {
      solved: solved.size,
      totalPlacements: layout.placements.length,
      newlyMastered,
      totalScore,
    };
    onComplete({
      kind: "lex",
      endReason: reason,
      trials: totalReviews,
      correct,
      points: totalScore,
      accuracy,
      durationMs: Date.now() - startedAt,
      meta,
    });
  }

  async function loadDict(): Promise<void> {
    const resp = await fetch(`${BASE}dict-${lang}.json`);
    dict = (await resp.json()) as DictEntry[];
    dictByWord = new Map(dict.map((e) => [e.word, e]));
    allWords = [...new Set(dict.map((d) => d.word))];
  }

  function buildSession(): void {
    const today = todayString();
    const seen = getSeenWords(lang);
    const due = new Set(getDueWords(lang, allWords, today));
    const queue = buildQueue(
      dict,
      seen,
      due,
      sessionCap,
      NEW_WORD_RATIO,
      shuffleArray,
    );
    layout = buildLayout(
      queue.map((e) => ({ clue: e.definition, answer: e.word })),
    );
    cells = cellMap(layout.placements);
    solved = new Set();
    filledCells = new Set();
    activeTyped = new Map();
    bonusQueue = layout.unplaced
      .map((u) => dictByWord.get(u.answer))
      .filter((e): e is DictEntry => e !== undefined);
  }

  function activePlacement(): Placement | null {
    if (activePlacementIdx === null) return null;
    return layout.placements[activePlacementIdx] ?? null;
  }

  function activeCellsList(): Cell[] {
    const p = activePlacement();
    return p ? cellsFor(p) : [];
  }

  function activeCellIndex(): number {
    const list = activeCellsList();
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c && c.x === cursorX && c.y === cursorY) return i;
    }
    return -1;
  }

  function typedString(): string {
    const list = activeCellsList();
    let s = "";
    for (const c of list) {
      s += activeTyped.get(cellKey(c.x, c.y)) ?? " ";
    }
    return s.trim();
  }

  function placementsAt(
    x: number,
    y: number,
  ): { placement: Placement; idx: number }[] {
    const out: { placement: Placement; idx: number }[] = [];
    for (let i = 0; i < layout.placements.length; i++) {
      const p = layout.placements[i];
      if (!p) continue;
      for (const c of cellsFor(p)) {
        if (c.x === x && c.y === y) {
          out.push({ placement: p, idx: i });
          break;
        }
      }
    }
    return out;
  }

  function activatePlacement(idx: number): void {
    if (solved.has(idx)) return;
    const p = layout.placements[idx];
    if (!p) return;
    activePlacementIdx = idx;
    activeBonus = null;
    cursorX = p.startx;
    cursorY = p.starty;
    cursorDir = p.orientation === "across" ? "across" : "down";
    activeTyped = new Map();
    revealed = false;
    inputLocked = false;
    promptShownAt = Date.now();
    renderPlay();
  }

  function activateCell(x: number, y: number): void {
    const hits = placementsAt(x, y).filter((h) => !solved.has(h.idx));
    if (hits.length === 0) return;
    let chosen = hits[0];
    if (
      activePlacementIdx !== null &&
      cursorX === x &&
      cursorY === y &&
      hits.length > 1
    ) {
      const otherDir: Direction = cursorDir === "across" ? "down" : "across";
      const flip = hits.find((h) => h.placement.orientation === otherDir);
      if (flip) chosen = flip;
    } else if (activePlacementIdx !== null) {
      const same = hits.find((h) => h.placement.orientation === cursorDir);
      if (same) chosen = same;
    }
    if (!chosen) return;
    if (chosen.idx !== activePlacementIdx) {
      activatePlacement(chosen.idx);
      cursorX = x;
      cursorY = y;
      renderPlay();
    } else {
      cursorX = x;
      cursorY = y;
      cursorDir = chosen.placement.orientation === "across" ? "across" : "down";
      renderPlay();
    }
  }

  function deactivate(): void {
    activePlacementIdx = null;
    activeBonus = null;
    activeTyped = new Map();
    revealed = false;
    inputLocked = false;
  }

  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function activeCellsKeySet(): Set<CellKey> {
    return new Set(activeCellsList().map((c) => cellKey(c.x, c.y)));
  }

  function gridBounds(): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const p of layout.placements) {
      for (const c of cellsFor(p)) {
        if (c.x < minX) minX = c.x;
        if (c.x > maxX) maxX = c.x;
        if (c.y < minY) minY = c.y;
        if (c.y > maxY) maxY = c.y;
      }
    }
    return { minX, maxX, minY, maxY };
  }

  function renderGrid(): string {
    if (layout.placements.length === 0) return "";
    const activeKeys = activeCellsKeySet();
    const cursorKey = cellKey(cursorX, cursorY);
    const html: string[] = [];
    const { minX, maxX, minY, maxY } = gridBounds();
    const width = maxX - minX + 1;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const k = cellKey(x, y);
        const info = cells.get(k);
        if (!info) {
          html.push(`<div class="xw-cell xw-blank"></div>`);
          continue;
        }
        const isActive = activeKeys.has(k);
        const isCursor = isActive && k === cursorKey;
        const isSolved = filledCells.has(k);
        const typed = activeTyped.get(k);
        const showLetter = isSolved || typed !== undefined;
        const correctType = typed !== undefined ? typed === info.letter : false;
        const classes = [
          "xw-cell",
          info.intersection ? "xw-cross" : "",
          isActive ? "xw-active" : "",
          isCursor ? "xw-cursor" : "",
          isSolved ? "xw-solved" : "",
          typed !== undefined && !isSolved
            ? correctType
              ? "xw-typing-correct"
              : "xw-typing-wrong"
            : "",
        ]
          .filter(Boolean)
          .join(" ");
        let num = "";
        for (let i = 0; i < layout.placements.length; i++) {
          const p = layout.placements[i];
          if (p && p.startx === x && p.starty === y) {
            num = `<span class="xw-num">${String(p.position)}</span>`;
            break;
          }
        }
        const letter = showLetter ? (typed ?? info.letter).toUpperCase() : "";
        const val = `<span class="xw-val">${String(letterValue(info.letter))}</span>`;
        html.push(
          `<div class="${classes}" data-x="${String(x)}" data-y="${String(y)}">${num}<span class="xw-letter">${letter}</span>${val}</div>`,
        );
      }
    }
    return `<div class="xw-grid-wrap" tabindex="0" aria-label="Crossword grid"><div class="xw-grid" style="--xw-cols:${String(width)}">${html.join("")}</div></div>`;
  }

  function clueShort(p: Placement): string {
    return `${String(p.position)} (${String(p.answer.length)})`;
  }

  function renderClueColumn(dir: Direction, title: string): string {
    const items = layout.placements
      .map((p, idx) => ({ p, idx }))
      .filter(({ p }) => p.orientation === dir)
      .sort((a, b) => a.p.position - b.p.position)
      .map(({ p, idx }) => {
        const isSolved = solved.has(idx);
        const isActive = activePlacementIdx === idx;
        const cls = [
          "xw-clue",
          isSolved ? "xw-clue-solved" : "",
          isActive ? "xw-clue-active" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `<button class="${cls}" data-idx="${String(idx)}"><span class="xw-clue-tag">${clueShort(p)}</span><span class="xw-clue-text">${escapeHtml(p.clue)}</span></button>`;
      })
      .join("");
    return `<div class="xw-clue-col"><div class="xw-clue-head">${title}</div>${items}</div>`;
  }

  function renderClueList(): string {
    const across = renderClueColumn("across", "→ Across");
    const down = renderClueColumn("down", "↓ Down");
    const bonus =
      bonusQueue.length > 0
        ? `<div class="xw-clue-col"><div class="xw-clue-head xw-bonus-head">★ Bonus (${String(bonusQueue.length)})</div>${bonusQueue
            .map(
              (e, i) =>
                `<button class="xw-clue xw-clue-bonus" data-bonus="${String(i)}"><span class="xw-clue-tag">★</span><span class="xw-clue-text">${escapeHtml(e.definition)}</span></button>`,
            )
            .join("")}</div>`
        : "";
    return `<div class="xw-clues">${across}${down}${bonus}</div>`;
  }

  function renderHud(): string {
    return `
      <div class="hud">
        <div class="timer">${String(solved.size)}/${String(layout.placements.length)}</div>
        <div class="score-display">${String(totalScore)} pts</div>
        <div class="streak-display">streak ${String(streak)}</div>
      </div>`;
  }

  function renderActiveBar(): string {
    const p = activePlacement();
    if (!p) return "";
    const len = p.answer.length;
    return `
      <div class="xw-bar">
        <div class="xw-bar-tag">${String(p.position)} ${p.orientation === "across" ? "→" : "↓"} (${String(len)})</div>
        <div class="xw-bar-clue">${escapeHtml(p.clue)}</div>
        <button class="xw-bar-submit" id="xw-submit">↵ Submit</button>
      </div>`;
  }

  function renderPlay(): void {
    container.innerHTML = `
      ${renderHud()}
      ${renderActiveBar()}
      ${renderGrid()}
      ${renderClueList()}
      <input id="xw-capture" type="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" aria-label="Crossword keyboard capture" tabindex="-1" />
    `;
    focusCapture();
  }

  function focusCapture(): void {
    const el = container.querySelector<HTMLInputElement>("#xw-capture");
    el?.focus({ preventScroll: true });
  }

  function renderOverview(): void {
    deactivate();
    renderPlay();
  }

  function renderReveal(typed: string): void {
    const p = activePlacement();
    const target = p?.answer ?? activeBonus?.word ?? null;
    const definition = p?.clue ?? activeBonus?.definition ?? null;
    const example =
      p !== null
        ? (dictByWord.get(p.answer)?.example ?? null)
        : (activeBonus?.example ?? null);
    if (target === null || definition === null) return;
    const matched = typed.trim().toLowerCase() === target.toLowerCase();
    const previewScore = matched
      ? turnScore(
          target,
          boardLayout(target),
          streak + 1,
          Date.now() - promptShownAt,
        )
      : 0;
    const exHtml = example
      ? `<div class="cue-example">&ldquo;${escapeHtml(example)}&rdquo;</div>`
      : "";
    const tag = p
      ? `${String(p.position)} ${p.orientation === "across" ? "→" : "↓"}`
      : "★ bonus";
    container.innerHTML = `
      ${renderHud()}
      <div class="xw-reveal-card">
        <div class="xw-active-tag">${tag}</div>
        <div class="cue-text">${escapeHtml(definition)}</div>
        ${exHtml}
        ${matched ? `<div class="score-preview">+${String(previewScore)} pts</div>` : ""}
        <div class="reveal-answer ${matched ? "matched" : "missed"}">
          <span class="reveal-label">Answer</span>
          <span class="reveal-word">${escapeHtml(target)}</span>
        </div>
        ${typed.trim() ? `<div class="reveal-typed">You typed: <em>${escapeHtml(typed.trim())}</em></div>` : ""}
        <div class="grade-buttons">
          <button class="grade-btn grade-again ${suggestedGrade === "again" ? "suggested" : ""}" data-grade="again">Again</button>
          <button class="grade-btn grade-hard ${suggestedGrade === "hard" ? "suggested" : ""}" data-grade="hard">Hard</button>
          <button class="grade-btn grade-good ${suggestedGrade === "good" ? "suggested" : ""}" data-grade="good">Good</button>
          <button class="grade-btn grade-easy ${suggestedGrade === "easy" ? "suggested" : ""}" data-grade="easy">Easy</button>
        </div>
        <div class="grade-hint">Suggested: <strong>${suggestedGrade}</strong> · 1/2/3/4</div>
      </div>
    `;
  }

  function moveCursor(delta: number): void {
    const list = activeCellsList();
    const i = activeCellIndex();
    if (i === -1) return;
    const next = Math.max(0, Math.min(list.length - 1, i + delta));
    const cell = list[next];
    if (!cell) return;
    cursorX = cell.x;
    cursorY = cell.y;
  }

  function typeLetter(letter: string): void {
    if (activePlacementIdx === null) return;
    const lower = letter.toLowerCase();
    activeTyped.set(cellKey(cursorX, cursorY), lower);
    moveCursor(+1);
    renderPlay();
  }

  function handleBackspace(): void {
    if (activePlacementIdx === null) return;
    const here = cellKey(cursorX, cursorY);
    if (activeTyped.has(here)) {
      activeTyped.delete(here);
    } else {
      moveCursor(-1);
      activeTyped.delete(cellKey(cursorX, cursorY));
    }
    renderPlay();
  }

  function handleArrow(key: string): void {
    if (activePlacementIdx === null) return;
    const along =
      (cursorDir === "across" &&
        (key === "ArrowLeft" || key === "ArrowRight")) ||
      (cursorDir === "down" && (key === "ArrowUp" || key === "ArrowDown"));
    if (along) {
      moveCursor(key === "ArrowRight" || key === "ArrowDown" ? +1 : -1);
      renderPlay();
      return;
    }
    const otherDir: Direction = cursorDir === "across" ? "down" : "across";
    const hit = placementsAt(cursorX, cursorY).find(
      (h) => h.placement.orientation === otherDir && !solved.has(h.idx),
    );
    if (hit) activatePlacement(hit.idx);
  }

  function handleTab(): void {
    if (layout.placements.length === 0) return;
    const start = activePlacementIdx ?? -1;
    for (let i = 1; i <= layout.placements.length; i++) {
      const next = (start + i) % layout.placements.length;
      if (!solved.has(next)) {
        activatePlacement(next);
        return;
      }
    }
  }

  function submit(): void {
    if (revealed) return;
    const target = activePlacement()?.answer ?? activeBonus?.word ?? null;
    if (target === null) return;
    revealed = true;
    const typed = typedString();
    suggestedGrade = suggestGradeFromTyping(typed, target);
    renderReveal(typed);
  }

  function pickBonus(i: number): void {
    const entry = bonusQueue[i];
    if (!entry) return;
    activeBonus = entry;
    activePlacementIdx = null;
    revealed = false;
    inputLocked = false;
    promptShownAt = Date.now();
    renderBonusPrompt("");
  }

  function renderBonusPrompt(typed: string): void {
    if (!activeBonus) return;
    container.innerHTML = `
      ${renderHud()}
      <div class="xw-bonus-card">
        <div class="xw-active-tag">★ bonus (${String(activeBonus.word.length)})</div>
        <div class="cue-text">${escapeHtml(activeBonus.definition)}</div>
        ${activeBonus.example ? `<div class="cue-example">&ldquo;${escapeHtml(activeBonus.example)}&rdquo;</div>` : ""}
        <div class="cloze-input-wrap">
          <input class="cloze-input" id="bonus-input" type="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Type the word…" value="${escapeHtml(typed)}" />
        </div>
        <div class="xw-prompt-actions">
          <button class="xw-back" id="xw-back-btn">← clues</button>
          <button class="xw-bar-submit" id="bonus-submit">↵ Submit</button>
        </div>
      </div>
    `;
    const input = container.querySelector<HTMLInputElement>("#bonus-input");
    input?.focus();
    input?.setSelectionRange(typed.length, typed.length);
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitBonus(input.value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        renderOverview();
      }
    });
  }

  function submitBonus(typed: string): void {
    if (revealed) return;
    if (!activeBonus) return;
    revealed = true;
    suggestedGrade = suggestGradeFromTyping(typed, activeBonus.word);
    renderReveal(typed);
  }

  function applyGrade(grade: Grade): void {
    if (ended || inputLocked) return;
    if (!revealed) submit();
    const target = activePlacement()?.answer ?? activeBonus?.word ?? null;
    if (target === null) return;
    inputLocked = true;
    recordReview(lang, target, grade, todayString());
    totalReviews++;
    if (grade === "again") {
      totalAgain++;
      streak = 0;
      sound.playWrong();
    } else {
      streak++;
      const earned = turnScore(
        target,
        boardLayout(target),
        streak,
        Date.now() - promptShownAt,
      );
      totalScore += earned;
      sound.playCorrect();
      if (activePlacementIdx !== null) {
        solved.add(activePlacementIdx);
        const p = defined(layout.placements[activePlacementIdx]);
        for (const c of cellsFor(p)) filledCells.add(cellKey(c.x, c.y));
      } else if (activeBonus) {
        const w = activeBonus.word;
        bonusQueue = bonusQueue.filter((e) => e.word !== w);
      }
    }
    setTimeout(
      () => {
        if (ended) return;
        if (
          solved.size === layout.placements.length &&
          bonusQueue.length === 0
        ) {
          finish("completed");
          return;
        }
        renderOverview();
      },
      grade === "again" ? 700 : 500,
    );
  }

  function onClick(e: Event): void {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLElement>("button");
    if (btn) {
      if (btn.classList.contains("grade-btn")) {
        const grade = btn.dataset.grade as Grade | undefined;
        if (grade) applyGrade(grade);
      } else if (btn.classList.contains("xw-clue")) {
        if (btn.dataset.idx !== undefined) {
          activatePlacement(Number(btn.dataset.idx));
        } else if (btn.dataset.bonus !== undefined) {
          pickBonus(Number(btn.dataset.bonus));
        }
      } else if (btn.id === "xw-back-btn") {
        renderOverview();
      } else if (btn.id === "xw-submit") {
        submit();
      } else if (btn.id === "bonus-submit") {
        const inp = container.querySelector<HTMLInputElement>("#bonus-input");
        submitBonus(inp?.value ?? "");
      }
      return;
    }
    const cell = target.closest<HTMLElement>(".xw-cell[data-x]");
    if (cell && cell.dataset.x !== undefined && cell.dataset.y !== undefined) {
      activateCell(Number(cell.dataset.x), Number(cell.dataset.y));
      focusCapture();
    }
  }

  function onKeydown(e: KeyboardEvent): void {
    if (ended) return;

    if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
      const map: Record<string, Grade> = {
        "1": "again",
        "2": "hard",
        "3": "good",
        "4": "easy",
      };
      e.preventDefault();
      applyGrade(map[e.key] as Grade);
      return;
    }
    if (revealed) return;

    if (activeBonus) return;

    if (activePlacementIdx === null) return;

    if (e.key === "Enter") {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      renderOverview();
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      handleBackspace();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      handleTab();
      return;
    }
    if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      handleArrow(e.key);
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      activateCell(cursorX, cursorY);
      return;
    }
    if (e.key.length === 1 && /^[a-zA-ZæøåÆØÅ]$/.test(e.key)) {
      e.preventDefault();
      typeLetter(e.key);
    }
  }

  async function start(): Promise<void> {
    await loadDict();
    if (ended) return;
    masteredAtStart = getMasteredCount(lang);
    buildSession();
    if (layout.placements.length === 0 && bonusQueue.length === 0) {
      finish("completed");
      return;
    }
    container.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeydown);
    const firstUnsolved = layout.placements.findIndex((_, i) => !solved.has(i));
    if (firstUnsolved >= 0) {
      activatePlacement(firstUnsolved);
    } else {
      renderOverview();
    }
  }

  void start();

  return {
    abort(): void {
      finish("aborted");
    },
  };
};
