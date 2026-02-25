// src/engine.ts

export interface EngineInfo {
  depth: number;
  score: { type: 'cp' | 'mate'; value: number };
  pv: string[];
}

export interface EngineOptions {
  chess960: boolean;
  skillLevel: number;  // 0-20
  elo: number;         // 1320-3190
  limitStrength: boolean;
  moveTime: number;    // milliseconds
  contempt: number;    // -100 to 100
}

export const DEFAULT_OPTIONS: EngineOptions = {
  chess960: true,
  skillLevel: 10,
  elo: 1500,
  limitStrength: true,
  moveTime: 1000,
  contempt: 0,
};

export function parseBestMove(line: string): string | null {
  const match = line.match(/^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
  return match ? match[1] : null;
}

export function parseInfoLine(line: string): EngineInfo | null {
  const depthMatch = line.match(/^info\s.*?\bdepth\s+(\d+)/);
  if (!depthMatch) return null;

  const scoreMatch = line.match(/score\s+(cp|mate)\s+(-?\d+)/);
  if (!scoreMatch) return null;

  const pvMatch = line.match(/\bpv\s+(.+)$/);
  const pv = pvMatch ? pvMatch[1].trim().split(/\s+/) : [];

  return {
    depth: parseInt(depthMatch[1]),
    score: {
      type: scoreMatch[1] as 'cp' | 'mate',
      value: parseInt(scoreMatch[2]),
    },
    pv,
  };
}

type EngineCallback = (move: string) => void;
type InfoCallback = (info: EngineInfo) => void;

export class StockfishEngine {
  private worker: Worker | null = null;
  private onBestMove: EngineCallback | null = null;
  private onInfo: InfoCallback | null = null;
  private ready = false;
  private options: EngineOptions;

  constructor(private scriptUrl: string) {
    this.options = { ...DEFAULT_OPTIONS };
  }

  async init(options: EngineOptions = DEFAULT_OPTIONS): Promise<void> {
    this.options = { ...options };
    return new Promise((resolve) => {
      this.worker = new Worker(this.scriptUrl);
      this.worker.addEventListener('message', (e: MessageEvent<string>) => {
        this.handleLine(e.data);
      });

      const origHandler = this.handleLine.bind(this);
      const initHandler = (line: string) => {
        if (line === 'readyok') {
          this.ready = true;
          this.handleLine = origHandler;
          resolve();
        }
      };
      this.handleLine = initHandler;

      this.send('uci');
      this.applyOptions(options);
      this.send('isready');
    });
  }

  private applyOptions(options: EngineOptions): void {
    this.send(`setoption name UCI_Chess960 value ${options.chess960}`);
    this.send(`setoption name Skill Level value ${options.skillLevel}`);
    this.send(`setoption name UCI_LimitStrength value ${options.limitStrength}`);
    this.send(`setoption name UCI_Elo value ${options.elo}`);
    this.send(`setoption name Contempt value ${options.contempt}`);
  }

  private send(cmd: string): void {
    this.worker?.postMessage(cmd);
  }

  private handleLine(line: string): void {
    const bestMove = parseBestMove(line);
    if (bestMove) {
      this.onBestMove?.(bestMove);
      return;
    }

    const info = parseInfoLine(line);
    if (info) {
      this.onInfo?.(info);
    }
  }

  go(fen: string, callback: EngineCallback, infoCallback?: InfoCallback): void {
    this.onBestMove = callback;
    this.onInfo = infoCallback ?? null;
    this.send('ucinewgame');
    this.send(`position fen ${fen}`);
    this.send(`go movetime ${this.options.moveTime}`);
  }

  goWithMoves(
    startFen: string,
    moves: string[],
    moveTime: number,
    callback: EngineCallback,
    infoCallback?: InfoCallback,
  ): void {
    this.onBestMove = callback;
    this.onInfo = infoCallback ?? null;
    const movesStr = moves.length > 0 ? ` moves ${moves.join(' ')}` : '';
    this.send(`position fen ${startFen}${movesStr}`);
    this.send(`go movetime ${moveTime}`);
  }

  newGame(): void {
    this.send('ucinewgame');
    this.send('isready');
  }

  stop(): void {
    this.send('stop');
  }

  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
