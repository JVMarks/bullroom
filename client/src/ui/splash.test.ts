import { describe, expect, it } from 'vitest';
import { splashText } from './overlays';

describe('tela de carregamento', () => {
  it('servidor do habblaud: textos de antes', () => {
    expect(splashText('connecting', 1_000, false)).toBe('Conectando ao escritório…');
    expect(splashText('closed', 1_000, false)).toContain('Tentando de novo');
  });

  it('núcleo do OpenSpread desligado: diz como ligar', () => {
    expect(splashText('closed', 1_000, true)).toBe('Núcleo do OpenSpread desligado: rode npm start na pasta core/');
    expect(splashText('connecting', 60_000, true)).toBe('Núcleo do OpenSpread desligado: rode npm start na pasta core/');
    expect(splashText('connecting', 1_000, true)).toBe('Conectando ao escritório…');
  });
});
