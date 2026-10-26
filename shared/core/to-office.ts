// Núcleo do OpenSpread → escritório do Bullroom (conceito A: cada corretora é um personagem na sala do par).
// Puro, com uma memória pequena (a série de cada sala). Código sem Node e sem DOM.
import type { AgentInfo, Notice, OfficeSnapshot, RoomInfo } from '../types';
import { hash32 } from '../hash';
import { intlLocale, tr } from '../i18n';
import type { CoreState } from './types';

const SERIES_MAX = 360;

/** Endereço do núcleo local do OpenSpread (stream em /v1/stream; configuração em /v1/config e /v1/check). */
export const CORE_BASE = 'http://127.0.0.1:4848';

/** Nome exibido de cada corretora (id da CCXT → nome). */
export const EXCHANGE_NAMES: Readonly<Record<string, string>> = {
  binance: 'Binance',
  okx: 'OKX',
  bybit: 'Bybit',
  kraken: 'Kraken',
  coinbaseexchange: 'Coinbase',
  kucoin: 'KuCoin',
  gate: 'Gate',
  mexc: 'MEXC',
  bitget: 'Bitget',
  htx: 'HTX',
  bitfinex: 'Bitfinex',
  bitstamp: 'Bitstamp',
  gemini: 'Gemini',
  cryptocom: 'Crypto.com',
  bingx: 'BingX',
  bitmart: 'BitMart',
  bitvavo: 'Bitvavo',
  upbit: 'Upbit',
  binanceus: 'Binance US',
  mercado: 'Mercado Bitcoin',
  foxbit: 'Foxbit',
  bitso: 'Bitso',
};

/** Nome exibido de uma corretora; sem nome na lista, o id com a primeira letra maiúscula. */
export function exchangeName(id: string): string {
  return EXCHANGE_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export class CoreOffice {
  private series = new Map<string, Array<{ at: number; pnlUsd: number }>>();
  private total: Array<{ at: number; pnlUsd: number }> = [];
  /** Rev próprio, sempre crescente: o do núcleo volta a 1 quando ele reinicia, e o store descartaria o snapshot. */
  private rev = 0;

  /** Alertas já vistos (por id) e se o primeiro estado já chegou. */
  private seenAlerts = new Set<string>();
  private alertsPrimed = false;

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
        const name = exchangeName(q.exchange);
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

  /**
   * Alertas de spread que tocaram desde a última olhada, como avisos da sala do par. Os que já existiam no primeiro
   * estado recebido não viram aviso (tocaram antes de o Bullroom abrir).
   */
  alertNotices(state: CoreState): Notice[] {
    const events = state.alerts ?? [];
    const fresh = events.filter((e) => !this.seenAlerts.has(e.id));
    for (const e of fresh) this.seenAlerts.add(e.id);
    if (this.seenAlerts.size > 200) this.seenAlerts = new Set(events.map((e) => e.id));
    if (!this.alertsPrimed) {
      this.alertsPrimed = true;
      return [];
    }
    const pct = (n: number) => `${new Intl.NumberFormat(intlLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(n)}%`;
    return fresh.map((e) => ({
      id: `core-alert-${e.id}`,
      level: 'info',
      text: tr('{0}: spread líquido chegou a {1} (alerta em {2}), de {3} para {4}.', [e.pair, pct(e.netPct), pct(e.abovePct), exchangeName(e.buyOn), exchangeName(e.sellOn)]),
      roomId: `core:room:${e.pair}`,
      at: e.at,
    }));
  }

}
