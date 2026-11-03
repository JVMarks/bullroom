// Bullroom: regras do painel "Mercados" (corretoras e pares do OpenSpread). Puro (testável): sem DOM e sem rede.
import type { CheckResult, ConfigLimits, CoreConfig, SpreadOpportunity, WalletChain } from '../../../shared/core/types';
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

/** Corretora × moeda-base que pedem taxa de saque: só as combinações em que a conferência diz que a corretora lista o par. */
export function feeRows(exchanges: readonly string[], pairs: readonly string[], check: CheckResult | null): Array<{ exchange: string; asset: string }> {
  const out: Array<{ exchange: string; asset: string }> = [];
  const seen = new Set<string>();
  for (const exchange of exchanges) {
    const listings = check?.exchanges.find((e) => e.id === exchange)?.listings ?? [];
    for (const pair of pairs) {
      if (!listings.find((l) => l.pair === pair && l.symbol)) continue;
      const asset = pair.split('/')[0];
      if (seen.has(`${exchange}|${asset}`)) continue;
      seen.add(`${exchange}|${asset}`);
      out.push({ exchange, asset });
    }
  }
  return out;
}

/** Quantidade digitada ("1", "0,5", " 2.25 ") → número entre 0 e `max`, ou null. */
export function parseAmount(input: string, max = 1_000_000): number | null {
  const t = input.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n <= max ? n : null;
}

/** Linha do cartão da sala sobre o saque no melhor spread ao vivo; null quando o núcleo não manda a informação. */
export function transferLine(best: SpreadOpportunity | null | undefined, locale: string): { tone: 'ok' | 'warn'; text: string } | null {
  const t = best?.transfer;
  if (!t) return null;
  const num = (n: number, d: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  const from = exchangeName(t.from);
  if (t.netPct !== null) {
    return { tone: 'ok', text: tr('Com o saque de {0} {1} na {2}: {3}% (operação de US$ {4})', [num(t.fee ?? 0, 2), t.asset, from, num(t.netPct, 2), num(t.sizeUsd, 0)]) };
  }
  if (t.missing === 'quote') return { tone: 'warn', text: tr('Saque não estimado: a cotação deste par não é em dólar.') };
  return { tone: 'warn', text: tr('Saque não informado ({0} · {1}): o número da sala ainda não inclui a transferência.', [from, t.asset]) };
}

export function sameConfig(a: CoreConfig, b: CoreConfig): boolean {
  const eq = (x: readonly string[], y: readonly string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  const alerts = (c: CoreConfig) => (c.alerts ?? []).map((x) => `${x.pair}@${x.abovePct}`);
  const fees = (c: CoreConfig) =>
    [`size:${c.transfer?.sizeUsd ?? 1000}`, ...Object.entries(c.transfer?.withdrawFees ?? {}).flatMap(([ex, m]) => Object.entries(m).map(([a, v]) => `${ex}:${a}:${v}`))].sort();
  const wallets = (c: CoreConfig) => (c.wallets ?? []).map((w) => `${w.chain}:${w.address}`);
  const discovery = (c: CoreConfig) => (c.discovery ? [`per:${c.discovery.perToken}`, ...c.discovery.tokens.map((t) => `${t.chain}:${t.address}`)] : []);
  return eq(a.exchanges, b.exchanges) && eq(a.pairs, b.pairs) && a.pollMs === b.pollMs && eq(alerts(a), alerts(b)) && eq(fees(a), fees(b)) && eq(wallets(a), wallets(b)) && eq(discovery(a), discovery(b));
}

/**
 * Rede pelo formato do endereço colado (o núcleo confere o checksum ao salvar). EVM serve à Ethereum e à Base:
 * devolve 'evm' e a tela pergunta qual. Puro.
 */
export function walletKind(input: string): 'solana' | 'evm' | 'bitcoin' | null {
  const s = input.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(s)) return 'evm';
  if (/^(bc1[02-9ac-hj-np-z]{11,71}|BC1[02-9AC-HJ-NP-Z]{11,71}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/.test(s)) return 'bitcoin';
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return 'solana';
  return null;
}

/** Endereço como o núcleo guarda (EVM em minúsculas, bech32 em minúsculas). */
export function normalizeWallet(chain: WalletChain, input: string): string {
  const s = input.trim();
  return chain === 'ethereum' || chain === 'base' || (chain === 'bitcoin' && /^bc1/i.test(s)) ? s.toLowerCase() : s;
}
