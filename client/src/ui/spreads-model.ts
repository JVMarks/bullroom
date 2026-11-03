// Bullroom: regras do painel "Spreads" (melhor spread líquido de cada sala em janelas de 5 min, 1 h e 24 h; ideia da
// tabela de "majors" do Forex Factory). Puro (testável): sem DOM e sem rede.
import type { CoreState, SpreadWindowId, SpreadWindows } from '../../../shared/core/types';
import { effectiveNet } from '../../../shared/core/to-office';

export const WINDOW_IDS: readonly SpreadWindowId[] = ['5m', '1h', '24h'];

/** Abaixo disto (pontos percentuais) a variação conta como "sem mudança". */
const FLAT_PP = 0.005;

export type ChangeTone = 'up' | 'down' | 'flat';

export interface SpreadRow {
  pair: string;
  /** Líquido de agora (com saque quando estimado); null sem cotação suficiente. */
  now: number | null;
  windows: SpreadWindows | null;
}

/** Uma linha por par do núcleo, na ordem do núcleo. */
export function spreadRows(state: CoreState | null | undefined): SpreadRow[] {
  return (state?.pairs ?? []).map((p) => ({ pair: p.pair, now: p.best ? effectiveNet(p.best) : null, windows: p.windows ?? null }));
}

/** "▲ 0,01", "▼ 0,03" ou "0,00" (pontos percentuais, 2 casas) e o tom. */
export function formatChange(pp: number, locale: string): { text: string; tone: ChangeTone } {
  const abs = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(pp));
  if (Math.abs(pp) < FLAT_PP) return { text: abs, tone: 'flat' };
  return pp > 0 ? { text: `▲ ${abs}`, tone: 'up' } : { text: `▼ ${abs}`, tone: 'down' };
}

/** "−0,20%" / "+0,03%" (2 casas). */
export function formatPct(n: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' }).format(n)}%`;
}

/** Onde o valor de agora fica entre o mínimo e o máximo da janela (0 a 1; meio quando não há faixa). */
export function rangePos(now: number, min: number, max: number): number {
  if (!(max > min)) return 0.5;
  return Math.min(1, Math.max(0, (now - min) / (max - min)));
}
