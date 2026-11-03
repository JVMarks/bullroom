// Bullroom: regras do painel "Agenda" (calendário com impacto + radar "só o que é novo"). Puro (testável): sem DOM.
// Regras de texto do radar (trader-news, docs/referencias.md): manchete é pista, não fato; sem previsão; sem resumo.
import type { AgendaEvent, AgendaImpact, CoreState, RadarItem } from '../../../shared/core/types';
import { tr } from '../../../shared/i18n';

export interface DayGroup {
  /** "Hoje", "Amanhã" ou a data ("qui., 12 nov."). */
  label: string;
  events: Array<{ id: string; time: string; title: string; impact: AgendaImpact; source: string; url?: string; pairs: string[]; past: boolean }>;
}

const DAY = 86_400_000;

/** Dia local (meia-noite) de um instante. */
const dayStart = (at: number): number => {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** Eventos agrupados por dia no fuso do navegador, com a hora local. */
export function groupEvents(events: readonly AgendaEvent[], now: number, locale: string): DayGroup[] {
  const today = dayStart(now);
  const timeFmt = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  const out: DayGroup[] = [];
  for (const e of [...events].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))) {
    const d = dayStart(e.at);
    const diff = Math.round((d - today) / DAY);
    const label = diff === 0 ? tr('Hoje') : diff === 1 ? tr('Amanhã') : diff === -1 ? tr('Ontem') : dayFmt.format(e.at);
    let g = out[out.length - 1];
    if (!g || g.label !== label) out.push((g = { label, events: [] }));
    g.events.push({ id: e.id, time: timeFmt.format(e.at), title: eventTitle(e), impact: e.impact, source: e.source, ...(e.url ? { url: e.url } : {}), pairs: e.pairs, past: e.at < now });
  }
  return out;
}

/** Nome por extenso das datas oficiais; evento do usuário fica como ele escreveu. */
export function eventTitle(e: Pick<AgendaEvent, 'kind' | 'title'>): string {
  if (e.kind === 'fomc') return tr('FOMC · decisão de juros (EUA)');
  if (e.kind === 'cpi') return tr('CPI · inflação ao consumidor (EUA)');
  return e.title;
}

export interface RadarRow extends RadarItem {
  fresh: boolean;
}

/** Manchetes com a marca "novo" (publicadas depois da última olhada). Sem última olhada, nenhuma é "nova". */
export function radarRows(items: readonly RadarItem[], lastSeen: number | null, room: string | null = null): RadarRow[] {
  return items.filter((i) => !room || i.pairs.includes(room)).map((i) => ({ ...i, fresh: lastSeen !== null && i.at > lastSeen }));
}

/** Resumo de saúde dos feeds para o rodapé: "2/3 feeds lendo". null sem feed. */
export function feedsLine(state: CoreState | null | undefined): string | null {
  const feeds = state?.agenda?.feeds ?? [];
  if (!feeds.length) return null;
  return tr('{0}/{1} feeds lendo', [feeds.filter((f) => f.ok).length, feeds.length]);
}
