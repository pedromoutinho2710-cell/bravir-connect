import { supabase } from "@/integrations/supabase/client";

export interface RankingVendedorBase {
  vendedor_id: string;
  nome: string;
  faturamento: number;
  numPedidos: number;
}

/**
 * Ranking de vendedores por ENTRADA DE PEDIDOS no período — fonte ÚNICA usada
 * tanto pelo Dashboard admin quanto pelo Painel do Vendedor, garantindo que as
 * posições sejam sempre idênticas nos dois.
 *
 * Regra (idêntica à que o Dashboard admin já usava):
 *  - pedidos com `data_pedido` no intervalo [inicio, fim], excluindo `rascunho`
 *    (na query) e `cancelado` (no filtro);
 *  - `faturamento` = soma de `itens_pedido.total_item` por `vendedor_id`;
 *  - inclui todos os vendedores com papel `vendedor`/`gestora` mesmo sem pedidos
 *    no período (faturamento 0);
 *  - nome via `profiles` (`full_name` || `email`); descarta quem não tem nome;
 *  - ordena por `faturamento` decrescente.
 */
export async function fetchRankingVendedores(
  inicio: string,
  fim: string,
): Promise<RankingVendedorBase[]> {
  const { data: pedidosData } = await supabase
    .from("pedidos")
    .select("vendedor_id, status, itens_pedido(total_item)")
    .gte("data_pedido", inicio)
    .lte("data_pedido", fim)
    .not("status", "in", '("rascunho")');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pedidos = ((pedidosData ?? []) as any[]).filter((p) => p.status !== "cancelado");

  const agg: Record<string, { faturamento: number; numPedidos: number }> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pedidos.forEach((p: any) => {
    if (!p.vendedor_id) return;
    if (!agg[p.vendedor_id]) agg[p.vendedor_id] = { faturamento: 0, numPedidos: 0 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const total = (p.itens_pedido ?? []).reduce((s: number, i: any) => s + Number(i.total_item), 0);
    agg[p.vendedor_id].faturamento += total;
    agg[p.vendedor_id].numPedidos += 1;
  });

  const profileMap: Record<string, string> = {};
  {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, full_name, email");
    (profilesData ?? []).forEach((p) => {
      profileMap[p.id] = p.full_name || p.email;
    });
  }

  let lista: RankingVendedorBase[] = Object.entries(agg).map(([vendedor_id, data]) => ({
    vendedor_id,
    nome: profileMap[vendedor_id] ?? "—",
    faturamento: data.faturamento,
    numPedidos: data.numPedidos,
  }));

  // Inclui todos os vendedores (papel vendedor/gestora) mesmo sem pedidos no período
  const { data: rolesData } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", ["vendedor", "gestora"]);
  const todosVendedorIds = (rolesData ?? []).map((r) => r.user_id);

  const idsNovos = todosVendedorIds.filter((id) => !profileMap[id]);
  if (idsNovos.length > 0) {
    const { data: novosProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", idsNovos);
    (novosProfiles ?? []).forEach((p) => {
      profileMap[p.id] = p.full_name || p.email;
    });
  }

  todosVendedorIds.forEach((vendedor_id) => {
    const nome = profileMap[vendedor_id] ?? "—";
    if (!nome || nome === "—") return; // pular vendedores sem profile
    if (!agg[vendedor_id]) {
      lista.push({ vendedor_id, nome, faturamento: 0, numPedidos: 0 });
    }
  });

  lista = lista.filter((r) => r.nome && r.nome !== "—");
  lista.sort((a, b) => b.faturamento - a.faturamento);
  return lista;
}
