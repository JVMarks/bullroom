// Simulador de robôs de trading do Bullroom (dados fictícios).
// Puro (sem Node/DOM): roda no navegador com ?mock=trading. Mesmo formato do DemoSimulator (tick/snapshot).
//
// Cada sala é um par de moedas com até ROOM_MAX_BOTS robôs (a ilha 3x2 de client/src/world/layout/room.ts).
// A cada passo de mercado (20 s / speed), cada robô pode entrar ou sair de posição e, posicionado, o PL faz um
// passeio aleatório. Quem atinge a perda diária é ejetado (status 'offline') e sai do snapshot depois de
// OFFLINE_GRACE_MS, para a animação de saída rodar. Ejetado não volta: não há reposição no mesmo dia.
// Vale sempre: a mesma semente e o mesmo `now` geram o mesmo escritório.
import type { Activity, AgentInfo, FeedItem, OfficeSnapshot, RoomInfo } from '../types';
import type { DemoTickResult } from '../demo/simulator';
import { hash32, mulberry32 } from '../hash';
import { pickName } from '../names';
import { intlLocale, tr } from '../i18n';
import { botStatus, formatPnl, shouldEject } from './rules';
import type { BotStats, BotTrading, PortfolioInfo, RoomTrading } from './types';

export const ROOM_MAX_BOTS = 6;
const MAX_BOTS = 54;
const DEFAULT_BOTS = 18;
const DEFAULT_TICK_MS = 20_000;
const OFFLINE_GRACE_MS = 20_000;
const SERIES_MAX = 360;
const RECENT_MAX = 30;
/** Passos atrasados processados de uma vez (aba suspensa): o resto é descartado. */
const MAX_CATCH_UP = 50;
const DAILY_LOSS_LIMIT_USD = 5;
const CAPITAL_USD = 1000;
/** Preço inicial do BTC simulado e o passo máximo por passo de mercado (±0,3%). */
const BTC_START_USD = 60_000;
const BTC_STEP = 0.003;

/** Ordem fixa das salas: stablecoins primeiro, depois os majors. */
const PAIRS = ['USDT/USDC', 'USDC/DAI', 'FDUSD/USDT', 'PYUSD/USDC', 'USDT/DAI', 'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BTC/USDC'] as const;
const STABLE = new Set<string>(['USDT/USDC', 'USDC/DAI', 'FDUSD/USDT', 'PYUSD/USDC', 'USDT/DAI']);
const EXCHANGES = ['Binance', 'OKX', 'Kraken', 'Bybit', 'Coinbase'] as const;
const STABLE_STRATEGIES = ['Spread', 'Peg reversion'] as const;
const MAJOR_STRATEGIES = ['Momentum', 'Grid', 'Mean reversion'] as const;

export interface TradingSimOptions {
  seed?: number;
  /** Multiplicador de velocidade (10 = um passo de mercado a cada 2 s). */
  speed?: number;
  /** Quantos robôs (padrão 18, máximo 54). */
  bots?: number;
  /** Intervalo entre passos de mercado no ritmo normal (padrão 20 s). */
  tickMs?: number;
}

interface SimBot {
  info: AgentInfo;
  trading: BotTrading;
  stats: BotStats;
  /** PL na abertura da posição atual (vitória = fechar acima dele). */
  entryPnl: number;
  removeAt?: number;
}

const pushCapped = <T>(list: T[], item: T): void => {
  list.push(item);
  if (list.length > SERIES_MAX) list.splice(0, list.length - SERIES_MAX);
};

export class TradingSimulator {
  private rng: () => number;
  private speed: number;
  private interval: number;
  private startedAt: number;
  private nextStepAt: number;
  private rooms: RoomInfo[] = [];
  private bots = new Map<string, SimBot>();
  /** PL final dos ejetados que já saíram do snapshot (continua na carteira). */
  private gonePnl = 0;
  private ejectedCount = 0;
  private series: PortfolioInfo['series'] = [];
  private pendingFeed: FeedItem[] = [];
  private rev = 0;
  private dirty = true;
  private seq = 0;
  /** Preço do BTC simulado, com sorteio próprio (não mexe na sequência dos robôs). */
  private btcRng: () => number;
  private btcUsd = BTC_START_USD;
  /** PL final dos ejetados que já saíram, por sala, e a série de cada sala. */
  private roomGone = new Map<string, number>();
  private roomSeries = new Map<string, RoomTrading['series']>();

