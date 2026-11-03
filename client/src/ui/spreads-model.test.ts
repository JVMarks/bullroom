import { describe, expect, it } from 'vitest';
import type { CoreState } from '../../../shared/core/types';
import { formatChange, formatPct, rangePos, spreadRows } from './spreads-model';

const STATE: CoreState = {
  rev: 1,
  at: 1,
  exchanges: [],
  pairs: [
    {
      pair: 'USDC/USDT',
      quotes: [],
      best: { pair: 'USDC/USDT', buyOn: 'bybit', sellOn: 'binance', grossPct: 0, netPct: -0.2, transfer: { asset: 'USDC', from: 'bybit', sizeUsd: 1000, fee: 1, costPct: 0.1, netPct: -0.3 } },
      windows: { '5m': { changePp: 0.01, min: -0.31, max: -0.29 }, '1h': null, '24h': null },
    },
    { pair: 'DAI/USDT', quotes: [], best: null },
  ],
};

describe('painel Spreads: regras', () => {
  it('uma linha por par: líquido de agora com o saque quando estimado, janelas do núcleo', () => {
    expect(spreadRows(STATE)).toEqual([
      { pair: 'USDC/USDT', now: -0.3, windows: { '5m': { changePp: 0.01, min: -0.31, max: -0.29 }, '1h': null, '24h': null } },
      { pair: 'DAI/USDT', now: null, windows: null },
    ]);
    expect(spreadRows(null)).toEqual([]);
  });

  it('variação com seta e tom; quase zero fica "sem mudança"', () => {
    expect(formatChange(0.03, 'pt-BR')).toEqual({ text: '▲ 0,03', tone: 'up' });
    expect(formatChange(-0.034, 'pt-BR')).toEqual({ text: '▼ 0,03', tone: 'down' });
    expect(formatChange(0.004, 'pt-BR')).toEqual({ text: '0,00', tone: 'flat' });
    expect(formatChange(0.01, 'en-US').text).toBe('▲ 0.01');
  });

  it('porcentagem com sinal e 2 casas', () => {
    expect(formatPct(-0.2, 'pt-BR')).toBe('-0,20%');
    expect(formatPct(0.034, 'pt-BR')).toBe('+0,03%');
    expect(formatPct(0, 'pt-BR')).toBe('0,00%');
  });

  it('posição do valor de agora na faixa, de 0 a 1 (meio quando a faixa é um ponto só)', () => {
    expect(rangePos(-0.2, -0.3, -0.1)).toBeCloseTo(0.5, 6);
    expect(rangePos(-0.35, -0.3, -0.1)).toBe(0);
    expect(rangePos(0, -0.3, -0.1)).toBe(1);
    expect(rangePos(-0.2, -0.2, -0.2)).toBe(0.5);
  });
});
