// Estatísticas puras do robô de trading (cartão do robô e telão da sala).
import type { BotStats } from './types';

type Series = BotStats['series'];

/** Variação do PL nos últimos `windowMs` até `now`; janela maior que o histórico = desde o primeiro ponto. */
export function changeOver(series: Series, windowMs: number, now: number): number {
  if (series.length === 0) return 0;
  const from = now - windowMs;
  let base = series[0];
  for (const p of series) {
    if (p.at <= from) base = p;
    else break;
  }
  return Math.round((series[series.length - 1].pnlUsd - base.pnlUsd) * 100) / 100;
}

/** Maior queda de um pico até um vale posterior (positivo). */
export function maxDrawdown(series: Series): number {
  let peak = -Infinity;
  let dd = 0;
  for (const p of series) {
    peak = Math.max(peak, p.pnlUsd);
    dd = Math.max(dd, peak - p.pnlUsd);
  }
  return Math.round(dd * 100) / 100;
}

/** O que `capitalUsd` teria rendido só segurando BTC, do preço inicial ao atual. */
export function hodlPnl(capitalUsd: number, btcStartUsd: number, btcNowUsd: number): number {
  if (!(btcStartUsd > 0)) return 0;
  return Math.round(capitalUsd * (btcNowUsd / btcStartUsd - 1) * 100) / 100;
}
