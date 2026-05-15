import { defined } from "../shared/assert";
import { BASE } from "../shared/base";
import { mountAppIcon, mountQuitButton } from "../shared/icons";
import { recordSessionScore, todayString } from "../shared/progress";
import * as sound from "../shared/sounds";
import { recordResult } from "../shared/stages";
import { initTheme, wireToggle } from "../shared/theme";
import { boardLayout, letterValue, turnScore } from "./lex-board";
import {
  buildLayout,
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
  getSeenWords,
  isMastered,
  recordReview,
  suggestGradeFromTyping,
} from "./lex-srs";

interface DictEntry {
  word: string;
  pos: string;
  definition: string;
  example: string;
}

const NEW_WORD_RATIO = 0.3;
const SESSION_CAP = 30; // smaller than before so the crossword stays legible

function getEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) {
    throw new Error(`Missing #${id} element`);
  }
  return el;
}
const game = getEl("game");

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
  ReturnType<typeof cellMap> extends Map<CellKey, infer V> ? V : never
>();
let solved = new Set<number>(); // placement indices that have been solved this session
let filledCells = new Set<CellKey>(); // cells uncovered by solved words
let bonusQueue: DictEntry[] = []; // unplaced words still up for review

let activePlacementIdx: number | null = null;
let activeBonus: DictEntry | null = null;
let revealed = false;
let suggestedGrade: Grade = "good";
let inputLocked = false;
let gameOver = false;

let totalReviews = 0;
let totalAgain = 0;
let totalScore = 0;
let streak = 0;
let promptShownAt = 0;
let masteredAtStart = 0;

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
    SESSION_CAP,
    NEW_WORD_RATIO,
    shuffleArray,
  );

  // crossword-layout-generator handles ASCII; Norwegian æøå pass through fine.
  layout = buildLayout(
    queue.map((e) => ({ clue: e.definition, answer: e.word })),
  );
  cells = cellMap(layout.placements);
  solved = new Set();
  filledCells = new Set();
  bonusQueue = layout.unplaced
    .map((u) => dictByWord.get(u.answer))
    .filter((e): e is DictEntry => e !== undefined);
}

function countMastered(): number {
  let n = 0;
  const prefix = `brainbout:lex:${lang}:`;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(prefix) === true) {
      const raw = localStorage.getItem(k);
      if (raw !== null) {
        try {
          const parsed = JSON.parse(raw) as { s?: number };
          if (isMastered({ s: parsed.s ?? 0 } as never)) n++;
        } catch {
          /* ignore */
        }
      }
    }
  }
  return n;
}

/* ─── rendering ────────────────────────────────────────────────────────── */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function activeCellsKey(): Set<CellKey> {
  if (activePlacementIdx === null) return new Set();
  const p = layout.placements[activePlacementIdx];
  if (!p) return new Set();
  return new Set(cellsFor(p).map((c) => cellKey(c.x, c.y)));
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

function renderGrid(typedForActive: string): string {
  if (layout.placements.length === 0) return "";
  const activeKeys = activeCellsKey();
  const html: string[] = [];
  const activeP =
    activePlacementIdx !== null ? layout.placements[activePlacementIdx] : null;
  const activeCells = activeP ? cellsFor(activeP) : [];
  const typedLower = typedForActive.toLowerCase();
  const typedAt = new Map<CellKey, string>();
  if (activeP) {
    for (let i = 0; i < activeCells.length && i < typedLower.length; i++) {
      const c = activeCells[i];
      const ch = typedLower[i];
      if (c && ch) typedAt.set(cellKey(c.x, c.y), ch);
    }
  }
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
      const isSolved = filledCells.has(k);
      const typed = typedAt.get(k);
      const reveal = isSolved || typed !== undefined;
      const correctType = typed !== undefined ? typed === info.letter : false;
      const classes = [
        "xw-cell",
        info.intersection ? "xw-cross" : "",
        isActive ? "xw-active" : "",
        isSolved ? "xw-solved" : "",
        typed !== undefined && !isSolved
          ? correctType
            ? "xw-typing-correct"
            : "xw-typing-wrong"
          : "",
      ]
        .filter(Boolean)
        .join(" ");
      // Show position number on the first cell of a placement.
      let num = "";
      for (let i = 0; i < layout.placements.length; i++) {
        const p = layout.placements[i];
        if (p && p.startx === x && p.starty === y) {
          num = `<span class="xw-num">${String(p.position)}</span>`;
          break;
        }
      }
      const letter = reveal ? (typed ?? info.letter).toUpperCase() : "";
      const val = `<span class="xw-val">${String(letterValue(info.letter))}</span>`;
      html.push(
        `<div class="${classes}">${num}<span class="xw-letter">${letter}</span>${val}</div>`,
      );
    }
  }
  return `<div class="xw-grid-wrap"><div class="xw-grid" style="--xw-cols:${String(width)}">${html.join("")}</div></div>`;
}

