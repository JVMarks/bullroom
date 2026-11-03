// Bullroom: "Máquinas" no cartão da sala de máquinas (clique na sala). Saúde do núcleo do OpenSpread e, por fonte, a
// latência do último pedido e o uso do limite de pedidos por minuto. Só ao vivo (?source=core). Puro na parte de regras
// (machineRows); a classe só desenha.
import type { CoreState } from '../../../shared/core/types';
import { MACHINES_ROOM_ID, sourceLevel, sourceName } from '../../../shared/core/to-office';
import { intlLocale, tr } from '../../../shared/i18n';
import type { UiContext } from './context';
import { h } from './dom';
import { formatDuration } from './format';

export interface MachineRow {
  name: string;
  /** "41 ms · 8 de 1.200/min" */
  detail: string;
  /** Uso do limite (0 a 1); null quando a fonte não publica limite. */
  use: number | null;
  level: 'ok' | 'warn' | 'down';
  /** Motivo de estar fora ou recuando. */
  note: string | null;
}

export interface MachineView {
  cpu: string;
  memory: string;
  system: string;
  uptime: string;
  rows: MachineRow[];
}

/** Textos da sala de máquinas a partir do estado do núcleo. null sem dados de máquina (núcleo antigo). Puro. */
export function machineView(state: CoreState | null | undefined, locale: string, duration: (ms: number) => string): MachineView | null {
  const m = state?.machine;
  if (!m) return null;
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const rows = m.sources.map((s): MachineRow => {
    const level = sourceLevel(s, m.at);
    const use = s.limitPerMin ? Math.min(1, s.perMin / s.limitPerMin) : null;
    const parts = [
      s.latencyMs !== undefined ? `${s.latencyMs} ms` : null,
      s.limitPerMin ? tr('{0} de {1}/min', [s.perMin, new Intl.NumberFormat(locale).format(s.limitPerMin)]) : tr('{0}/min (limite não publicado)', [s.perMin]),
    ].filter(Boolean);
    const note = s.backoffUntil && s.backoffUntil > m.at ? tr('recuando por {0}', [duration(s.backoffUntil - m.at)]) : !s.ok ? (s.error ?? tr('sem dados')) : null;
    return { name: s.kind === 'chain' ? `${sourceName(s)} · ${s.id}` : sourceName(s), detail: parts.join(' · '), use, level, note };
  });
  return {
    cpu: `${n.format(m.cpuPct)}%`,
    memory: `${m.rssMb} MB`,
    system: `${m.sysMemPct}%`,
    uptime: duration(m.uptimeS * 1000),
    rows,
  };
}

const LEVEL_COLOR = { ok: '#4ade80', warn: '#fbbf24', down: '#f87171' } as const;

/** Conteúdo da seção "Máquinas" do cartão da sala (o RoomView a embrulha). */
export class RoomMachinesView {
  readonly el: HTMLElement;
  private sig = '';

  constructor() {
    this.el = h('div', { class: 'ui-mc' });
  }

  /** Desenha quando a sala é a de máquinas; devolve false para as outras (a seção fica escondida). */
  render(ctx: UiContext, roomId: string): boolean {
    if (roomId !== MACHINES_ROOM_ID) return false;
    const v = machineView(ctx.store.coreState, intlLocale(), formatDuration);
    const sig = JSON.stringify(v);
    if (sig === this.sig) return true;
    this.sig = sig;
    if (!v) {
      this.el.replaceChildren(h('p', { class: 'ui-mk__status', text: tr('Esperando a primeira leitura do núcleo…') }));
      return true;
    }
    const kv = (k: string, val: string) => h('div', { class: 'ui-mc__kv' }, h('span', { text: k }), h('b', { text: val }));
    this.el.replaceChildren(
      h('div', { class: 'ui-mc__grid' }, kv(tr('CPU do núcleo'), v.cpu), kv(tr('Memória do núcleo'), v.memory), kv(tr('Memória do computador'), v.system), kv(tr('Rodando há'), v.uptime)),
      h('h4', { class: 'ui-mk__label', text: tr('Fontes (um rack cada)') }),
      ...v.rows.map((r) => {
        const bar = h('i', {});
        bar.style.width = `${Math.round((r.use ?? 1) * 100)}%`;
        bar.style.background = r.use === null && r.level === 'ok' ? '#3a4150' : LEVEL_COLOR[r.level];
        return h(
          'div',
          { class: 'ui-mc__row' },
          h('div', { class: 'ui-mc__line' }, h('span', { class: 'ui-mc__dot', attrs: { style: `background:${LEVEL_COLOR[r.level]}` } }), h('span', { class: 'ui-mc__name', text: r.name }), h('span', { class: 'ui-mc__detail', text: r.detail })),
          h('div', { class: 'ui-mc__bar' }, bar),
          ...(r.note ? [h('p', { class: 'ui-mc__note', text: r.note })] : []),
        );
      }),
      h('p', { class: 'ui-mk__hint', text: tr('Limite das corretoras: o ritmo que a CCXT respeita (mais conservador que o da corretora). Tudo medido no seu computador; nada é enviado.') }),
    );
    return true;
  }
}
