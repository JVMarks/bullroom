import { describe, expect, it } from 'vitest';
import type { BotTrading } from '../../../shared/trading/types';
import { botCardModel } from './bot-card';

const NOW = 3_600_000;
const bot = (over: Partial<BotTrading> = {}): BotTrading => ({
  exchange: 'Binance',
  pair: 'BTC/USDT',
  strategy: 'Grid',
  position: 'long',
  pnlUsd: 12,
  dailyLossLimitUsd: 5,
  capitalUsd: 1000,
  stats: {
    trades: 4,
    wins: 3,
    peakPnlUsd: 13.2,
    maxDrawdownUsd: 1.2,
    series: [
      { at: 0, pnlUsd: 0 },
      { at: NOW - 300_000, pnlUsd: 10 },
      { at: NOW, pnlUsd: 12 },
    ],
    btcStartUsd: 60000,
    btcNowUsd: 60000,
  },
  ...over,
});

describe('cartão do robô (Bullroom)', () => {
  it('acerto, trades, drawdown e variação na janela', () => {
    const m = botCardModel(bot(), '5m', NOW, 'pt-BR');
    expect(m.pnl).toBe('+$12,00');
    expect(m.tone).toBe('gain');
    expect(m.winRate).toBe('75%');
    expect(m.trades).toBe('4');
    expect(m.drawdown).toBe('-$1,20');
    expect(m.change).toBe('+$2,00');
    expect(botCardModel(bot(), '1h', NOW, 'pt-BR').change).toBe('+$12,00');
  });

  it('limite usado só conta perda', () => {
    expect(botCardModel(bot({ pnlUsd: -2.5 }), '24h', NOW, 'pt-BR').limitUsed).toBe('50%');
    expect(botCardModel(bot({ pnlUsd: 3 }), '24h', NOW, 'pt-BR').limitUsed).toBe('0%');
  });

  it('vs segurar BTC: PL do robô menos o que o capital rendeu em BTC', () => {
    expect(botCardModel(bot(), '1h', NOW, 'pt-BR')).toMatchObject({ vsBtc: '+$12,00', vsBtcTone: 'gain' });
    const s = { ...bot().stats!, btcNowUsd: 60300 };
    expect(botCardModel(bot({ pnlUsd: 1.5, stats: s }), '1h', NOW, 'pt-BR')).toMatchObject({ vsBtc: '-$3,50', vsBtcTone: 'loss' });
  });

  it('robô sem histórico: zeros, sem NaN', () => {
    const m = botCardModel(bot({ pnlUsd: 0, stats: undefined }), '24h', NOW, 'pt-BR');
    expect(m).toMatchObject({ pnl: '+$0,00', change: '+$0,00', winRate: '0%', trades: '0', drawdown: '+$0,00', limitUsed: '0%', vsBtc: '+$0,00' });
    expect(JSON.stringify(m)).not.toContain('NaN');
  });
});
