import { describe, expect, it } from 'vitest';
import { CoreOffice, SIMULATION_ROOM_ID } from './to-office';
import type { CoreState, EngineBot, EngineFill, EngineState } from './types';

const NOW = 1_760_000_000_000;

const bot = (over: Partial<EngineBot> = {}): EngineBot => ({
  id: 'bot-1',
  pair: 'AERO/USDT',
  exchanges: ['binance', 'bybit'],
  capitalUsd: 200,
  startedAt: NOW - 1000,
  status: 'running',
  pnlUsd: 0,
  pnlTodayUsd: 0,
  feesUsd: 0,
  trades: 0,
  wins: 0,
  losses: 0,
  maxDrawdownUsd: 0,
  balances: {},
  samples: 0,
  samplesAbove: 0,
  series: [],
  ...over,
});

const fill = (over: Partial<EngineFill> = {}): EngineFill => ({
  id: 'bot-1-1',
  botId: 'bot-1',
  at: NOW,
  pair: 'AERO/USDT',
  buyOn: 'binance',
  sellOn: 'bybit',
  base: 77,
  buyAvg: 0.6447,
  sellAvg: 0.6525,
  feesUsd: 0.1,
  pnlUsd: 0.5,
  quotedNetPct: 1.0874,
  realizedNetPct: 1.0077,
  partial: false,
  ...over,
});

const engine = (over: Partial<EngineState> = {}): EngineState => ({ at: NOW, engine: { kind: 'paper', ok: true }, mode: 'paper', bots: [bot()], fills: [], blocks: [], latencyMs: 1000, dailyLossLimitUsd: 5, ...over });

const state = (e?: EngineState, at = NOW): CoreState => ({
  rev: 1,
  at,
  exchanges: [{ id: 'binance', ok: true, lastAt: at }],
  pairs: [{ pair: 'AERO/USDT', quotes: [], best: { pair: 'AERO/USDT', buyOn: 'binance', sellOn: 'bybit', grossPct: 1.2, netPct: 1 } }],
  ...(e ? { engine: e } : {}),
});

const simRoom = (e: EngineState) => new CoreOffice(NOW).apply(state(e)).rooms.find((r) => r.id === SIMULATION_ROOM_ID);

describe('sala de simulação', () => {
  it('sem motor: nada muda, nem sala nem carteira paper', () => {
    const snap = new CoreOffice(NOW).apply(state());
    expect(snap.rooms.map((r) => r.id)).toEqual(['core:room:AERO/USDT']);
    expect(snap.portfolio?.paper).toBeUndefined();
  });

  it('motor sem robô: sem sala, para o prédio não ganhar uma sala vazia', () => {
    expect(simRoom(engine({ bots: [] }))).toBeUndefined();
  });

  it('uma sala só para todos os robôs, marcada como simulação, com PL em dólar', () => {
    const r = simRoom(engine({ bots: [bot({ pnlUsd: 0.5 }), bot({ id: 'bot-2', pair: 'ERA/USDT', pnlUsd: 0.48 })] }))!;
    expect(r.simulation).toBe(true);
    expect(r.trading?.unit).toBe('usd');
    expect(r.trading?.pnlUsd).toBeCloseTo(0.98, 10);
  });

  it('a semente dá sempre o tema roxo, e o selo vai no nome da sala', () => {
    const r = simRoom(engine())!;
    expect(r.seed).toBe(3);
    expect(r.name).toContain('SIMULATED');
  });

  it('o PL de robô parado continua na placa: parar não apaga resultado', () => {
    const r = simRoom(engine({ bots: [bot({ pnlUsd: 0.5, status: 'stopped' }), bot({ id: 'bot-2', pnlUsd: 0.1 })] }))!;
    expect(r.trading?.pnlUsd).toBeCloseTo(0.6, 10);
  });

  it('todos parados: a sala sai do prédio', () => {
    expect(simRoom(engine({ bots: [bot({ status: 'stopped' })] }))).toBeUndefined();
  });

  it('não mexe no spread real: placa do par, topo e unidade continuam em %', () => {
    const snap = new CoreOffice(NOW).apply(state(engine({ bots: [bot({ pnlUsd: 99 })] })));
    expect(snap.rooms[0].trading).toMatchObject({ pnlUsd: 1, unit: 'pct' });
    expect(snap.portfolio).toMatchObject({ simulated: false, unit: 'pct', totalPnlUsd: 1 });
  });

  it('a série só cresce quando o resultado muda (calma)', () => {
    const off = new CoreOffice(NOW);
    off.apply(state(engine({ bots: [bot({ pnlUsd: 0.5 })] })));
    off.apply(state(engine({ bots: [bot({ pnlUsd: 0.5 })] }), NOW + 10_000));
    const snap = off.apply(state(engine({ bots: [bot({ pnlUsd: 0.7 })] }), NOW + 20_000));
    expect(snap.rooms.find((r) => r.id === SIMULATION_ROOM_ID)!.trading!.series.map((p) => p.pnlUsd)).toEqual([0.5, 0.7]);
  });
});

