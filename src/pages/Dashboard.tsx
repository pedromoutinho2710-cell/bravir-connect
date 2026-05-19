import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, ArrowRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDate } from "@/lib/format";
import { STATUS_LABEL, STATUS_COLOR } from "@/lib/status";

type Periodo = "hoje" | "semana" | "mes" | "ano";

type PeriodoCards = "hoje" | "semana" | "mes" | "ano" | "custom";

const PERIODOS_CARDS: { key: PeriodoCards; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "semana", label: "Esta semana" },
  { key: "mes", label: "Este mês" },
  { key: "ano", label: "Este ano" },
  { key: "custom", label: "Personalizado" },
];

function getPeriodoCards(key: PeriodoCards, customInicio: string, customFim: string): { inicio: string; fim: string } {
  const hoje = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (key === "hoje") { const s = fmt(hoje); return { inicio: s, fim: s }; }
  if (key === "semana") {
    const dow = hoje.getDay();
    const diff = dow === 0 ? 6 : dow - 1;
    const seg = new Date(hoje); seg.setDate(hoje.getDate() - diff);
    return { inicio: fmt(seg), fim: fmt(hoje) };
  }
  if (key === "mes") {
    return { inicio: `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-01`, fim: fmt(hoje) };
  }
  if (key === "ano") { return { inicio: `${hoje.getFullYear()}-01-01`, fim: fmt(hoje) }; }
  return { inicio: customInicio, fim: customFim || fmt(hoje) };
}

function getDateRange(periodo: Periodo): { dataInicio: string; dataFim: string } {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (periodo === "hoje") {
    const s = fmt(today);
    return { dataInicio: s, dataFim: s };
  }
  if (periodo === "semana") {
    const day = today.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { dataInicio: fmt(monday), dataFim: fmt(sunday) };
  }
  if (periodo === "mes") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { dataInicio: fmt(start), dataFim: fmt(end) };
  }
  // ano
  const start = new Date(today.getFullYear(), 0, 1);
  const end = new Date(today.getFullYear(), 11, 31);
  return { dataInicio: fmt(start), dataFim: fmt(end) };
}

type DrillCardKey = "recebidos" | "agFaturamento" | "semEstoque" | "faturado" | "problemas";

type PedidoDrillRow = {
  id: string;
  numero_pedido: number;
  data_pedido: string;
  status: string;
  vendedor_id: string;
  razao_social: string;
  total: number;
};

const DRILL_CARD_LABEL: Record<DrillCardKey, string> = {
  recebidos: "Pedidos recebidos",
  agFaturamento: "Ag. Faturamento",
  semEstoque: "Pedidos sem estoque",
  faturado: "Faturado",
  problemas: "Problemas",
};

type KPIs = {
  recebidos: number;
  agFaturamento: number;
  semEstoque: number;
  faturado: number;
  problemas: number;
};

type RankingVendedor = {
  vendedor_id: string;
  nome: string;
  faturamento: number;
  numPedidos: number;
  clientesAtivos: number;
  metaMes: number | null;
};

type RankingSku = {
  produto_id: string;
  codigo_jiva: string;
  nome: string;
  marca: string;
  quantidade: number;
};

type RankingSkuValor = {
  produto_id: string;
  codigo_jiva: string;
  nome: string;
  marca: string;
  valor: number;
};

const PERIODOS: { key: Periodo; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês" },
  { key: "ano", label: "Ano" },
];

const MARCA_CORES: Record<string, string> = {
  "Bendita Cânfora": "#7f77dd",
  "Laby": "#378add",
  "Bravir": "#888780",
  "Alivik": "#1d9e75",
};

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const NIVEL_ORDEM: Record<string, number> = { "Bronze": 1, "Prata": 2, "Ouro": 3, "Diamante": 4 };

const AVATAR_COLORS = [
  "bg-green-100 text-green-800",
  "bg-blue-100 text-blue-800",
  "bg-purple-100 text-purple-800",
  "bg-orange-100 text-orange-800",
  "bg-pink-100 text-pink-800",
  "bg-teal-100 text-teal-800",
  "bg-yellow-100 text-yellow-800",
  "bg-red-100 text-red-800",
];

function nivelMaior(a: string | null, b: string | null): string | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return (NIVEL_ORDEM[a] ?? 0) >= (NIVEL_ORDEM[b] ?? 0) ? a : b;
}

