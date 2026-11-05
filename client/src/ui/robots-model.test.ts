import { describe, expect, it } from 'vitest';
import type { EngineBot, EngineConfig, EngineState, PairState } from '../../../shared/core/types';
import { botRows, capitalLine, engineWithPair, enabledEngine, limitsLine, pairHint, parseLimit, routeOptions, withLimits } from './robots-model';

const bot = (over: Partial<EngineBot> = {}): EngineBot => ({
  id: 'bot-1',
  pair: 'AERO/USDT',
  exchanges: ['binance', 'bybit'],
  capitalUsd: 200,
  startedAt: 0,
  status: 'running',
  pnlUsd: 0.5,
  pnlTodayUsd: 0.5,
  feesUsd: 0.1,
  trades: 1,
  wins: 1,
  losses: 0,
  maxDrawdownUsd: 0,
  balances: {},
  samples: 160,
  samplesAbove: 12,
  series: [0.5],
  ...over,
});

const engine = (over: Partial<EngineState> = {}): EngineState => ({ at: 0, engine: { kind: 'paper', ok: true }, mode: 'paper', bots: [bot()], fills: [], blocks: [], latencyMs: 1000, dailyLossLimitUsd: 5, ...over });

const config: EngineConfig = {
  enabled: false,
  policy: { maxTradeUsd: 100, minNetPct: 0.05, maxQuoteAgeMs: 20000, dailyLossLimitUsd: 5, allowedPairs: [] },
  totalUsd: 1000,
  reservePct: 20,
  capPct: 50,
  minUsd: 50,
  latencyMs: 1000,
  cooldownMs: 30000,
};

describe('linhas de robô', () => {
  it('resultado, leituras e rótulo', () => {
    const [r] = botRows(engine(), 'pt-BR');
    expect(r.title).toBe('AERO/USDT · Binance + Bybit');
    expect(r.status).toBe('esperando');
    expect(r.tone).toBe('run');
    expect(r.pnl).toContain('+US$');
    expect(r.pnlTone).toBe('gain');
    expect(r.result).toContain('1 operação');
    expect(r.samples).toBe('12 de 160');
    expect(r.canStop).toBe(true);
  });

  it('parado por saldo traz o motivo', () => {
    const [r] = botRows(engine({ bots: [bot({ status: 'parked', statusReason: 'Saldo de USDT em binance não cobre.' })] }), 'pt-BR');
    expect(r.status).toBe('parado: sem saldo');
    expect(r.tone).toBe('park');
    expect(r.note).toContain('Saldo de USDT');
    expect(r.note).toContain('inverter');
    expect(r.canStop).toBe(true);
  });

  it('ejetado e parado não têm botão de parar; prejuízo aparece como prejuízo', () => {
    const [a, b] = botRows(engine({ bots: [bot({ status: 'ejected', pnlUsd: -5 }), bot({ id: 'b2', status: 'stopped' })] }), 'pt-BR');
    expect(a.tone).toBe('out');
    expect(a.status).toBe('ejetado');
    expect(a.pnl).toContain('-US$');
    expect(a.pnlTone).toBe('loss');
    expect(a.canStop).toBe(false);
    expect(b.status).toBe('parado por você');
    expect(b.canStop).toBe(false);
  });

  it('última operação: cotado → realizado, só do robô certo', () => {
    const fill = { id: 'f', botId: 'bot-1', at: 1, pair: 'AERO/USDT', buyOn: 'a', sellOn: 'b', base: 1, buyAvg: 1, sellAvg: 1, feesUsd: 0, pnlUsd: 0, quotedNetPct: 1.0874, realizedNetPct: 1.0077, partial: true };
    const [mine, other] = botRows(engine({ bots: [bot(), bot({ id: 'b2' })], fills: [fill] }), 'pt-BR');
    expect(mine.last).toContain('1,09%');
    expect(mine.last).toContain('1,01%');
    expect(mine.last).toContain('parcial');
    expect(other.last).toBeNull();
  });

  it('bloqueio mais recente do robô vira aviso; parado por saldo não repete', () => {
    const blocks = [{ botId: 'bot-1', at: 1, reasons: [{ code: 'fee_unknown', message: 'Sem taxa.', fix: 'Troque.' }] }];
    expect(botRows(engine({ blocks }), 'pt-BR')[0].note).toBe('Sem taxa. Troque.');
  });

  it('ativos primeiro', () => {
    expect(botRows(engine({ bots: [bot({ id: 'p', status: 'stopped' }), bot({ id: 'a' })] }), 'pt-BR').map((r) => r.id)).toEqual(['a', 'p']);
  });
});

