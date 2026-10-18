import { describe, expect, it } from 'vitest';
import { portfolioLine, sparkPoints } from './portfolio';

const P = { simulated: true, totalPnlUsd: 33.96, bots: 54, trading: 25, ejected: 2, series: [] };

describe('carteira na barra do topo (Bullroom)', () => {
  it('linha com PL total, robôs e em operação', () => {
    expect(portfolioLine(P, 'pt-BR')).toBe('+$33,96 · 54 robôs · 25 em operação');
    expect(portfolioLine({ ...P, totalPnlUsd: -1.5, bots: 1, trading: 0 }, 'pt-BR')).toBe('-$1,50 · 1 robô · 0 em operação');
  });

  it('ao vivo: melhor spread líquido em % e corretoras online', () => {
    expect(portfolioLine({ ...P, simulated: false, unit: 'pct', totalPnlUsd: -0.202, bots: 5 }, 'pt-BR')).toBe('-0,20% · melhor spread líquido · 5 corretoras');
  });

  it('pontos do mini-gráfico: cabem na caixa e o último decide a cor', () => {
    expect(sparkPoints([], 80, 20)).toEqual({ points: [], up: true });
    const s = sparkPoints([{ at: 0, pnlUsd: 0 }, { at: 1, pnlUsd: 2 }, { at: 2, pnlUsd: -2 }], 80, 20);
    expect(s.up).toBe(false);
    expect(s.points).toHaveLength(3);
    expect(s.points[0].x).toBe(0);
    expect(s.points[2].x).toBe(80);
    for (const p of s.points) {
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(20);
    }
    // o maior valor fica em cima (y menor)
    expect(s.points[1].y).toBeLessThan(s.points[2].y);
  });
});
