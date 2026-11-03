// Bullroom: regras do cartão da carteira on-chain e do painel "Ranking". Puro (testável): sem DOM e sem rede.
// Cuidados (decisão do diretor, 02/11/2026): só o endereço encurtado (nunca nome), fonte e horário em todo número,
// cada operação com link para o explorador público, os piores ao lado dos melhores, nada de aviso e nada de copiar.
import type { CoreState, WalletChain, WalletOp, WalletState } from '../../../shared/core/types';
import { CHAIN_NAMES, shortAddress } from '../../../shared/core/to-office';
import { formatValue, valueTone } from '../../../shared/trading/rules';
import type { PnlTone, ValueUnit } from '../../../shared/trading/types';
import { tr } from '../../../shared/i18n';

const UNIT: Readonly<Record<string, ValueUnit>> = { SOL: 'sol', ETH: 'eth', BTC: 'btc', USD: 'usd' };

/** "+1,20 SOL", "-$3,10" e o tom (pela casa que aparece). */
export function formatResult(quote: string, amount: number, locale: string): { text: string; tone: PnlTone } {
  const unit = UNIT[quote];
  if (!unit) return { text: `${amount > 0 ? '+' : ''}${amount} ${quote}`, tone: amount > 0 ? 'gain' : amount < 0 ? 'loss' : 'zero' };
  return { text: formatValue(amount, unit, locale), tone: valueTone(amount, unit) };
}

/** Quantidade legível: 4 casas significativas; grande em notação compacta ("1,1 mi"). */
export function formatAmount(n: number, locale: string): string {
  if (Math.abs(n) >= 100_000) return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  return new Intl.NumberFormat(locale, { maximumSignificantDigits: 4 }).format(n);
}

const KIND_LABEL = (): Record<WalletOp['kind'], string> => ({
  buy: tr('Compra'),
  sell: tr('Venda'),
  in: tr('Entrada'),
  out: tr('Saída'),
  unclassified: tr('Não classificada'),
});

export interface OpRow {
  kind: WalletOp['kind'];
  label: string;
  text: string;
  /** Resultado da venda, quando fechou compra conhecida. */
  pnl: { text: string; tone: PnlTone } | null;
  at: number;
  url: string;
}

/** Uma linha por operação: "1,13 mi 8xH5…YgFd por 0,9 SOL". */
export function opRow(op: WalletOp, locale: string): OpRow {
  const amount = op.amount != null ? formatAmount(op.amount, locale) : '';
  const quote = op.quote && op.quoteAmount != null ? (op.quote === 'USD' ? `$${formatAmount(op.quoteAmount, locale)}` : `${formatAmount(op.quoteAmount, locale)} ${op.quote}`) : '';
  let text: string;
  if (op.kind === 'buy') text = tr('{0} {1} por {2}', [amount, op.asset ?? '', quote]);
  else if (op.kind === 'sell') text = tr('{0} {1} por {2}', [amount, op.asset ?? '', quote]);
  else if (op.kind === 'unclassified') text = tr('mexeu em mais de um ativo; confira no explorador');
  else text = `${amount} ${op.asset ?? ''}`.trim();
  return { kind: op.kind, label: KIND_LABEL()[op.kind], text, pnl: op.pnl !== undefined && op.quote ? formatResult(op.quote, op.pnl, locale) : null, at: op.at, url: op.url };
}

export interface WalletCardModel {
  where: string;
  /** Resultados por moeda (vazio = nenhuma venda fechada no período). */
  results: Array<{ text: string; tone: PnlTone }>;
  trades: string;
  hits: string;
  position: string;
  balance: string | null;
  /** "Fonte: api.mainnet-beta.solana.com · lido há 2 min" */
  source: string;
  /** "Operações lidas desde 28 out." (o período pode começar antes do que lemos). */
  since: string | null;
  external: string | null;
  error: string | null;
  ops: OpRow[];
}

export function walletCardModel(w: WalletState, state: CoreState | null, locale: string, ago: (at: number) => string, date: (at: number) => string): WalletCardModel {
  const days = Math.round((state?.wallets?.periodMs ?? 7 * 86_400_000) / 86_400_000);
  const src = state?.wallets?.sources.find((s) => s.chain === w.chain)?.source ?? '—';
  const ext = w.external;
  const usd = (n: number) => `$${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n)}`;
  return {
    where: [CHAIN_NAMES[w.chain], shortAddress(w.address), w.source === 'birdeye' ? tr('descoberta · Birdeye') : tr('sua lista')].join(' · '),
    results: w.results.map((r) => formatResult(r.quote, r.amount, locale)),
    trades: String(w.trades),
    hits: w.trades ? tr('{0} acertos · {1} erros', [w.wins, w.losses]) : '—',
    position: w.chain === 'bitcoin' ? '—' : w.open ? tr('aberta') : tr('zerada'),
    balance: w.balance ? `${formatAmount(w.balance.amount, locale)} ${w.balance.asset}` : null,
    source: w.lastAt ? tr('Fonte: {0} · lido {1} · resultado de {2} dias', [src, ago(w.lastAt), days]) : tr('Fonte: {0} · esperando a primeira leitura', [src]),
    since: w.since ? tr('Operações lidas desde {0}', [date(w.since)]) : null,
    external: ext
      ? [tr('Birdeye (24 h, token {0})', [shortAddress(ext.token)]), ext.volumeUsd !== undefined ? tr('volume {0}', [usd(ext.volumeUsd)]) : '', ext.trades !== undefined ? tr('{0} negócios', [ext.trades]) : '', ext.pnlUsd !== undefined ? tr('resultado {0}', [formatValue(ext.pnlUsd, 'usd', locale)]) : '']
          .filter(Boolean)
          .join(' · ')
      : null,
    error: w.ok ? null : (w.error ?? null),
    ops: w.ops.map((o) => opRow(o, locale)),
  };
}

export interface RankRow {
  address: string;
  short: string;
  result: { text: string; tone: PnlTone };
  trades: number;
  source: WalletState['source'];
}

export interface RankGroup {
  chain: WalletChain;
  title: string;
  best: RankRow[];
  worst: RankRow[];
}

/** Grupos do ranking (rede + moeda) na ordem do núcleo, com as linhas já formatadas. */
export function rankGroups(state: CoreState | null | undefined, locale: string): RankGroup[] {
  const ws = state?.wallets;
  if (!ws) return [];
  const row = (chain: WalletChain, quote: string) => (address: string): RankRow | null => {
    const w = ws.wallets.find((x) => x.chain === chain && x.address === address);
    const r = w?.results.find((x) => x.quote === quote);
    return w && r ? { address, short: shortAddress(address), result: formatResult(quote, r.amount, locale), trades: w.trades, source: w.source } : null;
  };
  return ws.ranking.map((g) => ({
    chain: g.chain,
    title: tr('{0} · em {1}', [CHAIN_NAMES[g.chain], g.quote === 'USD' ? tr('dólar (stablecoins)') : g.quote]),
    best: g.best.map(row(g.chain, g.quote)).filter((r): r is RankRow => r !== null),
    worst: g.worst.map(row(g.chain, g.quote)).filter((r): r is RankRow => r !== null),
  }));
}
