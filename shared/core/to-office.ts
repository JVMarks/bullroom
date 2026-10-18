// Núcleo do OpenSpread → escritório do Bullroom (conceito A: cada corretora é um personagem na sala do par).
// Puro, com uma memória pequena (a série de cada sala). Código sem Node e sem DOM.
import type { AgentInfo, OfficeSnapshot, RoomInfo } from '../types';
import { hash32 } from '../hash';
import type { CoreState } from './types';

const SERIES_MAX = 360;

/** Nome exibido de cada corretora (id da CCXT → nome). */
export const EXCHANGE_NAMES: Readonly<Record<string, string>> = {
  binance: 'Binance',
  okx: 'OKX',
  bybit: 'Bybit',
  kraken: 'Kraken',
  coinbaseexchange: 'Coinbase',
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

export class CoreOffice {
  private series = new Map<string, Array<{ at: number; pnlUsd: number }>>();
  private total: Array<{ at: number; pnlUsd: number }> = [];
  /** Rev próprio, sempre crescente: o do núcleo volta a 1 quando ele reinicia, e o store descartaria o snapshot. */
  private rev = 0;

  constructor(private startedAt = Date.now()) {}

  apply(state: CoreState): OfficeSnapshot {
    const rooms: RoomInfo[] = [];
    const agents: AgentInfo[] = [];
    let bestNet: number | null = null;
    state.pairs.forEach((p, slot) => {
      const id = `core:room:${p.pair}`;
      const net = p.best ? p.best.netPct : 0;
      if (p.best) bestNet = bestNet === null ? net : Math.max(bestNet, net);
      const series = this.series.get(id) ?? [];
      if (!series.length || series[series.length - 1].at !== state.at) series.push({ at: state.at, pnlUsd: net });
      if (series.length > SERIES_MAX) series.splice(0, series.length - SERIES_MAX);
      this.series.set(id, series);
      rooms.push({ id, name: p.pair, path: `openspread://${p.pair}`, slot, seed: hash32(id), createdAt: this.startedAt, trading: { pnlUsd: net, unit: 'pct', series: series.map((x) => ({ ...x })) } });
      // distância de cada corretora para o preço médio da sala, em pontos-base
      const mids = p.quotes.map((q) => (q.bid + q.ask) / 2);
      const avg = mids.reduce((s, m) => s + m, 0) / (mids.length || 1);
      p.quotes.forEach((q, i) => {
        const name = EXCHANGE_NAMES[q.exchange] ?? q.exchange;
        const agentId = `core:${q.exchange}:${p.pair}`;
        agents.push({
          id: agentId,
          kind: 'main',
          roomId: id,
          name,
          look: hash32(q.exchange) % 2 ? 'f' : 'm',
          role: `${name} · ${p.pair}`,
          title: `bid ${q.bid.toFixed(5)} · ask ${q.ask.toFixed(5)}${q.inverted ? ' (inv.)' : ''}`,
          sessionId: agentId,
          account: 'core',
          status: 'working',
          recent: [],
          tasks: [],
          startedAt: this.startedAt,
          lastEventAt: q.at,
          statusSince: this.startedAt,
          stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
          seed: hash32(q.exchange),
          badge: { value: round2(((mids[i] - avg) / avg) * 10_000), unit: 'bp' },
        });
      });
    });
    const top = bestNet ?? 0;
    if (!this.total.length || this.total[this.total.length - 1].at !== state.at) this.total.push({ at: state.at, pnlUsd: top });
    if (this.total.length > SERIES_MAX) this.total.splice(0, this.total.length - SERIES_MAX);
    const online = state.exchanges.filter((e) => e.ok).length;
    return {
      rev: ++this.rev,
      serverTime: state.at,
      rooms,
      agents,
      accounts: [],
      portfolio: { simulated: false, unit: 'pct', totalPnlUsd: top, bots: online, trading: online, ejected: 0, series: this.total.map((x) => ({ ...x })) },
      meta: { demo: false, sources: [], startedAt: this.startedAt, version: 'core' },
    };
  }
}
