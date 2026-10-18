// Bullroom: cartão do robô no painel lateral. Abas 5m/1h/24h, PL, acerto, trades, drawdown, limite usado e a
// comparação com só segurar BTC. Inspirado nos cartões de perfil do Capitol Trades (docs/referencias.md).
import type { AgentInfo } from '../../../shared/types';
import type { BotTrading, PnlTone } from '../../../shared/trading/types';
import { formatPnl, pnlTone } from '../../../shared/trading/rules';
import { changeOver, hodlPnl } from '../../../shared/trading/stats';
import { intlLocale, tr } from '../../../shared/i18n';
import { h, setHidden, setText } from './dom';

export type BotWindow = '5m' | '1h' | '24h';
const WINDOWS: readonly BotWindow[] = ['5m', '1h', '24h'];
const WINDOW_MS: Record<BotWindow, number> = { '5m': 300_000, '1h': 3_600_000, '24h': 86_400_000 };
const TONE_COLOR: Record<PnlTone, string> = { gain: '#4ade80', loss: '#f87171', zero: '#a1a9b8' };

export interface BotCardModel {
  pnl: string;
  tone: PnlTone;
  change: string;
  changeTone: PnlTone;
  winRate: string;
  trades: string;
  drawdown: string;
  limitUsed: string;
  vsBtc: string;
  vsBtcTone: PnlTone;
}

/** Textos do cartão para a janela escolhida. Sem estatísticas (robô recém-criado), tudo zerado. Puro (testável). */
export function botCardModel(t: BotTrading, win: BotWindow, now: number, locale: string): BotCardModel {
  const s = t.stats;
  const change = s ? changeOver(s.series, WINDOW_MS[win], now) : 0;
  const hodl = s ? hodlPnl(t.capitalUsd ?? 0, s.btcStartUsd, s.btcNowUsd) : 0;
  const vs = Math.round((t.pnlUsd - hodl) * 100) / 100;
  const trades = s?.trades ?? 0;
  const pct = (n: number) => `${Math.round(n)}%`;
  return {
    pnl: formatPnl(t.pnlUsd, locale),
    tone: pnlTone(t.pnlUsd),
    change: formatPnl(change, locale),
    changeTone: pnlTone(change),
    winRate: pct(trades ? ((s?.wins ?? 0) / trades) * 100 : 0),
    trades: String(trades),
    drawdown: formatPnl(-(s?.maxDrawdownUsd ?? 0), locale),
    limitUsed: pct(t.pnlUsd < 0 && t.dailyLossLimitUsd > 0 ? Math.min(100, (-t.pnlUsd / t.dailyLossLimitUsd) * 100) : 0),
    vsBtc: formatPnl(vs, locale),
    vsBtcTone: pnlTone(vs),
  };
}

export class BotCard {
  readonly el: HTMLElement;
  /** Janela escolhida (só em memória). */
  private win: BotWindow = '1h';
  private tabs = new Map<BotWindow, HTMLButtonElement>();
  private where: HTMLElement;
  private pnl: HTMLElement;
  private change: HTMLElement;
  private values = new Map<keyof BotCardModel, HTMLElement>();
  private last: AgentInfo | null = null;
  private lastNow = 0;

  constructor() {
    const tabRow = h('div', { class: 'ui-bot__tabs', role: 'tablist', attrs: { 'aria-label': tr('Período') } });
    for (const w of WINDOWS) {
      const b = h('button', { class: 'ui-bot__tab', type: 'button', role: 'tab', text: w, on: { click: () => this.select(w) } });
      this.tabs.set(w, b);
      tabRow.append(b);
    }
    this.where = h('p', { class: 'ui-bot__where' });
    this.pnl = h('span', { class: 'ui-bot__pnl' });
    this.change = h('span', { class: 'ui-bot__change' });
    const grid = h('dl', { class: 'ui-bot__grid' });
    const rows: Array<[keyof BotCardModel, string]> = [
      ['winRate', tr('Acerto')],
      ['trades', tr('Trades')],
      ['drawdown', tr('Drawdown máx.')],
      ['limitUsed', tr('Limite de perda usado')],
      ['vsBtc', tr('vs segurar BTC')],
    ];
    for (const [key, label] of rows) {
      const dd = h('dd');
      this.values.set(key, dd);
      grid.append(h('dt', { text: label }), dd);
    }
    this.el = h(
      'section',
      { class: 'ui-sec ui-bot', hidden: true },
      h('div', { class: 'ui-sec__head' }, h('h3', { class: 'ui-sec__title', text: tr('Robô') }), tabRow),
      this.where,
      h('div', { class: 'ui-bot__hero' }, this.pnl, this.change),
      grid,
      h('p', { class: 'ui-bot__note', text: tr('Dados simulados. Não é recomendação de investimento.') }),
    );
  }

  render(a: AgentInfo, now: number): void {
    this.last = a;
    this.lastNow = now;
    const t = a.trading;
    setHidden(this.el, !t);
    if (!t) return;
    const m = botCardModel(t, this.win, now, intlLocale());
    const pos = t.position === 'long' ? tr('comprado') : t.position === 'short' ? tr('vendido') : tr('zerado');
    setText(this.where, `${t.exchange} · ${t.pair} · ${t.strategy} · ${pos}`);
    setText(this.pnl, m.pnl);
    this.pnl.style.color = TONE_COLOR[m.tone];
    setText(this.change, tr('{0} em {1}', [m.change, this.win]));
    this.change.style.color = TONE_COLOR[m.changeTone];
    for (const [key, el] of this.values) setText(el, m[key] as string);
    this.values.get('vsBtc')!.style.color = TONE_COLOR[m.vsBtcTone];
    for (const [w, b] of this.tabs) {
      b.classList.toggle('is-on', w === this.win);
      b.setAttribute('aria-selected', String(w === this.win));
    }
  }

  private select(w: BotWindow): void {
    this.win = w;
    if (this.last) this.render(this.last, this.lastNow);
  }
}
