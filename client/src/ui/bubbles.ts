// Bullroom: painel "Bolhas" na gaveta da direita. Uma bolha por robô (simulado) ou por carteira on-chain (ao vivo):
// tamanho = capital (ou vendas fechadas), cor = PL (ou resultado). Clique abre o cartão. Sem animação: só redesenha
// quando um número muda.
import { intlLocale, tr } from '../../../shared/i18n';
import type { UiContext } from './context';
import { h } from './dom';
import { bubbleBounds, bubbleColor, bubbleInputs, packBubbles, sizeBasis } from './bubbles-model';

const SVG = 'http://www.w3.org/2000/svg';
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

export class BubblesView {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private filter: HTMLSelectElement;
  private sig = '';

  constructor(private ctx: UiContext) {
    this.filter = h('select', { class: 'ui-mk__input ui-mk__select', attrs: { 'aria-label': tr('Sala') }, on: { change: () => this.render(true) } });
    this.body = h('div', { class: 'ui-bb__body' });
    this.el = h(
      'section',
      { class: 'ui-mk ui-bb', attrs: { 'aria-label': tr('Bolhas') } },
      h('p', { class: 'ui-mk__intro', text: tr('Uma bolha por robô (simulado) ou por carteira on-chain (ao vivo). Clique numa bolha para ver o cartão.') }),
      this.filter,
      this.body,
    );
  }

  open(): void {
    this.sig = '';
    this.render(true);
  }

  render(force = false): void {
    const snap = this.ctx.store.snapshot;
    const rooms = snap?.rooms ?? [];
    const all = bubbleInputs(snap?.agents ?? []);
    const roomIds = [...new Set(all.map((b) => b.roomId))];
    const want = this.filter.value;
    const options = ['', ...roomIds];
    const optSig = options.join('|');
    if (this.filter.dataset.sig !== optSig) {
      this.filter.dataset.sig = optSig;
      this.filter.replaceChildren(...options.map((id) => h('option', { text: id ? (rooms.find((r) => r.id === id)?.name ?? id) : tr('Todas as salas'), attrs: { value: id } })));
      this.filter.value = options.includes(want) ? want : '';
    }
    const room = this.filter.value;
    const locale = intlLocale();
    const { items, basis } = sizeBasis(room ? all.filter((b) => b.roomId === room) : all);
    const bubbles = packBubbles(items, locale);
    const sig = JSON.stringify([basis, bubbles.map((b) => [b.id, b.r, b.text, b.x, b.y])]);
    if (!force && sig === this.sig) return;
    this.sig = sig;
    if (!bubbles.length) {
      this.body.replaceChildren(h('p', { class: 'ui-mk__status', text: this.ctx.store.core ? tr('Ao vivo, as bolhas são as carteiras on-chain. Cole endereços em Mercados › Carteiras.') : tr('Nenhum robô em operação ainda.') }));
      return;
    }
    const box = bubbleBounds(bubbles);
    const root = svg('svg', { class: 'ui-bb__svg', viewBox: `${box.x} ${box.y} ${box.w} ${box.h}`, role: 'img', 'aria-label': tr('Bolhas') });
    for (const b of bubbles) {
      const g = svg('g', { class: 'ui-bb__bubble', tabindex: 0, role: 'button', 'aria-label': `${b.name} ${b.text}` });
      g.append(svg('circle', { cx: b.x, cy: b.y, r: b.r, fill: bubbleColor(b.tone, b.strength) }));
      const title = svg('title', {});
      title.textContent = `${b.name} · ${b.text}`;
      g.append(title);
      if (b.r >= 18) {
        const name = svg('text', { x: b.x, y: b.r >= 26 ? b.y - 1 : b.y + 4, 'text-anchor': 'middle', class: 'ui-bb__name' });
        name.textContent = [...b.name].slice(0, Math.max(3, Math.floor(b.r / 5.5))).join('');
        g.append(name);
        if (b.r >= 26) {
          const val = svg('text', { x: b.x, y: b.y + 12, 'text-anchor': 'middle', class: 'ui-bb__val' });
          val.textContent = b.text;
          g.append(val);
        }
      }
      const pick = () => this.ctx.select({ type: 'agent', id: b.id });
      g.addEventListener('click', pick);
      g.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick()));
      root.append(g);
    }
    const legend =
      basis === 'capital'
        ? tr('Tamanho = capital do robô · cor = PL.')
        : basis === 'pnl'
          ? tr('Os robôs têm o mesmo capital, então o tamanho é o do PL: quem mais ganha ou perde fica maior. Cor = PL.')
          : tr('Tamanho = vendas fechadas em 7 dias · cor = resultado realizado na moeda da rede. Bitcoin não entra (sem troca na rede).');
    this.body.replaceChildren(root, h('p', { class: 'ui-mk__hint', text: legend }), ...(!this.ctx.store.core || (snap?.agents ?? []).some((a) => a.trading?.simulated) ? [h('p', { class: 'ui-mk__hint', text: tr('Dados simulados.') })] : []));
  }
}