describe('robôs do motor na sala', () => {
  const agents = (e: EngineState) => new CoreOffice(NOW).apply(state(e)).agents.filter((a) => a.roomId === SIMULATION_ROOM_ID);

  it('todo robô é marcado como simulado e fica na sala de simulação', () => {
    const [a] = agents(engine({ bots: [bot({ pnlUsd: 0.5, pnlTodayUsd: 0.2, capitalUsd: 200 })] }));
    expect(a.name).toBe('AERO');
    expect(a.trading).toMatchObject({ simulated: true, pair: 'AERO/USDT', exchange: 'Binance + Bybit', pnlUsd: 0.5, pnlTodayUsd: 0.2, capitalUsd: 200, position: 'flat' });
  });

  it.each([
    ['running', 'working'],
    ['parked', 'working'], // fica sentado: circulando, levaria o número simulado para fora da sala
    ['ejected', 'offline'],
  ] as const)('%s vira %s', (status, expected) => {
    expect(agents(engine({ bots: [bot({ status })] }))[0].status).toBe(expected);
  });

  it('parado por saldo fica marcado; rodando não', () => {
    expect(agents(engine({ bots: [bot({ status: 'parked' })] }))[0].trading!.parked).toBe(true);
    expect(agents(engine())[0].trading!.parked).toBeUndefined();
  });

  it('ejetado leva a hora da ejeção, a mesma nas leituras seguintes', () => {
    const off = new CoreOffice(NOW);
    const first = off.apply(state(engine({ bots: [bot({ status: 'ejected' })] }))).agents.find((a) => a.trading)!;
    const next = off.apply(state(engine({ bots: [bot({ status: 'ejected' })] }), NOW + 5000)).agents.find((a) => a.trading)!;
    expect(first.trading!.ejectedAt).toBe(NOW);
    expect(next.trading!.ejectedAt).toBe(NOW);
  });

  it('parado pelo usuário sai da sala', () => {
    expect(agents(engine({ bots: [bot({ status: 'stopped' }), bot({ id: 'bot-2' })] })).map((a) => a.id)).toEqual(['core:bot:bot-2']);
  });

  it('estatísticas do cartão vêm do motor; sem preço de BTC, a comparação fica zerada', () => {
    const [a] = agents(engine({ bots: [bot({ trades: 3, wins: 2, maxDrawdownUsd: 0.4, pnlUsd: 1 })] }));
    expect(a.trading!.stats).toMatchObject({ trades: 3, wins: 2, maxDrawdownUsd: 0.4, btcStartUsd: 0, btcNowUsd: 0 });
  });

  it('quem já operou mostra a última operação; quem não operou fica sem atividade', () => {
    const [a, b] = agents(engine({ bots: [bot(), bot({ id: 'bot-2', pair: 'BTC/USDT' })], fills: [fill()] }));
    expect(a.activity?.text).toContain('0,50');
    expect(b.activity).toBeUndefined();
  });

  it('o limite de perda do cartão é o da política', () => {
    const [a] = agents(engine({ dailyLossLimitUsd: 7 }));
    expect(a.trading!.dailyLossLimitUsd).toBe(7);
  });
});

describe('carteira paper no topo', () => {
  it('total, robôs, em operação e ejetados, sem somar no número real', () => {
    const snap = new CoreOffice(NOW).apply(
      state(engine({ bots: [bot({ pnlUsd: 0.5 }), bot({ id: 'b2', pnlUsd: 0.48, status: 'parked' }), bot({ id: 'b3', pnlUsd: -5, status: 'ejected' }), bot({ id: 'b4', pnlUsd: 1, status: 'stopped' })] })),
    );
    expect(snap.portfolio!.paper).toEqual({ pnlUsd: expect.closeTo(-3.02, 10), bots: 3, trading: 1, ejected: 1 });
  });
});

describe('feed dos robôs', () => {
  it('operação que já existia ao abrir não vira linha nova', () => {
    expect(new CoreOffice(NOW).feed(state(engine({ fills: [fill()] })))).toEqual([]);
  });

  it('operação nova vira uma linha, marcada como simulada, e não repete', () => {
    const off = new CoreOffice(NOW);
    off.feed(state(engine()));
    const items = off.feed(state(engine({ fills: [fill()] }), NOW + 10_000));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ agentId: 'core:bot:bot-1', roomId: SIMULATION_ROOM_ID });
    expect(items[0].activity.text).toContain('simulada');
    expect(off.feed(state(engine({ fills: [fill()] }), NOW + 20_000))).toEqual([]);
  });

  it('ficar parado ou recusado não entra no feed (calma)', () => {
    const off = new CoreOffice(NOW);
    off.feed(state(engine()));
    expect(off.feed(state(engine({ bots: [bot({ status: 'parked' })], blocks: [{ botId: 'bot-1', at: NOW, reasons: [{ code: 'x', message: 'm', fix: 'f' }] }] })))).toEqual([]);
  });

  it('ejeção vira uma linha, uma vez', () => {
    const off = new CoreOffice(NOW);
    off.feed(state(engine()));
    const ejected = engine({ bots: [bot({ status: 'ejected' })] });
    expect(off.feed(state(ejected, NOW + 1))).toHaveLength(1);
    expect(off.feed(state(ejected, NOW + 2))).toEqual([]);
  });
});
