export interface EngineInfo {
  depth: number;
  score: { type: "cp" | "mate"; value: number };
  pv: string[];
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

type BestMoveCallback = (move: string) => void;

export class StockfishEngine {
  private worker: Worker | null = null;
  private onBestMove: BestMoveCallback | null = null;
  private ready = false;

  public get isReady(): boolean {
    return this.ready;
  }

  public async init(): Promise<void> {
    const base = import.meta.env.BASE_URL as string;
    return new Promise((resolve) => {
      this.worker = new Worker(
        `${base}stockfish/stockfish-18-lite-single.js`,
      );
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
      this.send("setoption name UCI_Elo value 1500");
      this.send("isready");
    });
  }

  public go(
    startFen: string,
    moves: string[],
    callback: BestMoveCallback,
  ): void {
    this.onBestMove = callback;
    const movesStr = moves.length > 0 ? ` moves ${moves.join(" ")}` : "";
    this.send(`position fen ${startFen}${movesStr}`);
    this.send("go depth 8");
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

  private handleLine(line: string): void {
    const bestMove = parseBestMove(line);
    if (bestMove !== null) {
      this.onBestMove?.(bestMove);
    }
  }
}
