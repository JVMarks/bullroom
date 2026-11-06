// Bullroom: painel "Robôs" na gaveta da direita. Liga e para robôs simulados do motor de paper do OpenSpread e mostra
// resultado, leituras acima do mínimo e o motivo de cada parada. Tudo simulado sobre o livro real; nenhuma ordem de
// verdade. Só existe com ?source=core. A lista só redesenha quando um número muda; o formulário nunca é redesenhado
// enquanto o usuário digita.
import type { ConfigInfo, EngineConfig } from '../../../shared/core/types';
import { exchangeName } from '../../../shared/core/to-office';
import { intlLocale, tr } from '../../../shared/i18n';
import { coreConfigApi, coreEngineApi, type CoreConfigApi, type CoreEngineApi, type CoreReply } from '../net/core-config';
import type { UiContext } from './context';
import { h, setHidden, setText } from './dom';
import { botRows, capitalLine, enabledEngine, engineWithPair, limitsLine, pairHint, parseLimit, routeOptions, withLimits } from './robots-model';

const failure = (r: Extract<CoreReply<unknown>, { ok: false }>): string =>
  r.kind === 'offline' ? tr('O núcleo não respondeu. Ele está rodando (npm start na pasta core/)?') : r.details.join(' ');

export class RobotsView {
  readonly el: HTMLElement;
  private status: HTMLElement;
  private off: HTMLElement;
  private main: HTMLElement;
  private capital: HTMLElement;
  private limits: HTMLElement;
  private list: HTMLElement;
  private message: HTMLElement;
  private hint: HTMLElement;
  private pair: HTMLSelectElement;
  private a: HTMLSelectElement;
  private b: HTMLSelectElement;
  private amount: HTMLInputElement;
  private fields: Record<'totalUsd' | 'maxTradeUsd' | 'minNetPct' | 'dailyLossLimitUsd', HTMLInputElement>;
  private info: ConfigInfo | null = null;
  private listSig = '';
  private optionSig = '';
  private busy = false;

  constructor(
    private ctx: UiContext,
    private configApi: CoreConfigApi = coreConfigApi(),
    private engineApi: CoreEngineApi = coreEngineApi(),
  ) {
    const number = (label: string) => h('input', { class: 'ui-mk__input ui-rb__num', attrs: { inputmode: 'decimal', 'aria-label': label } }) as HTMLInputElement;
    this.fields = { totalUsd: number(tr('Capital simulado')), maxTradeUsd: number(tr('Tamanho por operação')), minNetPct: number(tr('Líquido mínimo')), dailyLossLimitUsd: number(tr('Perda diária por robô')) };
    const row = (label: string, input: HTMLElement, unit: string) => h('label', { class: 'ui-rb__field' }, h('span', { text: label }), h('span', { class: 'ui-rb__field-in' }, input, h('span', { class: 'ui-mk__hint', text: unit })));

    this.status = h('p', { class: 'ui-mk__status' });
    this.message = h('p', { class: 'ui-rb__message', hidden: true, attrs: { role: 'status' } });
    this.off = h(
      'div',
      { class: 'ui-rb__off', hidden: true },
      h('p', { class: 'ui-mk__hint', text: tr('O motor simula cada operação sobre o livro de ofertas real, com saldo de mentira: nenhuma chave, nenhuma ordem. Vem desligado e sem nenhum par permitido.') }),
      h('button', { class: 'ui-btn ui-btn--accent', type: 'button', text: tr('Ligar o motor de paper'), on: { click: () => void this.setEnabled(true) } }),
    );

    this.capital = h('p', { class: 'ui-rb__line' });
    this.limits = h('p', { class: 'ui-rb__line ui-mk__hint' });
    this.list = h('div', { class: 'ui-rb__list' });

    this.pair = h('select', { class: 'ui-mk__input ui-mk__select', attrs: { 'aria-label': tr('Par') }, on: { change: () => this.pickPair() } }) as HTMLSelectElement;
    this.a = h('select', { class: 'ui-mk__input ui-mk__select', attrs: { 'aria-label': tr('Primeira corretora') } }) as HTMLSelectElement;
    this.b = h('select', { class: 'ui-mk__input ui-mk__select', attrs: { 'aria-label': tr('Segunda corretora') } }) as HTMLSelectElement;
    this.amount = h('input', { class: 'ui-mk__input ui-rb__num', attrs: { inputmode: 'decimal', placeholder: tr('automático'), 'aria-label': tr('Capital do robô') } }) as HTMLInputElement;
    this.hint = h('p', { class: 'ui-rb__hint' });

    this.main = h(
      'div',
      { class: 'ui-rb__main', hidden: true },
      this.capital,
      this.limits,
      this.list,
      h('h3', { class: 'ui-mk__label', text: tr('Novo robô') }),
      this.pair,
      h('div', { class: 'ui-rb__pair' }, this.a, this.b),
      this.hint,
      row(tr('Capital do robô'), this.amount, 'US$'),
      h('button', { class: 'ui-btn ui-btn--accent', type: 'button', text: tr('Ligar robô'), on: { click: () => void this.start() } }),
      h('details', { class: 'ui-rb__more' },
        h('summary', { text: tr('Limites') }),
        row(tr('Capital simulado'), this.fields.totalUsd, 'US$'),
        row(tr('Tamanho por operação'), this.fields.maxTradeUsd, 'US$'),
        row(tr('Líquido mínimo'), this.fields.minNetPct, '%'),
        row(tr('Perda diária por robô'), this.fields.dailyLossLimitUsd, 'US$'),
        h('div', { class: 'ui-rb__actions' },
          h('button', { class: 'ui-btn', type: 'button', text: tr('Salvar limites'), on: { click: () => void this.saveLimits() } }),
          h('button', { class: 'ui-btn', type: 'button', text: tr('Desligar o motor'), on: { click: () => void this.setEnabled(false) } }),
        ),
      ),
      h('p', { class: 'ui-rb__warn', text: tr('Sem backtest de arbitragem. A falha de uma perna só não é simulada. Paper trading não garante resultado real.') }),
    );

    this.el = h(
      'section',
      { class: 'ui-mk ui-rb', attrs: { 'aria-label': tr('Robôs') } },
      h('p', { class: 'ui-rb__title' }, h('span', { class: 'ui-portfolio__sim', text: 'SIMULATED' })),
      this.status,
      this.message,
      this.off,
      this.main,
    );
  }

