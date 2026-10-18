import { describe, expect, it } from 'vitest';
import { changeOver, hodlPnl, maxDrawdown } from './stats';

const pts = (values: number[], stepMs = 60_000) => values.map((pnlUsd, i) => ({ at: i * stepMs, pnlUsd }));

describe('estatísticas do robô', () => {
  it('changeOver: variação do PL na janela; janela maior que o histórico = desde o início', () => {
    const s = pts([0, 1, 3]);
    expect(changeOver(s, 60_000, 120_000)).toBe(2);
    expect(changeOver(s, 3_600_000, 120_000)).toBe(3);
    expect(changeOver([], 60_000, 120_000)).toBe(0);
  });

  it('maxDrawdown: maior queda de um pico até um vale', () => {
    expect(maxDrawdown(pts([0, 2, -1, 1]))).toBe(3);
    expect(maxDrawdown(pts([0, 1, 2]))).toBe(0);
    expect(maxDrawdown([])).toBe(0);
  });

  it('hodlPnl: quanto o capital teria rendido só segurando BTC', () => {
    expect(hodlPnl(1000, 60000, 66000)).toBe(100);
    expect(hodlPnl(1000, 60000, 57000)).toBe(-50);
    expect(hodlPnl(1000, 0, 57000)).toBe(0);
  });
});
