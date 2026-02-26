// test/game.test.ts
import { describe, it, expect } from 'vitest';
import { createGame, makeMove, getGameStatus } from '../src/game';

describe('createGame', () => {
  it('creates a game from a Chess960 FEN', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1';
    const game = createGame(fen);
    expect(game.startFen).toBe(fen);
    expect(game.moves).toEqual([]);
    expect(game.turn).toBe('white');
    expect(game.isOver).toBe(false);
  });

  it('computes legal move destinations', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1';
    const game = createGame(fen);
    expect(game.dests.size).toBeGreaterThan(0);
    expect(game.dests.has('e2')).toBe(true);
    expect(game.dests.get('e2')).toContain('e4');
  });
});

describe('makeMove', () => {
  it('applies a legal move and switches turn', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1';
    const game = createGame(fen);
    const result = makeMove(game, 'e2', 'e4');
    expect(result).not.toBeNull();
    expect(result?.turn).toBe('black');
    expect(result?.moves).toEqual(['e2e4']);
    expect(result?.lastMove).toEqual(['e2', 'e4']);
  });

  it('returns null for illegal moves', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1';
    const game = createGame(fen);
    const result = makeMove(game, 'e2', 'e5');
    expect(result).toBeNull();
  });

  it('tracks UCI moves for Stockfish', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1';
    let game = createGame(fen);
    const g1 = makeMove(game, 'e2', 'e4');
    expect(g1).not.toBeNull();
    if (!g1) return;
    game = g1;
    const g2 = makeMove(game, 'e7', 'e5');
    expect(g2).not.toBeNull();
    if (!g2) return;
    game = g2;
    const g3 = makeMove(game, 'g1', 'f3');
    expect(g3).not.toBeNull();
    if (!g3) return;
    game = g3;
    expect(game.moves).toEqual(['e2e4', 'e7e5', 'g1f3']);
  });
});

describe('getGameStatus', () => {
  it('returns ongoing for a normal position', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1';
    const game = createGame(fen);
    expect(getGameStatus(game)).toEqual({ status: 'playing' });
  });

  it('detects checkmate', () => {
    // Fool's mate final position: 1. f3 e5 2. g4 Qh4#
    const fen = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 0 1';
    const game = createGame(fen);
    const status = getGameStatus(game);
    expect(status.status).toBe('checkmate');
    if (status.status === 'checkmate') {
      expect(status.winner).toBe('black');
    }
  });

  it('detects stalemate', () => {
    const stalemateFen = '8/8/8/8/8/5k2/5p2/5K2 w - - 0 1';
    const game = createGame(stalemateFen);
    const status = getGameStatus(game);
    expect(status.status).toBe('stalemate');
  });

  it('detects check', () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1';
    const game = createGame(fen);
    expect(game.isCheck).toBe(false);

    const checkFen =
      'rnb1kbnr/pppp1ppp/8/4p3/7q/4PP2/PPPP2PP/RNBQKBNR w KQkq - 0 1';
    const game2 = createGame(checkFen);
    expect(game2.isCheck).toBe(true);
  });
});
