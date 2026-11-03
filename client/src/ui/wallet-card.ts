// Bullroom: cartão da carteira on-chain no painel lateral e o painel "Ranking" na gaveta. Só ao vivo (?source=core).
// Cada operação abre o explorador público numa aba nova; não há botão de copiar nem aviso de "comprou".
import type { AgentInfo } from '../../../shared/types';
import type { PnlTone } from '../../../shared/trading/types';
import { intlLocale, tr } from '../../../shared/i18n';
import { walletAgentId } from '../../../shared/core/to-office';
import type { UiContext } from './context';
import { h, setHidden, setText } from './dom';
import { formatDateTime, relativeTime } from './format';
import { rankGroups, walletCardModel, type RankRow } from './wallet-model';

const TONE_COLOR: Record<PnlTone, string> = { gain: '#4ade80', loss: '#f87171', zero: '#a1a9b8' };
const SHOW_OPS = 10;

const link = (href: string, ...children: Array<HTMLElement | string>) => h('a', { class: 'ui-wl__link', attrs: { href, target: '_blank', rel: 'noopener noreferrer' } }, ...children);

export class WalletCard {
  readonly el: HTMLElement;
  private where: HTMLElement;
  private hero: HTMLElement;
  private values = new Map<string, HTMLElement>();
  private balanceRow: HTMLElement[];
  private source: HTMLElement;
  private since: HTMLElement;
  private external: HTMLElement;
  private error: HTMLElement;
  private ops: HTMLElement;
  private explorer: HTMLAnchorElement;
  /** Só redesenha quando muda o que aparece (princípio da calma). */
  private sig = '';

  constructor(private ctx: UiContext) {
    this.where = h('p', { class: 'ui-bot__where' });
    this.hero = h('div', { class: 'ui-bot__hero ui-wl__hero' });
    const grid = h('dl', { class: 'ui-bot__grid' });
    const rows: Array<[string, string]> = [
      ['trades', tr('Vendas fechadas')],
      ['hits', tr('Acertos e erros')],
      ['position', tr('Posição')],
      ['balance', tr('Saldo')],
    ];
    for (const [key, label] of rows) {
      const dt = h('dt', { text: label });
      const dd = h('dd');
      this.values.set(key, dd);
      grid.append(dt, dd);
      if (key === 'balance') this.balanceRow = [dt, dd];
    }
    this.balanceRow ??= [];
    this.source = h('p', { class: 'ui-wl__meta' });
    this.since = h('p', { class: 'ui-wl__meta' });
    this.external = h('p', { class: 'ui-wl__meta' });
    this.error = h('p', { class: 'ui-mk__status is-warn' });
    this.ops = h('ul', { class: 'ui-wl__ops' });
    this.explorer = link('', tr('Ver a carteira no explorador')) as HTMLAnchorElement;
    this.el = h(
      'section',
      { class: 'ui-sec ui-bot ui-wl', hidden: true },
      h('div', { class: 'ui-sec__head' }, h('h3', { class: 'ui-sec__title', text: tr('Carteira') }), h('button', { class: 'ui-link-btn', type: 'button', text: tr('Ranking'), on: { click: () => ctx.toggleRanking(true) } })),
      this.where,
      this.hero,
      grid,
      this.error,
      h('h4', { class: 'ui-mk__label', text: tr('Últimas operações') }),
      this.ops,
      this.explorer,
      this.source,
      this.since,
      this.external,
      h('p', { class: 'ui-bot__note', text: tr('Dados públicos da blockchain, só leitura. Resultado realizado por FIFO na moeda da operação; venda sem compra conhecida fica sem resultado. Não é recomendação de investimento.') }),
    );
  }

  render(a: AgentInfo, now: number): void {
    const w = a.wallet;
    setHidden(this.el, !w);
    if (!w) return;
    const locale = intlLocale();
    const m = walletCardModel(w, this.ctx.store.coreState, locale, (at) => relativeTime(at, now), (at) => formatDateTime(at));
    // O "lido há N s" muda a cada segundo: fica fora da assinatura e é atualizado sempre.
    setText(this.source, m.source);
    const sig = JSON.stringify({ ...m, source: '' });
    if (sig === this.sig) return;
    this.sig = sig;
    setText(this.where, m.where);
    this.hero.replaceChildren(
      ...(m.results.length
        ? m.results.map((r) => {
            const s = h('span', { class: 'ui-bot__pnl', text: r.text });
            s.style.color = TONE_COLOR[r.tone];
            return s;
          })
        : [h('span', { class: 'ui-wl__none', text: w.chain === 'bitcoin' ? tr('Bitcoin: só saldo e movimentos (sem troca na rede)') : tr('Nenhuma venda fechada no período') })]),
    );
    setText(this.values.get('trades')!, m.trades);
    setText(this.values.get('hits')!, m.hits);
    setText(this.values.get('position')!, m.position);
    setText(this.values.get('balance')!, m.balance ?? '');
    for (const el of this.balanceRow) setHidden(el, !m.balance);
    setText(this.error, m.error ?? '');
    setHidden(this.error, !m.error);
    setText(this.since, m.since ?? '');
    setHidden(this.since, !m.since);
    setText(this.external, m.external ?? '');
    setHidden(this.external, !m.external);
    this.explorer.href = w.url;
    const rows = m.ops.slice(0, SHOW_OPS).map((o) => {
      const pnl = o.pnl ? h('span', { class: 'ui-wl__pnl', text: o.pnl.text }) : null;
      if (pnl && o.pnl) pnl.style.color = TONE_COLOR[o.pnl.tone];
      return h(
        'li',
        { class: `ui-wl__op is-${o.kind}` },
        link(o.url, h('span', { class: 'ui-wl__kind', text: o.label }), h('span', { class: 'ui-wl__text', text: o.text }), ...(pnl ? [pnl] : []), h('span', { class: 'ui-wl__when', text: formatDateTime(o.at) })),
      );
    });
    this.ops.replaceChildren(...(rows.length ? rows : [h('li', { class: 'ui-mk__hint', text: tr('Nenhuma operação lida ainda.') })]));
  }
}

