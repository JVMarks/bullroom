import { describe, expect, it } from 'vitest';
import type { CheckResult } from '../../../shared/core/types';
import { draftProblems, formatFee, isVolatile, normalizePair, roomSummary, sameConfig, searchExchanges } from './markets-model';

const LIMITS = { minExchanges: 2, maxExchanges: 20, maxPairs: 20, minPollMs: 5000, maxPollMs: 300000 };

const CHECK: CheckResult = {
  at: 1,
  exchanges: [
    { id: 'binance', ok: true, listings: [{ pair: 'USDC/USDT', symbol: 'USDC/USDT', inverted: false, active: true, takerFee: 0.001 }, { pair: 'DAI/USDT', symbol: 'DAI/USDT', inverted: false, active: false, takerFee: 0.001 }] },
    { id: 'coinbaseexchange', ok: true, listings: [{ pair: 'USDC/USDT', symbol: 'USDT/USDC', inverted: true, active: true, takerFee: 0.006 }, { pair: 'DAI/USDT', symbol: null, inverted: false, active: false, takerFee: null }] },
    { id: 'kraken', ok: false, error: 'timeout', listings: [{ pair: 'USDC/USDT', symbol: null, inverted: false, active: false, takerFee: null }, { pair: 'DAI/USDT', symbol: null, inverted: false, active: false, takerFee: null }] },
  ],
};

describe('painel Mercados: regras', () => {
  it('normaliza o par digitado e recusa o que não é par', () => {
    expect(normalizePair(' btc/usdt ')).toBe('BTC/USDT');
    expect(normalizePair('eth-usdt')).toBe('ETH/USDT');
    expect(normalizePair('sol usdc')).toBe('SOL/USDC');
    expect(normalizePair('BTCUSDT')).toBeNull();
    expect(normalizePair('USDT/USDT')).toBeNull();
    expect(normalizePair('B/USDT')).toBeNull();
  });

  it('volátil = alguma das moedas não é estável nem fiduciária', () => {
    expect(isVolatile('USDC/USDT')).toBe(false);
    expect(isVolatile('USDT/BRL')).toBe(false);
    expect(isVolatile('BTC/USDT')).toBe(true);
    expect(isVolatile('ETH/BTC')).toBe(true);
  });

  it('resume a sala pela conferência: quem lista (com taxa e invertido), quem está inativo, se abre', () => {
    const usdc = roomSummary('USDC/USDT', ['binance', 'coinbaseexchange', 'kraken'], CHECK);
    expect(usdc.checked).toBe(true);
    expect(usdc.listed).toEqual([
      { id: 'binance', name: 'Binance', takerFee: 0.001, inverted: false },
      { id: 'coinbaseexchange', name: 'Coinbase', takerFee: 0.006, inverted: true },
    ]);
    expect(usdc.opens).toBe(true);
    const dai = roomSummary('DAI/USDT', ['binance', 'coinbaseexchange'], CHECK);
    expect(dai.listed).toEqual([]);
    expect(dai.inactive.map((e) => e.id)).toEqual(['binance']);
    expect(dai.opens).toBe(false);
  });

  it('sem conferência, ou com corretora/par fora dela, a sala fica "não conferida"', () => {
    expect(roomSummary('USDC/USDT', ['binance', 'okx'], null).checked).toBe(false);
    expect(roomSummary('USDC/USDT', ['binance', 'okx'], CHECK).checked).toBe(false);
    expect(roomSummary('ETH/USDT', ['binance'], CHECK).checked).toBe(false);
  });

  it('busca casa id ou nome, prefixo primeiro, sem as já escolhidas e com limite', () => {
    const known = ['binance', 'binanceus', 'bitget', 'coinbaseexchange', 'kucoin', 'okx'];
    expect(searchExchanges(known, 'coin', [])).toEqual(['coinbaseexchange', 'kucoin']);
    expect(searchExchanges(known, 'BIN', ['binance'])).toEqual(['binanceus']);
    expect(searchExchanges(known, '', [], 2)).toEqual(['binance', 'binanceus']);
    expect(searchExchanges(known, 'zzz', [])).toEqual([]);
  });

  it('taxa como porcentagem com 2 casas na língua da interface', () => {
    expect(formatFee(0.001, 'en-US')).toBe('0.10%');
    expect(formatFee(0.006, 'pt-BR')).toBe('0,60%');
  });

  it('problemas do rascunho seguem os limites do núcleo', () => {
    expect(draftProblems({ exchanges: ['binance'], pairs: [], pollMs: 10000 }, LIMITS)).toHaveLength(2);
    expect(draftProblems({ exchanges: ['binance', 'okx'], pairs: ['BTC/USDT'], pollMs: 10000 }, LIMITS)).toEqual([]);
  });

  it('compara configurações pela ordem e pelo intervalo', () => {
    const a = { exchanges: ['binance', 'okx'], pairs: ['BTC/USDT'], pollMs: 10000 };
    expect(sameConfig(a, { ...a, exchanges: ['binance', 'okx'] })).toBe(true);
    expect(sameConfig(a, { ...a, exchanges: ['okx', 'binance'] })).toBe(false);
    expect(sameConfig(a, { ...a, pollMs: 20000 })).toBe(false);
  });
});
