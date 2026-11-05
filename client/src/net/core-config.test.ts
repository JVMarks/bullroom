import { describe, expect, it } from 'vitest';
import { CORE_BASE, coreConfigApi, coreEngineApi } from './core-config';

const CONFIG = { exchanges: ['binance', 'okx'], pairs: ['BTC/USDT'], pollMs: 10000, alerts: [], transfer: { sizeUsd: 1000, withdrawFees: {} } };

/** fetch falso: registra o pedido e responde com o status e o corpo dados. */
function fakeFetch(status: number, body: unknown, calls: Array<{ url: string; init?: RequestInit }> = []) {
  return async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(body === undefined ? 'x' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
}

describe('robôs do motor de paper (cliente)', () => {
  const BODY = { pair: 'BTC/USDT', exchanges: ['a', 'b'] as [string, string] };

  it('liga com POST e JSON e para pelo id', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const api = coreEngineApi(fakeFetch(201, { id: 'bot-1' }, calls));
    expect(await api.start(BODY)).toEqual({ ok: true, value: { id: 'bot-1' } });
    await api.stop('bot-1');
    expect(calls[0].url).toBe(`${CORE_BASE}/v1/engine/bots`);
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(BODY);
    expect(calls[1].url).toBe(`${CORE_BASE}/v1/engine/bots/bot-1/stop`);
    expect(calls[1].init?.method).toBe('POST');
  });

  it('recusa da trava chega com o motivo e o que fazer', async () => {
    const api = coreEngineApi(fakeFetch(422, { error: 'blocked', reasons: [{ code: 'no_price', message: 'Sem cotação.', fix: 'Espere.' }] }));
    expect(await api.start(BODY)).toEqual({ ok: false, kind: 'invalid', details: ['Sem cotação. Espere.'] });
  });

  it('núcleo fora do ar', async () => {
    const api = coreEngineApi(async () => {
      throw new Error('recusado');
    });
    expect(await api.start(BODY)).toEqual({ ok: false, kind: 'offline', details: [] });
  });
});

describe('configuração do núcleo (cliente)', () => {
  it('GET /v1/config sem cache e PUT /v1/config com JSON', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const api = coreConfigApi(fakeFetch(200, { config: CONFIG }, calls));
    expect(await api.info()).toEqual({ ok: true, value: { config: CONFIG } });
    await api.save(CONFIG);
    expect(calls[0].url).toBe(`${CORE_BASE}/v1/config`);
    expect(calls[0].init?.cache).toBe('no-store');
    expect(calls[1].init?.method).toBe('PUT');
    expect((calls[1].init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(calls[1].init?.body))).toEqual(CONFIG);
  });

  it('POST /v1/check', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await coreConfigApi(fakeFetch(200, { at: 1, exchanges: [] }, calls)).check(CONFIG);
    expect(calls[0].url).toBe(`${CORE_BASE}/v1/check`);
    expect(calls[0].init?.method).toBe('POST');
  });

  it('núcleo desligado = offline; 422 traz os motivos; 429 = ocupado; outro erro traz o status', async () => {
    const down = coreConfigApi(async () => Promise.reject(new TypeError('Failed to fetch')));
    expect(await down.info()).toEqual({ ok: false, kind: 'offline', details: [] });
    expect(await coreConfigApi(fakeFetch(422, { error: 'invalid_config', details: ['par inválido: X'] })).save(CONFIG)).toEqual({ ok: false, kind: 'invalid', details: ['par inválido: X'] });
    expect((await coreConfigApi(fakeFetch(429, { error: 'check_in_progress' })).check(CONFIG)).ok).toBe(false);
    expect(await coreConfigApi(fakeFetch(429, { error: 'check_in_progress' })).check(CONFIG)).toMatchObject({ kind: 'busy' });
    expect(await coreConfigApi(fakeFetch(500, undefined)).info()).toEqual({ ok: false, kind: 'error', details: ['HTTP 500'] });
  });
});
