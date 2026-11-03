import { describe, expect, it } from 'vitest';
import type { AgentInfo } from '../../../shared/types';
import { bubbleBounds, bubbleColor, bubbleInputs, packBubbles, R_MAX, R_MIN, sizeBasis, type BubbleInput } from './bubbles-model';

const bot = (id: string, capitalUsd: number, pnlUsd: number, roomId = 'r1', ejected = false): AgentInfo =>
  ({ id, name: id, roomId, trading: { capitalUsd, pnlUsd, ...(ejected ? { ejectedAt: 1 } : {}) } }) as unknown as AgentInfo;

describe('bolhas', () => {
  it('robô: tamanho = capital, cor = PL; ejetado e Bitcoin ficam de fora; carteira pelas vendas e pelo balão', () => {
    const wallet = { id: 'w', name: 'DPDM…Ny7F', roomId: 'core:wallets:solana', wallet: { chain: 'solana', trades: 3 }, badge: { value: 1.2, unit: 'sol' } } as unknown as AgentInfo;
    const btc = { id: 'b', name: 'b', roomId: 'x', wallet: { chain: 'bitcoin', trades: 0 } } as unknown as AgentInfo;
    const exch = { id: 'e', name: 'Binance', roomId: 'x', badge: { value: 1, unit: 'bp' } } as unknown as AgentInfo;
    expect(bubbleInputs([bot('a', 500, 2), bot('z', 100, 1, 'r1', true), wallet, btc, exch])).toEqual([
      { id: 'a', name: 'a', roomId: 'r1', size: 500, value: 2, unit: 'usd' },
      { id: 'w', name: 'DPDM…Ny7F', roomId: 'core:wallets:solana', size: 3, value: 1.2, unit: 'sol' },
    ]);
  });

  it('empacota sem sobrepor, a maior no centro, tamanho pela raiz do capital, sempre igual', () => {
    const items: BubbleInput[] = Array.from({ length: 30 }, (_, i) => ({ id: `b${i}`, name: `b${i}`, roomId: 'r', size: 50 + ((i * 37) % 450), value: ((i * 13) % 9) - 4, unit: 'usd' }));
    const a = packBubbles(items, 'pt-BR');
    expect(packBubbles([...items].reverse(), 'pt-BR')).toEqual(a);
    for (let i = 0; i < a.length; i++)
      for (let j = i + 1; j < a.length; j++) expect(Math.hypot(a[i].x - a[j].x, a[i].y - a[j].y)).toBeGreaterThanOrEqual(a[i].r + a[j].r);
    const biggest = a[0];
    expect([biggest.x, biggest.y, biggest.r]).toEqual([0, 0, R_MAX]);
    for (const b of a) expect(b.r).toBeGreaterThanOrEqual(R_MIN);
    const box = bubbleBounds(a);
    for (const b of a) expect(b.x - b.r >= box.x && b.y + b.r <= box.y + box.h).toBe(true);
  });

  it('capitais quase iguais: o tamanho vira o do PL (com piso); capitais diferentes: capital; só carteiras: vendas', () => {
    const same = [
      { id: 'a', name: 'a', roomId: 'r', size: 500, value: 4, unit: 'usd' as const },
      { id: 'b', name: 'b', roomId: 'r', size: 550, value: -1, unit: 'usd' as const },
      { id: 'c', name: 'c', roomId: 'r', size: 500, value: 0, unit: 'usd' as const },
    ];
    const s = sizeBasis(same);
    expect(s.basis).toBe('pnl');
    expect(s.items.map((i) => i.size)).toEqual([4, 1, 0.16]);
    expect(sizeBasis([{ ...same[0] }, { ...same[1], size: 2000 }]).basis).toBe('capital');
    expect(sizeBasis([{ id: 'core:wallet:solana:x', name: 'x', roomId: 'r', size: 3, value: 1, unit: 'sol' }]).basis).toBe('trades');
  });

  it('texto e tom do valor; força relativa à maior da mesma unidade; cor', () => {
    const [x, y] = packBubbles(
      [
        { id: 'x', name: 'x', roomId: 'r', size: 10, value: -4, unit: 'usd' },
        { id: 'y', name: 'y', roomId: 'r', size: 5, value: 2, unit: 'usd' },
      ],
      'pt-BR',
    );
    expect([x.text, x.tone, x.strength]).toEqual(['-$4,00', 'loss', 1]);
    expect([y.text, y.tone, y.strength]).toEqual(['+$2,00', 'gain', 0.5]);
    expect(bubbleColor('zero', 1)).toBe('#6b7280');
    expect(bubbleColor('gain', 1)).toBe('rgb(34,197,94)');
    expect(packBubbles([], 'pt-BR')).toEqual([]);
  });
});