  open(): void {
    this.listSig = '';
    this.optionSig = '';
    this.say('');
    void this.load();
  }

  private async load(): Promise<void> {
    if (!this.ctx.store.core) {
      this.paintOffline(tr('Os robôs do motor de paper só existem com o núcleo ligado (?source=core). Aqui, na demonstração, os robôs são de mentira.'));
      return;
    }
    const r = await this.configApi.info();
    if (!r.ok) {
      this.paintOffline(failure(r));
      return;
    }
    this.info = r.value;
    this.fillLimits();
    this.render();
  }

  private paintOffline(text: string): void {
    setText(this.status, text);
    setHidden(this.status, false);
    setHidden(this.off, true);
    setHidden(this.main, true);
  }

  private get engine(): EngineConfig | undefined {
    return this.info?.config.engine;
  }

  render(): void {
    if (!this.info) return;
    const cfg = this.engine;
    const on = !!cfg?.enabled;
    setHidden(this.status, true);
    setHidden(this.off, on);
    setHidden(this.main, !on);
    if (!on || !cfg) return;
    const locale = intlLocale();
    const state = this.ctx.store.coreState;
    const engine = state?.engine;
    this.paintOptions();
    const p = state?.pairs.find((x) => x.pair === this.pair.value);
    const hint = pairHint(p, cfg.policy.minNetPct, locale);
    setText(this.hint, hint.text);
    this.hint.classList.toggle('is-low', hint.low);
    if (!engine) {
      this.list.replaceChildren(h('p', { class: 'ui-mk__status', text: tr('Esperando a primeira leitura do núcleo…') }));
      return;
    }
    setText(this.capital, capitalLine(engine, cfg, locale));
    setText(this.limits, limitsLine(cfg, locale));
    const rows = botRows(engine, locale);
    const sig = JSON.stringify([rows, engine.engine]);
    if (sig === this.listSig) return;
    this.listSig = sig;
    const kv = (k: string, v: string, cls = '') => h('div', { class: 'ui-rb__kv' }, h('span', { text: k }), h('span', { class: cls, text: v }));
    this.list.replaceChildren(
      ...(engine.engine.ok ? [] : [h('p', { class: 'ui-rb__note', text: tr('Erro no motor: {0}', [engine.engine.error ?? '']) })]),
      ...(rows.length ? [] : [h('p', { class: 'ui-mk__status', text: tr('Nenhum robô ainda. Escolha um par abaixo.') })]),
      ...rows.map((r) =>
        h(
          'article',
          { class: 'ui-rb__bot' },
          h('div', { class: 'ui-rb__head' }, h('b', {}, r.title, ...(r.mcp ? [h('span', { class: 'ui-rb__mcp', text: 'MCP', attrs: { title: tr('Ligado pelo seu Claude ou Codex, pela mesma trava de risco.') } })] : [])), h('span', { class: `ui-rb__pill is-${r.tone}`, text: r.status })),
          kv(tr('Resultado'), r.pnl, `is-${r.pnlTone}`),
          kv('', r.result),
          kv(tr('Leituras acima do mínimo'), r.samples),
          ...(r.last ? [kv(tr('Última'), r.last)] : []),
          ...(r.note ? [h('p', { class: 'ui-rb__note', text: r.note })] : []),
          ...(r.canStop ? [h('button', { class: 'ui-btn ui-btn--sm', type: 'button', text: tr('Parar'), on: { click: () => void this.stop(r.id) } })] : []),
        ),
      ),
    );
  }

