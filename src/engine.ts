// src/engine.ts

export interface EngineInfo {
  depth: number;
  score: { type: "cp" | "mate"; value: number };
  pv: string[];
}

export interface EngineOptions {
  chess960: boolean;
  elo: number; // 1320-3190
  limitStrength: boolean;
}

export const DEFAULT_OPTIONS: EngineOptions = {
  chess960: true,
  elo: 1500,
  limitStrength: true,
};

export function nodesForElo(elo: number): number {
  const t = (elo - 1320) / (3190 - 1320);
  return Math.round(10000 * Math.pow(100, t));
}

export async function humanDelay(): Promise<void> {
  const ms = 1000 + Math.random() * 2000;
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function parseBestMove(line: string): string | null {
  const match = /^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/.exec(line);
  return match?.[1] ?? null;
}

export function parseInfoLine(line: string): EngineInfo | null {
  const depthMatch = /^info\s.*?\bdepth\s+(\d+)/.exec(line);
  if (!depthMatch) return null;

  const scoreMatch = /score\s+(cp|mate)\s+(-?\d+)/.exec(line);
  if (!scoreMatch) return null;

  const pvMatch = /\bpv\s+(.+)$/.exec(line);
  const pv = pvMatch ? pvMatch[1].trim().split(/\s+/) : [];

  return {
    depth: parseInt(depthMatch[1], 10),
    score: {
      type: scoreMatch[1] as "cp" | "mate",
      value: parseInt(scoreMatch[2], 10),
    },
    pv,
  };
}

type EngineCallback = (move: string) => void;
type InfoCallback = (info: EngineInfo) => void;

export class StockfishEngine {
  private readonly scriptUrl: string;
  private worker: Worker | null = null;
  private onBestMove: EngineCallback | null = null;
  private onInfo: InfoCallback | null = null;
  private _ready = false;
  private readonly options: EngineOptions;

  public constructor(scriptUrl: string) {
    this.scriptUrl = scriptUrl;
    this.options = { ...DEFAULT_OPTIONS };
  }

  public get isReady(): boolean {
    return this._ready;
  }

  public async init(options: EngineOptions = DEFAULT_OPTIONS): Promise<void> {
    Object.assign(this.options, options);
    return new Promise((resolve) => {
      this.worker = new Worker(this.scriptUrl);
      this.worker.addEventListener(
        "message",
        (e: MessageEvent<string>): void => {
          this.handleLine(e.data);
        },
      );

      const origHandler = this.handleLine.bind(this);
      const initHandler = (line: string): void => {
        if (line === "readyok") {
          this._ready = true;
          this.handleLine = origHandler;
          resolve();
        }
      };
      this.handleLine = initHandler;

      this.send("uci");
      this.applyOptions(options);
      this.send("isready");
    });
  }

  public go(
    fen: string,
    callback: EngineCallback,
    infoCallback?: InfoCallback,
  ): void {
    this.onBestMove = callback;
    this.onInfo = infoCallback ?? null;
    this.send("ucinewgame");
    this.send(`position fen ${fen}`);
    this.send(`go nodes ${String(nodesForElo(this.options.elo))}`);
  }

  public goWithMoves(
    startFen: string,
    moves: string[],
    callback: EngineCallback,
    infoCallback?: InfoCallback,
  ): void {
    this.onBestMove = callback;
    this.onInfo = infoCallback ?? null;
    const movesStr = moves.length > 0 ? ` moves ${moves.join(" ")}` : "";
    this.send(`position fen ${startFen}${movesStr}`);
    this.send(`go nodes ${String(nodesForElo(this.options.elo))}`);
  }

  public newGame(): void {
    this.send("ucinewgame");
    this.send("isready");
  }

  public stop(): void {
    this.send("stop");
  }

  public destroy(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  private applyOptions(options: EngineOptions): void {
    this.send(`setoption name UCI_Chess960 value ${String(options.chess960)}`);
    this.send(
      `setoption name UCI_LimitStrength value ${String(options.limitStrength)}`,
    );
    this.send(`setoption name UCI_Elo value ${String(options.elo)}`);
  }

  private send(cmd: string): void {
    this.worker?.postMessage(cmd);
  }

  private handleLine(line: string): void {
    const bestMove = parseBestMove(line);
    if (bestMove !== null) {
      this.onBestMove?.(bestMove);
      return;
    }

    const info = parseInfoLine(line);
    if (info) {
      this.onInfo?.(info);
    }
  }
}
