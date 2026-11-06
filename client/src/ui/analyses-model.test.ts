import { describe, expect, it } from 'vitest';
import type { AnalysesBrief, ScoreLine } from '../../../shared/core/types';
import { analysisRows, calibrationPoints, chartNote, headline, statRows } from './analyses-model';

const NOW = 1_000_000_000;
const line = (over: Partial<ScoreLine> = {}): ScoreLine => ({
  submitted: 0, open: 0, resolved: 0, voids: 0, hits: 0, hitPct: null, brier: null, baselineBrier: 0.25, skill: null,
  calibration: [], plans: { triggered: 0, avgNetPct: null, worstNetPct: null }, ...over,
});
const item = (over: Partial<AnalysesBrief['items'][number]> = {}): AnalysesBrief['items'][number] => ({
  id: 'a', pair: 'BTC/USDT', model: 'claude', horizon: '24h', direction: 'up', conviction: 70, submittedAt: NOW - 1000, expiresAt: NOW + 6 * 3_600_000, referencePrice: 76144.45, ...over,
});

describe('manchete', () => {
  it('com pouca amostra, o número grande é a amostra e não o acerto', () => {
    const h = headline(line({ resolved: 7, hits: 7, hitPct: null }), 30, 'pt-BR');
    expect(h).toMatchObject({ big: '7', label: 'de 30 para mostrar o acerto', progress: 7 / 30 });
    expect(JSON.stringify(h)).not.toContain('%');
  });
  it('com amostra, mostra o acerto com o tamanho dela e os sem dados', () => {
    const h = headline(line({ resolved: 41, hits: 24, voids: 2, hitPct: 58.5 }), 30, 'pt-BR');
    expect(h).toMatchObject({ big: '59%', label: 'de acerto em 41 · 2 sem dados', progress: null });
  });
  it('sem dados só aparece quando existe', () => {
    expect(headline(line({ resolved: 30, hitPct: 50 }), 30, 'pt-BR').label).toBe('de acerto em 30');
    expect(headline(line({ resolved: 3, voids: 1 }), 30, 'pt-BR').note).toContain('1 sem dados');
  });
});

describe('números', () => {
  it('Brier sempre contra o chute; sem resolvidas, nada', () => {
    expect(statRows(line(), 'pt-BR')).toEqual([]);
    expect(statRows(line({ resolved: 1, brier: 0.2571 }), 'pt-BR')[0]).toEqual({ label: 'Brier (chute = 0,250)', value: '0,257', tone: 'zero' });
  });
  it('planos com sinal e cor; o pior plano também aparece', () => {
    const rows = statRows(line({ resolved: 1, brier: 0.2, plans: { triggered: 2, avgNetPct: -0.06, worstNetPct: -2.4 } }), 'pt-BR');
    expect(rows[1]).toEqual({ label: 'Planos, média com taxas', value: '−0,06%', tone: 'loss' });
    expect(rows[2]).toEqual({ label: 'Pior plano', value: '−2,40%', tone: 'loss' });
    expect(statRows(line({ resolved: 1, brier: 0.2, plans: { triggered: 1, avgNetPct: 1.1, worstNetPct: 1.1 } }), 'pt-BR')[1]).toMatchObject({ value: '+1,10%', tone: 'gain' });
  });
});

describe('linhas', () => {
  it('aberta diz quando vence', () => {
    const [r] = analysisRows([item()], NOW, 'pt-BR');
    expect(r).toMatchObject({ title: 'BTC/USDT', tone: 'open', tag: 'aberta', meta: 'claude · 24h · alta · convicção 70' });
    expect(r.detail).toContain('vence em 6 h');
    expect(r.detail).toContain('76.144');
  });
  it('erro tem o mesmo tratamento do acerto, com movimento e plano', () => {
    const plans = [{ label: 'A' as const, status: 'stop' as const, netPct: -0.62 }];
    const [miss] = analysisRows([item({ direction: 'down', result: { status: 'resolved', hit: false, movePct: 0.42, resolvedAt: NOW, plans } })], NOW, 'pt-BR');
    expect(miss).toMatchObject({ tone: 'miss', tag: 'errou', detail: 'moveu +0,42%', plans: [{ text: 'Plano A −0,62%', tone: 'loss' }] });
    expect(miss.meta).toContain('baixa');
    const [hit] = analysisRows([item({ result: { status: 'resolved', hit: true, movePct: 0.02, resolvedAt: NOW, plans: [] } })], NOW, 'pt-BR');
    expect(hit).toMatchObject({ tone: 'hit', tag: 'acertou', plans: [] });
  });
  it('sem dados aparece e diz por quê', () => {
    const [r] = analysisRows([item({ result: { status: 'void', resolvedAt: NOW, plans: [{ label: 'A', status: 'void' }] } })], NOW, 'pt-BR');
    expect(r).toMatchObject({ tone: 'void', tag: 'sem dados' });
    expect(r.detail).toContain('15 min');
    expect(r.plans).toEqual([{ text: 'Plano A sem dados', tone: 'zero' }]);
  });
  it('plano que não entrou diz isso', () => {
    const [r] = analysisRows([item({ result: { status: 'resolved', hit: true, movePct: 1, resolvedAt: NOW, plans: [{ label: 'B', status: 'not_triggered' }] } })], NOW, 'pt-BR');
    expect(r.plans).toEqual([{ text: 'Plano B não entrou', tone: 'zero' }]);
  });
  it('já venceu mas ainda sem resposta do núcleo', () => {
    expect(analysisRows([item({ expiresAt: NOW - 1 })], NOW, 'pt-BR')[0].detail).toContain('vencendo');
  });
  it('tempo restante em dias e minutos', () => {
    expect(analysisRows([item({ expiresAt: NOW + 3 * 86_400_000 })], NOW, 'pt-BR')[0].detail).toContain('vence em 3 d');
    expect(analysisRows([item({ expiresAt: NOW + 5 * 60_000 })], NOW, 'pt-BR')[0].detail).toContain('vence em 5 min');
  });
});

describe('gráfico de calibração', () => {
  const calibration = [
    { from: 50, to: 59, n: 18, meanConviction: 54, hitPct: 56 },
    { from: 60, to: 69, n: 0, meanConviction: null, hitPct: null },
    { from: 90, to: 100, n: 3, meanConviction: 93, hitPct: 0 },
  ];
  it('só aparece com a amostra mínima: antes disso o desenho sugere uma certeza que não existe', () => {
    expect(calibrationPoints(line({ resolved: 29, calibration }), 30)).toEqual([]);
  });
  it('com amostra, um ponto por faixa com análises, e faixa vazia não vira zero', () => {
    expect(calibrationPoints(line({ resolved: 30, calibration }), 30)).toEqual([
      { conviction: 54, hit: 56, n: 18 },
      { conviction: 93, hit: 0, n: 3 },
    ]);
  });
  it('a nota lê o desenho sem depender da cor', () => {
    expect(chartNote([{ conviction: 54, hit: 56, n: 18 }])).toContain('18 análises: disse 54%, acertou 56%');
  });
});
