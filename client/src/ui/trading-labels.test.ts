import { describe, expect, it } from 'vitest';
import type { AgentInfo } from '../../../shared/types';
import type { BotTrading } from '../../../shared/trading/types';
import { tradingActivityFallback, tradingHeading, tradingRoleLabel, tradingStatusLabel } from './trading-labels';

const T: BotTrading = { exchange: 'Binance', pair: 'BTC/USDT', strategy: 'Grid', position: 'long', pnlUsd: 0, dailyLossLimitUsd: 5 };
const bot = (over: Partial<BotTrading> = {}) => ({ trading: { ...T, ...over } }) as AgentInfo;
const observer = { badge: { value: 0.3, unit: 'bp' } } as AgentInfo;
const common = { kind: 'main', status: 'working' } as AgentInfo;

describe('rótulos dos modos de trading', () => {
  it('robô: posição na linha, estado no painel', () => {
    expect(tradingRoleLabel(bot())).toBe('comprado');
    expect(tradingRoleLabel(bot({ position: 'short' }))).toBe('vendido');
    expect(tradingRoleLabel(bot({ position: 'flat' }))).toBe('zerado');
    expect(tradingStatusLabel(bot())).toBe('Operando');
    expect(tradingStatusLabel(bot({ position: 'flat' }))).toBe('Zerado');
    expect(tradingHeading(bot())).toBe('Robô');
    expect(tradingActivityFallback(bot())).toBe('sem operação ainda');
  });

  it('robô ejetado: "ejetado", nunca "offline"', () => {
    expect(tradingRoleLabel(bot({ ejectedAt: 1 }))).toBe('ejetado');
    expect(tradingStatusLabel(bot({ ejectedAt: 1, position: 'long' }))).toBe('Ejetado');
  });

  it('corretora observada (ao vivo)', () => {
    expect(tradingRoleLabel(observer)).toBe('corretora');
    expect(tradingStatusLabel(observer)).toBe('Ao vivo');
    expect(tradingHeading(observer)).toBe('Corretora');
    expect(tradingActivityFallback(observer)).toBe('ao vivo');
  });

  it('agente comum: null (fica o rótulo do habblaud)', () => {
    expect(tradingRoleLabel(common)).toBeNull();
    expect(tradingStatusLabel(common)).toBeNull();
    expect(tradingHeading(common)).toBeNull();
    expect(tradingActivityFallback(common)).toBeNull();
  });
});
