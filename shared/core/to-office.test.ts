import { describe, expect, it } from 'vitest';
import { CoreOffice, ROUTE_GAP_MS, ROUTE_STABLE } from './to-office';
import type { CoreState, Quote } from './types';

const NOW = 1_760_000_000_000;
const q = (exchange: string, bid: number, ask: number, pair = 'USDC/USDT'): Quote => ({ exchange, pair, bid, ask, takerFee: 0.001, at: NOW, inverted: false });

const STATE: CoreState = {
  rev: 7,
  at: NOW,
  exchanges: [
    { id: 'binance', ok: true, lastAt: NOW },
    { id: 'okx', ok: true, lastAt: NOW },
    { id: 'kraken', ok: false, error: 'timeout' },
  ],
  pairs: [
    {
      pair: 'USDC/USDT',
      quotes: [q('binance', 1.0012, 1.0013), q('okx', 1.0014, 1.0015)],
      best: { pair: 'USDC/USDT', buyOn: 'binance', sellOn: 'okx', grossPct: 0.01, netPct: -0.19 },
    },
    { pair: 'USDE/USDT', quotes: [q('binance', 1.0009, 1.001, 'USDE/USDT')], best: null },
  ],
};

describe('CoreOffice (núcleo → sala, conceito A)', () => {
  it('uma sala por par e um personagem por corretora com cotação', () => {
    const snap = new CoreOffice(NOW).apply(STATE);
    expect(snap.rooms.map((r) => r.name)).toEqual(['USDC/USDT', 'USDE/USDT']);
    const usdc = snap.agents.filter((a) => a.roomId === snap.rooms[0].id);
    expect(usdc.map((a) => a.name).sort()).toEqual(['Binance', 'OKX']);
    expect(usdc.every((a) => a.status === 'working')).toBe(true);
    expect(snap.agents.some((a) => a.name === 'Kraken')).toBe(false);
  });

  it('balão = distância do preço médio da sala, em pontos-base', () => {
    const snap = new CoreOffice(NOW).apply(STATE);
    const bin = snap.agents.find((a) => a.name === 'Binance' && a.roomId === snap.rooms[0].id)!;
    const okx = snap.agents.find((a) => a.name === 'OKX' && a.roomId === snap.rooms[0].id)!;
    expect(bin.badge!.unit).toBe('bp');
    expect(bin.badge!.value).toBeCloseTo(-1, 1);
    expect(okx.badge!.value).toBeCloseTo(1, 1);
    expect(bin.trading).toBeUndefined();
  });

  it('placa = melhor spread líquido em %, com série; sala sem par de corretoras fica em 0', () => {
    const off = new CoreOffice(NOW);
    off.apply(STATE);
    const snap = off.apply({ ...STATE, rev: 8, at: NOW + 10_000 });
    expect(snap.rooms[0].trading).toMatchObject({ pnlUsd: -0.19, unit: 'pct' });
    expect(snap.rooms[0].trading!.series).toHaveLength(2);
    expect(snap.rooms[1].trading!.pnlUsd).toBe(0);
  });

  it('carteira: ao vivo (não simulado), em %, corretoras online', () => {
    const snap = new CoreOffice(NOW).apply(STATE);
    expect(snap.portfolio).toMatchObject({ simulated: false, unit: 'pct', totalPnlUsd: -0.19, bots: 2 });
    expect(snap.meta.demo).toBe(false);
  });

  it('rev do escritório sempre sobe, mesmo se o núcleo reiniciar (o rev dele volta a 1)', () => {
    const off = new CoreOffice(NOW);
    const a = off.apply(STATE).rev;
    const b = off.apply({ ...STATE, rev: 1, at: NOW + 10_000 }).rev;
    expect(b).toBeGreaterThan(a);
  });

  it('alertas viram aviso da sala uma vez; os que já existiam no primeiro estado ficam calados', () => {
    const office = new CoreOffice(NOW);
    const ev = (id: string, at = NOW) => ({ id, pair: 'USDC/USDT', abovePct: -0.2, netPct: -0.19, buyOn: 'binance', sellOn: 'coinbaseexchange', at });
    expect(office.alertNotices({ ...STATE, alerts: [ev('a')] })).toEqual([]);
    const fresh = office.alertNotices({ ...STATE, alerts: [ev('a'), ev('b', NOW + 5)] });
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toMatchObject({ id: 'core-alert-b', level: 'info', roomId: 'core:room:USDC/USDT', at: NOW + 5 });
    expect(fresh[0].text).toContain('USDC/USDT');
    expect(fresh[0].text).toContain('Coinbase');
    expect(office.alertNotices({ ...STATE, alerts: [ev('a'), ev('b', NOW + 5)] })).toEqual([]);
    // núcleo antigo, sem alertas: nada
    expect(office.alertNotices(STATE)).toEqual([]);
  });

  it('carteira ao vivo traz o status de cada corretora (com o motivo de quem está fora)', () => {
    const snap = new CoreOffice(NOW).apply(STATE);
    expect(snap.portfolio!.sources).toEqual([
      { id: 'binance', name: 'Binance', ok: true },
      { id: 'okx', name: 'OKX', ok: true },
      { id: 'kraken', name: 'Kraken', ok: false, error: 'timeout' },
    ]);
  });

  it('feed ao vivo: calado na abertura, mudança de sinal na hora, rota só estável e espaçada', () => {
    const office = new CoreOffice(NOW);
    const st = (at: number, netPct: number, buyOn = 'binance', sellOn = 'okx'): CoreState => ({
      ...STATE,
      at,
      pairs: [{ pair: 'USDC/USDT', quotes: [], best: { pair: 'USDC/USDT', buyOn, sellOn, grossPct: netPct + 0.2, netPct } }],
    });
    expect(office.feed(st(NOW, -0.2))).toEqual([]);
    const up = office.feed(st(NOW + 10_000, 0.03));
    expect(up).toHaveLength(1);
    expect(up[0]).toMatchObject({ roomId: 'core:room:USDC/USDT', agentId: 'core:okx:USDC/USDT', roomName: 'USDC/USDT' });
    expect(up[0].activity.text).toContain('positivo');
    expect(office.feed(st(NOW + 20_000, 0.04))).toEqual([]);
    expect(office.feed(st(NOW + 30_000, -0.1))[0].activity.text).toContain('negativo');
    // rota nova: só depois de ROUTE_STABLE leituras seguidas, e respeitando o intervalo desde a última
    let t = NOW + 30_000;
    const flips: number[] = [];
    for (let i = 0; i < ROUTE_STABLE + 2; i++) flips.push(office.feed(st((t += 10_000), -0.1, 'bybit', 'binance')).length);
    expect(flips.every((n) => n === 0)).toBe(true); // ainda dentro do intervalo mínimo desde a abertura
    t = NOW + ROUTE_GAP_MS + 60_000;
    const later = office.feed(st(t, -0.1, 'bybit', 'binance'));
    expect(later).toHaveLength(1);
    expect(later[0].activity.text).toContain('Bybit → Binance');
    // rota que pisca (uma leitura só) não vira aviso
    const t2 = t + ROUTE_GAP_MS + 60_000;
    expect(office.feed(st(t2, -0.1, 'kraken', 'okx'))).toEqual([]);
    expect(office.feed(st(t2 + 10_000, -0.1, 'bybit', 'binance'))).toEqual([]);
  });

  it('com o saque estimado, placa e topo usam o líquido com transferência e o resumo diz em quantas salas', () => {
    const t = { asset: 'USDC', from: 'binance', sizeUsd: 1000, fee: 1, costPct: 0.1, netPct: -0.29 };
    const withT: CoreState = { ...STATE, pairs: [{ ...STATE.pairs[0], best: { ...STATE.pairs[0].best!, transfer: t } }, STATE.pairs[1]] };
    const snap = new CoreOffice(NOW).apply(withT);
    expect(snap.rooms[0].trading!.pnlUsd).toBe(-0.29);
    expect(snap.portfolio!.totalPnlUsd).toBe(-0.29);
    expect(snap.portfolio!.transfer).toEqual({ included: 1, total: 1, sizeUsd: 1000 });
    // sem configuração de transferência no núcleo: sem resumo (núcleo antigo)
    expect(new CoreOffice(NOW).apply(STATE).portfolio!.transfer).toBeUndefined();
  });
});
