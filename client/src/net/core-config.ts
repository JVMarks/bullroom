// Corretoras e pares do núcleo local do OpenSpread: GET /v1/config, POST /v1/check (confere sem gravar) e
// PUT /v1/config (grava e aplica). O núcleo só aceita estes pedidos vindos do Bullroom local.
import type { CheckResult, ConfigInfo, CoreConfig, EngineBot } from '../../../shared/core/types';
import { CORE_BASE } from '../../../shared/core/to-office';

export { CORE_BASE };

export type CoreFailure = 'offline' | 'invalid' | 'busy' | 'error';
export type CoreReply<T> = { ok: true; value: T } | { ok: false; kind: CoreFailure; details: string[] };

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

async function call<T>(fetchImpl: FetchLike, path: string, init?: RequestInit): Promise<CoreReply<T>> {
  let r: Response;
  try {
    r = await fetchImpl(`${CORE_BASE}${path}`, { cache: 'no-store', ...init });
  } catch {
    return { ok: false, kind: 'offline', details: [] };
  }
  let body: unknown = null;
  try {
    body = await r.json();
  } catch {
    body = null;
  }
  if (r.ok) return { ok: true, value: body as T };
  const raw = (body as { details?: unknown } | null)?.details;
  // A trava responde com motivos: o que aconteceu e o que fazer.
  const reasons = (body as { reasons?: Array<{ message?: string; fix?: string }> } | null)?.reasons;
  const details = Array.isArray(raw) ? raw.map(String) : Array.isArray(reasons) ? reasons.map((x) => [x.message, x.fix].filter(Boolean).join(' ')) : [];
  const kind: CoreFailure = r.status === 422 ? 'invalid' : r.status === 429 ? 'busy' : 'error';
  return { ok: false, kind, details: details.length ? details : [`HTTP ${r.status}`] };
}

export interface CoreConfigApi {
  info(): Promise<CoreReply<ConfigInfo>>;
  check(config: CoreConfig): Promise<CoreReply<CheckResult>>;
  save(config: CoreConfig): Promise<CoreReply<ConfigInfo>>;
}

/** Ligar e parar robôs simulados do motor de paper. */
export interface CoreEngineApi {
  start(req: { pair: string; exchanges: [string, string]; capitalUsd?: number }): Promise<CoreReply<EngineBot>>;
  stop(id: string): Promise<CoreReply<EngineBot>>;
}

export function coreEngineApi(fetchImpl: FetchLike = (url, init) => fetch(url, init)): CoreEngineApi {
  const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return {
    start: (req) => call<EngineBot>(fetchImpl, '/v1/engine/bots', post(req)),
    stop: (id) => call<EngineBot>(fetchImpl, `/v1/engine/bots/${encodeURIComponent(id)}/stop`, post({})),
  };
}

export function coreConfigApi(fetchImpl: FetchLike = (url, init) => fetch(url, init)): CoreConfigApi {
  const json = (method: string, config: CoreConfig): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
  return {
    info: () => call<ConfigInfo>(fetchImpl, '/v1/config'),
    check: (config) => call<CheckResult>(fetchImpl, '/v1/check', json('POST', config)),
    save: (config) => call<ConfigInfo>(fetchImpl, '/v1/config', json('PUT', config)),
  };
}
