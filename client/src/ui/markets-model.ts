// Bullroom: regras do painel "Mercados" (corretoras e pares do OpenSpread). Puro (testável): sem DOM e sem rede.
import type { CheckResult, ConfigLimits, CoreConfig } from '../../../shared/core/types';
import { exchangeName } from '../../../shared/core/to-office';
import { tr } from '../../../shared/i18n';

/** Moedas estáveis e moedas fiduciárias: par só com elas não é "volátil" (o preço não corre durante a transferência). */
const STEADY = new Set(['USDT', 'USDC', 'DAI', 'FDUSD', 'USDE', 'TUSD', 'PYUSD', 'USDS', 'USDP', 'BUSD', 'EURC', 'USD', 'EUR', 'BRL', 'GBP']);

export const SUGGESTED_PAIRS: readonly string[] = ['USDC/USDT', 'USDE/USDT', 'FDUSD/USDT', 'DAI/USDT', 'BTC/USDT', 'ETH/USDT', 'SOL/USDT'];

const PAIR = /^[A-Z0-9]{2,12}\/[A-Z0-9]{2,12}$/;

/** "btc-usdt", "BTC USDT" ou "btc/usdt" → "BTC/USDT"; formato inválido → null. */
export function normalizePair(input: string): string | null {
  const p = input.trim().toUpperCase().replace(/\s*[-\s/]\s*/, '/');
  if (!PAIR.test(p)) return null;
  const [base, quote] = p.split('/');
  return base === quote ? null : p;
}

export function isVolatile(pair: string): boolean {
  return pair.split('/').some((c) => !STEADY.has(c));
}

export interface ExchangeOnPair {
  id: string;
  name: string;
  takerFee: number | null;
  inverted: boolean;
}

export interface RoomSummary {
  pair: string;
  /** A conferência cobre este par e todas as corretoras escolhidas. */
  checked: boolean;
  listed: ExchangeOnPair[];
  inactive: ExchangeOnPair[];
  /** Com 2 ou mais corretoras ativas a sala abre. */
  opens: boolean;
  volatile: boolean;
}

/** O que a última conferência diz deste par, na ordem das corretoras escolhidas. */
export function roomSummary(pair: string, exchanges: readonly string[], check: CheckResult | null): RoomSummary {
  const listed: ExchangeOnPair[] = [];
  const inactive: ExchangeOnPair[] = [];
  let checked = !!check;
  for (const id of exchanges) {
    const ex = check?.exchanges.find((e) => e.id === id);
    const l = ex?.listings.find((x) => x.pair === pair);
    if (!ex || !l) {
      checked = false;
      continue;
    }
    if (!l.symbol) continue;
    const item = { id, name: exchangeName(id), takerFee: l.takerFee, inverted: l.inverted };
    (l.active ? listed : inactive).push(item);
  }
  return { pair, checked, listed, inactive, opens: listed.length >= 2, volatile: isVolatile(pair) };
}

/** Corretoras para o campo de busca: casa id ou nome; as que começam com o texto vêm antes; sem as já escolhidas. */
export function searchExchanges(known: readonly string[], query: string, selected: readonly string[], limit = 12): string[] {
  const q = query.trim().toLowerCase();
  const taken = new Set(selected);
  const scored: Array<[number, string]> = [];
  for (const id of known) {
    if (taken.has(id)) continue;
    const name = exchangeName(id).toLowerCase();
    if (!q) scored.push([1, id]);
    else if (id.startsWith(q) || name.startsWith(q)) scored.push([0, id]);
    else if (id.includes(q) || name.includes(q)) scored.push([1, id]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  return scored.slice(0, limit).map(([, id]) => id);
}

/** Taxa taker como porcentagem com 2 casas ("0,10%"). */
export function formatFee(fee: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(fee);
}

/** O que impede salvar ou conferir (mesmas regras do núcleo, ditas na língua da interface). */
export function draftProblems(draft: CoreConfig, limits: ConfigLimits): string[] {
  const out: string[] = [];
  if (draft.exchanges.length < limits.minExchanges) out.push(tr('Escolha pelo menos {0} corretoras para comparar.', [limits.minExchanges]));
  if (draft.exchanges.length > limits.maxExchanges) out.push(tr('No máximo {0} corretoras.', [limits.maxExchanges]));
  if (draft.pairs.length < 1) out.push(tr('Escolha pelo menos 1 par.'));
  if (draft.pairs.length > limits.maxPairs) out.push(tr('No máximo {0} pares.', [limits.maxPairs]));
  return out;
}

/** Nível digitado ("0,05", "0.05%", "-0,1") → número em %, ou null fora da faixa ou do formato. */
export function parseAlertPct(input: string, min = -1, max = 10): number | null {
  const t = input.trim().replace('%', '').replace(',', '.').trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}

export function sameConfig(a: CoreConfig, b: CoreConfig): boolean {
  const eq = (x: readonly string[], y: readonly string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  const alerts = (c: CoreConfig) => (c.alerts ?? []).map((x) => `${x.pair}@${x.abovePct}`);
  return eq(a.exchanges, b.exchanges) && eq(a.pairs, b.pairs) && a.pollMs === b.pollMs && eq(alerts(a), alerts(b));
}
