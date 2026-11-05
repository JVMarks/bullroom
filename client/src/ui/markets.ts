// Bullroom: painel "Mercados" na gaveta da direita. Escolhe as corretoras (cada uma vira um personagem) e os pares
// (cada um vira uma sala) que o núcleo local do OpenSpread lê; "Conferir" pergunta ao núcleo quem lista cada par (com a
// taxa taker pública) e "Salvar e aplicar" grava o arquivo do núcleo, que troca as salas sem reiniciar.
// Só existe de verdade com ?source=core; na demonstração simulada o painel explica como ligar o núcleo.
import type { CheckResult, ConfigInfo, CoreConfig } from '../../../shared/core/types';
import { CHAIN_NAMES, exchangeName, shortAddress } from '../../../shared/core/to-office';
import type { WalletChain } from '../../../shared/core/types';
import { intlLocale, tr } from '../../../shared/i18n';
import { coreConfigApi, type CoreConfigApi, type CoreFailure } from '../net/core-config';
import type { UiContext } from './context';
import { h, iconButton, setHidden, setText } from './dom';
import { ICONS } from './icons';
import { draftProblems, engineFor, feeRows, formatFee, normalizePair, parseAlertPct, parseAmount, localToIso, normalizeWallet, roomSummary, sameConfig, searchExchanges, SUGGESTED_PAIRS, transferLine, walletKind } from './markets-model';

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
  /** Assinatura do status das corretoras já desenhado (render só repinta as bolinhas quando ela muda). */
  private sourcesSig = '';
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
  /** Seção "Custo de transferência": tamanho da operação e taxa de saque por corretora e moeda. */
  private transferBox: HTMLElement;
  /** Assinatura do custo de transferência ao vivo já desenhado nos cartões das salas. */
  private transferSig = '';
  private walletsBox: HTMLElement;
  private walletInput: HTMLInputElement;
  private walletEvm: HTMLSelectElement;
  private discoveryEl: HTMLElement;
  private discoveryKey: HTMLElement;
  private discoveryBox: HTMLElement;
  private tokenInput: HTMLInputElement;
  private tokenChain: HTMLSelectElement;
  private perToken: HTMLInputElement;
  private feedsBox: HTMLElement;
  private feedInput: HTMLInputElement;
  private eventsBox: HTMLElement;
  private eventTitle: HTMLInputElement;
  private eventAt: HTMLInputElement;
  private eventImpact: HTMLSelectElement;
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
    this.transferBox = h('div', { class: 'ui-mk__transfer' });

    this.walletsBox = h('div', { class: 'ui-mk__chips', role: 'list' });
    this.walletInput = h('input', { class: 'ui-mk__input', type: 'text', attrs: { 'aria-label': tr('Endereço público da carteira'), placeholder: tr('+ Endereço público (Solana, Ethereum, Base ou Bitcoin)'), autocomplete: 'off', spellcheck: 'false' }, on: { input: () => this.paintWalletChain() } });
    const chainOption = (chain: WalletChain) => h('option', { text: CHAIN_NAMES[chain], attrs: { value: chain } });
    this.walletEvm = h('select', { class: 'ui-mk__input ui-mk__select', hidden: true, attrs: { 'aria-label': tr('Rede do endereço 0x') } }, chainOption('ethereum'), chainOption('base'));
    const walletForm = h('form', { class: 'ui-mk__add', on: { submit: (e) => (e.preventDefault(), this.addWallet()) } }, this.walletInput, this.walletEvm, h('button', { class: 'ui-btn', type: 'submit', text: tr('Acompanhar') }));
    this.discoveryKey = h('p', { class: 'ui-mk__hint' });
    this.discoveryBox = h('div', { class: 'ui-mk__chips', role: 'list' });
    this.tokenInput = h('input', { class: 'ui-mk__input', type: 'text', attrs: { 'aria-label': tr('Endereço do token'), placeholder: tr('+ Endereço do token (mint ou contrato)'), autocomplete: 'off', spellcheck: 'false' } });
    this.tokenChain = h('select', { class: 'ui-mk__input ui-mk__select', attrs: { 'aria-label': tr('Rede do token') } }, chainOption('solana'), chainOption('ethereum'), chainOption('base'));
    this.perToken = h('input', { class: 'ui-mk__input ui-mk__num', type: 'number', attrs: { min: 1, max: 10, step: 1, 'aria-label': tr('Carteiras por token') }, on: { change: () => this.setPerToken() } });
    const tokenForm = h('form', { class: 'ui-mk__add', on: { submit: (e) => (e.preventDefault(), this.addToken()) } }, this.tokenChain, this.tokenInput, h('button', { class: 'ui-btn', type: 'submit', text: tr('Adicionar') }));
    this.discoveryEl = h(
      'div',
      {},
      h('h3', { class: 'ui-mk__label', text: tr('Descoberta (top traders, Birdeye)') }),
      this.discoveryKey,
      this.discoveryBox,
      tokenForm,
      h('label', { class: 'ui-mk__hint ui-mk__inline' }, tr('Carteiras por token'), this.perToken),
    );
    this.feedsBox = h('div', { class: 'ui-mk__chips', role: 'list' });
    this.feedInput = h('input', { class: 'ui-mk__input', type: 'url', attrs: { 'aria-label': tr('Endereço do feed RSS'), placeholder: tr('+ Endereço de um feed RSS ou Atom (https://…)'), autocomplete: 'off', spellcheck: 'false' } });
    const feedForm = h('form', { class: 'ui-mk__add', on: { submit: (e) => (e.preventDefault(), this.addFeed()) } }, this.feedInput, h('button', { class: 'ui-btn', type: 'submit', text: tr('Adicionar') }));
    this.eventsBox = h('div', { class: 'ui-mk__events' });
    this.eventTitle = h('input', { class: 'ui-mk__input', type: 'text', attrs: { 'aria-label': tr('Nome do evento'), placeholder: tr('+ Evento (ex.: desbloqueio de token)'), maxlength: 80 } });
    this.eventAt = h('input', { class: 'ui-mk__input ui-mk__select', type: 'datetime-local', attrs: { 'aria-label': tr('Data e hora do evento') } });
    this.eventImpact = h(
      'select',
      { class: 'ui-mk__input ui-mk__select', attrs: { 'aria-label': tr('Impacto do evento') } },
      h('option', { text: tr('alto'), attrs: { value: 'high' } }),
      h('option', { text: tr('médio'), attrs: { value: 'medium' } }),
      h('option', { text: tr('baixo'), attrs: { value: 'low' } }),
    );
    const eventForm = h('form', { class: 'ui-mk__add ui-mk__add--wrap', on: { submit: (e) => (e.preventDefault(), this.addEvent()) } }, this.eventTitle, this.eventAt, this.eventImpact, h('button', { class: 'ui-btn', type: 'submit', text: tr('Adicionar') }));
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
      h('h3', { class: 'ui-mk__label', text: tr('Custo de transferência') }),
      this.transferBox,
      h('h3', { class: 'ui-mk__label', text: tr('Carteiras (on-chain)') }),
      this.walletsBox,
      walletForm,
      h('p', { class: 'ui-mk__hint', text: tr('Só o endereço público, nunca nome. Cada rede vira uma sala; cada carteira, um personagem. A Base precisa da chave grátis do Blockscout no seu computador.') }),
      this.discoveryEl,
      h('h3', { class: 'ui-mk__label', text: tr('Agenda e radar') }),
      h('p', { class: 'ui-mk__hint', text: tr('FOMC e CPI já vêm com as datas oficiais. Aqui entram os seus eventos e os feeds do radar (só manchete e link).') }),
      this.eventsBox,
      eventForm,
      this.feedsBox,
      feedForm,
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
    // O resto é redesenhado em paint(), quando algo do próprio painel muda (princípio da calma); aqui só as bolinhas
    // de status das corretoras, quando alguma muda.
    const sig = (this.ctx.store.snapshot?.portfolio?.sources ?? []).map((s) => `${s.id}:${s.ok}`).join(',');
    const tsig = (this.ctx.store.coreState?.pairs ?? []).map((p) => `${p.pair}:${p.best?.transfer?.netPct ?? p.best?.transfer?.missing ?? ''}`).join(',');
    if (tsig !== this.transferSig) {
      this.transferSig = tsig;
      if (this.phase === 'ready' && this.draft) this.paintRooms();
    }
    if (sig !== this.sourcesSig) {
      this.sourcesSig = sig;
      if (this.phase === 'ready' && this.draft) this.paintExchanges();
    }
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
      this.paintTransfer();
      this.paintWallets();
      this.paintAgenda();
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

  /** O seletor Ethereum/Base só aparece para endereço 0x (o formato é o mesmo nas duas redes). */
  private paintWalletChain(): void {
    setHidden(this.walletEvm, walletKind(this.walletInput.value) !== 'evm');
  }

  private addWallet(): void {
    if (!this.draft || !this.info) return;
    const raw = this.walletInput.value.trim();
    const kind = walletKind(raw);
    if (!kind) {
      this.note = { tone: 'error', lines: [tr('Não reconheci esse endereço. Cole o endereço público de Solana, Ethereum, Base ou Bitcoin.')] };
      this.paint();
      return;
    }
    const chain: WalletChain = kind === 'evm' ? (this.walletEvm.value as WalletChain) : kind;
    const address = normalizeWallet(chain, raw);
    const list = this.draft.wallets ?? [];
    if (list.some((w) => w.chain === chain && w.address === address)) return;
    const max = this.info.limits.maxWallets ?? 30;
    if (list.length >= max) {
      this.note = { tone: 'error', lines: [tr('No máximo {0} carteiras.', [max])] };
      this.paint();
      return;
    }
    this.walletInput.value = '';
    this.paintWalletChain();
    this.edit((d) => (d.wallets = [...(d.wallets ?? []), { chain, address }]));
  }

  private addToken(): void {
    if (!this.draft || !this.info) return;
    const raw = this.tokenInput.value.trim();
    const chain = this.tokenChain.value as 'solana' | 'ethereum' | 'base';
    const kind = walletKind(raw);
    if (!(chain === 'solana' ? kind === 'solana' : kind === 'evm')) {
      this.note = { tone: 'error', lines: [tr('Endereço de token inválido para {0}.', [CHAIN_NAMES[chain]])] };
      this.paint();
      return;
    }
    const address = normalizeWallet(chain, raw);
    const d = this.draft.discovery ?? { tokens: [], perToken: 5 };
    if (d.tokens.some((t) => t.chain === chain && t.address === address)) return;
    const max = this.info.limits.maxDiscoveryTokens ?? 5;
    if (d.tokens.length >= max) {
      this.note = { tone: 'error', lines: [tr('No máximo {0} tokens na descoberta.', [max])] };
      this.paint();
      return;
    }
    this.tokenInput.value = '';
    this.edit((x) => (x.discovery = { tokens: [...d.tokens, { chain, address }], perToken: d.perToken }));
  }

  private setPerToken(): void {
    const n = Math.round(Number(this.perToken.value));
    const max = this.info?.limits.maxPerToken ?? 10;
    if (!this.draft?.discovery || !(n >= 1 && n <= max)) return void this.paint();
    this.edit((x) => (x.discovery = { ...x.discovery!, perToken: n }));
  }

  private paintWallets(): void {
    const d = this.draft!;
    const live = this.ctx.store.coreState?.wallets?.wallets ?? [];
    const chip = (label: string, title: string, remove: () => void, dot?: HTMLElement) =>
      h('span', { class: 'ui-mk__chip', role: 'listitem', title }, ...(dot ? [dot] : []), label, h('button', { class: 'ui-mk__x', type: 'button', text: '✕', attrs: { 'aria-label': tr('Tirar {0}', [label]) }, on: { click: remove } }));
    this.walletsBox.replaceChildren(
      ...(d.wallets ?? []).map((w) => {
        const st = live.find((x) => x.chain === w.chain && x.address === w.address);
        const cls = !st || (!st.lastAt && !st.error) ? '' : st.ok ? ' is-ok' : ' is-off';
        const why = !st || (!st.lastAt && !st.error) ? tr('Ainda sem leitura desta carteira') : st.ok ? tr('Respondendo') : tr('Fora agora: {0}', [st.error ?? '']);
        const dot = h('span', { class: 'ui-mk__dot' + cls, title: why, attrs: { 'aria-label': why } });
        const label = CHAIN_NAMES[w.chain] + ' · ' + shortAddress(w.address);
        return chip(label, w.address, () => this.edit((x) => (x.wallets = (x.wallets ?? []).filter((y) => !(y.chain === w.chain && y.address === w.address)))), dot);
      }),
    );
    setText(
      this.discoveryKey,
      this.info!.keys?.birdeye
        ? tr('Chave do Birdeye encontrada no seu computador. Para cada token, as carteiras de maior volume em 24 h entram marcadas "descoberta", separadas da sua lista; o resultado mostrado é o nosso, pela mesma regra.')
        : tr('Sem chave do Birdeye: crie uma em bds.birdeye.so e coloque em OPENSPREAD_BIRDEYE_KEY ou em ~/.openspread/keys.json. A chave fica só no seu computador.'),
    );
    const disc = d.discovery;
    this.discoveryBox.replaceChildren(
      ...(disc?.tokens ?? []).map((t) => {
        const label = CHAIN_NAMES[t.chain] + ' · ' + shortAddress(t.address);
        return chip(label, t.address, () => this.edit((x) => (x.discovery = { tokens: (x.discovery?.tokens ?? []).filter((y) => !(y.chain === t.chain && y.address === t.address)), perToken: x.discovery?.perToken ?? 5 })));
      }),
    );
    if (document.activeElement !== this.perToken) this.perToken.value = String(disc?.perToken ?? 5);
    this.perToken.disabled = !disc?.tokens.length;
  }

  private addFeed(): void {
    if (!this.draft || !this.info) return;
    const raw = this.feedInput.value.trim();
    let url: string;
    try {
      const u = new URL(raw);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocolo');
      url = u.href;
    } catch {
      this.note = { tone: 'error', lines: [tr('Use o endereço completo do feed, começando com https://.')] };
      this.paint();
      return;
    }
    const r = this.draft.radar ?? { feeds: [], keywords: [] };
    if (r.feeds.includes(url)) return;
    const max = this.info.limits.maxFeeds ?? 10;
    if (r.feeds.length >= max) {
      this.note = { tone: 'error', lines: [tr('No máximo {0} feeds.', [max])] };
      this.paint();
      return;
    }
    this.feedInput.value = '';
    this.edit((d) => (d.radar = { feeds: [...r.feeds, url], keywords: [...r.keywords] }));
  }

  private addEvent(): void {
    if (!this.draft || !this.info) return;
    const title = this.eventTitle.value.replace(/\s+/g, ' ').trim();
    const at = localToIso(this.eventAt.value, new Date(this.eventAt.value).getTimezoneOffset());
    if (title.length < 2 || !at) {
      this.note = { tone: 'error', lines: [tr('Dê um nome (2 a 80 letras) e uma data e hora ao evento.')] };
      this.paint();
      return;
    }
    const list = this.draft.events ?? [];
    const max = this.info.limits.maxEvents ?? 50;
    if (list.length >= max) {
      this.note = { tone: 'error', lines: [tr('No máximo {0} eventos.', [max])] };
      this.paint();
      return;
    }
    this.eventTitle.value = '';
    this.eventAt.value = '';
    const impact = this.eventImpact.value as 'high' | 'medium' | 'low';
    this.edit((d) => (d.events = [...list, { title, at, impact }].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))));
  }

  private paintAgenda(): void {
    const d = this.draft!;
    const fmt = new Intl.DateTimeFormat(intlLocale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const impactName: Record<string, string> = { high: tr('alto'), medium: tr('médio'), low: tr('baixo') };
    this.eventsBox.replaceChildren(
      ...(d.events ?? []).map((e, i) =>
        h(
          'div',
          { class: 'ui-mk__event' },
          h('span', { class: 'ui-ag__imp is-' + e.impact, title: impactName[e.impact] }),
          h('span', { class: 'ui-mk__event-text', text: e.title + ' · ' + fmt.format(Date.parse(e.at)) }),
          h('button', {
            class: 'ui-mk__x',
            type: 'button',
            text: '✕',
            attrs: { 'aria-label': tr('Tirar {0}', [e.title]) },
            on: { click: () => this.edit((x) => (x.events = (x.events ?? []).filter((_, j) => j !== i))) },
          }),
        ),
      ),
    );
    const feeds = d.radar?.feeds ?? [];
    const live = this.ctx.store.coreState?.agenda?.feeds ?? [];
    this.feedsBox.replaceChildren(
      ...feeds.map((url) => {
        const st = live.find((f) => f.url === url);
        const cls = !st || !st.lastAt ? '' : st.ok ? ' is-ok' : ' is-off';
        const why = !st || !st.lastAt ? tr('Ainda sem leitura deste feed') : st.ok ? tr('Respondendo') : tr('Fora agora: {0}', [st.error ?? '']);
        let label = url;
        try {
          label = new URL(url).host;
        } catch {
          // fica o endereço inteiro
        }
        return h(
          'span',
          { class: 'ui-mk__chip', role: 'listitem', title: url },
          h('span', { class: 'ui-mk__dot' + cls, title: why, attrs: { 'aria-label': why } }),
          label,
          h('button', {
            class: 'ui-mk__x',
            type: 'button',
            text: '✕',
            attrs: { 'aria-label': tr('Tirar {0}', [label]) },
            on: { click: () => this.edit((x) => (x.radar = { feeds: (x.radar?.feeds ?? []).filter((f) => f !== url), keywords: [...(x.radar?.keywords ?? [])] })) },
          }),
        );
      }),
    );
  }

  private paintExchanges(): void {
    const d = this.draft!;
    this.exchanges.replaceChildren(
      ...d.exchanges.map((id) =>
        h(
          'span',
          { class: 'ui-mk__chip', role: 'listitem' },
          this.statusDot(id),
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

  /** Bolinha da corretora: verde = respondendo, vermelha = fora (com o motivo na dica), cinza = ainda sem leitura. */
  private statusDot(id: string): HTMLElement {
    const s = this.ctx.store.snapshot?.portfolio?.sources?.find((x) => x.id === id);
    const cls = !s ? '' : s.ok ? ' is-ok' : ' is-off';
    const title = !s ? tr('Ainda sem leitura desta corretora') : s.ok ? tr('Respondendo') : tr('Fora agora: {0}', [s.error ?? s.name]);
    return h('span', { class: `ui-mk__dot${cls}`, title, attrs: { 'aria-label': title } });
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
        return h('div', { class: `ui-mk__room${s.checked && !s.opens ? ' is-short' : ''}` }, h('div', { class: 'ui-mk__room-head' }, h('b', { text: pair }), remove), ...lines, ...this.transferRow(pair, locale), this.alertRow(pair, locale));
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

  /** No cartão da sala: o saque do melhor spread ao vivo (incluído, não informado ou não estimado). */
  private transferRow(pair: string, locale: string): HTMLElement[] {
    const best = this.ctx.store.coreState?.pairs.find((p) => p.pair === pair)?.best;
    const line = transferLine(best, locale);
    return line ? [h('p', { class: line.tone === 'ok' ? 'ui-mk__transfer-ok' : 'ui-mk__warn', text: line.text })] : [];
  }

  /** Tamanho da operação e a taxa de saque de cada corretora para cada moeda das salas (vazio = não informada). */
  private paintTransfer(): void {
    const d = this.draft!;
    const limits = this.info!.limits;
    const minSize = limits.minSizeUsd ?? 10;
    const maxSize = limits.maxSizeUsd ?? 10_000_000;
    const commit = (input: HTMLInputElement, apply: (v: string) => void) => {
      input.addEventListener('change', () => apply(input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
      });
    };
    const size = h('input', { class: 'ui-mk__input ui-mk__pct', type: 'text', attrs: { inputmode: 'decimal', value: String(d.transfer.sizeUsd), 'aria-label': tr('Tamanho da operação em US$') } });
    commit(size, (v) => {
      const n = parseAmount(v, maxSize);
      if (n === null || n < minSize) {
        this.note = { tone: 'error', lines: [tr('Tamanho da operação: um valor em US$ entre {0} e {1}.', [minSize, maxSize])] };
        this.paint();
        return;
      }
      this.edit((x) => (x.transfer.sizeUsd = n));
    });
    const rows = feeRows(d.exchanges, d.pairs, this.check).map(({ exchange, asset }) => {
      const current = d.transfer.withdrawFees[exchange]?.[asset];
      const input = h('input', {
        class: 'ui-mk__input ui-mk__pct',
        type: 'text',
        attrs: { inputmode: 'decimal', placeholder: '—', value: current === undefined ? '' : String(current), 'aria-label': tr('Taxa de saque de {0} na {1}', [asset, exchangeName(exchange)]) },
      });
      commit(input, (v) => {
        if (!v.trim()) {
          this.edit((x) => {
            delete x.transfer.withdrawFees[exchange]?.[asset];
            if (x.transfer.withdrawFees[exchange] && !Object.keys(x.transfer.withdrawFees[exchange]).length) delete x.transfer.withdrawFees[exchange];
          });
          return;
        }
        const n = parseAmount(v);
        if (n === null) {
          this.note = { tone: 'error', lines: [tr('Taxa de saque: uma quantidade da moeda, como 1 ou 0,5.')] };
          this.paint();
          return;
        }
        this.edit((x) => ((x.transfer.withdrawFees[exchange] ??= {})[asset] = n));
      });
      return h('div', { class: 'ui-mk__fee' }, h('span', { text: `${exchangeName(exchange)} · ${asset}` }), h('span', { class: 'ui-mk__fee-in' }, input, h('span', { class: 'ui-mk__hint', text: asset })));
    });
    this.transferBox.replaceChildren(
      h('p', { class: 'ui-mk__hint', text: tr('A taxa de saque é fixa, então pesa mais em operações pequenas. Nenhuma corretora informa essa taxa sem chave: copie da página de taxas de saque de cada uma. Fora da conta: o tempo da transferência e a volta do dinheiro.') }),
      h('div', { class: 'ui-mk__fee' }, h('span', { text: tr('Tamanho da operação') }), h('span', { class: 'ui-mk__fee-in' }, size, h('span', { class: 'ui-mk__hint', text: 'US$' }))),
      ...(rows.length ? rows : [h('p', { class: 'ui-mk__hint', text: tr('Clique em Conferir para ver quais taxas de saque informar.') })]),
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

const copy = (c: CoreConfig): CoreConfig => ({
  exchanges: [...c.exchanges],
  pairs: [...c.pairs],
  pollMs: c.pollMs,
  alerts: (c.alerts ?? []).map((a) => ({ ...a })),
  transfer: { sizeUsd: c.transfer?.sizeUsd ?? 1000, withdrawFees: Object.fromEntries(Object.entries(c.transfer?.withdrawFees ?? {}).map(([k, v]) => [k, { ...v }])) },
  wallets: (c.wallets ?? []).map((w) => ({ ...w })),
  ...(c.events ? { events: c.events.map((e) => ({ ...e, ...(e.pairs ? { pairs: [...e.pairs] } : {}) })) } : {}),
  ...(c.radar ? { radar: { feeds: [...c.radar.feeds], keywords: [...c.radar.keywords] } } : {}),
  ...(c.discovery ? { discovery: { tokens: c.discovery.tokens.map((t) => ({ ...t })), perToken: c.discovery.perToken } } : {}),
  // Sem esta linha, salvar por aqui apagaria o motor de paper do arquivo.
  ...(c.engine ? { engine: engineFor(c.engine, c.pairs) } : {}),
});
