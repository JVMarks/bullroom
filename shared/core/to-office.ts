// Núcleo do OpenSpread → escritório do Bullroom (conceito A: cada corretora é um personagem na sala do par).
// Puro, com uma memória pequena (a série de cada sala). Código sem Node e sem DOM.
import type { AgentInfo, FeedItem, Notice, OfficeSnapshot, RoomInfo } from '../types';
import { hash32 } from '../hash';
import { intlLocale, tr } from '../i18n';
import type { ValueUnit } from '../trading/types';
import type { CoreState, SpreadOpportunity, WalletChain, WalletState } from './types';

/** Líquido que vale para a sala: com o saque quando o núcleo conseguiu estimar (mesma regra de core/src/transfer.ts). */
export function effectiveNet(best: SpreadOpportunity): number {
  return best.transfer?.netPct ?? best.netPct;
}

const SERIES_MAX = 360;
/** Feed ao vivo: leituras seguidas para aceitar uma rota nova e intervalo mínimo entre avisos de rota do mesmo par. */
export const ROUTE_STABLE = 3;
export const ROUTE_GAP_MS = 5 * 60_000;

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

/** Nome exibido de cada rede. */
export const CHAIN_NAMES: Readonly<Record<WalletChain, string>> = { solana: 'Solana', ethereum: 'Ethereum', base: 'Base', bitcoin: 'Bitcoin' };
const CHAIN_ORDER: readonly WalletChain[] = ['solana', 'ethereum', 'base', 'bitcoin'];
const QUOTE_UNIT: Readonly<Record<string, ValueUnit>> = { SOL: 'sol', ETH: 'eth', BTC: 'btc', USD: 'usd' };
const NATIVE: Readonly<Record<WalletChain, string>> = { solana: 'SOL', ethereum: 'ETH', base: 'ETH', bitcoin: 'BTC' };

/** `7xKX…9fQ`: endereço encurtado (nunca nome de pessoa). */
export const shortAddress = (a: string): string => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

/** Id da sala de uma rede e do personagem de uma carteira. */
export const walletRoomId = (chain: WalletChain): string => `core:wallets:${chain}`;
export const walletAgentId = (w: Pick<WalletState, 'chain' | 'address'>): string => `core:wallet:${w.chain}:${w.address}`;

/**
 * Resultado que vai sobre a cabeça: o da moeda da rede, senão o em dólar (stablecoin). Só com venda fechada no
 * período; Bitcoin não tem troca na rede, então não tem balão. Puro.
 */
export function walletBadge(w: WalletState): { value: number; unit: ValueUnit } | undefined {
  if (!w.trades) return undefined;
  const r = w.results.find((x) => x.quote === NATIVE[w.chain]) ?? w.results.find((x) => x.quote === 'USD') ?? w.results[0];
  const unit = r && QUOTE_UNIT[r.quote];
  return r && unit ? { value: r.amount, unit } : undefined;
}

export class CoreOffice {
  private series = new Map<string, Array<{ at: number; pnlUsd: number }>>();
  private total: Array<{ at: number; pnlUsd: number }> = [];
  /** Rev próprio, sempre crescente: o do núcleo volta a 1 quando ele reinicia, e o store descartaria o snapshot. */
  private rev = 0;

