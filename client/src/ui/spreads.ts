// Bullroom: painel "Spreads" na gaveta da direita (A) e as janelas no cartão da sala (B). O núcleo do OpenSpread guarda
// o histórico (uma amostra por minuto, 25 h, no seu computador) e manda, por par, quanto o melhor spread líquido mudou
// em 5 min, 1 h e 24 h e o mínimo e o máximo de cada janela. Só existe com ?source=core.
import type { SpreadWindows } from '../../../shared/core/types';
import { intlLocale, tr } from '../../../shared/i18n';
import type { UiContext } from './context';
import { h } from './dom';
import { formatChange, formatPct, rangePos, spreadRows, WINDOW_IDS } from './spreads-model';

const WINDOW_LABEL = (): Record<string, string> => ({ '5m': tr('5 min'), '1h': tr('1 h'), '24h': tr('24 h') });

/** As três caixas de um par (variação e faixa de cada janela); usadas no painel e no cartão da sala. */
export function windowBoxes(windows: SpreadWindows | null, locale: string): HTMLElement {
  const labels = WINDOW_LABEL();
  return h(
    'div',
    { class: 'ui-sp__boxes' },
    ...WINDOW_IDS.map((id) => {
      const w = windows?.[id];
      if (!w) return h('div', { class: 'ui-sp__box' }, h('span', { class: 'ui-sp__wlabel', text: labels[id] }), h('span', { class: 'ui-sp__none', text: tr('sem histórico ainda') }));
      const c = formatChange(w.changePp, locale);
      return h(
        'div',
        { class: 'ui-sp__box' },
        h('span', { class: 'ui-sp__wlabel', text: labels[id] }),
        h('span', { class: `ui-sp__chg is-${c.tone}`, text: c.text }),
        h('span', { class: 'ui-sp__range', text: tr('{0} a {1}', [formatPct(w.min, locale), formatPct(w.max, locale)]) }),
      );
    }),
  );
}

export class SpreadsView {
  readonly el: HTMLElement;
  private body: HTMLElement;
  /** Assinatura do que já está desenhado: só redesenha quando os números mudam (princípio da calma). */
  private sig = '';

  constructor(private ctx: UiContext) {
    this.body = h('div', { class: 'ui-sp__body' });
    this.el = h(
      'section',
      { class: 'ui-mk ui-sp', attrs: { 'aria-label': tr('Spreads') } },
      h('p', { class: 'ui-mk__intro', text: tr('Melhor spread líquido de cada sala agora e quanto mudou em cada janela, em pontos percentuais.') }),
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
    const rows = spreadRows(store.coreState);
    const sig = JSON.stringify(rows);
    if (sig === this.sig) return;
    this.sig = sig;
    const locale = intlLocale();
    if (!rows.length) {
      this.body.replaceChildren(h('p', { class: 'ui-mk__status', text: tr('Esperando a primeira leitura do núcleo…') }));
      return;
    }
    const labels = WINDOW_LABEL();
    const head = h('tr', {}, h('th', { text: tr('Par') }), h('th', { text: tr('Agora') }), ...WINDOW_IDS.map((id) => h('th', { text: labels[id] })));
    const lines = rows.map((r) =>
      h(
        'tr',
        {},
        h('td', { text: r.pair }),
        h('td', { class: `ui-sp__now${r.now === null ? '' : r.now > 0 ? ' is-up' : ' is-down'}`, text: r.now === null ? '—' : formatPct(r.now, locale) }),
        ...WINDOW_IDS.map((id) => {
          const w = r.windows?.[id];
          if (!w) return h('td', { class: 'ui-sp__none', text: '—', title: tr('sem histórico ainda') });
          const c = formatChange(w.changePp, locale);
          return h('td', { class: `ui-sp__chg is-${c.tone}`, text: c.text });
        }),
      ),
    );
    const ranges = rows
      .filter((r) => r.now !== null && r.windows?.['24h'])
      .map((r) => {
        const w = r.windows!['24h']!;
        const marker = h('i', {});
        marker.style.left = `${Math.round(rangePos(r.now!, w.min, w.max) * 100)}%`;
        return h(
          'div',
          { class: 'ui-sp__rrow' },
          h('span', { text: r.pair }),
          h('span', { class: 'ui-sp__rnum', text: formatPct(w.min, locale) }),
          h('span', { class: 'ui-sp__bar', attrs: { 'aria-hidden': 'true' } }, marker),
          h('span', { class: 'ui-sp__rnum', text: formatPct(w.max, locale) }),
        );
      });
    this.body.replaceChildren(
      h('table', { class: 'ui-sp__table' }, h('thead', {}, head), h('tbody', {}, ...lines)),
      h('h3', { class: 'ui-mk__label', text: tr('Faixa de 24 h (mínimo · agora · máximo)') }),
      ...(ranges.length ? ranges : [h('p', { class: 'ui-mk__hint', text: tr('Aparece depois de 24 h de leitura (o histórico fica salvo no seu computador).') })]),
      h('p', { class: 'ui-mk__hint', text: tr('Uma amostra por minuto, guardada pelo núcleo em history.json, ao lado da configuração. Com o saque informado em Mercados, os números já o incluem.') }),
    );
  }
}

/** Conteúdo da seção "Spread em janelas" do cartão da sala ao vivo (o RoomView a embrulha na seção dele). */
export class RoomWindows {
  readonly boxes: HTMLElement;
  private sig = '';

  constructor() {
    this.boxes = h('div');
  }

  /** Desenha as janelas do par da sala; devolve false quando a sala não é do núcleo (a seção fica escondida). */
  render(ctx: UiContext, roomId: string): boolean {
    const pair = roomId.startsWith('core:room:') ? roomId.slice('core:room:'.length) : null;
    const row = pair ? spreadRows(ctx.store.coreState).find((r) => r.pair === pair) : undefined;
    if (!row) return false;
    const sig = JSON.stringify(row.windows);
    if (sig !== this.sig) {
      this.sig = sig;
      this.boxes.replaceChildren(windowBoxes(row.windows, intlLocale()));
    }
    return true;
  }
}

/** Texto do título do painel na gaveta. */
export function spreadsHeading(): string {
  return tr('Spreads');
}

