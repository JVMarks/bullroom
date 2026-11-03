// Bullroom: painel "Agenda" na gaveta da direita. Próximos eventos (impacto por cor, hora no seu fuso, fonte) e o radar
// de manchetes com o que é novo desde a última olhada. Só ao vivo (?source=core). Evento de alto impacto a menos de
// 30 min acende o alarme da sala (shared/core/to-office.ts, agendaAlarm).
import { intlLocale, tr } from '../../../shared/i18n';
import type { UiContext } from './context';
import { h } from './dom';
import { relativeTime } from './format';
import { feedsLine, groupEvents, radarRows } from './agenda-model';

const SEEN_KEY = 'bullroom.radar.seen';
const IMPACT_LABEL = (): Record<string, string> => ({ high: tr('alto impacto'), medium: tr('médio impacto'), low: tr('baixo impacto') });

/** Última olhada no radar (por navegador; só conveniência). */
function readSeen(): number | null {
  try {
    const v = Number(localStorage.getItem(SEEN_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
function writeSeen(at: number): void {
  try {
    localStorage.setItem(SEEN_KEY, String(at));
  } catch {
    // sem armazenamento: o "novo" só não sobrevive a recarregar a página
  }
}

const link = (href: string, ...children: Array<HTMLElement | string>) => h('a', { class: 'ui-ag__link', attrs: { href, target: '_blank', rel: 'noopener noreferrer' } }, ...children);

export class AgendaView {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private sig = '';
  /** "Novo" = depois desta hora (a olhada anterior); a olhada de agora passa a valer na próxima abertura. */
  private seenBefore: number | null = null;

  constructor(private ctx: UiContext) {
    this.body = h('div', { class: 'ui-ag__body' });
    this.el = h('section', { class: 'ui-mk ui-ag', attrs: { 'aria-label': tr('Agenda') } }, this.body);
  }

  open(): void {
    this.seenBefore = readSeen();
    writeSeen(Date.now());
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
    const ag = store.coreState?.agenda;
    const now = this.ctx.now();
    const locale = intlLocale();
    const groups = groupEvents(ag?.events ?? [], now, locale);
    const rows = radarRows(ag?.radar ?? [], this.seenBefore);
    // as horas relativas ("há 12 min") mudam devagar: a assinatura usa o minuto
    const sig = JSON.stringify({ groups, rows: rows.map((r) => [r.id, r.fresh]), feeds: ag?.feeds, m: Math.floor(now / 60_000) });
    if (sig === this.sig) return;
    this.sig = sig;
    if (!ag) {
      this.body.replaceChildren(h('p', { class: 'ui-mk__status', text: tr('Esperando a primeira leitura do núcleo…') }));
      return;
    }
    const impact = IMPACT_LABEL();
    const events = groups.length
      ? groups.map((g) =>
          h(
            'div',
            { class: 'ui-ag__day' },
            h('h4', { class: 'ui-ag__dayh', text: g.label }),
            ...g.events.map((e) =>
              h(
                'div',
                { class: `ui-ag__ev${e.past ? ' is-past' : ''}` },
                h('span', { class: 'ui-ag__time', text: e.time }),
                h('span', { class: `ui-ag__imp is-${e.impact}`, title: impact[e.impact], attrs: { 'aria-label': impact[e.impact] } }),
                h(
                  'span',
                  { class: 'ui-ag__title' },
                  e.title,
                  h('span', { class: 'ui-ag__src' }, ' · ', e.url ? link(e.url, e.source) : e.source, e.pairs.length ? ` · ${e.pairs.join(', ')}` : ''),
                ),
              ),
            ),
          ),
        )
      : [h('p', { class: 'ui-mk__hint', text: tr('Nada nos próximos 14 dias.') })];
    const fresh = rows.filter((r) => r.fresh).length;
    const radarHead = this.seenBefore ? tr('Radar · {0} novas desde {1}', [fresh, new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(this.seenBefore)]) : tr('Radar');
    const radar = ag.feeds.length
      ? rows.length
        ? rows.slice(0, 30).map((r) =>
            h(
              'div',
              { class: `ui-ag__news${r.fresh ? ' is-fresh' : ''}` },
              link(r.url, h('span', { class: 'ui-ag__head', text: r.title })),
              h('span', { class: 'ui-ag__meta', text: [r.source, relativeTime(r.at, now), ...(r.pairs.length ? [r.pairs.join(', ')] : [])].join(' · ') }),
            ),
          )
        : [h('p', { class: 'ui-mk__hint', text: tr('Nenhuma manchete nos últimos 7 dias.') })]
      : [h('p', { class: 'ui-mk__hint', text: tr('Radar desligado: escolha feeds RSS em Mercados › Agenda e radar.') })];
    const feedErrors = ag.feeds.filter((f) => !f.ok).map((f) => h('p', { class: 'ui-mk__status is-warn', text: tr('Feed fora: {0} ({1})', [f.url, f.error ?? '']) }));
    const line = feedsLine(store.coreState);
    this.body.replaceChildren(
      h('h3', { class: 'ui-mk__label', text: tr('Próximos 14 dias') }),
      ...events,
      h('p', { class: 'ui-mk__hint', text: tr('Alto impacto a menos de 30 min acende o alarme da sala. FOMC e CPI: datas oficiais do Fed e do BLS; os outros eventos são os seus.') }),
      h('h3', { class: 'ui-mk__label', text: radarHead }),
      ...radar,
      ...feedErrors,
      h('p', { class: 'ui-mk__hint', text: [line, tr('Manchete é pista, não fato. Sem previsão e sem recomendação.')].filter(Boolean).join(' · ') }),
    );
  }
}
