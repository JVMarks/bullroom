import { describe, expect, it } from 'vitest';
import { agendaAlarm, CoreOffice } from '../../../shared/core/to-office';
import type { AgendaEvent, CoreState } from '../../../shared/core/types';
import { localToIso, sameConfig } from './markets-model';
import { eventTitle, feedsLine, groupEvents, radarRows } from './agenda-model';

const NOW = Date.parse('2026-11-10T12:00:00Z');
const ev = (id: string, at: number, over: Partial<AgendaEvent> = {}): AgendaEvent => ({ id, title: id, kind: 'user', at, impact: 'high', source: 'config', origin: 'user', pairs: [], ...over });
const clock = (at: number) => new Date(at).toISOString().slice(11, 16);

describe('alarme da sala', () => {
  it('acende de 30 min antes até 10 min depois, só em alto impacto e no par do evento (sem pares = todas)', () => {
    const cpi = ev('cpi', NOW + 20 * 60_000, { kind: 'cpi', title: 'CPI' });
    expect(agendaAlarm([cpi], 'USDC/USDT', NOW, clock)).toEqual({ kind: 'alarm', text: 'CPI às 12:20', at: cpi.at - 30 * 60_000, until: cpi.at + 10 * 60_000 });
    expect(agendaAlarm([cpi], 'USDC/USDT', NOW - 11 * 60_000, clock)).toBeUndefined();
    expect(agendaAlarm([cpi], 'USDC/USDT', cpi.at + 10 * 60_000, clock)).toBeUndefined();
    expect(agendaAlarm([{ ...cpi, impact: 'medium' }], 'USDC/USDT', NOW, clock)).toBeUndefined();
    expect(agendaAlarm([{ ...cpi, pairs: ['USDE/USDT'] }], 'USDC/USDT', NOW, clock)).toBeUndefined();
  });

  it('o escritório põe o alarme na sala do par (o `at` não muda: a animação não recomeça)', () => {
    const state: CoreState = {
      rev: 1,
      at: NOW,
      exchanges: [{ id: 'binance', ok: true }],
      pairs: [{ pair: 'USDC/USDT', quotes: [], best: null }],
      agenda: { at: NOW, events: [ev('fomc', NOW + 25 * 60_000, { kind: 'fomc', title: 'FOMC' })], radar: [], feeds: [] },
    };
    const office = new CoreOffice(NOW);
    const a = office.apply(state).rooms[0].effect;
    const b = office.apply({ ...state, at: NOW + 60_000 }).rooms[0].effect;
    expect(a?.kind).toBe('alarm');
    expect(a?.text).toContain('FOMC às');
    expect(b?.at).toBe(a?.at);
  });
});

describe('agenda', () => {
  it('agrupa por dia (Hoje, Amanhã, data), hora local, nome das datas oficiais, passado marcado', () => {
    const g = groupEvents([ev('b', NOW + 86_400_000), ev('a', NOW + 3_600_000, { kind: 'fomc', title: 'FOMC', url: 'https://www.federalreserve.gov/x' }), ev('old', NOW - 3_600_000)], NOW, 'pt-BR');
    expect(g.map((d) => [d.label, d.events.map((e) => [e.title, e.past])])).toEqual([
      ['Hoje', [['old', true], ['FOMC · decisão de juros (EUA)', false]]],
      ['Amanhã', [['b', false]]],
    ]);
    expect(g[0].events[1].url).toBe('https://www.federalreserve.gov/x');
    expect(eventTitle({ kind: 'cpi', title: 'CPI' })).toBe('CPI · inflação ao consumidor (EUA)');
  });

  it('radar: "novo" só depois da última olhada; filtro por sala; resumo dos feeds', () => {
    const items = [
      { id: 'a', title: 'a', url: 'https://x/a', at: NOW, source: 'x', pairs: ['USDC/USDT'] },
      { id: 'b', title: 'b', url: 'https://x/b', at: NOW - 7_200_000, source: 'x', pairs: [] },
    ];
    expect(radarRows(items, NOW - 3_600_000).map((r) => r.fresh)).toEqual([true, false]);
    expect(radarRows(items, null).every((r) => !r.fresh)).toBe(true);
    expect(radarRows(items, null, 'USDC/USDT').map((r) => r.id)).toEqual(['a']);
    expect(feedsLine({ rev: 1, at: 0, exchanges: [], pairs: [], agenda: { at: 0, events: [], radar: [], feeds: [{ url: 'https://a', ok: true }, { url: 'https://b', ok: false }] } })).toBe('1/2 feeds lendo');
    expect(feedsLine(null)).toBeNull();
  });

  it('Mercados: hora local com o fuso explícito; mudar eventos ou feeds acende o Salvar', () => {
    expect(localToIso('2026-11-20T14:00', 180)).toBe('2026-11-20T14:00:00-03:00');
    expect(localToIso('2026-11-20T14:00', -330)).toBe('2026-11-20T14:00:00+05:30');
    expect(localToIso('20/11/2026', 0)).toBeNull();
    const base = { exchanges: ['binance', 'okx'], pairs: ['USDC/USDT'], pollMs: 10_000, alerts: [], transfer: { sizeUsd: 1000, withdrawFees: {} } };
    expect(sameConfig({ ...base, events: [{ title: 'x', at: '2026-11-20T14:00:00-03:00', impact: 'low' }] }, base)).toBe(false);
    expect(sameConfig({ ...base, radar: { feeds: ['https://a/rss'], keywords: [] } }, base)).toBe(false);
    expect(sameConfig({ ...base, radar: { feeds: [], keywords: [] } }, { ...base, radar: { feeds: [], keywords: [] } })).toBe(true);
  });
});
