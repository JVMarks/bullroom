// Regras puras do robô de trading: status na sala, ejeção, cor e texto do PL.
import type { AgentStatus } from '../types';
import type { BotTrading, PnlTone } from './types';

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
