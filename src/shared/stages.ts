export const MAX_STAGE = 3;
const HISTORY_SIZE = 5;
const PREFIX = "brainbout:stage";

interface StageData {
  stage: number;
  history: number[];
}

function key(gameId: string): string {
  return `${PREFIX}:${gameId}`;
}

function load(gameId: string): StageData {
  const raw = localStorage.getItem(key(gameId));
  if (raw === null) return { stage: 1, history: [] };
  try {
    return JSON.parse(raw) as StageData;
  } catch {
    return { stage: 1, history: [] };
  }
}

function save(gameId: string, data: StageData): void {
  localStorage.setItem(key(gameId), JSON.stringify(data));
}

export function getStage(gameId: string): number {
  return load(gameId).stage;
}

export function getHistory(gameId: string): number[] {
  return load(gameId).history;
}

export function recordResult(gameId: string, accuracy: number): void {
  const data = load(gameId);
  data.history.push(accuracy);
  if (data.history.length > HISTORY_SIZE) {
    data.history = data.history.slice(-HISTORY_SIZE);
  }
  save(gameId, data);
}

export function advance(gameId: string): void {
  const data = load(gameId);
  data.stage = Math.min(data.stage + 1, MAX_STAGE);
  data.history = [];
  save(gameId, data);
}

export function retreat(gameId: string): void {
  const data = load(gameId);
  data.stage = Math.max(data.stage - 1, 1);
  save(gameId, data);
}

export type Readiness = "grey" | "amber" | "green";

export function readiness(gameId: string, threshold: number): Readiness {
  const data = load(gameId);
  if (data.stage >= MAX_STAGE) return "grey";
  if (data.history.length < HISTORY_SIZE) return "grey";
  const avg =
    data.history.reduce((sum, v) => sum + v, 0) / data.history.length;
  if (avg >= threshold) return "green";
  if (avg >= threshold - 0.1) return "amber";
  return "grey";
}