export default function Dashboard() {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [periodoCards, setPeriodoCards] = useState<PeriodoCards>("mes");
  const [customCardInicio, setCustomCardInicio] = useState("");
  const [customCardFim, setCustomCardFim] = useState("");
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPIs>({
    recebidos: 0,
    agFaturamento: 0,
    semEstoque: 0,
    faturado: 0,
    problemas: 0,
  });
  const [metaTotal, setMetaTotal] = useState(0);
  const [fatMesAtual, setFatMesAtual] = useState(0);
  const [pipelineTotal, setPipelineTotal] = useState(0);
  const [ranking, setRanking] = useState<RankingVendedor[]>([]);
  const [topSkus, setTopSkus] = useState<RankingSku[]>([]);
  const [tabProdutos, setTabProdutos] = useState<"quantidade" | "valor">("quantidade");
  const [topSkusValor, setTopSkusValor] = useState<RankingSkuValor[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [campanhaAtiva, setCampanhaAtiva] = useState<any>(null);
  const [entradaCampanha, setEntradaCampanha] = useState(0);
  const [entradaMarca, setEntradaMarca] = useState<Record<string, number>>({});
  const [fatMensal, setFatMensal] = useState<{ mes: string; valor: number }[]>([]);
  const [rankingCampanha, setRankingCampanha] = useState<{
    vendedor_id: string;
    nome: string;
    fatCampanha: number;
    nivel: string | null;
    metaVendedor: number | null;
    categoriaInicial: string | null;
    nivelExibido: string | null;
  }[]>([]);
  const [metaTotalCampanha, setMetaTotalCampanha] = useState(0);
  const [vendedorExpandido, setVendedorExpandido] = useState<string | null>(null);

  // Filtro de período customizado
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  // Drill-down dos cards
  const [cardAberto, setCardAberto] = useState<DrillCardKey | null>(null);
  const [drillPedidos, setDrillPedidos] = useState<PedidoDrillRow[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillProfiles, setDrillProfiles] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);

    // Determine effective date range
    const { dataInicio: periodoInicio, dataFim: periodoFim } = getDateRange(periodo);
    const effectiveInicio = (dataInicio && dataFim) ? dataInicio : periodoInicio;
    const effectiveFim = (dataInicio && dataFim) ? dataFim : periodoFim;

    const now = new Date();
    const mesAtual = now.getMonth() + 1;
    const anoAtual = now.getFullYear();
    const pad = (n: number) => String(n).padStart(2, "0");
    const mesInicio = `${anoAtual}-${pad(mesAtual)}-01`;
    const mesFim = new Date(anoAtual, mesAtual, 0).toISOString().slice(0, 10);

    // Build array of last 6 months (oldest first, current month last)
    const meses6 = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(anoAtual, now.getMonth() - (5 - i), 1);
      const ano = d.getFullYear();
      const mes = d.getMonth(); // 0-based
      const inicio = `${ano}-${pad(mes + 1)}-01`;
      const fim = new Date(ano, mes + 1, 0).toISOString().slice(0, 10);
      return { label: MESES_ABREV[mes], inicio, fim };
    });

    (async () => {
      try {
        const { inicio: kpiInicio, fim: kpiFim } = getPeriodoCards(periodoCards, customCardInicio, customCardFim);

        const [pedidosRes, metasRes, pedidosMesRes, pipelineRes, preFatRes, lancadosRes, aguardRes, fatKpiRes, probRes, campanhaRes, ...mensaisRes] = await Promise.all([
          // Pedidos do período — base para ranking e top SKUs
          supabase
            .from("pedidos")
            .select("id, vendedor_id, status, data_pedido, itens_pedido(total_item, produto_id, quantidade)")
            .gte("data_pedido", effectiveInicio)
            .lte("data_pedido", effectiveFim)
            .not("status", "in", '("rascunho")'),
          // Meta total da empresa do mês atual (inclui vendedor_id para ranking individual)
          supabase
            .from("metas")
            .select("vendedor_id, valor_meta_reais")
            .eq("mes", mesAtual)
            .eq("ano", anoAtual),
          // Faturamento do mês atual para cálculo de % da meta + clientes ativos por vendedor
          supabase
            .from("pedidos")
            .select("id, vendedor_id, cliente_id, status, itens_pedido(total_item)")
            .gte("data_pedido", mesInicio)
            .lte("data_pedido", mesFim)
            .not("status", "in", '("rascunho","cancelado")'),
          // Pedidos em pipeline para previsão do mês
          supabase
            .from("pedidos")
            .select("id, itens_pedido(total_item)")
            .in("status", ["pendente_sankhya", "em_faturamento"]),
          // KPI: Pedidos recebidos (todos exceto rascunho e cancelado)
          supabase.from("pedidos").select("id", { count: "exact", head: true }).not("status", "in", '("rascunho","cancelado")').gte("data_pedido", kpiInicio).lte("data_pedido", kpiFim),
          // KPI: Ag. Faturamento (no_sankhya)
          supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "no_sankhya").gte("data_pedido", kpiInicio).lte("data_pedido", kpiFim),
          // KPI: Pedidos sem estoque (sem_estoque)
          supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "sem_estoque").gte("data_pedido", kpiInicio).lte("data_pedido", kpiFim),
          // KPI: Faturado
          supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "faturado").gte("data_pedido", kpiInicio).lte("data_pedido", kpiFim),
          // KPI: Problemas (com_problema + devolvido + cancelado)
          supabase.from("pedidos").select("id", { count: "exact", head: true }).in("status", ["com_problema", "devolvido", "cancelado"]).gte("data_pedido", kpiInicio).lte("data_pedido", kpiFim),
          // Campanha ativa
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).from("campanhas").select("*, campanha_niveis(*)").eq("ativa", true).maybeSingle(),
          // Faturamento mensal — últimos 6 meses
          ...meses6.map((m) =>
            supabase
              .from("pedidos")
              .select("id, itens_pedido(total_item)")
              .eq("status", "faturado")
              .gte("data_pedido", m.inicio)
              .lte("data_pedido", m.fim)
          ),
        ]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pedidos = (pedidosRes.data ?? []) as any[];
        const pedidosSemCancelado = pedidos.filter((p) => p.status !== "cancelado");

        setKpis({
          recebidos: preFatRes.count ?? 0,
          agFaturamento: lancadosRes.count ?? 0,
          semEstoque: aguardRes.count ?? 0,
          faturado: fatKpiRes.count ?? 0,
          problemas: probRes.count ?? 0,
        });

        // Meta total do mês
        const metaSum = (metasRes.data ?? []).reduce((s, m) => s + Number(m.valor_meta_reais), 0);
        setMetaTotal(metaSum);

        // Faturamento mês atual para % da meta
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fatMes = (pedidosMesRes.data ?? []).reduce(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (s: number, p: any) => s + (p.itens_pedido ?? []).reduce((si: number, i: any) => si + Number(i.total_item), 0),
          0,
        );
        setFatMesAtual(fatMes);

        // Meta mensal por vendedor
        const metasPorVendedor: Record<string, number> = {};
        (metasRes.data ?? []).forEach((m) => {
          if (m.vendedor_id) metasPorVendedor[m.vendedor_id] = Number(m.valor_meta_reais);
        });

        // Clientes ativos por vendedor no mês atual (excluindo devolvido)
        const clientesAtivosPorVendedor: Record<string, Set<string>> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pedidosMesRes.data ?? []).forEach((p: any) => {
          if (!p.vendedor_id || !p.cliente_id || p.status === "devolvido") return;
          if (!clientesAtivosPorVendedor[p.vendedor_id]) clientesAtivosPorVendedor[p.vendedor_id] = new Set();
          clientesAtivosPorVendedor[p.vendedor_id].add(p.cliente_id);
        });

        // Pipeline total para previsão
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pipeline = (pipelineRes.data ?? []).reduce(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (s: number, p: any) => s + (p.itens_pedido ?? []).reduce((si: number, i: any) => si + Number(i.total_item), 0),
          0,
        );
        setPipelineTotal(pipeline);

        // Campanha ativa
        const campanha = campanhaRes.data ?? null;
        setCampanhaAtiva(campanha);

        if (!campanha) {
          setEntradaCampanha(0);
          setRankingCampanha([]);
        }

        // Ranking vendedores — todos, sem slice
        const vendedorAgg: Record<string, { faturamento: number; numPedidos: number }> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pedidosSemCancelado.forEach((p: any) => {
          if (!vendedorAgg[p.vendedor_id]) vendedorAgg[p.vendedor_id] = { faturamento: 0, numPedidos: 0 };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const total = (p.itens_pedido ?? []).reduce((s: number, i: any) => s + Number(i.total_item), 0);
          vendedorAgg[p.vendedor_id].faturamento += total;
          vendedorAgg[p.vendedor_id].numPedidos += 1;
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

        const rankingList: RankingVendedor[] = Object.entries(vendedorAgg)
          .map(([vendedor_id, data]) => ({
            vendedor_id,
            nome: profileMap[vendedor_id] ?? "—",
            faturamento: data.faturamento,
            numPedidos: data.numPedidos,
            clientesAtivos: clientesAtivosPorVendedor[vendedor_id]?.size ?? 0,
            metaMes: metasPorVendedor[vendedor_id] ?? null,
          }))
          .sort((a, b) => b.faturamento - a.faturamento);
        setRanking(rankingList);

        // Ranking campanha por vendedor
        if (campanha) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: campanhaProdutosData } = await (supabase as any)
            .from("campanha_produtos")
            .select("tipo, produto_id, marca")
            .eq("campanha_id", campanha.id);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const marcasCampanha = new Set<string>(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((campanhaProdutosData ?? []) as any[]).filter((cp: any) => cp.tipo === "marca").map((cp: any) => cp.marca as string)
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const produtosCampanha = new Set<string>(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((campanhaProdutosData ?? []) as any[]).filter((cp: any) => cp.tipo === "produto").map((cp: any) => cp.produto_id as string)
          );

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: pedCampDetalhe } = await (supabase as any)
            .from("pedidos")
            .select("vendedor_id, itens_pedido(total_item, produto_id, produto:produtos(marca))")
            .gte("data_pedido", campanha.data_inicio)
            .lte("data_pedido", campanha.data_fim)
            .not("status", "in", '("cancelado","devolvido","rascunho")');

          let entradaFiltrada = 0;
          const vendedorFatCamp: Record<string, number> = {};
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((pedCampDetalhe ?? []) as any[]).forEach((p: any) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (p.itens_pedido ?? []).forEach((item: any) => {
              const marca = item.produto?.marca as string | undefined;
              const prodId = item.produto_id as string | undefined;
              if ((marca && marcasCampanha.has(marca)) || (prodId && produtosCampanha.has(prodId))) {
                entradaFiltrada += Number(item.total_item);
                if (p.vendedor_id) {
                  if (!vendedorFatCamp[p.vendedor_id]) vendedorFatCamp[p.vendedor_id] = 0;
                  vendedorFatCamp[p.vendedor_id] += Number(item.total_item);
                }
              }
            });
          });
          setEntradaCampanha(entradaFiltrada);

          // Metas individuais por vendedor
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: metasVendedorData } = await (supabase as any)
            .from("campanha_metas_vendedor")
            .select("vendedor_id, meta_valor, categoria")
            .eq("campanha_id", campanha.id);

          const metaTotalCampanha = (metasVendedorData ?? []).reduce((s: number, m: any) => s + Number(m.meta_valor), 0);
          setMetaTotalCampanha(metaTotalCampanha);

          const metasVendedorMap: Record<string, { meta: number; categoria: string | null }> = {};
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((metasVendedorData ?? []) as any[]).forEach((m: any) => {
            metasVendedorMap[m.vendedor_id] = { meta: Number(m.meta_valor), categoria: m.categoria ?? null };
          });

          // Buscar profiles de vendedores com meta que não estão no profileMap
          const metaVendedorIds = (metasVendedorData ?? []).map((m: any) => m.vendedor_id as string);
          const idsParaBuscar = metaVendedorIds.filter((id: string) => !profileMap[id]);
          if (idsParaBuscar.length > 0) {
            const { data: extraProfiles } = await supabase.from("profiles").select("id, full_name, email").in("id", idsParaBuscar);
            (extraProfiles ?? []).forEach((p) => { profileMap[p.id] = p.full_name || p.email; });
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const niveisCamp = [...((campanha.campanha_niveis ?? []) as any[])].sort(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (a: any, b: any) => Number(b.valor_minimo) - Number(a.valor_minimo)
          );

          const rankingCampList = metaVendedorIds
            .map((vendedor_id: string) => {
              const fat = vendedorFatCamp[vendedor_id] ?? 0;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const nivel = (niveisCamp.find((n: any) => fat >= Number(n.valor_minimo)) as any)?.nome ?? null;
              const metaVendedor = metasVendedorMap[vendedor_id]?.meta ?? null;
              const categoriaInicial = metasVendedorMap[vendedor_id]?.categoria ?? null;
              const nome = profileMap[vendedor_id] ?? vendedor_id;
              return { vendedor_id, nome, fatCampanha: fat, nivel, metaVendedor, categoriaInicial, nivelExibido: nivelMaior(categoriaInicial, nivel) };
            })
            .sort((a, b) => b.fatCampanha - a.fatCampanha);

          setRankingCampanha(rankingCampList);
        }

        // Top SKUs por quantidade e por valor — todos, sem slice
        const skuAgg: Record<string, { quantidade: number; valor: number }> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pedidosSemCancelado.forEach((p: any) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p.itens_pedido ?? []).forEach((i: any) => {
            if (!i.produto_id) return;
            if (!skuAgg[i.produto_id]) skuAgg[i.produto_id] = { quantidade: 0, valor: 0 };
            skuAgg[i.produto_id].quantidade += Number(i.quantidade);
            skuAgg[i.produto_id].valor += Number(i.total_item);
          });
        });

        const allSkuIds = Object.keys(skuAgg);

        if (allSkuIds.length > 0) {
          const { data: produtosData } = await supabase
            .from("produtos")
            .select("id, codigo_jiva, nome, marca")
            .in("id", allSkuIds);

          const prodMap: Record<string, { codigo_jiva: string; nome: string; marca: string }> = {};
          (produtosData ?? []).forEach((p) => {
            prodMap[p.id] = { codigo_jiva: p.codigo_jiva, nome: p.nome, marca: p.marca };
          });

          setTopSkus(
            [...allSkuIds]
              .sort((a, b) => skuAgg[b].quantidade - skuAgg[a].quantidade)
              .map((id) => ({
                produto_id: id,
                codigo_jiva: prodMap[id]?.codigo_jiva ?? "—",
                nome: prodMap[id]?.nome ?? "—",
                marca: prodMap[id]?.marca ?? "—",
                quantidade: skuAgg[id].quantidade,
              })),
          );

          setTopSkusValor(
            [...allSkuIds]
              .sort((a, b) => skuAgg[b].valor - skuAgg[a].valor)
              .map((id) => ({
                produto_id: id,
                codigo_jiva: prodMap[id]?.codigo_jiva ?? "—",
                nome: prodMap[id]?.nome ?? "—",
                marca: prodMap[id]?.marca ?? "—",
                valor: skuAgg[id].valor,
              })),
          );

          // Entrada por marca
          const marcaAgg: Record<string, number> = {};
          allSkuIds.forEach((id) => {
            const marca = prodMap[id]?.marca ?? "Outros";
            if (!marcaAgg[marca]) marcaAgg[marca] = 0;
            marcaAgg[marca] += skuAgg[id].valor;
          });
          setEntradaMarca(marcaAgg);
        } else {
          setTopSkus([]);
          setTopSkusValor([]);
          setEntradaMarca({});
        }

        // Faturamento mensal — mapear respostas com labels dos meses
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fatMensalArr = (mensaisRes as any[]).map((res, i) => ({
          mes: meses6[i].label,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          valor: ((res.data ?? []) as any[]).reduce(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (s: number, p: any) => s + (p.itens_pedido ?? []).reduce((si: number, ii: any) => si + Number(ii.total_item), 0),
            0,
          ),
        }));
        setFatMensal(fatMensalArr);
      } catch {
        toast.error("Erro ao carregar dashboard");
      }
    })().finally(() => setLoading(false));
  }, [periodo, periodoCards, customCardInicio, customCardFim, dataInicio, dataFim]);

  const metaPct = metaTotal > 0 ? Math.min((fatMesAtual / metaTotal) * 100, 100) : 0;
  const previsaoMes = fatMesAtual + pipelineTotal;
  const previsaoPct = metaTotal > 0 ? Math.min((previsaoMes / metaTotal) * 100, 100) : 0;

  // Campanha: nível mais alto, progresso e dias
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const niveisOrdenados: any[] = campanhaAtiva
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? [...((campanhaAtiva.campanha_niveis ?? []) as any[])].sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))
    : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nivelMaisAlto: any = niveisOrdenados.length > 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? niveisOrdenados.reduce((acc: any, n: any) => (Number(n.valor_minimo) > Number(acc.valor_minimo) ? n : acc), niveisOrdenados[0])
    : null;
  const campanhaMetaMaxima = nivelMaisAlto ? Number(nivelMaisAlto.valor_minimo) : 0;
  void campanhaMetaMaxima;
  const campanhaPct = metaTotalCampanha > 0 ? Math.min((entradaCampanha / metaTotalCampanha) * 100, 100) : 0;
  const campanhaDiasRestantes = campanhaAtiva
    ? Math.max(0, Math.ceil((new Date(campanhaAtiva.data_fim).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  // Dias campanha para cálculo de status por vendedor
  const campanhaTotalDias = campanhaAtiva?.data_inicio && campanhaAtiva?.data_fim
    ? Math.max(0, Math.ceil((new Date(campanhaAtiva.data_fim).getTime() - new Date(campanhaAtiva.data_inicio).getTime()) / 86400000))
    : 0;
  const campanhaDiasPassados = campanhaAtiva?.data_inicio
    ? Math.min(campanhaTotalDias, Math.max(0, Math.ceil((Date.now() - new Date(campanhaAtiva.data_inicio).getTime()) / 86400000)))
    : 0;

  // Fluxo de metas
  const fatFaturadoMes = fatMensal.length > 0 ? fatMensal[fatMensal.length - 1].valor : 0;
  const entradaPct = metaTotal > 0 ? (fatMesAtual / metaTotal) * 100 : 0;
  const faturadoPct = metaTotal > 0 ? (fatFaturadoMes / metaTotal) * 100 : 0;

  const badgeColor = (pct: number) => {
    if (pct >= 80) return "bg-green-100 text-green-800";
    if (pct >= 50) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  const nivelBadgeClass = (nivel: string) => {
    const n = nivel.toLowerCase();
    if (n.includes("diamante")) return "bg-purple-100 text-purple-800 hover:bg-purple-100";
    if (n.includes("ouro")) return "bg-yellow-100 text-yellow-800 hover:bg-yellow-100";
    if (n.includes("prata")) return "bg-gray-100 text-gray-700 hover:bg-gray-100";
    if (n.includes("bronze")) return "bg-orange-100 text-orange-800 hover:bg-orange-100";
    return "bg-gray-100 text-gray-700 hover:bg-gray-100";
  };

  const maxFatMensal = Math.max(...fatMensal.map((m) => m.valor), 1);

// Donut chart — entrada por marca
  const totalGeralMarca = Object.values(entradaMarca).reduce((s, v) => s + v, 0);
  const donutCircumference = 2 * Math.PI * 70;
  const marcasSorted = Object.entries(entradaMarca).sort(([, a], [, b]) => b - a);
  const donutSlices = (() => {
    let cum = 0;
    return marcasSorted.map(([marca, valor]) => {
      const pct = totalGeralMarca > 0 ? valor / totalGeralMarca : 0;
      const dash = pct * donutCircumference;
      const offset = -(cum * donutCircumference);
      cum += pct;
      return { marca, valor, pct, dash, offset };
    });
  })();

  // Keep existing derived values used elsewhere
  void metaPct;
  void previsaoMes;
  void previsaoPct;

  async function carregarDrill(card: DrillCardKey) {
    const { inicio, fim } = getPeriodoCards(periodoCards, customCardInicio, customCardFim);
    if (periodoCards === "custom" && (!customCardInicio || !customCardFim)) return;
    setDrillLoading(true);
    setDrillPedidos([]);

    let query = supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("pedidos") as any;

    query = query
      .select("id, numero_pedido, data_pedido, status, vendedor_id, clientes(razao_social), itens_pedido(total_item)")
      .gte("data_pedido", inicio)
      .lte("data_pedido", fim)
      .order("data_pedido", { ascending: false });

    if (card === "recebidos") query = query.not("status", "in", '("rascunho","cancelado")');
    else if (card === "agFaturamento") query = query.eq("status", "no_sankhya");
    else if (card === "semEstoque") query = query.eq("status", "sem_estoque");
    else if (card === "faturado") query = query.eq("status", "faturado");
    else if (card === "problemas") query = query.in("status", ["com_problema", "devolvido", "cancelado"]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await query as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: PedidoDrillRow[] = ((data ?? []) as any[]).map((p: any) => ({
      id: p.id,
      numero_pedido: p.numero_pedido,
      data_pedido: p.data_pedido,
      status: p.status,
      vendedor_id: p.vendedor_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      razao_social: (p.clientes as any)?.razao_social ?? "—",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      total: ((p.itens_pedido ?? []) as any[]).reduce((s: number, i: any) => s + Number(i.total_item ?? 0), 0),
    }));
    setDrillPedidos(rows);

    const vendedorIds = [...new Set(rows.map((r) => r.vendedor_id).filter(Boolean))];
    if (vendedorIds.length > 0) {
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", vendedorIds);
      const map: Record<string, string> = {};
      (profilesData ?? []).forEach((p) => { map[p.id] = p.full_name ?? p.email; });
      setDrillProfiles(map);
    }

    setDrillLoading(false);
  }

  function handleCardClick(card: DrillCardKey) {
    if (cardAberto === card) {
      setCardAberto(null);
      setDrillPedidos([]);
    } else {
      setCardAberto(card);
      carregarDrill(card);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Seção 1 — Cabeçalho */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1A6B3A]">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral do negócio</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PERIODOS.map(({ key, label }) => (
            <Button
              key={key}
              variant={periodo === key && !dataInicio ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setPeriodo(key);
                setDataInicio("");
                setDataFim("");
              }}
              style={periodo === key && !dataInicio ? { backgroundColor: "#1A6B3A", borderColor: "#1A6B3A" } : undefined}
            >
              {label}
            </Button>
          ))}

          {/* Separador */}
          <div className="border-l h-6 mx-1" />

          {/* Filtro customizado */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">De:</span>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="text-xs border rounded px-2 py-1 h-8 bg-background"
            />
            <span className="text-xs text-muted-foreground">Até:</span>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="text-xs border rounded px-2 py-1 h-8 bg-background"
            />
            <Button
              size="sm"
              variant={dataInicio && dataFim ? "default" : "outline"}
              style={dataInicio && dataFim ? { backgroundColor: "#1A6B3A", borderColor: "#1A6B3A" } : undefined}
              onClick={() => {
                // dates are already in state; this button confirms intentionally
                if (dataInicio && dataFim) {
                  setDataInicio(dataInicio);
                  setDataFim(dataFim);
                }
              }}
            >
              Aplicar
            </Button>
          </div>
        </div>
      </div>

      {/* Seção 2 — Fluxo de Metas */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Nó 1: Meta de entrada */}
        <div className="rounded-lg border p-4 flex-1 min-w-[160px]">
          <div className="text-xs text-muted-foreground mb-1">Meta de entrada</div>
          <div className="text-xl font-bold">{formatBRL(metaTotal)}</div>
          <span className="inline-block mt-2 rounded-full px-2 py-0.5 text-xs bg-gray-100 text-gray-700">
            Definida manualmente
          </span>
        </div>

        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

        {/* Nó 2: Entrada de pedidos — destaque azul */}
        <div className="rounded-lg border-2 border-blue-400 bg-blue-50 p-4 flex-1 min-w-[160px]">
          <div className="text-xs text-muted-foreground mb-1">Entrada de pedidos</div>
          <div className="text-xl font-bold">{formatBRL(fatMesAtual)}</div>
          <span className={`inline-block mt-2 rounded-full px-2 py-0.5 text-xs ${badgeColor(entradaPct)}`}>
            {entradaPct.toFixed(0)}% da meta
          </span>
        </div>

        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

        {/* Nó 3: Total faturado */}
        <div className="rounded-lg border p-4 flex-1 min-w-[160px]">
          <div className="text-xs text-muted-foreground mb-1">Total faturado</div>
          <div className="text-xl font-bold">{formatBRL(fatFaturadoMes)}</div>
          <span className={`inline-block mt-2 rounded-full px-2 py-0.5 text-xs ${badgeColor(faturadoPct)}`}>
            {faturadoPct.toFixed(0)}% da meta
          </span>
        </div>

        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

        {/* Nó 4: Total a faturar (pipeline) */}
        <div className="rounded-lg border p-4 flex-1 min-w-[160px]">
          <div className="text-xs text-muted-foreground mb-1">Total a faturar</div>
          <div className="text-xl font-bold">{formatBRL(pipelineTotal)}</div>
          <span className="inline-block mt-2 rounded-full px-2 py-0.5 text-xs bg-blue-100 text-blue-800">
            em processamento
          </span>
        </div>
      </div>

      {/* Seção 4 — Filtros dos cards */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIODOS_CARDS.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={periodoCards === p.key ? "default" : "outline"}
            style={periodoCards === p.key ? { backgroundColor: "#1A6B3A", borderColor: "#1A6B3A" } : undefined}
            onClick={() => {
              setPeriodoCards(p.key);
              if (p.key !== "custom") {
                setCustomCardInicio("");
                setCustomCardFim("");
              }
            }}
          >
            {p.label}
          </Button>
        ))}
        {periodoCards === "custom" && (
          <div className="flex items-center gap-2 ml-1">
            <Input
              type="date"
              value={customCardInicio}
              onChange={(e) => setCustomCardInicio(e.target.value)}
              className="w-36 h-8 text-xs"
            />
            <span className="text-xs text-muted-foreground">até</span>
            <Input
              type="date"
              value={customCardFim}
              onChange={(e) => setCustomCardFim(e.target.value)}
              className="w-36 h-8 text-xs"
            />
          </div>
        )}
      </div>

      {/* Seção 4 — KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {(
          [
            { key: "recebidos" as DrillCardKey, label: "Pedidos recebidos", value: kpis.recebidos, bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-800", textBig: "text-orange-900" },
            { key: "agFaturamento" as DrillCardKey, label: "Ag. Faturamento", value: kpis.agFaturamento, bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-800", textBig: "text-blue-900" },
            { key: "semEstoque" as DrillCardKey, label: "Pedidos sem estoque", value: kpis.semEstoque, bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-800", textBig: "text-yellow-900" },
            { key: "faturado" as DrillCardKey, label: "Faturado", value: kpis.faturado, bg: "bg-green-50", border: "border-green-200", text: "text-green-800", textBig: "text-green-900" },
            { key: "problemas" as DrillCardKey, label: "Problemas", value: kpis.problemas, bg: "bg-red-50", border: "border-red-200", text: "text-red-800", textBig: "text-red-900" },
          ]
        ).map(({ key, label, value, bg, border, text, textBig }) => (
          <button
            key={key}
            type="button"
            onClick={() => handleCardClick(key)}
            className={`rounded-lg border p-4 text-left transition-all hover:shadow-md focus:outline-none ${bg} ${border} ${cardAberto === key ? "ring-2 ring-offset-1 ring-current shadow-md" : ""}`}
          >
            <div className={`text-sm font-medium ${text}`}>{label}</div>
            <div className={`text-3xl font-bold mt-1 ${textBig}`}>{value}</div>
          </button>
        ))}
      </div>

      {/* Drill-down dos cards */}
      {cardAberto && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">
              {DRILL_CARD_LABEL[cardAberto]}
              {drillLoading ? " — carregando…" : ` — ${drillPedidos.length} pedido(s)`}
            </h3>
            <Button size="sm" variant="ghost" onClick={() => { setCardAberto(null); setDrillPedidos([]); }}>
              Fechar
            </Button>
          </div>
          <div className="rounded-md border overflow-x-auto">
            {drillLoading ? (
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : drillPedidos.length === 0 ? (
              <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                Nenhum pedido neste período
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">#</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drillPedidos.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono font-semibold text-sm">#{p.numero_pedido}</TableCell>
                      <TableCell className="text-sm">{formatDate(p.data_pedido)}</TableCell>
                      <TableCell className="text-sm font-medium">{p.razao_social}</TableCell>
                      <TableCell className="text-sm">{drillProfiles[p.vendedor_id] ?? "—"}</TableCell>
                      <TableCell className="text-right font-bold text-sm text-green-700">{formatBRL(p.total)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[p.status] ?? "bg-gray-100 text-gray-800 border-gray-300"}`}>
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      )}

      {/* Seção 5 — Entrada por marca */}
      {Object.keys(entradaMarca).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Entrada por marca</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6 items-center">
              {/* Donut fixo 200x200 */}
              <div className="relative shrink-0" style={{ width: 200, height: 200 }}>
                <svg width="200" height="200" style={{ display: "block" }}>
                  <circle cx="100" cy="100" r="70" fill="none" stroke="#e5e7eb" strokeWidth="38" />
                  {donutSlices.map(({ marca, dash, offset }) => (
                    <circle
                      key={marca}
                      cx="100" cy="100" r="70"
                      fill="none"
                      stroke={MARCA_CORES[marca] ?? "#888780"}
                      strokeWidth="38"
                      strokeDasharray={`${dash} ${donutCircumference - dash}`}
                      strokeDashoffset={offset}
                      transform="rotate(-90 100 100)"
                    />
                  ))}
                </svg>
                {/* Centro: Total + valor */}
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
                >
                  <span className="text-xs text-muted-foreground leading-tight">Total</span>
                  <span className="text-sm font-semibold leading-tight">{formatBRL(totalGeralMarca)}</span>
                </div>
              </div>

              {/* Legenda compacta à direita */}
              <div className="flex flex-col flex-1" style={{ gap: 4 }}>
                {donutSlices.map(({ marca, valor, pct }, i) => (
                  <div
                    key={marca}
                    className="flex items-center gap-2 text-sm"
                    style={{
                      paddingBottom: 4,
                      borderBottom: i < donutSlices.length - 1 ? "0.5px solid #e5e7eb" : undefined,
                    }}
                  >
                    <span
                      className="shrink-0"
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        backgroundColor: MARCA_CORES[marca] ?? "#888780",
                      }}
                    />
                    <span className="flex-1 min-w-0 truncate">{marca}</span>
                    <span
                      className="text-muted-foreground shrink-0 tabular-nums"
                      style={{ width: 44, textAlign: "right" }}
                    >
                      {(pct * 100).toFixed(1)}%
                    </span>
                    <span
                      className="shrink-0 tabular-nums"
                      style={{ fontWeight: 500, width: 88, textAlign: "right" }}
                    >
                      {formatBRL(valor)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Seção 6 — Faturamento mensal */}
      <div className="grid gap-4">
        {/* Faturamento mensal — gráfico de barras div+Tailwind */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Faturamento mensal (últimos 6 meses)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between gap-2 h-48">
              {fatMensal.map((m, idx) => (
                <div key={m.mes} className="flex flex-col items-center flex-1 h-full justify-end">
                  <span className="text-xs font-medium mb-1 text-center leading-tight">
                    {formatBRL(m.valor)}
                  </span>
                  <div
                    className="w-full rounded-t transition-all"
                    style={{
                      height: `${(m.valor / maxFatMensal) * 100}%`,
                      backgroundColor: idx === fatMensal.length - 1 ? "#1A6B3A" : "#A7C7B7",
                      minHeight: m.valor > 0 ? "4px" : "0px",
                    }}
                  />
                  <span className="text-xs text-muted-foreground mt-1">{m.mes}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Seção 7 — Rankings */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Ranking vendedores */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ranking de vendedores</CardTitle>
          </CardHeader>
          <CardContent>
            {ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum dado no período</p>
            ) : (
              <div className="max-h-[600px] overflow-y-auto space-y-0 divide-y">
                {ranking.map((r, idx) => {
                  const pct = r.metaMes && r.metaMes > 0
                    ? Math.min((r.faturamento / r.metaMes) * 100, 100)
                    : 0;
                  const metaAtingida = r.metaMes != null && r.faturamento >= r.metaMes;
                  const barColor = pct >= 70 ? "#22c55e" : "#ef4444";
                  const iniciais = r.nome.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
                  const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                  return (
                    <div key={r.vendedor_id} className="py-3 flex items-start gap-3">
                      {/* Avatar */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${avatarColor}`}>
                        {iniciais}
                      </div>
                      {/* Corpo */}
                      <div className="flex-1 min-w-0">
                        {/* Linha 1: nome + faturamento */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm leading-tight">
                            <span className="text-muted-foreground mr-1.5">{idx + 1}.</span>
                            {r.nome}
                          </span>
                          <span className="text-sm font-bold text-green-700 shrink-0">{formatBRL(r.faturamento)}</span>
                        </div>
                        {/* Linha 2: pedidos + clientes ativos */}
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-muted-foreground">{r.numPedidos} pedido(s)</span>
                          <span className="text-xs text-muted-foreground">{r.clientesAtivos} cliente(s) ativo(s) no mês</span>
                        </div>
                        {/* Linha 3+: meta */}
                        {r.metaMes ? (
                          <>
                            <div className="text-xs text-muted-foreground mt-1.5">
                              Meta: {formatBRL(r.metaMes)} — Realizado: {formatBRL(r.faturamento)} · {pct.toFixed(1)}%
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mt-1">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, backgroundColor: barColor }}
                              />
                            </div>
                            {metaAtingida ? (
                              <div className="text-xs text-green-600 font-medium mt-0.5">✓ Meta atingida!</div>
                            ) : null}
                          </>
                        ) : (
                          <div className="text-xs text-muted-foreground mt-1">Meta não definida para este mês</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ranking produtos — tabs quantidade / valor */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ranking de produtos</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={tabProdutos} onValueChange={(v) => setTabProdutos(v as "quantidade" | "valor")}>
              <TabsList className="mb-3">
                <TabsTrigger value="quantidade">Por quantidade</TabsTrigger>
                <TabsTrigger value="valor">Por valor</TabsTrigger>
              </TabsList>

              <TabsContent value="quantidade">
                {topSkus.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum dado no período</p>
                ) : (
                  <div className="max-h-[500px] overflow-y-auto">
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">#</TableHead>
                            <TableHead>Código</TableHead>
                            <TableHead>Nome</TableHead>
                            <TableHead>Marca</TableHead>
                            <TableHead className="text-right">Qtd</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {topSkus.map((s, idx) => (
                            <TableRow key={s.produto_id}>
                              <TableCell className="font-bold">{idx + 1}</TableCell>
                              <TableCell className="font-mono text-sm">{s.codigo_jiva}</TableCell>
                              <TableCell className="text-sm">{s.nome}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">{s.marca}</Badge>
                              </TableCell>
                              <TableCell className="text-right text-sm font-medium">{s.quantidade}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="valor">
                {topSkusValor.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum dado no período</p>
                ) : (
                  <div className="max-h-[500px] overflow-y-auto">
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">#</TableHead>
                            <TableHead>Código</TableHead>
                            <TableHead>Nome</TableHead>
                            <TableHead>Marca</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {topSkusValor.map((s, idx) => (
                            <TableRow key={s.produto_id}>
                              <TableCell className="font-bold">{idx + 1}</TableCell>
                              <TableCell className="font-mono text-sm">{s.codigo_jiva}</TableCell>
                              <TableCell className="text-sm">{s.nome}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">{s.marca}</Badge>
                              </TableCell>
                              <TableCell className="text-right text-sm font-medium">{formatBRL(s.valor)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Seção 3 — Campanha Ativa */}
      {campanhaAtiva && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            {/* Área superior */}
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Esquerda: info da campanha */}
              <div className="flex-1 space-y-2">
                <h3 className="text-xl font-bold">{campanhaAtiva.nome}</h3>
                {campanhaAtiva.descricao && (
                  <p className="text-sm text-muted-foreground">{campanhaAtiva.descricao}</p>
                )}
                {Array.isArray(campanhaAtiva.marcas) && campanhaAtiva.marcas.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(campanhaAtiva.marcas as string[]).map((m) => (
                      <Badge
                        key={m}
                        style={{ backgroundColor: MARCA_CORES[m] ?? "#888780", color: "#fff", border: "none" }}
                      >
                        {m}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Direita: tabela de níveis */}
              {niveisOrdenados.length > 0 && (
                <div className="flex-1 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nível</TableHead>
                        <TableHead>De</TableHead>
                        <TableHead>Até</TableHead>
                        <TableHead>Prêmio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {niveisOrdenados.map((nivel: any) => (
                        <TableRow key={nivel.id}>
                          <TableCell className="font-medium">{nivel.nome}</TableCell>
                          <TableCell>{formatBRL(nivel.valor_minimo)}</TableCell>
                          <TableCell>{nivel.valor_maximo == null ? "Sem limite" : formatBRL(nivel.valor_maximo)}</TableCell>
                          <TableCell className="text-sm">{nivel.descricao_premio}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Separador */}
            <div className="border-t" />

            {/* Área inferior: progresso */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Meta: {formatBRL(metaTotalCampanha)} → Entrada: {formatBRL(entradaCampanha)} · {campanhaPct.toFixed(1)}% da meta
                </span>
                <span className="text-muted-foreground">{campanhaDiasRestantes} dias restantes</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{ width: `${campanhaPct}%`, backgroundColor: "#1A6B3A" }}
                />
              </div>
            </div>

            {/* Desempenho por vendedor */}
            {rankingCampanha.length > 0 && (
              <>
                <div className="border-t" />
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                    Desempenho por vendedor
                  </p>
                  <div>
                    {rankingCampanha.map((r, idx) => {
                      const diasRestantes = campanhaTotalDias - campanhaDiasPassados;
                      const metaVendedor = r.metaVendedor;
                      const fatCampanha = r.fatCampanha;
                      const pctAtingimento = metaVendedor && metaVendedor > 0
                        ? Math.min((fatCampanha / metaVendedor) * 100, 100)
                        : 0;
                      const pctEsperado = campanhaTotalDias > 0
                        ? (campanhaDiasPassados / campanhaTotalDias) * 100
                        : 0;
                      const ritmoNecessario = metaVendedor && campanhaTotalDias > 0
                        ? metaVendedor / campanhaTotalDias
                        : null;
                      const ritmoAtual = campanhaDiasPassados > 0
                        ? fatCampanha / campanhaDiasPassados
                        : 0;
                      const status = !metaVendedor ? "sem_meta"
                        : ritmoNecessario !== null && ritmoAtual >= ritmoNecessario ? "verde"
                        : ritmoNecessario !== null && ritmoAtual >= ritmoNecessario * 0.9 ? "amarelo"
                        : "vermelho";
                      const statusLabel = status === "verde" ? "Em linha"
                        : status === "amarelo" ? "Próximo"
                        : status === "vermelho" ? "Abaixo"
                        : "Sem meta";
                      const statusBadgeClass = status === "verde" ? "bg-green-100 text-green-800"
                        : status === "amarelo" ? "bg-yellow-100 text-yellow-800"
                        : status === "vermelho" ? "bg-red-100 text-red-800"
                        : "bg-gray-100 text-gray-600";
                      const avatarClass = status === "verde" ? "bg-green-50 text-green-800"
                        : status === "amarelo" ? "bg-yellow-50 text-yellow-800"
                        : status === "vermelho" ? "bg-red-50 text-red-800"
                        : "bg-muted text-muted-foreground";
                      const barColor = status === "verde" ? "#22c55e"
                        : status === "amarelo" ? "#eab308"
                        : status === "vermelho" ? "#ef4444"
                        : "#d1d5db";
                      const metaAtingida = metaVendedor != null && fatCampanha >= metaVendedor;
                      const necessarioPorDia = metaVendedor != null && !metaAtingida && diasRestantes > 0
                        ? (metaVendedor - fatCampanha) / diasRestantes
                        : null;
                      const diffPct = pctAtingimento - pctEsperado;
                      const iniciais = r.nome.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
                      const expandido = vendedorExpandido === r.vendedor_id;

                      return (
                        <div
                          key={r.vendedor_id}
                          className={idx < rankingCampanha.length - 1 ? "border-b" : ""}
                        >
                          {/* Linha resumida — clicável */}
                          <button
                            type="button"
                            className="w-full flex items-center gap-2 py-3 text-left"
                            onClick={() => setVendedorExpandido(expandido ? null : r.vendedor_id)}
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${avatarClass}`}>
                              {iniciais}
                            </div>
                            <span className="flex-1 font-medium text-sm">{r.nome}</span>
                            {/* Mini barra de progresso */}
                            <div className="shrink-0 rounded-full bg-muted overflow-hidden" style={{ width: 80, height: 4 }}>
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pctAtingimento}%`, backgroundColor: barColor }}
                              />
                            </div>
                            {/* Percentual */}
                            <span className="text-xs tabular-nums text-right shrink-0" style={{ width: 36 }}>
                              {pctAtingimento.toFixed(0)}%
                            </span>
                            {/* Badge status */}
                            <span className={`text-xs rounded-full px-2 py-0.5 font-medium shrink-0 ${statusBadgeClass}`}>
                              {statusLabel}
                            </span>
                            {/* Badge nível */}
                            {r.nivelExibido && (
                              <Badge className={`${nivelBadgeClass(r.nivelExibido)} text-xs shrink-0`}>{r.nivelExibido}</Badge>
                            )}
                            <ChevronDown
                              className="h-4 w-4 text-muted-foreground shrink-0 transition-transform"
                              style={{ transform: expandido ? "rotate(180deg)" : "rotate(0deg)" }}
                            />
                          </button>

                          {/* Detalhe expandido */}
                          {expandido && (
                            <div className="pb-4 space-y-3">
                              {/* 4 metric cards */}
                              <div className="grid grid-cols-4 gap-2">
                                <div className="bg-muted rounded-md p-3">
                                  <div className="text-xs text-muted-foreground mb-1">Meta</div>
                                  <div className="text-sm font-medium">
                                    {metaVendedor ? formatBRL(metaVendedor) : "Sem meta"}
                                  </div>
                                </div>
                                <div className="bg-muted rounded-md p-3">
                                  <div className="text-xs text-muted-foreground mb-1">Realizado</div>
                                  <div className={`text-sm font-medium ${status === "verde" ? "text-green-600" : status === "vermelho" ? "text-red-600" : ""}`}>
                                    {formatBRL(fatCampanha)}
                                  </div>
                                </div>
                                <div className="bg-muted rounded-md p-3">
                                  <div className="text-xs text-muted-foreground mb-1">Meta/dia necessária</div>
                                  <div className="text-sm font-medium">
                                    {metaVendedor && campanhaTotalDias > 0
                                      ? `${formatBRL(metaVendedor / campanhaTotalDias)}/dia`
                                      : "—"}
                                  </div>
                                </div>
                                <div className="bg-muted rounded-md p-3">
                                  <div className="text-xs text-muted-foreground mb-1">Nec. p/ fechar</div>
                                  <div className={`text-sm font-medium ${metaAtingida ? "text-green-600" : ""}`}>
                                    {metaAtingida
                                      ? "Meta atingida!"
                                      : necessarioPorDia != null
                                      ? `${formatBRL(necessarioPorDia)}/dia`
                                      : "—"}
                                  </div>
                                </div>
                              </div>

                              {/* Barra de progresso full width */}
                              {metaVendedor != null && (
                                <div>
                                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all"
                                      style={{ width: `${pctAtingimento}%`, backgroundColor: barColor }}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                                    <span>{pctAtingimento.toFixed(1)}%</span>
                                    <span>
                                      Deveria estar em {Math.round(campanhaDiasPassados / Math.max(campanhaTotalDias, 1) * 100)}%
                                      {" · "}{diffPct >= 0 ? "+" : ""}{diffPct.toFixed(1)}% {diffPct >= 0 ? "acima" : "abaixo"}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  );
}
