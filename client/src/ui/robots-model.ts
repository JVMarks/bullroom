// Bullroom: regras do painel "Robôs" (motor de paper do OpenSpread). Puro (testável): sem DOM e sem rede.
// O que vem do núcleo (motivo de bloqueio, motivo de parada) é mostrado como veio.
import type { EngineBot, EngineConfig, EngineState, PairState } from '../../../shared/core/types';
import { exchangeName } from '../../../shared/core/to-office';
import { tr } from '../../../shared/i18n';

export type RobotTone = 'run' | 'park' | 'out';

export interface RobotRow {
  id: string;
  title: string;
  status: string;
  tone: RobotTone;
  /** "+US$ 0,50" */
  pnl: string;
  pnlTone: 'gain' | 'loss' | 'zero';
  /** "1 operação · taxas US$ 0,10" */
  result: string;
  /** "12 de 160" */
  samples: string;
  /** "cotado 1,09% → realizado 1,01%"; null sem operação. */
  last: string | null;
  /** Por que parou ou o último bloqueio. */
  note: string | null;
  canStop: boolean;
}

const usd = (n: number, locale: string, digits = 2): string => new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: 2 }).format(n);
const money = (n: number, locale: string): string => `${n > 0 ? '+' : n < 0 ? '-' : ''}US$ ${usd(Math.abs(n), locale)}`;
const pct = (n: number, locale: string): string => `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}%`;

const active = (b: EngineBot): boolean => b.status === 'running' || b.status === 'parked';

function label(b: EngineBot): { status: string; tone: RobotTone } {
  if (b.status === 'running') return { status: tr('esperando'), tone: 'run' };
  if (b.status === 'parked') return { status: tr('parado: sem saldo'), tone: 'park' };
  if (b.status === 'ejected') return { status: tr('ejetado'), tone: 'out' };
  return { status: tr('parado por você'), tone: 'out' };
}

/** Uma linha por robô, ativos primeiro. Puro. */
export function botRows(e: EngineState, locale: string): RobotRow[] {
  const ordered = [...e.bots.filter(active), ...e.bots.filter((b) => !active(b))];
  return ordered.map((b) => {
    const { status, tone } = label(b);
    const fill = e.fills.find((f) => f.botId === b.id);
    const block = e.blocks.find((k) => k.botId === b.id);
    let note: string | null = null;
    if (b.status === 'parked') note = [b.statusReason, tr('Sem transferência, o robô só volta quando o spread inverter.')].filter(Boolean).join(' ');
    else if (b.status === 'ejected') note = b.statusReason ?? null;
    else if (b.status === 'running' && block) note = block.reasons.map((r) => `${r.message} ${r.fix}`).join(' ');
    return {
      id: b.id,
      title: `${b.pair} · ${b.exchanges.map(exchangeName).join(' + ')}`,
      status,
      tone,
      pnl: money(b.pnlUsd, locale),
      pnlTone: b.pnlUsd > 0 ? 'gain' : b.pnlUsd < 0 ? 'loss' : 'zero',
      result: `${b.trades === 1 ? tr('1 operação') : tr('{0} operações', [b.trades])} · ${tr('taxas US$ {0}', [usd(b.feesUsd, locale)])}`,
      samples: tr('{0} de {1}', [b.samplesAbove, b.samples]),
      last: fill ? tr('cotado {0} → realizado {1}{2}', [pct(fill.quotedNetPct, locale), pct(fill.realizedNetPct, locale), fill.partial ? tr(' (parcial)') : '']) : null,
      note,
      canStop: active(b),
    };
  });
}

/** "US$ 200 em uso de US$ 1.000 · reserva US$ 200". Puro. */
export function capitalLine(e: EngineState, c: EngineConfig, locale: string): string {
  const used = e.bots.filter(active).reduce((s, b) => s + b.capitalUsd, 0);
  const whole = (n: number) => usd(n, locale, 0);
  return tr('US$ {0} em uso de US$ {1} · reserva US$ {2}', [whole(used), whole(c.totalUsd), whole((c.totalUsd * c.reservePct) / 100)]);
}

/** "US$ 100 por operação · mínimo 0,05% · perda US$ 5/dia". Puro. */
export function limitsLine(c: EngineConfig, locale: string): string {
  return tr('US$ {0} por operação · mínimo {1} · perda US$ {2}/dia', [usd(c.policy.maxTradeUsd, locale, 0), pct(c.policy.minNetPct, locale), usd(c.policy.dailyLossLimitUsd, locale, 0)]);
}

/** Número digitado (vírgula ou ponto). Vazio, inválido ou negativo = null. Puro. */
export function parseLimit(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export interface LimitFields {
  totalUsd: number;
  maxTradeUsd: number;
  minNetPct: number;
  dailyLossLimitUsd: number;
}

/** O config com os limites do formulário; o resto fica como está. O núcleo confere ao salvar. Puro. */
export function withLimits(c: EngineConfig, f: LimitFields): EngineConfig {
  return { ...c, totalUsd: f.totalUsd, policy: { ...c.policy, maxTradeUsd: f.maxTradeUsd, minNetPct: f.minNetPct, dailyLossLimitUsd: f.dailyLossLimitUsd } };
}

export function enabledEngine(c: EngineConfig, enabled: boolean): EngineConfig {
  return { ...c, enabled };
}

/** Ligar um robô num par é a escolha do usuário de permitir esse par. Já permitido: devolve o mesmo objeto. Puro. */
export function engineWithPair(c: EngineConfig, pair: string): EngineConfig {
  if (c.policy.allowedPairs.includes(pair)) return c;
  return { ...c, policy: { ...c.policy, allowedPairs: [...c.policy.allowedPairs, pair] } };
}

/** Corretoras com cotação do par e a rota do melhor spread agora. Puro. */
export function routeOptions(p: PairState | undefined): { exchanges: string[]; suggested: [string, string] | null } {
  const exchanges = [...new Set((p?.quotes ?? []).map((q) => q.exchange))].sort();
  return { exchanges, suggested: p?.best ? [p.best.buyOn, p.best.sellOn] : null };
}

/** O que temos no lugar de backtest: o melhor líquido do par em 24 h, contra o mínimo. Puro. */
export function pairHint(p: PairState | undefined, minNetPct: number, locale: string): { text: string; low: boolean } {
  const day = p?.windows?.['24h'];
  if (!day) return { text: tr('Ainda sem 24 h de histórico deste par no núcleo.'), low: false };
  const low = day.max < minNetPct;
  return { text: low ? tr('Melhor líquido em 24 h: {0}, abaixo do mínimo. O robô deve ficar parado.', [pct(day.max, locale)]) : tr('Melhor líquido em 24 h: {0}.', [pct(day.max, locale)]), low };
}
