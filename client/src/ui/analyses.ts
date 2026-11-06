// Bullroom: painel "Análises" na gaveta da direita. O que o Claude ou Codex do usuário registrou pelo MCP, com o placar
// do núcleo. Só leitura: nada aqui registra, edita ou retira análise. Só existe com ?source=core. Sem animação: só
// redesenha quando um número muda.
import { intlLocale, tr } from '../../../shared/i18n';
import { analysisRows, calibrationPoints, chartNote, headline, pointText, statRows, type CalibrationPoint } from './analyses-model';
import type { UiContext } from './context';
import { h } from './dom';

const SVG = 'http://www.w3.org/2000/svg';
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
};

/** Disse x, acertou quanto? Um eixo só; a diagonal tracejada é onde o ponto estaria se a convicção fosse exata. */
function calibrationChart(points: CalibrationPoint[]): SVGSVGElement {
  const W = 326, H = 230, L = 36, R = 18, T = 12, B = 46;
  const x = (v: number) => L + ((v - 50) / 50) * (W - L - R);
  const y = (v: number) => T + (1 - v / 100) * (H - T - B);
  const root = svg('svg', { class: 'ui-an__chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${tr('Disse x, acertou quanto?')} ${chartNote(points)}` });
  for (const v of [0, 50, 100]) {
    root.append(svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'ui-an__grid' }));
    root.append(svg('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end' }, `${v}%`));
  }
  for (const v of [50, 75, 100]) root.append(svg('text', { x: x(v), y: H - 28, 'text-anchor': 'middle' }, `${v}%`));
  root.append(svg('text', { x: (L + W - R) / 2, y: H - 8, 'text-anchor': 'middle' }, tr('convicção declarada')));
  root.append(svg('line', { x1: x(50), y1: y(50), x2: x(100), y2: y(100), class: 'ui-an__diag' }));
  root.append(svg('text', { x: x(86), y: y(90), 'text-anchor': 'end' }, tr('se fosse exato')));
  for (const p of points) {
    const g = svg('g', { class: 'ui-an__point' });
    g.append(svg('title', {}, pointText(p)));
    // Área de toque maior que a marca.
    g.append(svg('circle', { cx: x(p.conviction), cy: y(p.hit), r: 14, fill: 'transparent' }));
    g.append(svg('circle', { cx: x(p.conviction), cy: y(p.hit), r: 5, class: 'ui-an__dot' }));
    g.append(svg('text', { x: x(p.conviction), y: y(p.hit) + (p.hit < 15 ? -10 : 19), 'text-anchor': 'middle', class: 'ui-an__n' }, `n=${p.n}`));
    root.append(g);
  }
  return root;
}

export class AnalysesView {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private sig = '';

  constructor(private ctx: UiContext) {
    this.body = h('div', { class: 'ui-an__body' });
    this.el = h('section', { class: 'ui-mk ui-an', attrs: { 'aria-label': tr('Análises') } }, this.body);
  }

  open(): void {
    this.sig = '';
    this.render();
  }

  private status(text: string): void {
    if (this.sig === text) return;
    this.sig = text;
    this.body.replaceChildren(h('p', { class: 'ui-mk__status', text }));
  }

  render(): void {
    if (!this.ctx.store.core) return this.status(tr('As análises só existem com o núcleo ligado (?source=core). A demonstração não tem nenhuma.'));
    const state = this.ctx.store.coreState;
    if (!state) return this.status(tr('Esperando a primeira leitura do núcleo…'));
    const brief = state.analyses;
    if (!brief) return this.status(tr('Atualize o núcleo do OpenSpread para ver as análises.'));

    const locale = intlLocale();
    const { total } = brief.scoreboard;
    const { minSample } = brief.scoreboard;
    const head = headline(total, minSample, locale);
    const stats = statRows(total, locale);
    const points = calibrationPoints(total, minSample);
    const rows = analysisRows(brief.items, state.at, locale);
    const sig = JSON.stringify([total.submitted, head, stats, points, rows]);
    if (sig === this.sig) return;
    this.sig = sig;

    const notice = h('p', { class: 'ui-an__notice', text: tr('Registro do próprio usuário. Não é ordem nem recomendação.') });
    if (!total.submitted) {
      this.body.replaceChildren(h('p', { class: 'ui-mk__status', text: tr('Nenhuma análise ainda. Conecte o seu Claude ou Codex ao OpenSpread (veja o README) e peça uma análise.') }), notice);
      return;
    }
    this.body.replaceChildren(
      h(
        'div',
        { class: 'ui-an__head' },
        h('p', { class: 'ui-an__big' }, h('b', { text: head.big }), h('span', { text: head.label })),
        ...(head.progress === null
          ? []
          : [h('div', { class: 'ui-an__bar', attrs: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(minSample), 'aria-valuenow': String(total.resolved), 'aria-label': head.label } }, this.fill(head.progress))]),
        ...(head.note ? [h('p', { class: 'ui-an__note', text: head.note })] : []),
      ),
      ...stats.map((s) => h('div', { class: 'ui-rb__kv' }, h('span', { text: s.label }), h('span', { class: `is-${s.tone}`, text: s.value }))),
      ...(points.length
        ? [
            h('h3', { class: 'ui-mk__label', text: tr('Disse x, acertou quanto?') }),
            calibrationChart(points),
            h('p', { class: 'ui-an__note', text: tr('Abaixo da linha, a convicção foi maior que o acerto.') }),
          ]
        : []),
      ...rows.map((r) =>
        h(
          'article',
          { class: 'ui-rb__bot' },
          h('div', { class: 'ui-rb__head' }, h('b', { text: r.title }), h('span', { class: `ui-an__tag is-${r.tone}`, text: r.tag })),
          h('p', { class: 'ui-an__meta', text: r.meta }),
          h('p', { class: 'ui-an__meta' }, h('span', { text: r.detail }), ...r.plans.flatMap((p) => [h('span', { text: ' · ' }), h('span', { class: `is-${p.tone}`, text: p.text })])),
        ),
      ),
      notice,
    );
  }

  private fill(progress: number): HTMLElement {
    const el = h('i', {});
    el.style.transform = `scaleX(${progress})`;
    return el;
  }
}