  constructor(opts: TradingSimOptions = {}, now = Date.now()) {
    this.rng = mulberry32(opts.seed ?? hash32(String(now)));
    this.btcRng = mulberry32(((opts.seed ?? hash32(String(now))) ^ 0x9e3779b9) >>> 0);
    this.speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
    this.interval = (opts.tickMs ?? DEFAULT_TICK_MS) / this.speed;
    this.startedAt = now;
    this.nextStepAt = now + this.interval;
    const count = Math.max(0, Math.min(MAX_BOTS, Math.floor(opts.bots ?? DEFAULT_BOTS)));
    const used = new Set<string>();
    for (let i = 0; i < Math.ceil(count / ROOM_MAX_BOTS); i++) {
      const pair = PAIRS[i];
      const id = `sim:room:${pair}`;
      this.rooms.push({ id, name: pair, path: `sim://${pair}`, slot: i, seed: hash32(id), createdAt: now });
      this.roomSeries.set(id, [{ at: now, pnlUsd: 0 }]);
    }
    for (let j = 0; j < count; j++) {
      const room = this.rooms[Math.floor(j / ROOM_MAX_BOTS)];
      const id = `sim:bot-${j + 1}`;
      const person = pickName(id, used);
      used.add(person.name);
      const stable = STABLE.has(room.name);
      const r = this.rng();
      const trading: BotTrading = {
        exchange: this.pick(EXCHANGES),
        pair: room.name,
        strategy: this.pick(stable ? STABLE_STRATEGIES : MAJOR_STRATEGIES),
        position: r < 0.25 ? 'long' : r < 0.5 ? 'short' : 'flat',
        pnlUsd: 0,
        dailyLossLimitUsd: DAILY_LOSS_LIMIT_USD,
        capitalUsd: CAPITAL_USD,
      };
      const stats: BotStats = { trades: 0, wins: 0, peakPnlUsd: 0, maxDrawdownUsd: 0, series: [{ at: now, pnlUsd: 0 }], btcStartUsd: BTC_START_USD, btcNowUsd: BTC_START_USD };
      const info: AgentInfo = {
        id,
        kind: 'main',
        roomId: room.id,
        name: person.name,
        look: person.look,
        role: `${trading.exchange} · ${trading.pair}`,
        title: trading.strategy,
        sessionId: id,
        account: 'sim',
        status: botStatus(trading),
        recent: [],
        tasks: [],
        startedAt: now,
        lastEventAt: now,
        statusSince: now,
        stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
        seed: hash32(id),
        trading,
      };
      this.bots.set(id, { info, trading, stats, entryPnl: 0 });
    }
    this.series.push({ at: now, pnlUsd: 0 });
  }

  /** Força o PL de um robô (testes e capturas de tela). false = robô inexistente ou já ejetado. */
  setPnl(botId: string, usd: number): boolean {
    const b = this.bots.get(botId);
    if (!b || b.trading.ejectedAt !== undefined) return false;
    b.trading.pnlUsd = usd;
    this.dirty = true;
    return true;
  }

  /** Avança a simulação até `now`. */
  tick(now: number): DemoTickResult {
    let steps = 0;
    while (now >= this.nextStepAt) {
      if (steps++ < MAX_CATCH_UP) this.step(this.nextStepAt);
      this.nextStepAt += this.interval;
    }
    for (const [id, b] of this.bots) {
      if (b.removeAt !== undefined && now >= b.removeAt) {
        this.gonePnl += b.trading.pnlUsd;
        this.roomGone.set(b.info.roomId, (this.roomGone.get(b.info.roomId) ?? 0) + b.trading.pnlUsd);
        this.bots.delete(id);
        this.dirty = true;
      }
    }
    const changed = this.dirty;
    if (changed) this.rev++;
    this.dirty = false;
    const feed = this.pendingFeed;
    this.pendingFeed = [];
    return { changed, feed, notices: [] };
  }

  snapshot(now = Date.now()): OfficeSnapshot {
    const agents = [...this.bots.values()].map((b) => {
      const stats: BotStats = { ...b.stats, series: b.stats.series.map((p) => ({ ...p })) };
      const info: AgentInfo = { ...b.info, recent: b.info.recent.slice(), tasks: [], stats: { ...b.info.stats }, trading: { ...b.trading, stats } };
      if (b.info.activity) info.activity = { ...b.info.activity };
      return info;
    });
    const portfolio: PortfolioInfo = {
      simulated: true,
      totalPnlUsd: this.totalPnl(),
      bots: agents.length,
      trading: agents.filter((a) => a.status === 'working').length,
      ejected: this.ejectedCount,
      series: this.series.map((p) => ({ ...p })),
    };
    return {
      rev: this.rev,
      serverTime: now,
      rooms: this.rooms.map((r) => ({ ...r, trading: { pnlUsd: this.roomPnl(r.id), series: (this.roomSeries.get(r.id) ?? []).map((p) => ({ ...p })) } })),
      agents,
      accounts: [],
      portfolio,
      meta: { demo: true, sources: [], startedAt: this.startedAt, version: 'sim' },
    };
  }

