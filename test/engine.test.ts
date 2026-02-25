// test/engine.test.ts
import { describe, it, expect } from 'vitest';
import { parseBestMove, parseInfoLine } from '../src/engine';

describe('parseBestMove', () => {
  it('parses a simple bestmove', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4');
  });

  it('parses bestmove with promotion', () => {
    expect(parseBestMove('bestmove a7a8q')).toBe('a7a8q');
  });

  it('parses chess960 castling move', () => {
    expect(parseBestMove('bestmove e1h1')).toBe('e1h1');
  });

  it('returns null for non-bestmove lines', () => {
    expect(parseBestMove('info depth 10 score cp 30')).toBeNull();
    expect(parseBestMove('readyok')).toBeNull();
  });
});

describe('parseInfoLine', () => {
  it('parses centipawn score', () => {
    const info = parseInfoLine(
      'info depth 15 seldepth 21 score cp 34 nodes 123456 nps 1234567 time 100 pv e2e4 e7e5'
    );
    expect(info).not.toBeNull();
    expect(info!.depth).toBe(15);
    expect(info!.score).toEqual({ type: 'cp', value: 34 });
    expect(info!.pv[0]).toBe('e2e4');
  });

  it('parses mate score', () => {
    const info = parseInfoLine(
      'info depth 20 seldepth 20 score mate 3 nodes 500000 nps 5000000 time 100 pv d1h5 g6h5'
    );
    expect(info).not.toBeNull();
    expect(info!.score).toEqual({ type: 'mate', value: 3 });
  });

  it('parses negative mate score', () => {
    const info = parseInfoLine(
      'info depth 20 score mate -2 pv e1d1 d8d1'
    );
    expect(info!.score).toEqual({ type: 'mate', value: -2 });
  });

  it('returns null for non-info lines', () => {
    expect(parseInfoLine('bestmove e2e4')).toBeNull();
    expect(parseInfoLine('readyok')).toBeNull();
  });
});
