import { describe, expect, it } from 'vitest';
import { botStatus } from './rules';
import { ROOM_MAX_BOTS, TradingSimulator } from './simulator';

const T0 = 1_760_000_000_000;
const STEP = 20_000;

/** Roda `n` passos de mercado (ritmo normal: um a cada 20 s). */
function run(sim: TradingSimulator, n: number, from = T0): number {
  let now = from;
  for (let i = 0; i < n; i++) {
    now += STEP;
    sim.tick(now);
  }
  return now;
}

describe('TradingSimulator', () => {
  it('same seed → same snapshot', () => {
    const a = new TradingSimulator({ seed: 7 }, T0);
    const b = new TradingSimulator({ seed: 7 }, T0);
    const end = run(a, 10);
    run(b, 10);
    expect(JSON.stringify(a.snapshot(end))).toBe(JSON.stringify(b.snapshot(end)));
  });

  it('rooms never exceed 6 bots', () => {
    const sim = new TradingSimulator({ seed: 1, bots: 54 }, T0);
    const snap = sim.snapshot(T0);
    expect(ROOM_MAX_BOTS).toBe(6);
    expect(snap.rooms).toHaveLength(9);
    expect(snap.agents).toHaveLength(54);
    const perRoom = new Map<string, number>();
    for (const a of snap.agents) perRoom.set(a.roomId, (perRoom.get(a.roomId) ?? 0) + 1);
    for (const n of perRoom.values()) expect(n).toBeLessThanOrEqual(6);
    expect(new Set(snap.rooms.map((r) => r.name)).size).toBe(9);
  });

  it('padrão de 18 robôs e no máximo 54', () => {
    expect(new TradingSimulator({ seed: 1 }, T0).snapshot(T0).agents).toHaveLength(18);
    expect(new TradingSimulator({ seed: 1, bots: 99 }, T0).snapshot(T0).agents).toHaveLength(54);
  });

  it('ejected bot never trades again today', () => {
    const sim = new TradingSimulator({ seed: 3, bots: 6 }, T0);
    const id = sim.snapshot(T0).agents[0].id;
    expect(sim.setPnl(id, -5)).toBe(true);
    let now = T0;
    let ejectedAt: number | undefined;
    for (let i = 0; i < 50; i++) {
      now += STEP;
      sim.tick(now);
      const a = sim.snapshot(now).agents.find((x) => x.id === id);
      if (a) {
        expect(a.status).not.toBe('working');
        expect(a.status).toBe('offline');
        ejectedAt ??= a.trading?.ejectedAt;
      } else {
        // some 20 s depois da ejeção (tempo da animação de saída)
        expect(ejectedAt).toBeDefined();
        expect(now - ejectedAt!).toBeGreaterThanOrEqual(20_000);
      }
    }
    expect(sim.snapshot(now).agents.find((x) => x.id === id)).toBeUndefined();
    expect(sim.snapshot(now).portfolio?.ejected).toBeGreaterThanOrEqual(1);
  });

  it('status follows position', () => {
    const sim = new TradingSimulator({ seed: 11, bots: 30 }, T0);
    let now = T0;
    for (let i = 0; i < 40; i++) {
      now += STEP;
      sim.tick(now);
      for (const a of sim.snapshot(now).agents) expect(a.status).toBe(botStatus(a.trading!));
    }
  });

  it('portfolio adds up (com os ejetados que já saíram)', () => {
    const sim = new TradingSimulator({ seed: 5, bots: 54 }, T0);
    const last = new Map<string, number>();
    let now = T0;
    for (let i = 0; i < 200; i++) {
      now += STEP;
      sim.tick(now);
      for (const a of sim.snapshot(now).agents) last.set(a.id, a.trading!.pnlUsd);
    }
    const snap = sim.snapshot(now);
    const p = snap.portfolio!;
    const total = [...last.values()].reduce((s, v) => s + v, 0);
    expect(p.simulated).toBe(true);
    expect(Math.abs(p.totalPnlUsd - total)).toBeLessThan(0.01);
    expect(p.bots).toBe(snap.agents.length);
    expect(p.trading).toBe(snap.agents.filter((a) => a.status === 'working').length);
    expect(p.series.length).toBeGreaterThan(0);
    expect(p.series.length).toBeLessThanOrEqual(360);
  });

  it('feed de operações no formato COMPRA/VENDA · par · corretora', () => {
    const sim = new TradingSimulator({ seed: 2, bots: 18 }, T0);
    const texts: string[] = [];
    let now = T0;
    for (let i = 0; i < 20; i++) {
      now += STEP;
      texts.push(...sim.tick(now).feed.map((f) => f.activity.text));
    }
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) expect(t).toMatch(/^(COMPRA|VENDA) \S+\/\S+ · \w+ · \$\d+$|^EJETADO · /);
  });

  it('sala soma os robôs, ejetados inclusive', () => {
    const sim = new TradingSimulator({ seed: 5, bots: 54 }, T0);
    const last = new Map<string, { room: string; pnl: number }>();
    let now = T0;
    for (let i = 0; i < 200; i++) {
      now += STEP;
      sim.tick(now);
      for (const a of sim.snapshot(now).agents) last.set(a.id, { room: a.roomId, pnl: a.trading!.pnlUsd });
    }
    const snap = sim.snapshot(now);
    for (const room of snap.rooms) {
      const sum = [...last.values()].filter((x) => x.room === room.id).reduce((s, x) => s + x.pnl, 0);
      expect(Math.abs(room.trading!.pnlUsd - sum)).toBeLessThan(0.01);
      expect(room.trading!.series.length).toBeGreaterThan(0);
      expect(room.trading!.series.length).toBeLessThanOrEqual(360);
    }
  });

  it('sala vazia continua no snapshot com o PL final', () => {
    const sim = new TradingSimulator({ seed: 3, bots: 6 }, T0);
    for (const a of sim.snapshot(T0).agents) sim.setPnl(a.id, -5);
    const end = run(sim, 50);
    const snap = sim.snapshot(end);
    expect(snap.agents).toHaveLength(0);
    expect(snap.rooms).toHaveLength(1);
    expect(snap.rooms[0].trading!.pnlUsd).toBeLessThanOrEqual(-30);
  });

  it('estatísticas de cada robô', () => {
    const sim = new TradingSimulator({ seed: 4, bots: 18 }, T0);
    const end = run(sim, 100);
    for (const a of sim.snapshot(end).agents) {
      const s = a.trading!.stats!;
      expect(s.trades).toBeGreaterThanOrEqual(s.wins);
      expect(s.series.length).toBeLessThanOrEqual(360);
      expect(s.btcStartUsd).toBeGreaterThan(0);
      expect(s.btcNowUsd).toBeGreaterThan(0);
      expect(s.maxDrawdownUsd).toBeGreaterThanOrEqual(0);
      expect(a.trading!.capitalUsd).toBe(1000);
    }
    expect(sim.snapshot(end).agents.some((a) => a.trading!.stats!.trades > 0)).toBe(true);
  });

  it('speed acelera o mercado', () => {
    const sim = new TradingSimulator({ seed: 9, speed: 10 }, T0);
    const r = sim.tick(T0 + 2_000);
    expect(r.changed).toBe(true);
  });
});