  /** Pares do config e corretoras com cotação. Só troca as opções quando a lista muda, para não fechar o menu aberto. */
  private paintOptions(): void {
    const pairs = this.info?.config.pairs ?? [];
    const state = this.ctx.store.coreState;
    const quoted = pairs.map((p) => `${p}:${routeOptions(state?.pairs.find((x) => x.pair === p)).exchanges.join()}`).join('|');
    if (quoted === this.optionSig) return;
    this.optionSig = quoted;
    const want = this.pair.value;
    this.pair.replaceChildren(...pairs.map((p) => h('option', { text: p, attrs: { value: p } })));
    this.pair.value = pairs.includes(want) ? want : (pairs[0] ?? '');
    this.pickPair();
  }

  private pickPair(): void {
    const p = this.ctx.store.coreState?.pairs.find((x) => x.pair === this.pair.value);
    const { exchanges, suggested } = routeOptions(p);
    const fill = (el: HTMLSelectElement, value: string | undefined) => {
      el.replaceChildren(...exchanges.map((id) => h('option', { text: exchangeName(id), attrs: { value: id } })));
      if (value) el.value = value;
    };
    fill(this.a, suggested?.[0] ?? exchanges[0]);
    fill(this.b, suggested?.[1] ?? exchanges[1]);
    if (this.engine) {
      const hint = pairHint(p, this.engine.policy.minNetPct, intlLocale());
      setText(this.hint, hint.text);
      this.hint.classList.toggle('is-low', hint.low);
    }
  }

  private fillLimits(): void {
    const c = this.engine ?? this.info?.engineDefaults;
    if (!c) return;
    this.fields.totalUsd.value = String(c.totalUsd);
    this.fields.maxTradeUsd.value = String(c.policy.maxTradeUsd);
    this.fields.minNetPct.value = String(c.policy.minNetPct);
    this.fields.dailyLossLimitUsd.value = String(c.policy.dailyLossLimitUsd);
  }

  private say(text: string, error = false): void {
    setText(this.message, text);
    setHidden(this.message, !text);
    this.message.classList.toggle('is-error', error);
  }

  /** Grava o motor no config atual do núcleo, sem tocar no resto. */
  private async saveEngine(engine: EngineConfig): Promise<boolean> {
    const fresh = await this.configApi.info();
    if (!fresh.ok) {
      this.say(failure(fresh), true);
      return false;
    }
    const r = await this.configApi.save({ ...fresh.value.config, engine });
    if (!r.ok) {
      this.say(failure(r), true);
      return false;
    }
    this.info = r.value;
    this.fillLimits();
    return true;
  }

  private async guarded(fn: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await fn();
    } finally {
      this.busy = false;
      this.ctx.invalidate();
    }
  }

  private setEnabled(on: boolean): Promise<void> {
    return this.guarded(async () => {
      const base = this.engine ?? this.info?.engineDefaults;
      if (!base) return;
      this.say('');
      await this.saveEngine(enabledEngine(base, on));
    });
  }

  private saveLimits(): Promise<void> {
    return this.guarded(async () => {
      const c = this.engine;
      if (!c) return;
      const f = this.fields;
      const totalUsd = parseLimit(f.totalUsd.value);
      const maxTradeUsd = parseLimit(f.maxTradeUsd.value);
      const minNetPct = parseLimit(f.minNetPct.value);
      const dailyLossLimitUsd = parseLimit(f.dailyLossLimitUsd.value);
      if (totalUsd === null || maxTradeUsd === null || minNetPct === null || dailyLossLimitUsd === null) {
        this.say(tr('Preencha os limites com números.'), true);
        return;
      }
      if (await this.saveEngine(withLimits(c, { totalUsd, maxTradeUsd, minNetPct, dailyLossLimitUsd }))) this.say(tr('Limites salvos.'));
    });
  }

  private start(): Promise<void> {
    return this.guarded(async () => {
      const c = this.engine;
      const pair = this.pair.value;
      if (!c || !pair) return;
      const typed = this.amount.value.trim();
      const capitalUsd = typed ? parseLimit(typed) : undefined;
      if (capitalUsd === null) {
        this.say(tr('Capital do robô precisa ser um número.'), true);
        return;
      }
      this.say('');
      const next = engineWithPair(c, pair);
      if (next !== c && !(await this.saveEngine(next))) return;
      const r = await this.engineApi.start({ pair, exchanges: [this.a.value, this.b.value], ...(capitalUsd !== undefined ? { capitalUsd } : {}) });
      if (!r.ok) {
        this.say(failure(r), true);
        return;
      }
      this.amount.value = '';
      this.say(tr('Robô ligado em {0}.', [pair]));
    });
  }

  private stop(id: string): Promise<void> {
    return this.guarded(async () => {
      const r = await this.engineApi.stop(id);
      if (!r.ok) this.say(failure(r), true);
    });
  }
}
