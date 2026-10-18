import { describe, expect, it } from 'vitest';
import { CoreOffice } from './to-office';
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
});
