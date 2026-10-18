// Regras puras do robô de trading: status na sala, ejeção, cor e texto do PL.
import type { AgentStatus } from '../types';
import type { BotTrading, PnlTone, ValueUnit } from './types';

/** Posicionado opera na mesa ('working'), zerado circula ('idle'), ejetado vai embora ('offline'). */
export function botStatus(t: BotTrading): AgentStatus {
  if (t.ejectedAt !== undefined) return 'offline';
  return t.position === 'flat' ? 'idle' : 'working';
}

/** Atingiu a perda diária máxima. */
export function shouldEject(t: BotTrading): boolean {
  return t.pnlUsd <= -t.dailyLossLimitUsd;
}

const cents = (usd: number): number => Math.round(usd * 100);

/** Tom do balão pelo valor já arredondado em centavos: -0,004 é zero, não perda. */
export function pnlTone(usd: number): PnlTone {
  const c = cents(usd);
  return c > 0 ? 'gain' : c < 0 ? 'loss' : 'zero';
}

/** "+$4,01" (pt-BR), "-$0.39" (en). Sinal sempre; zero sai "+$0,00", nunca "-$0,00". */
export function formatPnl(usd: number, locale: string): string {
  const c = cents(usd);
  const n = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(c) / 100);
  return `${c < 0 ? '-' : '+'}$${n}`;
}

/** Valor com sinal na unidade: usd "+$4,01", pct "-0,20%", bp "+1,3 bp". Zero arredondado sai com "+". */
export function formatValue(v: number, unit: ValueUnit | undefined, locale: string): string {
  if (!unit || unit === 'usd') return formatPnl(v, locale);
  const digits = unit === 'pct' ? 2 : 1;
  const k = 10 ** digits;
  const r = Math.round(v * k);
  const n = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(r) / k);
  return `${r < 0 ? '-' : '+'}${n}${unit === 'pct' ? '%' : ' bp'}`;
}
