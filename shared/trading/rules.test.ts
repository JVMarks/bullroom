import { describe, expect, it } from 'vitest';
import { botStatus, formatPnl, pnlTone, shouldEject } from './rules';
import type { BotTrading } from './types';

const bot = (over: Partial<BotTrading> = {}): BotTrading => ({
  exchange: 'Binance',
  pair: 'BTC/USDT',
  strategy: 'Spread',
  position: 'flat',
  pnlUsd: 0,
  dailyLossLimitUsd: 5,
  ...over,
});

describe('botStatus: a posição vira o comportamento na sala', () => {
  it('posicionado opera na mesa, zerado circula, ejetado vai embora', () => {
    expect(botStatus(bot({ position: 'long' }))).toBe('working');
    expect(botStatus(bot({ position: 'short' }))).toBe('working');
    expect(botStatus(bot({ position: 'flat' }))).toBe('idle');
    expect(botStatus(bot({ position: 'long', ejectedAt: 1 }))).toBe('offline');
  });
});

describe('shouldEject: limite de perda diária', () => {
  it('ejeta ao atingir o limite, não antes', () => {
    expect(shouldEject(bot({ pnlUsd: -5, dailyLossLimitUsd: 5 }))).toBe(true);
    expect(shouldEject(bot({ pnlUsd: -4.99, dailyLossLimitUsd: 5 }))).toBe(false);
  });
});

describe('pnlTone: cor do balão pelo valor em centavos', () => {
  it('ganho, perda e zero (o que arredonda para zero é zero)', () => {
    expect(pnlTone(4.01)).toBe('gain');
    expect(pnlTone(-0.39)).toBe('loss');
    expect(pnlTone(-0.004)).toBe('zero');
    expect(pnlTone(0.004)).toBe('zero');
  });
});

describe('formatPnl: sinal sempre, $ antes, decimal do idioma', () => {
  it('formata como no balão', () => {
    expect(formatPnl(4.01, 'pt-BR')).toBe('+$4,01');
    expect(formatPnl(-0.39, 'pt-BR')).toBe('-$0,39');
    expect(formatPnl(-0.39, 'en')).toBe('-$0.39');
    expect(formatPnl(-0.004, 'pt-BR')).toBe('+$0,00');
    expect(formatPnl(1234.5, 'en')).toBe('+$1,234.50');
  });
});
