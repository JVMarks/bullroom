import { describe, expect, it } from 'vitest';
import { roomTheme, simulationTheme, THEME_COUNT } from './theme';

describe('tema da sala de simulação', () => {
  it('nenhuma sala comum usa o tapete nem o rodapé dela', () => {
    const sim = simulationTheme();
    for (let seed = 0; seed < THEME_COUNT; seed++) {
      expect(roomTheme(seed).carpet).not.toBe(sim.carpet);
      expect(roomTheme(seed).wall.trim).not.toBe(sim.wall.trim);
    }
  });

  it('devolve uma cópia nova: quem mexe nela não muda a próxima', () => {
    const a = simulationTheme();
    a.wall.base = '#000000';
    expect(simulationTheme().wall.base).not.toBe('#000000');
  });
});