function clueLabel(p: Placement): string {
  return `${String(p.position)}. ${p.orientation === "across" ? "→" : "↓"} (${String(p.answer.length)})`;
}

function renderClueList(): string {
  const items = layout.placements.map((p, idx) => {
    const isSolved = solved.has(idx);
    const isActive = activePlacementIdx === idx;
    const cls = [
      "xw-clue",
      isSolved ? "xw-clue-solved" : "",
      isActive ? "xw-clue-active" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const definition = escapeHtml(p.clue);
    return `<button class="${cls}" data-idx="${String(idx)}"><span class="xw-clue-tag">${clueLabel(p)}</span><span class="xw-clue-text">${definition}</span></button>`;
  });
  const bonus =
    bonusQueue.length > 0
      ? `<div class="xw-bonus-header">Bonus (${String(bonusQueue.length)})</div>` +
        bonusQueue
          .map(
            (e, i) =>
              `<button class="xw-clue xw-clue-bonus" data-bonus="${String(i)}"><span class="xw-clue-tag">★</span><span class="xw-clue-text">${escapeHtml(e.definition)}</span></button>`,
          )
          .join("")
      : "";
  return `<div class="xw-clues">${items.join("")}${bonus}</div>`;
}

function renderHud(): string {
  const solvedCount = solved.size;
  const total = layout.placements.length;
  return `
    <div class="hud">
      <div class="timer">${String(solvedCount)}/${String(total)} solved</div>
      <div class="score-display">${String(totalScore)} pts</div>
      <div class="streak-display">streak ${String(streak)}</div>
    </div>`;
}

function renderOverview(): void {
  activePlacementIdx = null;
  activeBonus = null;
  revealed = false;
  inputLocked = false;
  game.innerHTML = `
    ${renderHud()}
    ${renderGrid("")}
    <div class="xw-hint">Tap a clue to solve it</div>
    ${renderClueList()}
  `;
}

function renderActivePrompt(typed: string): void {
  const target = currentTargetWord();
  const definition = currentDefinition();
  if (target === null || definition === null) return;
  const exHtml = currentExample()
    ? `<div class="cue-example">&ldquo;${escapeHtml(currentExample() as string)}&rdquo;</div>`
    : "";
  const tag =
    activePlacementIdx !== null
      ? clueLabel(defined(layout.placements[activePlacementIdx]))
      : "★ bonus";
  game.innerHTML = `
    ${renderHud()}
    ${renderGrid(typed)}
    <div class="xw-active-tag">${tag}</div>
    <div class="cue-text">${escapeHtml(definition)}</div>
    ${exHtml}
    <div class="cloze-input-wrap">
      <input class="cloze-input" type="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Type the word…" id="cloze-input" maxlength="${String(target.length + 4)}" />
    </div>
    <div class="xw-prompt-actions">
      <button class="xw-back" id="xw-back-btn">← clues</button>
    </div>
  `;
  const input = document.querySelector<HTMLInputElement>("#cloze-input");
  input?.focus();
  input?.addEventListener("input", () => {
    renderActivePrompt(input.value);
  });
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      reveal(input.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      renderOverview();
    }
  });
}

function renderReveal(typed: string): void {
  const target = currentTargetWord();
  const definition = currentDefinition();
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
  const exHtml = currentExample()
    ? `<div class="cue-example">&ldquo;${escapeHtml(currentExample() as string)}&rdquo;</div>`
    : "";
  const tag =
    activePlacementIdx !== null
      ? clueLabel(defined(layout.placements[activePlacementIdx]))
      : "★ bonus";
  game.innerHTML = `
    ${renderHud()}
    ${renderGrid(target)}
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
    <div class="grade-hint">Suggested: <strong>${suggestedGrade}</strong> · press 1/2/3/4</div>
  `;
}

/* ─── current-prompt accessors ─────────────────────────────────────────── */

