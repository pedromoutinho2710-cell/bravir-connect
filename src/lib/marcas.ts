/**
 * Cores oficiais por marca do Grupo Bravir — fonte única, reusada por todas as telas.
 *
 * Famílias da marca: **Bravir + Bendita Cânfora = VERDE**; **Laby + Alivik = AZUL-MARINHO**.
 * Dentro de cada família usamos tons distintos para manter a legibilidade em
 * gráficos (donut, legendas, badges de marca) sem perder a leitura de marca.
 */
// Tons escuros o bastante para texto branco legível (badges de marca usam color #fff)
// e distintos dentro de cada família para legibilidade em gráficos.
export const MARCA_CORES: Record<string, string> = {
  Bravir: "#006130", // verde Bravir (logo oficial) — branco 7.6:1
  "Bendita Cânfora": "#2E7D46", // verde médio (mesma família) — branco 5.1:1
  Laby: "#18406B", // azul-marinho — branco 10.6:1
  Alivik: "#35639C", // azul médio (mesma família) — branco 6.2:1
};

/** Cor neutra para marcas não mapeadas. */
export const MARCA_COR_PADRAO = "#6B7280";

/** Retorna a cor da marca (ou um cinza neutro quando não houver mapeamento). */
export function corMarca(marca: string | null | undefined): string {
  if (!marca) return MARCA_COR_PADRAO;
  return MARCA_CORES[marca] ?? MARCA_COR_PADRAO;
}