  /** Um passo de mercado para todos os robôs ativos. */
  private step(at: number): void {
    this.btcUsd = Math.round(this.btcUsd * (1 + (this.btcRng() * 2 - 1) * BTC_STEP) * 100) / 100;
    for (const b of this.bots.values()) {
      const t = b.trading;
      if (t.ejectedAt !== undefined) continue;
      const wasOpen = t.position !== 'flat';
      if (t.position !== 'flat') {
        const size = STABLE.has(t.pair) ? 0.05 : 0.6;
        t.pnlUsd = Math.round((t.pnlUsd + (this.rng() * 2 - 1) * size) * 100) / 100;
      }
      if (shouldEject(t)) {
        t.ejectedAt = at;
        b.removeAt = at + OFFLINE_GRACE_MS;
        this.ejectedCount++;
        this.emit(b, at, 'error', '⛔', tr('EJETADO · {0}', [formatPnl(t.pnlUsd, intlLocale())]));
      } else if (t.position !== 'flat' && this.rng() < 0.25) {
        const side = t.position === 'long' ? 'sell' : 'buy';
        t.position = 'flat';
        this.emit(b, at, 'other', side === 'buy' ? '📈' : '📉', this.orderText(side, t));
      } else if (t.position === 'flat' && this.rng() < 0.35) {
        t.position = this.rng() < 0.5 ? 'long' : 'short';
        const side = t.position === 'long' ? 'buy' : 'sell';
        this.emit(b, at, 'other', side === 'buy' ? '📈' : '📉', this.orderText(side, t));
      }
      if (wasOpen && (t.position === 'flat' || t.ejectedAt !== undefined)) {
        b.stats.trades++;
        if (t.pnlUsd > b.entryPnl) b.stats.wins++;
      }
      if (!wasOpen && t.position !== 'flat') b.entryPnl = t.pnlUsd;
      this.updateStats(b, at);
      const status = botStatus(t);
      if (status !== b.info.status) {
        b.info.status = status;
        b.info.statusSince = at;
      }
    }
    for (const r of this.rooms) pushCapped(this.roomSeries.get(r.id)!, { at, pnlUsd: Math.round(this.roomPnl(r.id) * 100) / 100 });
    this.series.push({ at, pnlUsd: Math.round(this.totalPnl() * 100) / 100 });
    if (this.series.length > SERIES_MAX) this.series.splice(0, this.series.length - SERIES_MAX);
    this.dirty = true;
  }

  private orderText(side: 'buy' | 'sell', t: BotTrading): string {
    const amount = 50 + Math.floor(this.rng() * 451);
    return side === 'buy' ? tr('COMPRA {0} · {1} · ${2}', [t.pair, t.exchange, amount]) : tr('VENDA {0} · {1} · ${2}', [t.pair, t.exchange, amount]);
  }

  private emit(b: SimBot, at: number, kind: Activity['kind'], icon: string, text: string): void {
    const activity: Activity = { id: `${b.info.id}:${++this.seq}`, kind, icon, text, at };
    b.info.activity = activity;
    b.info.recent.push(activity);
    if (b.info.recent.length > RECENT_MAX) b.info.recent.shift();
    b.info.lastEventAt = at;
    const room = this.rooms.find((r) => r.id === b.info.roomId);
    this.pendingFeed.push({ id: activity.id, agentId: b.info.id, roomId: b.info.roomId, agentName: b.info.name, roomName: room?.name ?? '', activity });
  }

  private updateStats(b: SimBot, at: number): void {
    const s = b.stats;
    const pnl = b.trading.pnlUsd;
    s.peakPnlUsd = Math.max(s.peakPnlUsd, pnl);
    s.maxDrawdownUsd = Math.max(s.maxDrawdownUsd, Math.round((s.peakPnlUsd - pnl) * 100) / 100);
    s.btcNowUsd = this.btcUsd;
    pushCapped(s.series, { at, pnlUsd: pnl });
  }

  private roomPnl(roomId: string): number {
    let sum = this.roomGone.get(roomId) ?? 0;
    for (const b of this.bots.values()) if (b.info.roomId === roomId) sum += b.trading.pnlUsd;
    return sum;
  }

  private totalPnl(): number {
    let sum = this.gonePnl;
    for (const b of this.bots.values()) sum += b.trading.pnlUsd;
    return sum;
  }

  private pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.rng() * list.length)];
  }
}
