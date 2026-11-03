import { describe, expect, it } from 'vitest';
import { CoreOffice, walletAgentId, walletBadge, walletRoomId } from '../../../shared/core/to-office';
import type { CoreState, WalletState } from '../../../shared/core/types';
import { formatValue, valueTone } from '../../../shared/trading/rules';
import { normalizeWallet, sameConfig, walletKind } from './markets-model';
import { formatAmount, opRow, rankGroups, walletCardModel } from './wallet-model';

const NOW = 1_793_707_000_000;
const SOL_A = 'DPDMHjJHmod2qURf69mV1pe4nSaSFhXv1TSUxtQrNy7F';
const SOL_B = 'JBWKHLUAFDzYR3A3qgun3EtDe6MZEzYyMCQWZf9G1tmx';
const BTC = '34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo';

const wallet = (over: Partial<WalletState>): WalletState => ({
  chain: 'solana',
  address: SOL_A,
  source: 'curated',
  ok: true,
  lastAt: NOW - 30_000,
  since: NOW - 3 * 86_400_000,
  results: [],
  trades: 0,
  wins: 0,
  losses: 0,
  open: false,
  ops: [],
  url: `https://solscan.io/account/${SOL_A}`,
  ...over,
});

const state = (wallets: WalletState[], ranking: NonNullable<CoreState['wallets']>['ranking'] = []): CoreState => ({
  rev: 1,
  at: NOW,
  exchanges: [],
  pairs: [],
  wallets: { at: NOW, periodMs: 7 * 86_400_000, wallets, ranking, sources: [{ chain: 'solana', source: 'api.mainnet-beta.solana.com', ok: true }] },
});

describe('unidades de moeda de rede', () => {
  it('formata e dá o tom pela casa que aparece', () => {
    expect(formatValue(1.2, 'sol', 'pt-BR')).toBe('+1,20 SOL');
    expect(formatValue(-0.0123, 'eth', 'en')).toBe('-0.012 ETH');
    expect(formatValue(0.5, 'btc', 'en')).toBe('+0.5000 BTC');
    expect(valueTone(0.004, 'sol')).toBe('zero');
    expect(valueTone(-0.006, 'sol')).toBe('loss');
    expect(formatValue(4.01, 'usd', 'en')).toBe('+$4.01');
  });
});

describe('carteiras → escritório', () => {
  it('uma sala por rede depois das salas de par; posição aberta senta, zerada circula; balão só com venda fechada', () => {
    const s = state([
      wallet({ address: SOL_A, open: true, trades: 2, wins: 1, losses: 1, results: [{ quote: 'SOL', amount: 1.25 }, { quote: 'USD', amount: -3 }] }),
      wallet({ address: SOL_B }),
      wallet({ chain: 'bitcoin', address: BTC, balance: { asset: 'BTC', amount: 2 }, url: `https://mempool.space/address/${BTC}` }),
    ]);
    const snap = new CoreOffice(NOW).apply(s);
    expect(snap.rooms.map((r) => [r.id, r.name, r.trading])).toEqual([
      [walletRoomId('solana'), 'Carteiras · Solana', undefined],
      [walletRoomId('bitcoin'), 'Carteiras · Bitcoin', undefined],
    ]);
    const a = snap.agents.find((x) => x.id === walletAgentId({ chain: 'solana', address: SOL_A }))!;
    expect(a).toMatchObject({ name: 'DPDM…Ny7F', status: 'working', roomId: walletRoomId('solana'), badge: { value: 1.25, unit: 'sol' } });
    expect(a.wallet?.address).toBe(SOL_A);
    const b = snap.agents.find((x) => x.id === walletAgentId({ chain: 'solana', address: SOL_B }))!;
    expect(b.status).toBe('idle');
    expect(b.badge).toBeUndefined();
    expect(snap.agents.find((x) => x.roomId === walletRoomId('bitcoin'))!.badge).toBeUndefined();
    // nada de feed nem aviso por carteira (princípio da calma)
    expect(new CoreOffice(NOW).feed(s)).toEqual([]);
  });

  it('balão: moeda da rede primeiro, senão dólar', () => {
    expect(walletBadge(wallet({ trades: 1, results: [{ quote: 'USD', amount: 12 }] }))).toEqual({ value: 12, unit: 'usd' });
    expect(walletBadge(wallet({ chain: 'base', trades: 1, results: [{ quote: 'ETH', amount: -0.1 }, { quote: 'USD', amount: 5 }] }))).toEqual({ value: -0.1, unit: 'eth' });
  });
});

