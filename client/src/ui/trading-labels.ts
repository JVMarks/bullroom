// Bullroom: rótulos da barra lateral e do painel para robôs (simulados) e corretoras observadas (ao vivo).
// Cada função devolve null para agentes comuns, que ficam com os rótulos do habblaud. Puro (testável).
import type { AgentInfo } from '../../../shared/types';
import { tr } from '../../../shared/i18n';

type Who = Pick<AgentInfo, 'trading' | 'badge' | 'wallet'>;

/** No lugar do "Principal": a posição do robô, ou "corretora". */
export function tradingRoleLabel(a: Who): string | null {
  const t = a.trading;
  if (t) {
    if (t.ejectedAt !== undefined) return tr('ejetado');
    if (t.simulated) return t.parked ? tr('parado') : tr('esperando');
    return t.position === 'long' ? tr('comprado') : t.position === 'short' ? tr('vendido') : tr('zerado');
  }
  if (a.wallet) return tr('carteira');
  return a.badge ? tr('corretora') : null;
}

/** No lugar de "Trabalhando" / "Ocioso": "Operando", "Zerado", "Ejetado" ou "Ao vivo". */
export function tradingStatusLabel(a: Who): string | null {
  const t = a.trading;
  if (t) {
    if (t.ejectedAt !== undefined) return tr('Ejetado');
    if (t.simulated) return t.parked ? tr('Parado: sem saldo') : tr('Esperando oportunidade');
    return t.position === 'flat' ? tr('Zerado') : tr('Operando');
  }
  if (a.wallet) return a.wallet.chain === 'bitcoin' ? tr('Ao vivo') : a.wallet.open ? tr('Posição aberta') : tr('Zerada');
  return a.badge ? tr('Ao vivo') : null;
}

/** Título do painel: "Robô" ou "Corretora" (no lugar de "Agente"). */
export function tradingHeading(a: Who): string | null {
  return a.trading ? tr('Robô') : a.wallet ? tr('Carteira') : a.badge ? tr('Corretora') : null;
}

/** Linha de atividade sem nenhuma operação ainda (no lugar de "Aguardando instruções"). */
export function tradingActivityFallback(a: Who): string | null {
  return a.trading || a.wallet ? tr('sem operação ainda') : a.badge ? tr('ao vivo') : null;
}