  /** Feed ao vivo: último sinal e rota de cada par, rota candidata (leituras seguidas) e hora do último aviso de rota. */
  private routes = new Map<string, { positive: boolean; route: string; pending: string; seen: number; routeAt: number }>();
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
      const net = p.best ? effectiveNet(p.best) : 0;
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
    // Carteiras on-chain: uma sala por rede, depois das salas de par; cada carteira é um personagem (sentado com
    // posição aberta, circulando zerado). Nada de feed nem aviso: a sala só se mexe.
    const wallets = state.wallets?.wallets ?? [];
    for (const chain of CHAIN_ORDER) {
      const list = wallets.filter((w) => w.chain === chain);
      if (!list.length) continue;
      const roomId = walletRoomId(chain);
      rooms.push({ id: roomId, name: tr('Carteiras · {0}', [CHAIN_NAMES[chain]]), path: `openspread://wallets/${chain}`, slot: rooms.length, seed: hash32(roomId), createdAt: this.startedAt });
      for (const w of list) {
        const id = walletAgentId(w);
        const badge = walletBadge(w);
        const last = w.ops[0];
        agents.push({
          id,
          kind: 'main',
          roomId,
          name: shortAddress(w.address),
          look: hash32(w.address) % 2 ? 'f' : 'm',
          role: w.source === 'birdeye' ? tr('Carteira · {0} · descoberta', [CHAIN_NAMES[chain]]) : tr('Carteira · {0}', [CHAIN_NAMES[chain]]),
          sessionId: id,
          account: 'core',
          status: w.open ? 'working' : 'idle',
          recent: [],
          tasks: [],
          startedAt: this.startedAt,
          lastEventAt: last?.at ?? w.lastAt ?? this.startedAt,
          statusSince: this.startedAt,
          stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
          seed: hash32(w.address),
          ...(badge ? { badge } : {}),
          wallet: w,
        });
      }
    }
    const top = bestNet ?? 0;
    if (!this.total.length || this.total[this.total.length - 1].at !== state.at) this.total.push({ at: state.at, pnlUsd: top });
    if (this.total.length > SERIES_MAX) this.total.splice(0, this.total.length - SERIES_MAX);
    const online = state.exchanges.filter((e) => e.ok).length;
    const withBest = state.pairs.filter((p) => p.best);
    const included = withBest.filter((p) => p.best!.transfer?.netPct != null).length;
    const sizeUsd = withBest.find((p) => p.best!.transfer)?.best!.transfer!.sizeUsd;
    return {
      rev: ++this.rev,
      serverTime: state.at,
      rooms,
      agents,
      accounts: [],
      portfolio: {
        simulated: false,
        unit: 'pct',
        totalPnlUsd: top,
        bots: online,
        trading: online,
        ejected: 0,
        series: this.total.map((x) => ({ ...x })),
        ...(sizeUsd !== undefined ? { transfer: { included, total: withBest.length, sizeUsd } } : {}),
        sources: state.exchanges.map((e) => ({ id: e.id, name: exchangeName(e.id), ok: e.ok, ...(e.ok || !e.error ? {} : { error: e.error }) })),
      },
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


  /**
   * Linhas do feed no modo ao vivo (princípio da calma): o primeiro estado de cada par só é registrado; mudança de
   * sinal do melhor spread líquido entra na hora; mudança de rota (outra dupla de corretoras) só depois de
   * ROUTE_STABLE leituras seguidas e no máximo uma vez a cada ROUTE_GAP_MS por par.
   */
  feed(state: CoreState): FeedItem[] {
    const out: FeedItem[] = [];
    const pct = (n: number) => `${n > 0 ? '+' : ''}${new Intl.NumberFormat(intlLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}%`;
    for (const p of state.pairs) {
      if (!p.best) continue;
      const b = p.best;
      const net = effectiveNet(b);
      const positive = net > 0;
      const route = `${b.buyOn}>${b.sellOn}`;
      const prev = this.routes.get(p.pair);
      if (!prev) {
        this.routes.set(p.pair, { positive, route, pending: route, seen: 0, routeAt: state.at });
        continue;
      }
      const routeArgs = [exchangeName(b.buyOn), exchangeName(b.sellOn), pct(net)];
      const detail = () =>
        b.transfer?.netPct != null ? tr('{0} → {1} · {2}, já sem as taxas de compra e venda e o saque', routeArgs) : tr('{0} → {1} · {2}, já sem as taxas de compra e venda', routeArgs);
      const item = (kind: string, icon: string, text: string): FeedItem => {
        const activity = { id: `core-feed:${p.pair}:${state.at}:${kind}`, kind: 'other' as const, icon, text, detail: detail(), at: state.at };
        return { id: activity.id, agentId: `core:${b.sellOn}:${p.pair}`, roomId: `core:room:${p.pair}`, agentName: exchangeName(b.sellOn), roomName: p.pair, activity };
      };
      if (positive !== prev.positive) {
        out.push(positive ? item('up', '✅', tr('Spread líquido ficou positivo: {0}', [pct(net)])) : item('down', '🔻', tr('Spread líquido voltou ao negativo: {0}', [pct(net)])));
        prev.positive = positive;
      }
      if (route === prev.route) {
        prev.pending = route;
        prev.seen = 0;
      } else {
        prev.seen = route === prev.pending ? prev.seen + 1 : 1;
        prev.pending = route;
        if (prev.seen >= ROUTE_STABLE && state.at - prev.routeAt >= ROUTE_GAP_MS) {
          out.push(item('route', '🔀', tr('Melhor rota agora: {0} → {1}', [exchangeName(b.buyOn), exchangeName(b.sellOn)])));
          prev.route = route;
          prev.routeAt = state.at;
          prev.seen = 0;
        }
      }
    }
    return out;
  }

}