describe('capital e limites', () => {
  it('capital em uso conta só os ativos e mostra a reserva', () => {
    const line = capitalLine(engine({ bots: [bot(), bot({ id: 'x', status: 'stopped', capitalUsd: 300 })] }), { ...config, enabled: true }, 'pt-BR');
    expect(line).toContain('200');
    expect(line).toContain('1.000');
    expect(line).toContain('200');
    expect(line).not.toContain('500');
  });

  it('limites legíveis', () => {
    const line = limitsLine(config, 'pt-BR');
    expect(line).toContain('100');
    expect(line).toContain('0,05%');
    expect(line).toContain('5');
  });

  it('número do formulário: vírgula ou ponto; vazio ou inválido é null', () => {
    expect(parseLimit('1.000')).toBe(1);
    expect(parseLimit('0,05')).toBe(0.05);
    expect(parseLimit(' 250 ')).toBe(250);
    expect(parseLimit('')).toBeNull();
    expect(parseLimit('abc')).toBeNull();
    expect(parseLimit('-1')).toBeNull();
  });

  it('salvar limites muda só o que o formulário tem, sem mexer no original', () => {
    const next = withLimits(config, { totalUsd: 2000, maxTradeUsd: 50, minNetPct: 0.1, dailyLossLimitUsd: 3 });
    expect(next).toMatchObject({ totalUsd: 2000, reservePct: 20, latencyMs: 1000, policy: { maxTradeUsd: 50, minNetPct: 0.1, dailyLossLimitUsd: 3, maxQuoteAgeMs: 20000 } });
    expect(config.totalUsd).toBe(1000);
  });

  it('ligar o motor mantém os limites sugeridos', () => {
    expect(enabledEngine(config, true)).toEqual({ ...config, enabled: true });
    expect(config.enabled).toBe(false);
  });

  it('par novo entra nos permitidos uma vez só', () => {
    const one = engineWithPair(config, 'BTC/USDT');
    expect(one.policy.allowedPairs).toEqual(['BTC/USDT']);
    expect(engineWithPair(one, 'BTC/USDT')).toBe(one);
  });
});

describe('escolha do par', () => {
  const quote = (exchange: string) => ({ exchange, pair: 'BTC/USDT', bid: 1, ask: 1, takerFee: 0.001, at: 0, inverted: false });
  const pair = (over: Partial<PairState> = {}): PairState => ({ pair: 'BTC/USDT', quotes: [quote('okx'), quote('bybit'), quote('kucoin')], best: { pair: 'BTC/USDT', buyOn: 'kucoin', sellOn: 'bybit', grossPct: 0, netPct: -0.2 }, ...over });
  const win = (max: number) => ({ '5m': null, '1h': null, '24h': { changePp: 0, min: -1, max } });

  it('só oferece corretora com cotação, e a melhor rota vem marcada', () => {
    expect(routeOptions(pair())).toEqual({ exchanges: ['bybit', 'kucoin', 'okx'], suggested: ['kucoin', 'bybit'] });
  });

  it('par sem duas cotações não dá rota', () => {
    expect(routeOptions(pair({ quotes: [quote('okx')], best: null }))).toEqual({ exchanges: ['okx'], suggested: null });
    expect(routeOptions(undefined)).toEqual({ exchanges: [], suggested: null });
  });

  it('máximo em 24 h abaixo do mínimo avisa; acima, não assusta', () => {
    expect(pairHint(pair({ windows: win(-0.18) }), 0.05, 'pt-BR')).toEqual({ text: expect.stringContaining('-0,18%'), low: true });
    expect(pairHint(pair({ windows: win(0.2) }), 0.05, 'pt-BR')).toEqual({ text: expect.stringContaining('0,20%'), low: false });
  });

  it('sem 24 h de histórico: diz isso, sem número', () => {
    expect(pairHint(pair(), 0.05, 'pt-BR')).toEqual({ text: expect.stringContaining('histórico'), low: false });
    expect(pairHint(undefined, 0.05, 'pt-BR').low).toBe(false);
  });
});
