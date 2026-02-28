export interface EngineInfo {
  depth: number;
  score: { type: "cp" | "mate"; value: number };
  pv: string[];
}

export function parseBestMove(line: string): string | null {
  const match = /^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/.exec(line);
  return match?.[1] ?? null;
}

/** Compute absolute eval swing between two info lines (centipawns). */
export function computeEvalSwing(
  prev: EngineInfo,
  curr: EngineInfo,
): number {
  const toCP = (s: EngineInfo["score"]): number =>
    s.type === "mate" ? (s.value > 0 ? 10000 : -10000) : s.value;
  return Math.abs(toCP(curr.score) - toCP(prev.score));
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

type BestMoveCallback = (move: string) => void;

export class StockfishEngine {
  private worker: Worker | null = null;
  private onBestMove: BestMoveCallback | null = null;
  private ready = false;
  private infoLines: EngineInfo[] = [];
  private onInfo: ((info: EngineInfo) => void) | null = null;

  public get isReady(): boolean {
    return this.ready;
  }

  public async init(elo: number = 1500): Promise<void> {
    const base = import.meta.env.BASE_URL;
    return new Promise((resolve) => {
      this.worker = new Worker(`${base}stockfish/stockfish-18-lite-single.js`);
      this.worker.addEventListener(
        "message",
        (e: MessageEvent<string>): void => {
          this.handleLine(e.data);
        },
      );

      const origHandler = this.handleLine.bind(this);
      this.handleLine = (line: string): void => {
        if (line === "readyok") {
          this.ready = true;
          this.handleLine = origHandler;
          resolve();
        }
      };

      this.send("uci");
      this.send("setoption name UCI_Chess960 value true");
      this.send("setoption name UCI_LimitStrength value true");
      this.send(`setoption name UCI_Elo value ${elo}`);
      this.send("isready");
    });
  }

  public go(
    startFen: string,
    moves: string[],
    callback: BestMoveCallback,
    options?: { nodes?: number; onInfo?: (info: EngineInfo) => void },
  ): void {
    this.onBestMove = callback;
    this.onInfo = options?.onInfo ?? null;
    this.infoLines = [];
    const movesStr = moves.length > 0 ? ` moves ${moves.join(" ")}` : "";
    this.send(`position fen ${startFen}${movesStr}`);
    const searchCmd = options?.nodes
      ? `go nodes ${options.nodes}`
      : "go depth 8";
    this.send(searchCmd);
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

  private send(cmd: string): void {
    this.worker?.postMessage(cmd);
  }

  public getEvalSwing(): number {
    if (this.infoLines.length < 2) return 0;
    const prev = this.infoLines[this.infoLines.length - 2];
    const curr = this.infoLines[this.infoLines.length - 1];
    return computeEvalSwing(prev, curr);
  }

  private handleLine(line: string): void {
    const info = parseInfoLine(line);
    if (info) {
      this.infoLines.push(info);
      this.onInfo?.(info);
      return;
    }
    const bestMove = parseBestMove(line);
    if (bestMove !== null) {
      this.onBestMove?.(bestMove);
    }
  }
}
