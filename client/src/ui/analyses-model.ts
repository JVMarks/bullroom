// Bullroom: regras do painel "Análises" (Caderno + calibração). Puro (testável): sem DOM e sem rede.
// Com pouca amostra o número grande é a amostra; acerto e gráfico só aparecem com o mínimo que o núcleo define.
import type { AnalysesBrief, PlanResult, ScoreLine } from '../../../shared/core/types';
import { tr } from '../../../shared/i18n';

export type Tone = 'gain' | 'loss' | 'zero';

export interface Headline {
  big: string;
  label: string;
  /** De 0 a 1 enquanto falta amostra; null depois. */
  progress: number | null;
  note: string | null;
}

const fixed = (n: number, digits: number, locale: string) => new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
const signedPct = (n: number, locale: string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fixed(Math.abs(n), 2, locale)}%`;
const toneOf = (n: number): Tone => (n > 0 ? 'gain' : n < 0 ? 'loss' : 'zero');

export function headline(total: ScoreLine, minSample: number, locale: string): Headline {
  const voids = total.voids ? tr('{0} sem dados', [total.voids]) : null;
  if (total.hitPct === null) {
    return {
      big: String(total.resolved),
      label: tr('de {0} para mostrar o acerto', [minSample]),
      progress: Math.min(1, total.resolved / minSample),
      note: [tr('Com pouca amostra, percentual engana.'), voids].filter(Boolean).join(' · '),
    };
  }
  const label = tr('de acerto em {0}', [total.resolved]);
  return { big: `${fixed(total.hitPct, 0, locale)}%`, label: voids ? `${label} · ${voids}` : label, progress: null, note: null };
}

export interface StatRow {
  label: string;
  value: string;
  tone: Tone;
}

export function statRows(total: ScoreLine, locale: string): StatRow[] {
  const rows: StatRow[] = [];
  if (total.brier !== null) rows.push({ label: tr('Brier (chute = {0})', [fixed(total.baselineBrier, 3, locale)]), value: fixed(total.brier, 3, locale), tone: 'zero' });
  const { avgNetPct, worstNetPct } = total.plans;
  if (avgNetPct !== null) rows.push({ label: tr('Planos, média com taxas'), value: signedPct(avgNetPct, locale), tone: toneOf(avgNetPct) });
  if (worstNetPct !== null) rows.push({ label: tr('Pior plano'), value: signedPct(worstNetPct, locale), tone: toneOf(worstNetPct) });
  return rows;
}

export interface AnalysisRow {
  id: string;
  title: string;
  tone: 'open' | 'hit' | 'miss' | 'void';
  tag: string;
  meta: string;
  detail: string;
  plans: Array<{ text: string; tone: Tone }>;
}

function remaining(ms: number): string {
  const min = Math.ceil(ms / 60_000);
  if (min < 60) return `${min} min`;
  const hours = Math.round(min / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}

function planLine(p: PlanResult, locale: string): { text: string; tone: Tone } {
  if (p.netPct !== undefined) return { text: `${tr('Plano {0}', [p.label])} ${signedPct(p.netPct, locale)}`, tone: toneOf(p.netPct) };
  return { text: p.status === 'not_triggered' ? tr('Plano {0} não entrou', [p.label]) : tr('Plano {0} sem dados', [p.label]), tone: 'zero' };
}

export function analysisRows(items: AnalysesBrief['items'], now: number, locale: string): AnalysisRow[] {
  return items.map((a) => {
    const base = {
      id: a.id,
      title: a.pair,
      meta: tr('{0} · {1} · {2} · convicção {3}', [a.model, a.horizon, a.direction === 'up' ? tr('alta') : tr('baixa'), a.conviction]),
    };
    const r = a.result;
    if (!r) {
      const left = a.expiresAt - now;
      const when = left > 0 ? tr('vence em {0}', [remaining(left)]) : tr('vencendo');
      return { ...base, tone: 'open', tag: tr('aberta'), detail: `${when} · ${tr('referência {0}', [new Intl.NumberFormat(locale, { maximumFractionDigits: 8 }).format(Math.round(a.referencePrice * 1e8) / 1e8)])}`, plans: [] };
    }
    const plans = r.plans.map((p) => planLine(p, locale));
    if (r.status === 'void') return { ...base, tone: 'void', tag: tr('sem dados'), detail: tr('sem preço até 15 min depois do vencimento'), plans };
    return { ...base, tone: r.hit ? 'hit' : 'miss', tag: r.hit ? tr('acertou') : tr('errou'), detail: tr('moveu {0}', [signedPct(r.movePct ?? 0, locale)]), plans };
  });
}

export interface CalibrationPoint {
  /** Convicção média da faixa, em %. */
  conviction: number;
  /** Acerto observado na faixa, em %. */
  hit: number;
  n: number;
}

/** Vazio abaixo da amostra mínima. Faixa sem análises não vira ponto (não é acerto zero). */
export function calibrationPoints(total: ScoreLine, minSample: number): CalibrationPoint[] {
  if (total.resolved < minSample) return [];
  return total.calibration.flatMap((b) => (b.meanConviction === null || b.hitPct === null ? [] : [{ conviction: b.meanConviction, hit: b.hitPct, n: b.n }]));
}

const pointText = (p: CalibrationPoint) => tr('{0} análises: disse {1}%, acertou {2}%', [p.n, Math.round(p.conviction), Math.round(p.hit)]);

/** Os mesmos números do gráfico em texto, para quem não enxerga o desenho. */
export function chartNote(points: CalibrationPoint[]): string {
  return points.map(pointText).join('; ');
}

export { pointText };