describe('cartão da carteira', () => {
  it('fonte e hora, resultado, acertos, posição, operações com link', () => {
    const w = wallet({
      open: true,
      trades: 2,
      wins: 1,
      losses: 1,
      results: [{ quote: 'SOL', amount: 0.5 }],
      ops: [
        { tx: 's', at: NOW - 3_600_000, kind: 'sell', asset: '8xH5…YgFd', assetId: 'm', amount: 1_125_972.5, quote: 'SOL', quoteAmount: 1.4, pnl: 0.5, url: 'https://solscan.io/tx/s' },
        { tx: 'u', at: NOW - 7_200_000, kind: 'unclassified', asset: null, assetId: null, amount: null, quote: null, quoteAmount: null, url: 'https://solscan.io/tx/u' },
      ],
    });
    const m = walletCardModel(w, state([w]), 'pt-BR', () => 'há 30 s', () => '31 out.');
    expect(m.where).toBe('Solana · DPDM…Ny7F · sua lista');
    expect(m.results).toEqual([{ text: '+0,50 SOL', tone: 'gain' }]);
    expect(m.hits).toBe('1 acertos · 1 erros');
    expect(m.position).toBe('aberta');
    expect(m.source).toBe('Fonte: api.mainnet-beta.solana.com · lido há 30 s · resultado de 7 dias');
    expect(m.since).toBe('Operações lidas desde 31 out.');
    expect(m.ops[0]).toMatchObject({ label: 'Venda', pnl: { text: '+0,50 SOL', tone: 'gain' }, url: 'https://solscan.io/tx/s' });
    expect(m.ops[0].text).toContain('8xH5…YgFd');
    expect(m.ops[1]).toMatchObject({ label: 'Não classificada', pnl: null });
    expect(m.error).toBeNull();
  });

  it('descoberta mostra o número do Birdeye ao lado; erro aparece', () => {
    const w = wallet({ ok: false, error: 'limite de pedidos', source: 'birdeye', external: { source: 'birdeye', token: 'So11111111111111111111111111111111111111112', volumeUsd: 1234.4, trades: 9 } });
    const m = walletCardModel(w, state([w]), 'en', () => '', () => '');
    expect(m.where).toContain('descoberta · Birdeye');
    expect(m.external).toBe('Birdeye (24 h, token So11…1112) · volume $1,234 · 9 negócios');
    expect(m.error).toBe('limite de pedidos');
  });

  it('quantidades e operação de compra em dólar', () => {
    expect(formatAmount(1_125_972.5, 'en')).toBe('1.1M');
    expect(formatAmount(0.123456, 'en')).toBe('0.1235');
    expect(opRow({ tx: 'b', at: 0, kind: 'buy', asset: 'PEPE', assetId: 'x', amount: 1000, quote: 'USD', quoteAmount: 900, url: 'u' }, 'en').text).toBe('1,000 PEPE por $900');
  });
});

describe('ranking', () => {
  it('melhores e piores com resultado formatado; ignora endereço que sumiu', () => {
    const ws = [wallet({ address: SOL_A, trades: 3, results: [{ quote: 'SOL', amount: 2 }] }), wallet({ address: SOL_B, trades: 1, results: [{ quote: 'SOL', amount: -1 }], source: 'birdeye' })];
    const g = rankGroups(state(ws, [{ chain: 'solana', quote: 'SOL', best: [SOL_A], worst: [SOL_B, 'sumiu'] }]), 'pt-BR');
    expect(g).toHaveLength(1);
    expect(g[0].title).toBe('Solana · em SOL');
    expect(g[0].best).toEqual([{ address: SOL_A, short: 'DPDM…Ny7F', result: { text: '+2,00 SOL', tone: 'gain' }, trades: 3, source: 'curated' }]);
    expect(g[0].worst.map((r) => [r.short, r.result.text, r.source])).toEqual([['JBWK…1tmx', '-1,00 SOL', 'birdeye']]);
    expect(rankGroups(null, 'pt-BR')).toEqual([]);
  });
});

describe('Mercados › Carteiras', () => {
  it('rede pelo formato; EVM pergunta; normaliza como o núcleo', () => {
    expect(walletKind(SOL_A)).toBe('solana');
    expect(walletKind('0x28C6c06298d514Db089934071355E5743bf21d60')).toBe('evm');
    expect(walletKind(BTC)).toBe('bitcoin');
    expect(walletKind('bc1qwk9qmeqm3fwc5q29yu945z0tuvn2yqwvf3wt9cayt5s886lcuhssejj98j')).toBe('bitcoin');
    expect(walletKind('fulano')).toBeNull();
    expect(normalizeWallet('base', '0xABC')).toBe('0xabc');
    expect(normalizeWallet('solana', ` ${SOL_A} `)).toBe(SOL_A);
  });

  it('mudança nas carteiras ou na descoberta conta como mudança (o botão Salvar acende)', () => {
    const base = { exchanges: ['binance', 'okx'], pairs: ['USDC/USDT'], pollMs: 10_000, alerts: [], transfer: { sizeUsd: 1000, withdrawFees: {} } };
    expect(sameConfig({ ...base, wallets: [] }, base)).toBe(true);
    expect(sameConfig({ ...base, wallets: [{ chain: 'solana', address: SOL_A }] }, base)).toBe(false);
    expect(sameConfig({ ...base, discovery: { tokens: [], perToken: 3 } }, { ...base, discovery: { tokens: [], perToken: 5 } })).toBe(false);
  });
});
