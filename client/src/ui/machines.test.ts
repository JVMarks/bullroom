import { describe, expect, it } from 'vitest';
import { CoreOffice, MACHINES_ROOM_ID } from '../../../shared/core/to-office';
import type { CoreState } from '../../../shared/core/types';
import { machineView } from './machines';

const NOW = 1_793_707_000_000;
const state: CoreState = {
  rev: 1,
  at: NOW,
  exchanges: [],
  pairs: [],
  machine: {
    at: NOW,
    cpuPct: 7.25,
    rssMb: 184,
    heapMb: 60,
    sysMemPct: 63,
    uptimeS: 5400,
    sources: [
      { id: 'binance', kind: 'exchange', ok: true, latencyMs: 41, perMin: 96, limitPerMin: 1200 },
      { id: 'kraken', kind: 'exchange', ok: true, latencyMs: 300, perMin: 55, limitPerMin: 60 },
      { id: 'okx', kind: 'exchange', ok: false, error: 'timeout', perMin: 0, limitPerMin: 545 },
      { id: 'api.mainnet-beta.solana.com', kind: 'chain', chain: 'solana', ok: false, error: 'limite', perMin: 30, limitPerMin: 600, backoffUntil: NOW + 90_000 },
      { id: 'mempool.space', kind: 'chain', chain: 'bitcoin', ok: true, perMin: 2, limitPerMin: null },
    ],
  },
};

describe('sala de máquinas', () => {
  it('vira uma sala do escritório com um rack por fonte e a série da CPU (sem gente)', () => {
    const snap = new CoreOffice(NOW).apply(state);
    const room = snap.rooms.find((r) => r.id === MACHINES_ROOM_ID)!;
    expect(room.name).toBe('Sala de máquinas');
    expect(room.trading).toBeUndefined();
    expect(room.machines).toEqual({
      cpuPct: 7.25,
      rssMb: 184,
      series: [{ at: NOW, pnlUsd: 7.25 }],
      racks: [
        { id: 'binance', name: 'Binance', level: 'ok' },
        { id: 'kraken', name: 'Kraken', level: 'warn' },
        { id: 'okx', name: 'OKX', level: 'down' },
        { id: 'api.mainnet-beta.solana.com', name: 'Solana', level: 'warn' },
        { id: 'mempool.space', name: 'Bitcoin', level: 'ok' },
      ],
    });
    expect(snap.agents.some((a) => a.roomId === MACHINES_ROOM_ID)).toBe(false);
    expect(new CoreOffice(NOW).apply({ ...state, machine: undefined }).rooms).toEqual([]);
  });

  it('cartão: números do núcleo, latência, uso do limite e o motivo de quem está fora ou recuando', () => {
    const v = machineView(state, 'pt-BR', (ms) => `${Math.round(ms / 1000)} s`)!;
    expect([v.cpu, v.memory, v.system, v.uptime]).toEqual(['7,3%', '184 MB', '63%', '5400 s']);
    expect(v.rows.map((r) => [r.name, r.detail, r.use, r.level, r.note])).toEqual([
      ['Binance', '41 ms · 96 de 1.200/min', 0.08, 'ok', null],
      ['Kraken', '300 ms · 55 de 60/min', 55 / 60, 'warn', null],
      ['OKX', '0 de 545/min', 0, 'down', 'timeout'],
      ['Solana · api.mainnet-beta.solana.com', '30 de 600/min', 0.05, 'warn', 'recuando por 90 s'],
      ['Bitcoin · mempool.space', '2/min (limite não publicado)', null, 'ok', null],
    ]);
    expect(machineView({ ...state, machine: undefined }, 'pt-BR', String)).toBeNull();
  });
});