function currentTargetWord(): string | null {
  if (activePlacementIdx !== null) {
    return layout.placements[activePlacementIdx]?.answer ?? null;
  }
  return activeBonus?.word ?? null;
}

function currentDefinition(): string | null {
  if (activePlacementIdx !== null) {
    return layout.placements[activePlacementIdx]?.clue ?? null;
  }
  return activeBonus?.definition ?? null;
}

function currentExample(): string | null {
  if (activePlacementIdx !== null) {
    const ans = layout.placements[activePlacementIdx]?.answer;
    return ans ? (dictByWord.get(ans)?.example ?? null) : null;
  }
  return activeBonus?.example ?? null;
}

/* ─── flow ─────────────────────────────────────────────────────────────── */

function pickClue(idx: number): void {
  if (solved.has(idx)) return;
  activePlacementIdx = idx;
  activeBonus = null;
  revealed = false;
  inputLocked = false;
  promptShownAt = Date.now();
  renderActivePrompt("");
}

function pickBonus(i: number): void {
  const entry = bonusQueue[i];
  if (!entry) return;
  activeBonus = entry;
  activePlacementIdx = null;
  revealed = false;
  inputLocked = false;
  promptShownAt = Date.now();
  renderActivePrompt("");
}

function reveal(typed: string): void {
  if (revealed) return;
  const target = currentTargetWord();
  if (target === null) return;
  revealed = true;
  suggestedGrade = suggestGradeFromTyping(typed, target);
  renderReveal(typed);
}

function applyGrade(grade: Grade): void {
  if (gameOver || inputLocked) return;
  if (!revealed) {
    reveal("");
  }
  const target = currentTargetWord();
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
      if (gameOver) return;
      if (solved.size === layout.placements.length && bonusQueue.length === 0) {
        showResult();
        return;
      }
      renderOverview();
    },
    grade === "again" ? 700 : 500,
  );
}

function showResult(): void {
  gameOver = true;
  const masteredNow = countMastered();
  const newlyMastered = Math.max(0, masteredNow - masteredAtStart);
  const accuracy = totalReviews === 0 ? 0 : 1 - totalAgain / totalReviews;
  recordSessionScore("lex", totalReviews);
  recordResult("lex", accuracy);
  game.innerHTML = `
    <div class="result">
      <div class="final-score">${String(totalScore)}</div>
      <div class="result-label">pts · ${String(solved.size)}/${String(layout.placements.length)} crossword · ${String(Math.round(accuracy * 100))}% recalled</div>
      <div class="peak-streak">+${String(newlyMastered)} new mastered word${newlyMastered === 1 ? "" : "s"}</div>
      <div class="result-actions">
        <button id="again-btn">Play Again</button>
        <button id="back-btn" class="secondary">Back to Hub</button>
      </div>
    </div>
  `;
  sound.playVictory();
}

async function startGame(): Promise<void> {
  totalReviews = 0;
  totalAgain = 0;
  totalScore = 0;
  streak = 0;
  gameOver = false;
  revealed = false;
  inputLocked = false;
  await loadDict();
  masteredAtStart = countMastered();
  buildSession();
  if (layout.placements.length === 0 && bonusQueue.length === 0) {
    showResult();
    return;
  }
  renderOverview();
}

/* ─── event wiring ─────────────────────────────────────────────────────── */

game.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (!btn) return;
  if (btn.classList.contains("grade-btn")) {
    const grade = btn.dataset.grade as Grade | undefined;
    if (grade) applyGrade(grade);
  } else if (btn.classList.contains("xw-clue")) {
    if (btn.dataset.idx !== undefined) {
      pickClue(Number(btn.dataset.idx));
    } else if (btn.dataset.bonus !== undefined) {
      pickBonus(Number(btn.dataset.bonus));
    }
  } else if (btn.id === "xw-back-btn") {
    renderOverview();
  } else if (btn.id === "again-btn") {
    void startGame();
  } else if (btn.id === "back-btn") {
    window.location.href = `${BASE}?completed=lex`;
  }
});

mountQuitButton(() => {
  if (!gameOver) showResult();
});

document.addEventListener("keydown", (e) => {
  if (gameOver) return;
  if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
    const map: Record<string, Grade> = {
      "1": "again",
      "2": "hard",
      "3": "good",
      "4": "easy",
    };
    applyGrade(map[e.key] as Grade);
  }
});

void startGame();

initTheme();
wireToggle();
mountAppIcon("lex", "var(--ctp-blue)");
