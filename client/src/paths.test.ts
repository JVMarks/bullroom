import { describe, expect, it } from 'vitest';
import { assetUrl } from './paths';

describe('assetUrl (demo em subcaminho)', () => {
  it('base na raiz: igual ao caminho de antes', () => {
    expect(assetUrl('/assets/brand/logo-mark.png', '/')).toBe('/assets/brand/logo-mark.png');
    expect(assetUrl('assets/manifest.json', '/')).toBe('/assets/manifest.json');
  });

  it('base num subcaminho (GitHub Pages): prefixa sem barra dupla', () => {
    expect(assetUrl('/assets/brand/logo-mark.png', '/OpenSpread/demo/')).toBe('/OpenSpread/demo/assets/brand/logo-mark.png');
    expect(assetUrl('assets/x.png', '/OpenSpread/demo')).toBe('/OpenSpread/demo/assets/x.png');
  });

  it('base relativa do Vite (./)', () => {
    expect(assetUrl('/assets/x.png', './')).toBe('./assets/x.png');
  });
});
