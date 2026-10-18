// Caminho dos arquivos de client/public respeitando o `base` do Vite. Na raiz (servidor do Bullroom, dev) nada muda;
// na demo do site (GitHub Pages em /OpenSpread/demo/) os assets ficam debaixo do subcaminho.

/** `/assets/x.png` → `<base>assets/x.png`, sem barra dupla. `base` padrão: o do build (import.meta.env.BASE_URL). */
export function assetUrl(path: string, base: string = import.meta.env.BASE_URL ?? '/'): string {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return prefix + path.replace(/^\/+/, '');
}
