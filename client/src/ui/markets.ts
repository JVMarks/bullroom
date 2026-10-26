// Bullroom: painel "Mercados" na gaveta da direita. Escolhe as corretoras (cada uma vira um personagem) e os pares
// (cada um vira uma sala) que o núcleo local do OpenSpread lê; "Conferir" pergunta ao núcleo quem lista cada par (com a
// taxa taker pública) e "Salvar e aplicar" grava o arquivo do núcleo, que troca as salas sem reiniciar.
// Só existe de verdade com ?source=core; na demonstração simulada o painel explica como ligar o núcleo.
import type { CheckResult, ConfigInfo, CoreConfig } from '../../../shared/core/types';
import { exchangeName } from '../../../shared/core/to-office';
import { intlLocale, tr } from '../../../shared/i18n';
import { coreConfigApi, type CoreConfigApi, type CoreFailure } from '../net/core-config';
import type { UiContext } from './context';
import { h, iconButton, setHidden, setText } from './dom';
import { ICONS } from './icons';
import { draftProblems, formatFee, normalizePair, parseAlertPct, roomSummary, sameConfig, searchExchanges, SUGGESTED_PAIRS } from './markets-model';

type Phase = 'demo' | 'loading' | 'offline' | 'ready';
type Tone = 'ok' | 'warn' | 'error';

export class MarketsView {
  readonly el: HTMLElement;
  private phase: Phase = 'loading';
  private info: ConfigInfo | null = null;
  private draft: CoreConfig | null = null;
  private check: CheckResult | null = null;
  private busy: 'check' | 'save' | null = null;
  private note: { tone: Tone; lines: string[] } | null = null;
  private searching = false;
  /** Par com o campo de novo alerta aberto. */
  private alertFor: string | null = null;

  private status: HTMLElement;
  private retry: HTMLButtonElement;
  private editor: HTMLElement;
  private exchanges: HTMLElement;
  private addExchange: HTMLButtonElement;
  private search: HTMLElement;
  private searchInput: HTMLInputElement;
  private results: HTMLElement;
  private rooms: HTMLElement;
  private pairInput: HTMLInputElement;
  private suggestions: HTMLElement;
  private noteEl: HTMLElement;
  private checkBtn: HTMLButtonElement;
  private saveBtn: HTMLButtonElement;

