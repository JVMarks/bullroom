// Bullroom: a Ajuda dos modos de trading (?mock=trading e ?source=core). A do habblaud (help.ts) fala de agentes do
// Claude Code, terminal, contas e GitHub, que não existem aqui; esta fala de salas, robôs, corretoras e do OpenSpread.
import { tr } from '../../../shared/i18n';
import { h } from './dom';

/** Atalhos que valem nos modos de trading (os de terminal, timelapse, permissões e "Meu dia" ficam fora). */
const SHORTCUTS: Array<[string[], string]> = [
  [['/'], tr('Buscar sala, robô ou corretora')],
  [['F'], tr('Seguir o personagem selecionado')],
  [['O', '0'], tr('Visão geral do prédio')],
  [['Esc'], tr('Fechar a gaveta e tirar a seleção')],
  [['['], tr('Mostrar ou ocultar o painel lateral')],
  [[']'], tr('Mostrar ou ocultar o feed de atividade')],
  [['?'], tr('Abrir esta ajuda')],
  [['←', '↑', '→', '↓'], tr('Mover a câmera (também W A S D)')],
  [['+', '−'], tr('Aproximar e afastar')],
];

const item = (emoji: string, text: string) =>
  h('li', {}, h('span', { class: 'ui-icon-legend__icon', text: emoji, attrs: { 'aria-hidden': 'true' } }), h('span', { text }));

/** Título da Ajuda nos modos de trading. */
export function tradingHelpTitle(): string {
  return tr('Como ler a sala de trading');
}

/** Seções da Ajuda: `live` = núcleo do OpenSpread (corretoras ao vivo); senão, robôs simulados. */
export function tradingHelpSections(live: boolean): HTMLElement[] {
  const intro = live
    ? tr('Cada sala é um par de moedas e cada personagem, uma corretora lida ao vivo pelo OpenSpread no seu computador. Selo LIVE · READ-ONLY: só dados públicos, sem chave e sem ordem.')
    : tr('Cada sala é um par de moedas e cada personagem, um robô de trading simulado. Selo SIMULATED: nenhuma corretora, chave ou dinheiro real.');

  const room = live
    ? [
        item('🎈', tr('O balão sobre a cabeça é a distância da corretora para o preço médio da sala, em pontos-base (1 bp = 0,01%): + mais caro, − mais barato.')),
        item('🏷️', tr('A placa e o telão mostram o melhor spread líquido da sala: comprar numa corretora e vender em outra, já sem as taxas de compra e venda (e o saque, se você informou as taxas em Mercados).')),
        item('🟢', tr('No topo: o melhor spread de todas as salas e quantas corretoras estão respondendo; a dica diz quem está fora.')),
        item('📰', tr('O feed registra quando o melhor spread fica positivo ou volta a negativo e quando a melhor rota muda de corretoras.')),
      ]
    : [
        item('💺', tr('Sentado na mesa: o robô está posicionado. Circulando (café, conversa): está zerado, esperando a próxima entrada.')),
        item('💰', tr('O valor sobre a cabeça é o PL do dia do robô: verde ganho, vermelho perda.')),
        item('⛔', tr('Ao bater o limite de perda do dia, o robô é ejetado e sai da sala.')),
        item('🏷️', tr('A placa soma o PL dos robôs da sala (os ejetados também) e o telão na parede desenha o histórico.')),
        item('📰', tr('O feed mostra cada COMPRA, VENDA e EJETADO.')),
      ];

  const panels = [
    ...(live ? [] : [h('li', { text: tr('Clique num robô para ver o cartão: PL, acerto, trades, drawdown, limite de perda usado e a comparação com só segurar BTC, em 5 min, 1 h e 24 h.') })]),
    h('li', {
      text: tr('Mercados (o selo do topo ou Configurações › Mercados): escolher corretoras e pares, conferir quem lista cada par, criar alertas de spread e informar o custo de transferência. Só funciona ao vivo.'),
    }),
    h('li', { text: tr('Alerta de spread: avisa uma vez quando o líquido de um par chega ao nível escolhido e só volta a valer depois que ele recua.') }),
  ];

  const shortcuts = h(
    'dl',
    { class: 'ui-shortcuts' },
    ...SHORTCUTS.flatMap(([k, text]) => [h('dt', {}, h('span', { class: 'ui-keys' }, ...k.map((x) => h('kbd', { class: 'ui-kbd', text: x })))), h('dd', { text })]),
  );

  return [
    h('section', { class: 'ui-help__intro' }, h('p', { text: intro })),
    h('section', { class: 'ui-help__shell' }, h('h3', { text: tr('Na sala') }), h('ul', { class: 'ui-shell-legend' }, ...room)),
    h('section', {}, h('h3', { text: tr('Painéis') }), h('ul', { class: 'ui-help__list' }, ...panels)),
    h(
      'section',
      {},
      h('h3', { text: tr('Ao vivo com o OpenSpread') }),
      h('p', {
        class: 'ui-help__lead',
        text: tr('Rode o núcleo do OpenSpread (npm start na pasta core/) e abra o Bullroom com ?source=core. Tudo roda no seu computador: dados públicos das corretoras, sem chave, sem ordem e sem servidor nosso.'),
      }),
    ),
    h(
      'section',
      {},
      h('h3', { text: tr('Controles') }),
      h(
        'ul',
        { class: 'ui-help__list' },
        h('li', { text: tr('Arraste o prédio para mover a câmera e use a rolagem do mouse (ou pinça) para dar zoom.') }),
        h('li', { text: tr('Clique num personagem ou numa sala para ver os detalhes; duplo clique aproxima a câmera.') }),
      ),
      shortcuts,
    ),
    h('section', {}, h('p', { class: 'ui-help__lead', text: tr('Projeto educativo: nada aqui é recomendação de investimento.') })),
  ];
}