export class RankingView {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private sig = '';

  constructor(private ctx: UiContext) {
    this.body = h('div', { class: 'ui-wl__rank' });
    this.el = h(
      'section',
      { class: 'ui-mk ui-wl', attrs: { 'aria-label': tr('Ranking') } },
      h('p', { class: 'ui-mk__intro', text: tr('Resultado realizado das carteiras que você acompanha, por rede e moeda. Os piores ficam ao lado dos melhores.') }),
      this.body,
    );
  }

  open(): void {
    this.sig = '';
    this.render();
  }

  render(): void {
    const store = this.ctx.store;
    if (!store.core) {
      if (this.sig !== 'demo') {
        this.sig = 'demo';
        this.body.replaceChildren(h('p', { class: 'ui-mk__status', text: tr('Só ao vivo: rode o OpenSpread no seu computador e abra o Bullroom com ?source=core.') }));
      }
      return;
    }
    const ws = store.coreState?.wallets;
    const locale = intlLocale();
    const groups = rankGroups(store.coreState, locale);
    const sig = JSON.stringify({ groups, n: ws?.wallets.length ?? 0, src: ws?.sources });
    if (sig === this.sig) return;
    this.sig = sig;
    if (!ws?.wallets.length) {
      this.body.replaceChildren(h('p', { class: 'ui-mk__status', text: tr('Nenhuma carteira ainda. Cole endereços públicos em Mercados › Carteiras.') }));
      return;
    }
    const days = Math.round(ws.periodMs / 86_400_000);
    const rowEl = (r: RankRow, i: number) =>
      h(
        'li',
        { class: 'ui-wl__rrow' },
        h('span', { class: 'ui-wl__pos', text: String(i + 1) }),
        h('button', { class: 'ui-link-btn ui-wl__addr', type: 'button', text: r.short, title: tr('Ver no escritório'), on: { click: () => this.select(groupsChain(r), r.address) } }),
        h('span', { class: 'ui-wl__ntr', text: tr('{0} vendas', [r.trades]) + (r.source === 'birdeye' ? ` · ${tr('descoberta')}` : '') }),
        (() => {
          const s = h('span', { class: 'ui-wl__pnl', text: r.result.text });
          s.style.color = TONE_COLOR[r.result.tone];
          return s;
        })(),
      );
    const chains = new Map<string, string>();
    const groupsChain = (r: RankRow) => chains.get(r.address) ?? '';
    const blocks = groups.map((g) => {
      for (const r of [...g.best, ...g.worst]) chains.set(r.address, g.chain);
      return h(
        'div',
        { class: 'ui-wl__group' },
        h('h3', { class: 'ui-mk__label', text: g.title }),
        h('div', { class: 'ui-wl__cols' },
          h('div', {}, h('h4', { class: 'ui-wl__colh', text: tr('Melhores') }), g.best.length ? h('ol', { class: 'ui-wl__list' }, ...g.best.map(rowEl)) : h('p', { class: 'ui-mk__hint', text: tr('ninguém no positivo') })),
          h('div', {}, h('h4', { class: 'ui-wl__colh', text: tr('Piores') }), g.worst.length ? h('ol', { class: 'ui-wl__list' }, ...g.worst.map(rowEl)) : h('p', { class: 'ui-mk__hint', text: tr('ninguém no negativo') })),
        ),
      );
    });
    const sources = ws.sources.map((s) => `${s.source}${s.ok ? '' : ` (${s.error ?? tr('sem dados')})`}`).join(' · ');
    this.body.replaceChildren(
      ...(blocks.length ? blocks : [h('p', { class: 'ui-mk__status', text: tr('Ainda sem venda fechada no período: o ranking aparece quando alguma carteira vender o que comprou.') })]),
      h('p', { class: 'ui-mk__hint', text: tr('Período: {0} dias. Só entra quem fechou venda de compra conhecida. Fontes: {1}. Atualizado {2}.', [days, sources, formatDateTime(ws.at)]) }),
    );
  }

  private select(chain: string, address: string): void {
    if (!chain) return;
    this.ctx.toggleRanking(false);
    this.ctx.select({ type: 'agent', id: walletAgentId({ chain: chain as 'solana', address }) });
  }
}
