// Bullroom: carteira dos robôs na barra do topo (PL total, robôs, em operação, mini-gráfico e o selo SIMULATED).
// Toma o lugar dos contadores de agentes quando o snapshot traz `portfolio`.
import type { PortfolioInfo } from '../../../shared/trading/types';
import { formatValue, pnlTone } from '../../../shared/trading/rules';
import { intlLocale, tr } from '../../../shared/i18n';
import { h, setHidden, setText, setTitle } from './dom';

const SPARK_W = 84;
const SPARK_H = 22;
const TONE_COLOR = { gain: '#4ade80', loss: '#f87171', zero: '#a1a9b8' } as const;

/** "+$33,96 · 54 robôs · 25 em operação". Puro (testável). */
export function portfolioLine(p: PortfolioInfo, locale: string): string {
  const total = formatValue(p.totalPnlUsd, p.unit, locale);
  // ao vivo (núcleo do OpenSpread): melhor spread líquido entre as salas e corretoras online
  if (p.unit === 'pct') return tr('{0} · melhor spread líquido · {1}', [total, p.bots === 1 ? tr('1 corretora') : tr('{0} corretoras', [p.bots])]);
  const bots = p.bots === 1 ? tr('1 robô') : tr('{0} robôs', [p.bots]);
  return tr('{0} · {1} · {2} em operação', [total, bots, p.trading]);
}

/** Pontos do mini-gráfico numa caixa w×h (y para baixo); `up` = o último ponto é ≥ 0. Puro (testável). */
export function sparkPoints(series: PortfolioInfo['series'], w: number, h: number): { points: Array<{ x: number; y: number }>; up: boolean } {
  if (series.length === 0) return { points: [], up: true };
  const values = series.map((p) => p.pnlUsd);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const step = series.length > 1 ? w / (series.length - 1) : 0;
  const points = values.map((v, i) => ({ x: Math.round(i * step * 100) / 100, y: Math.round(((max - v) / span) * h * 100) / 100 }));
  return { points, up: values[values.length - 1] >= 0 };
}

export class PortfolioBar {
  readonly el: HTMLElement;
  private total: HTMLElement;
  private rest: HTMLElement;
  private canvas: HTMLCanvasElement;
  private badge: HTMLElement;
  /** Último estado desenhado no mini-gráfico (princípio da calma: só redesenha quando muda). */
  private drawn = '';

  constructor() {
    this.total = h('span', { class: 'ui-portfolio__total' });
    this.rest = h('span', { class: 'ui-portfolio__rest' });
    this.canvas = h('canvas', { class: 'ui-portfolio__spark', attrs: { width: String(SPARK_W * 2), height: String(SPARK_H * 2), 'aria-hidden': 'true' } });
    this.badge = h('span', { class: 'ui-portfolio__sim' });
    this.el = h('div', { class: 'ui-portfolio', role: 'status', attrs: { 'aria-live': 'polite' }, hidden: true }, this.total, this.rest, this.canvas, this.badge);
  }

  render(p: PortfolioInfo | undefined): void {
    setHidden(this.el, !p);
    if (!p) return;
    const locale = intlLocale();
    const [total, ...rest] = portfolioLine(p, locale).split(' · ');
    setText(this.total, total);
    this.total.style.color = TONE_COLOR[pnlTone(p.totalPnlUsd)];
    setText(this.rest, rest.join(' · '));
    setText(this.badge, p.simulated ? 'SIMULATED' : 'LIVE · READ-ONLY');
    this.badge.classList.toggle('is-live', !p.simulated);
    setTitle(this.badge, p.simulated ? tr('Dados simulados: nenhuma corretora, chave ou dinheiro real') : tr('Dados públicos ao vivo, só leitura: nenhuma chave, nenhuma ordem'));
    setTitle(
      this.el,
      p.unit === 'pct'
        ? tr('{0}. Spread líquido já sem as taxas de compra e venda; sem custo de transferência entre corretoras.', [portfolioLine(p, locale)])
        : tr('Carteira: {0}. Ejetados hoje: {1}.', [portfolioLine(p, locale), p.ejected]),
    );
    this.drawSpark(p.series);
  }

  private drawSpark(series: PortfolioInfo['series']): void {
    const last = series[series.length - 1];
    const key = `${series.length}:${last?.at}:${last?.pnlUsd}`;
    if (key === this.drawn) return;
    this.drawn = key;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, SPARK_W, SPARK_H);
    const { points, up } = sparkPoints(series, SPARK_W, SPARK_H - 2);
    if (points.length < 2) return;
    ctx.strokeStyle = up ? TONE_COLOR.gain : TONE_COLOR.loss;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y + 1) : ctx.moveTo(pt.x, pt.y + 1)));
    ctx.stroke();
  }
}
