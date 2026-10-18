// Bullroom: rótulos da barra lateral e do painel para robôs (simulados) e corretoras observadas (ao vivo).
// Cada função devolve null para agentes comuns, que ficam com os rótulos do habblaud. Puro (testável).
import type { AgentInfo } from '../../../shared/types';
import { tr } from '../../../shared/i18n';

type Who = Pick<AgentInfo, 'trading' | 'badge'>;

/** No lugar do "Principal": a posição do robô, ou "corretora". */
export function tradingRoleLabel(a: Who): string | null {
  const t = a.trading;
  if (t) {
    if (t.ejectedAt !== undefined) return tr('ejetado');
    return t.position === 'long' ? tr('comprado') : t.position === 'short' ? tr('vendido') : tr('zerado');
  }
  return a.badge ? tr('corretora') : null;
}

/** No lugar de "Trabalhando" / "Ocioso": "Operando", "Zerado", "Ejetado" ou "Ao vivo". */
export function tradingStatusLabel(a: Who): string | null {
  const t = a.trading;
  if (t) {
    if (t.ejectedAt !== undefined) return tr('Ejetado');
    return t.position === 'flat' ? tr('Zerado') : tr('Operando');
  }
  return a.badge ? tr('Ao vivo') : null;
}

/** Título do painel: "Robô" ou "Corretora" (no lugar de "Agente"). */
export function tradingHeading(a: Who): string | null {
  return a.trading ? tr('Robô') : a.badge ? tr('Corretora') : null;
}

/** Linha de atividade sem nenhuma operação ainda (no lugar de "Aguardando instruções"). */
export function tradingActivityFallback(a: Who): string | null {
  return a.trading ? tr('sem operação ainda') : a.badge ? tr('ao vivo') : null;
}
