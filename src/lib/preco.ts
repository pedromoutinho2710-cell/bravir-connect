/**
 * Cálculo unificado de preço de um item de pedido.
 *
 * Cascata de descontos (nunca soma valores monetários):
 *   bruto → × (1 − descontoPerfil − descontoComercial/100) → preço líquido (após perfil)
 *         → × (1 − descontoTrade/100)                       → preço final
 *
 * O desconto comercial (adicional) é somado ao desconto de perfil (cluster)
 * antes de incidir sobre o bruto; o desconto de trade incide por cima do líquido.
 *
 * Arredondamento consistente em todos os valores monetários retornados:
 * Math.round(x * 100) / 100.
 */
export function calcularPrecoItem(params: {
  precoBruto: number;
  descontoPerfil: number; // 0-1 (fração)
  descontoComercial: number; // 0-100 (percentual)
  descontoTrade: number; // 0-100 (percentual)
  quantidade: number;
}): {
  precoAposPerfil: number;
  precoAposComercial: number;
  precoFinal: number;
  totalItem: number;
} {
  const {
    precoBruto,
    descontoPerfil,
    descontoComercial,
    descontoTrade,
    quantidade,
  } = params;

  const round = (x: number) => Math.round(x * 100) / 100;

  const aposPerfilRaw =
    precoBruto * (1 - descontoPerfil - descontoComercial / 100);
  const precoFinalRaw = aposPerfilRaw * (1 - descontoTrade / 100);

  const precoAposPerfil = round(aposPerfilRaw);

  return {
    precoAposPerfil,
    // mantido por compatibilidade: o desconto comercial já está embutido no líquido após perfil
    precoAposComercial: precoAposPerfil,
    precoFinal: round(precoFinalRaw),
    totalItem: round(precoFinalRaw * quantidade),
  };
}