  constructor(
    private ctx: UiContext,
    private api: CoreConfigApi = coreConfigApi(),
  ) {
    this.status = h('p', { class: 'ui-mk__status' });
    this.retry = h('button', { class: 'ui-btn', type: 'button', text: tr('Tentar de novo'), hidden: true, on: { click: () => void this.load() } });

    this.addExchange = h('button', { class: 'ui-mk__chip ui-mk__chip--add', type: 'button', text: tr('+ corretora'), attrs: { 'aria-expanded': 'false' }, on: { click: () => this.toggleSearch() } });
    this.exchanges = h('div', { class: 'ui-mk__chips', role: 'list' });
    this.searchInput = h('input', { class: 'ui-mk__input', type: 'search', attrs: { 'aria-label': tr('Buscar corretora'), autocomplete: 'off', spellcheck: 'false' } });
    this.searchInput.addEventListener('input', () => this.paintResults());
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.toggleSearch(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const first = this.results.querySelector('button');
        first?.click();
      }
    });
    this.results = h('div', { class: 'ui-mk__results', role: 'list' });
    this.search = h('div', { class: 'ui-mk__search', hidden: true }, this.searchInput, this.results);

    this.rooms = h('div', { class: 'ui-mk__rooms' });
    this.pairInput = h('input', { class: 'ui-mk__input', type: 'text', attrs: { 'aria-label': tr('Novo par'), placeholder: tr('+ Nova sala, ex.: ETH/USDT'), autocomplete: 'off', spellcheck: 'false' } });
    const pairForm = h('form', { class: 'ui-mk__add', on: { submit: (e) => (e.preventDefault(), this.addPair(this.pairInput.value)) } }, this.pairInput);
    this.suggestions = h('div', { class: 'ui-mk__suggest' });

    this.noteEl = h('div', { class: 'ui-mk__note', role: 'status', attrs: { 'aria-live': 'polite' } });
    this.checkBtn = h('button', { class: 'ui-btn', type: 'button', text: tr('Conferir'), on: { click: () => void this.runCheck() } });
    this.saveBtn = h('button', { class: 'ui-btn ui-btn--primary', type: 'button', text: tr('Salvar e aplicar'), on: { click: () => void this.save() } });

    this.editor = h(
      'div',
      { class: 'ui-mk__editor', hidden: true },
      h('h3', { class: 'ui-mk__label', text: tr('Corretoras') }),
      h('div', { class: 'ui-mk__chips-row' }, this.exchanges, this.addExchange),
      this.search,
      h('h3', { class: 'ui-mk__label', text: tr('Salas (pares)') }),
      this.rooms,
      pairForm,
      this.suggestions,
    );
    const actions = h('div', { class: 'ui-mk__actions' }, this.checkBtn, this.saveBtn);
    this.el = h(
      'section',
      { class: 'ui-mk', attrs: { 'aria-label': tr('Mercados') } },
      h('p', { class: 'ui-mk__intro', text: tr('Cada par vira uma sala; cada corretora, um personagem.') }),
      this.status,
      this.retry,
      this.editor,
      this.noteEl,
      actions,
    );
    this.paint();
  }

  /** Abre o painel: na demonstração só explica; com o núcleo, lê a configuração atual e já confere. */
  open(): void {
    this.note = null;
    this.searching = false;
    if (!this.ctx.store.core) {
      this.phase = 'demo';
      this.paint();
      return;
    }
    void this.load();
  }

  private async load(): Promise<void> {
    this.phase = 'loading';
    this.paint();
    const r = await this.api.info();
    if (!r.ok) {
      this.phase = 'offline';
      this.paint();
      return;
    }
    this.info = r.value;
    this.draft = copy(r.value.config);
    this.phase = 'ready';
    this.paint();
    void this.runCheck();
  }

  private toggleSearch(open = !this.searching): void {
    this.searching = open;
    this.searchInput.value = '';
    this.paint();
    if (open) this.searchInput.focus();
    else this.addExchange.focus();
  }

  private edit(change: (d: CoreConfig) => void): void {
    if (!this.draft) return;
    change(this.draft);
    this.note = null;
    this.paint();
  }

  private addPair(input: string): void {
    if (!this.draft || !this.info) return;
    const pair = normalizePair(input);
    if (!pair) {
      this.note = { tone: 'error', lines: [tr('Use o formato BTC/USDT.')] };
      this.paint();
      return;
    }
    this.pairInput.value = '';
    if (this.draft.pairs.includes(pair)) return;
    if (this.draft.pairs.length >= this.info.limits.maxPairs) {
      this.note = { tone: 'error', lines: [tr('No máximo {0} pares.', [this.info.limits.maxPairs])] };
      this.paint();
      return;
    }
    this.edit((d) => d.pairs.push(pair));
  }

  private async runCheck(): Promise<void> {
    if (!this.draft || this.busy) return;
    const problems = this.info ? draftProblems(this.draft, this.info.limits) : [];
    if (problems.length) {
      this.note = { tone: 'error', lines: problems };
      this.paint();
      return;
    }
    this.busy = 'check';
    this.paint();
    const r = await this.api.check(copy(this.draft));
    this.busy = null;
    if (r.ok) this.check = r.value;
    else this.fail(r.kind, r.details);
    this.paint();
  }

  private async save(): Promise<void> {
    if (!this.draft || !this.info || this.busy) return;
    const problems = draftProblems(this.draft, this.info.limits);
    if (problems.length) {
      this.note = { tone: 'error', lines: problems };
      this.paint();
      return;
    }
    this.busy = 'save';
    this.paint();
    const r = await this.api.save(copy(this.draft));
    this.busy = null;
    if (!r.ok) {
      this.fail(r.kind, r.details);
      this.paint();
      return;
    }
    this.info = r.value;
    this.draft = copy(r.value.config);
    this.note = { tone: 'ok', lines: [tr('Salvo. As salas mudam na próxima leitura do núcleo.')] };
    this.ctx.announce(tr('Mercados salvos.'));
    this.paint();
    void this.runCheck();
  }

  private fail(kind: CoreFailure, details: string[]): void {
    if (kind === 'offline') {
      this.phase = 'offline';
      return;
    }
    const head =
      kind === 'busy' ? tr('Já há uma conferência em andamento. Tente de novo em instantes.') : kind === 'invalid' ? tr('O núcleo recusou a configuração:') : tr('O núcleo respondeu com erro:');
    this.note = { tone: kind === 'busy' ? 'warn' : 'error', lines: kind === 'busy' ? [head] : [head, ...details] };
  }

  render(): void {
    // Tudo é redesenhado em paint(), quando algo do próprio painel muda (princípio da calma).
  }

  private paint(): void {
    const ready = this.phase === 'ready' && !!this.draft && !!this.info;
    const status =
      this.phase === 'demo'
        ? tr('Na demonstração os robôs são simulados e não há corretoras. Para escolher corretoras e pares, rode o OpenSpread no seu computador e abra o Bullroom com ?source=core.')
        : this.phase === 'offline'
          ? tr('O núcleo do OpenSpread não respondeu. Rode npm start na pasta core/ e tente de novo.')
          : this.phase === 'loading'
            ? tr('Lendo a configuração do núcleo…')
            : tr('OpenSpread no seu computador: dados públicos, sem chave e sem ordem.');
    setText(this.status, status);
    this.status.classList.toggle('is-warn', this.phase === 'offline');
    setHidden(this.retry, this.phase !== 'offline');
    setHidden(this.editor, !ready);
    setHidden(this.checkBtn, !ready);
    setHidden(this.saveBtn, !ready);

    if (ready) {
      this.paintExchanges();
      this.addExchange.setAttribute('aria-expanded', String(this.searching));
      setHidden(this.search, !this.searching);
      this.searchInput.placeholder = tr('Buscar entre {0} corretoras', [this.info!.known.length]);
      if (this.searching) this.paintResults();
      this.paintRooms();
      this.paintSuggestions();
      const changed = !sameConfig(this.draft!, this.info!.config);
      this.checkBtn.disabled = this.busy !== null;
      this.saveBtn.disabled = this.busy !== null || !changed;
      setText(this.checkBtn, this.busy === 'check' ? tr('Conferindo…') : tr('Conferir'));
      setText(this.saveBtn, this.busy === 'save' ? tr('Salvando…') : tr('Salvar e aplicar'));
    }

    this.noteEl.replaceChildren(...(this.note ? this.note.lines.map((l) => h('p', { text: l })) : []));
    this.noteEl.className = `ui-mk__note${this.note ? ` is-${this.note.tone}` : ''}`;
    setHidden(this.noteEl, !this.note);
  }

  private paintExchanges(): void {
    const d = this.draft!;
    this.exchanges.replaceChildren(
      ...d.exchanges.map((id) =>
        h(
          'span',
          { class: 'ui-mk__chip', role: 'listitem' },
          exchangeName(id),
          h('button', {
            class: 'ui-mk__x',
            type: 'button',
            text: '✕',
            attrs: { 'aria-label': tr('Tirar {0}', [exchangeName(id)]) },
            on: { click: () => this.edit((x) => (x.exchanges = x.exchanges.filter((e) => e !== id))) },
          }),
        ),
      ),
    );
    this.addExchange.disabled = d.exchanges.length >= this.info!.limits.maxExchanges;
  }

  private paintResults(): void {
    const found = searchExchanges(this.info!.known, this.searchInput.value, this.draft!.exchanges);
    this.results.replaceChildren(
      ...(found.length
        ? found.map((id) =>
            h(
              'button',
              {
                class: 'ui-mk__result',
                type: 'button',
                role: 'listitem',
                on: {
                  click: () => {
                    this.edit((x) => x.exchanges.push(id));
                    this.toggleSearch(false);
                  },
                },
              },
              h('span', { text: exchangeName(id) }),
              h('span', { class: 'ui-mk__id', text: id }),
            ),
          )
        : [h('p', { class: 'ui-mk__hint', text: tr('Nenhuma corretora com esse nome.') })]),
    );
  }

  private paintRooms(): void {
    const d = this.draft!;
    const locale = intlLocale();
    this.rooms.replaceChildren(
      ...d.pairs.map((pair) => {
        const s = roomSummary(pair, d.exchanges, this.check);
        const lines: HTMLElement[] = [];
        if (!s.checked) {
          lines.push(h('p', { class: 'ui-mk__hint', text: tr('Clique em Conferir para ver quais corretoras listam este par.') }));
        } else {
          if (s.listed.length) {
            const who = h('p', { class: 'ui-mk__who' });
            s.listed.forEach((e, i) => {
              if (i) who.append(' · ');
              const fee = e.takerFee === null ? tr('taxa taker não informada') : tr('taxa taker pública: {0}', [formatFee(e.takerFee, locale)]);
              who.append(h('span', { class: 'ui-mk__ex', text: e.inverted ? `${e.name} ↔` : e.name, title: e.inverted ? `${fee} · ${tr('a corretora lista o par invertido')}` : fee, tabIndex: 0 }));
            });
            lines.push(who);
          }
          if (s.inactive.length) lines.push(h('p', { class: 'ui-mk__warn', text: tr('Inativo em: {0}', [s.inactive.map((e) => e.name).join(', ')]) }));
          if (!s.opens) {
            lines.push(
              h('p', {
                class: 'ui-mk__warn',
                text: s.listed.length === 0 ? tr('Nenhuma corretora escolhida lista este par.') : tr('Só {0} lista: a sala não abre com menos de 2 corretoras.', [s.listed[0].name]),
              }),
            );
          }
        }
        if (s.volatile) lines.push(h('p', { class: 'ui-mk__warn', text: tr('Volátil: a transferência entre corretoras não é descontada.') }));
        const remove = iconButton(
          ICONS.close,
          tr('Tirar a sala {0}', [pair]),
          () =>
            this.edit((x) => {
              x.pairs = x.pairs.filter((p) => p !== pair);
              x.alerts = x.alerts.filter((a) => a.pair !== pair);
            }),
          'ui-icon-btn--sm',
        );
        return h('div', { class: `ui-mk__room${s.checked && !s.opens ? ' is-short' : ''}` }, h('div', { class: 'ui-mk__room-head' }, h('b', { text: pair }), remove), ...lines, this.alertRow(pair, locale));
      }),
    );
  }

  /** Linha do alerta da sala: o alerta atual (com ✕), o botão "+ alerta" ou o campo do nível. */
  private alertRow(pair: string, locale: string): HTMLElement {
    const d = this.draft!;
    const current = d.alerts.find((a) => a.pair === pair);
    const pct = (n: number) => `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(n)}%`;
    if (current) {
      return h(
        'div',
        { class: 'ui-mk__alert' },
        h('span', { text: tr('Alerta: spread líquido ≥ {0}', [pct(current.abovePct)]), title: tr('Toca uma vez ao chegar ao nível e volta a valer depois que o spread recua.') }),
        h('button', {
          class: 'ui-mk__x',
          type: 'button',
          text: '✕',
          attrs: { 'aria-label': tr('Tirar o alerta de {0}', [pair]) },
          on: { click: () => this.edit((x) => (x.alerts = x.alerts.filter((a) => a.pair !== pair))) },
        }),
      );
    }
    if (this.alertFor !== pair) {
      return h('button', {
        class: 'ui-mk__suggestion ui-mk__alert-add',
        type: 'button',
        text: tr('+ alerta de spread'),
        on: {
          click: () => {
            this.alertFor = pair;
            this.paint();
            this.rooms.querySelector<HTMLInputElement>('.ui-mk__alert-form input')?.focus();
          },
        },
      });
    }
    const limits = this.info!.limits;
    const input = h('input', {
      class: 'ui-mk__input ui-mk__pct',
      type: 'text',
      attrs: { inputmode: 'decimal', placeholder: '0,05', 'aria-label': tr('Nível do alerta em % para {0}', [pair]), autocomplete: 'off' },
    });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      this.alertFor = null;
      this.paint();
    });
    const submit = (e: Event) => {
      e.preventDefault();
      const n = parseAlertPct(input.value, limits.minAlertPct ?? -1, limits.maxAlertPct ?? 10);
      if (n === null) {
        this.note = { tone: 'error', lines: [tr('Nível do alerta: um número em % entre {0} e {1}.', [limits.minAlertPct ?? -1, limits.maxAlertPct ?? 10])] };
        this.paint();
        return;
      }
      this.alertFor = null;
      this.edit((x) => x.alerts.push({ pair, abovePct: n }));
    };
    return h(
      'form',
      { class: 'ui-mk__alert-form', on: { submit } },
      h('span', { class: 'ui-mk__hint', text: tr('Avisar quando o spread líquido chegar a') }),
      input,
      h('span', { class: 'ui-mk__hint', text: '%' }),
      h('button', { class: 'ui-btn ui-btn--sm', type: 'submit', text: tr('OK') }),
    );
  }

  private paintSuggestions(): void {
    const free = SUGGESTED_PAIRS.filter((p) => !this.draft!.pairs.includes(p)).slice(0, 4);
    setHidden(this.suggestions, free.length === 0);
    this.suggestions.replaceChildren(
      h('span', { class: 'ui-mk__hint', text: tr('Sugestões:') }),
      ...free.map((p) => h('button', { class: 'ui-mk__suggestion', type: 'button', text: p, on: { click: () => this.addPair(p) } })),
    );
  }
}

const copy = (c: CoreConfig): CoreConfig => ({ exchanges: [...c.exchanges], pairs: [...c.pairs], pollMs: c.pollMs, alerts: (c.alerts ?? []).map((a) => ({ ...a })) });
