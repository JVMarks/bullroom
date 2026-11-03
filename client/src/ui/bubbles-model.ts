// Bullroom: regras do painel "Bolhas" (bubble map do Pump.fun, docs/referencias.md). Puro (testável): sem DOM.
// Simulado: uma bolha por robô, tamanho = capital, cor = PL. Ao vivo: uma bolha por carteira on-chain, tamanho = vendas
// fechadas no período, cor = resultado. O empacotamento é determinístico: os mesmos números dão o mesmo desenho, então
// o painel só muda quando um número muda (princípio da calma).
import type { AgentInfo } from '../../../shared/types';
import { formatValue, valueTone } from '../../../shared/trading/rules';
import type { PnlTone, ValueUnit } from '../../../shared/trading/types';

export interface BubbleInput {
  id: string;
  name: string;
  roomId: string;
  /** Base do tamanho (capital em US$, ou vendas fechadas). */
  size: number;
  /** Valor da cor (PL ou resultado), na unidade. */
  value: number;
  unit: ValueUnit;
}

export interface Bubble extends BubbleInput {
  x: number;
  y: number;
  r: number;
  text: string;
  tone: PnlTone;
  /** 0 a 1: força da cor pelo tamanho do valor entre as bolhas da mesma unidade. */
  strength: number;
}

export const R_MIN = 10;
export const R_MAX = 44;
const GAP = 3;

/** O que define o tamanho: capital (robôs), tamanho do PL (robôs com o mesmo capital) ou vendas fechadas (carteiras). */
export type BubbleBasis = 'capital' | 'pnl' | 'trades';

/**
 * Robôs com capitais quase iguais (até 20% de diferença) dariam bolhas do mesmo tamanho: aí o tamanho passa a ser o do
 * PL (quem mais ganha ou perde fica maior, como a força da placa). Devolve a regra usada para a legenda.
 */
export function sizeBasis(items: BubbleInput[]): { items: BubbleInput[]; basis: BubbleBasis } {
  const bots = items.filter((i) => i.unit === 'usd' && !i.id.startsWith('core:wallet:'));
  if (!bots.length) return { items, basis: 'trades' };
  const caps = bots.map((b) => b.size);
  if (Math.max(...caps) > Math.min(...caps) * 1.2) return { items, basis: 'capital' };
  const maxAbs = Math.max(...bots.map((b) => Math.abs(b.value)), 0.01);
  return { items: items.map((i) => (bots.includes(i) ? { ...i, size: Math.max(maxAbs * 0.04, Math.abs(i.value)) } : i)), basis: 'pnl' };
}

/** Bolhas a partir dos agentes: robôs (simulado) ou carteiras (ao vivo). Ejetado e Bitcoin (sem resultado) ficam de fora. */
export function bubbleInputs(agents: readonly AgentInfo[]): BubbleInput[] {
  const out: BubbleInput[] = [];
  for (const a of agents) {
    const t = a.trading;
    if (t) {
      if (t.ejectedAt !== undefined) continue;
      out.push({ id: a.id, name: a.name, roomId: a.roomId, size: Math.max(1, t.capitalUsd ?? 1), value: t.pnlUsd, unit: 'usd' });
    } else if (a.wallet && a.wallet.chain !== 'bitcoin') {
      out.push({ id: a.id, name: a.name, roomId: a.roomId, size: Math.max(1, a.wallet.trades), value: a.badge?.value ?? 0, unit: a.badge?.unit ?? 'usd' });
    }
  }
  return out;
}

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/**
 * Empacota em volta de (0, 0): a maior no centro, cada próxima no ponto livre mais perto do centro, encostada numa já
 * posta (24 direções por bolha). Empate desfeito pelo id: sempre o mesmo desenho para os mesmos números.
 */
export function packBubbles(items: readonly BubbleInput[], locale: string): Bubble[] {
  if (!items.length) return [];
  const maxSize = Math.max(...items.map((i) => i.size));
  const maxAbs = new Map<ValueUnit, number>();
  for (const i of items) maxAbs.set(i.unit, Math.max(maxAbs.get(i.unit) ?? 0, Math.abs(i.value)));
  const sorted = [...items].sort((a, b) => b.size - a.size || a.id.localeCompare(b.id));
  const placed: Bubble[] = [];
  for (const it of sorted) {
    const r = Math.round((R_MIN + (R_MAX - R_MIN) * Math.sqrt(it.size / maxSize)) * 10) / 10;
    let best = { x: 0, y: 0, d: Infinity };
    if (!placed.length) best = { x: 0, y: 0, d: 0 };
    for (const p of placed) {
      for (let k = 0; k < 24; k++) {
        const ang = (k / 24) * Math.PI * 2;
        const x = p.x + Math.cos(ang) * (p.r + r + GAP);
        const y = p.y + Math.sin(ang) * (p.r + r + GAP);
        if (placed.some((q) => dist(x, y, q.x, q.y) < q.r + r + GAP - 0.01)) continue;
        const d = Math.hypot(x, y);
        if (d < best.d - 1e-9) best = { x, y, d };
      }
    }
    const m = maxAbs.get(it.unit) ?? 0;
    placed.push({
      ...it,
      x: Math.round(best.x * 10) / 10,
      y: Math.round(best.y * 10) / 10,
      r,
      text: formatValue(it.value, it.unit, locale),
      tone: valueTone(it.value, it.unit),
      strength: m > 0 ? Math.min(1, Math.abs(it.value) / m) : 0,
    });
  }
  return placed;
}

/** Caixa que contém todas as bolhas (para o viewBox do SVG). */
export function bubbleBounds(bubbles: readonly Bubble[]): { x: number; y: number; w: number; h: number } {
  if (!bubbles.length) return { x: 0, y: 0, w: 1, h: 1 };
  const x0 = Math.min(...bubbles.map((b) => b.x - b.r));
  const y0 = Math.min(...bubbles.map((b) => b.y - b.r));
  const x1 = Math.max(...bubbles.map((b) => b.x + b.r));
  const y1 = Math.max(...bubbles.map((b) => b.y + b.r));
  return { x: x0 - 2, y: y0 - 2, w: x1 - x0 + 4, h: y1 - y0 + 4 };
}

/** Cor da bolha: verde ou vermelho mais forte quanto maior o valor; cinza no zero. */
export function bubbleColor(tone: PnlTone, strength: number): string {
  if (tone === 'zero') return '#6b7280';
  const s = 0.35 + 0.65 * strength;
  const [r, g, b] = tone === 'gain' ? [34, 197, 94] : [239, 68, 68];
  const base = [31, 41, 55];
  const mixc = (c: number, i: number) => Math.round(base[i] + (c - base[i]) * s);
  return `rgb(${mixc(r, 0)},${mixc(g, 1)},${mixc(b, 2)})`;
}
