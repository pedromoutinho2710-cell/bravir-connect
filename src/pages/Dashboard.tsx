import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";

type Periodo = "hoje" | "semana" | "mes" | "ano";

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

type KPIs = {
  preFaturado: number;
  lancados: number;
  aguardandoFaturamento: number;
  faturado: number;
  problemas: number;
};

type RankingVendedor = {
  vendedor_id: string;
  nome: string;
  faturamento: number;
  numPedidos: number;
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

function nivelMaior(a: string | null, b: string | null): string | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return (NIVEL_ORDEM[a] ?? 0) >= (NIVEL_ORDEM[b] ?? 0) ? a : b;
}

export default function Dashboard() {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [periodoKpi, setPeriodoKpi] = useState<Periodo>("mes");
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPIs>({
    preFaturado: 0,
    lancados: 0,
    aguardandoFaturamento: 0,
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

  // Filtro de período customizado
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

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
        const { dataInicio: kpiInicio, dataFim: kpiFim } = getDateRange(periodoKpi);

        const [pedidosRes, metasRes, pedidosMesRes, pipelineRes, preFatRes, lancadosRes, aguardRes, fatKpiRes, probRes, campanhaRes, ...mensaisRes] = await Promise.all([
          // Pedidos do período — base para ranking e top SKUs
          supabase
            .from("pedidos")
            .select("id, vendedor_id, status, data_pedido, itens_pedido(total_item, produto_id, quantidade)")
            .gte("data_pedido", effectiveInicio)
            .lte("data_pedido", effectiveFim)
            .not("status", "in", '("rascunho")'),
          // Meta total da empresa do mês atual
          supabase
            .from("metas")
            .select("valor_meta_reais")
            .eq("mes", mesAtual)
            .eq("ano", anoAtual),
          // Faturamento do mês atual para cálculo de % da meta
          supabase
            .from("pedidos")
            .select("id, itens_pedido(total_item)")
            .gte("data_pedido", mesInicio)
            .lte("data_pedido", mesFim)
            .not("status", "in", '("rascunho","cancelado")'),
          // Pedidos em pipeline para previsão do mês
          supabase
            .from("pedidos")
            .select("id, itens_pedido(total_item)")
            .in("status", ["pendente_sankhya", "em_faturamento"]),
          // KPI: Pré Faturado
          supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "pendente_sankhya").gte("data_pedido", kpiInicio).lte("data_pedido", kpiFim),
          // KPI: Pedidos Lançados
          supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "no_sankhya").gte("data_pedido", kpiInicio).lte("data_pedido", kpiFim),
          // KPI: Aguardando Faturamento
          supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "parcialmente_faturado").gte("data_pedido", kpiInicio).lte("data_pedido", kpiFim),
          // KPI: Faturado
          supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "faturado").gte("data_pedido", kpiInicio).lte("data_pedido", kpiFim),
          // KPI: Problemas
          supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "com_problema").gte("data_pedido", kpiInicio).lte("data_pedido", kpiFim),
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
          preFaturado: preFatRes.count ?? 0,
          lancados: lancadosRes.count ?? 0,
          aguardandoFaturamento: aguardRes.count ?? 0,
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

        if (campanha) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: pedidosCampanha } = await (supabase as any)
            .from("pedidos")
            .select("id, itens_pedido(total_item)")
            .gte("data_pedido", campanha.data_inicio)
            .lte("data_pedido", campanha.data_fim)
            .not("status", "in", '("cancelado","devolvido","rascunho")');

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const entrada = ((pedidosCampanha ?? []) as any[]).reduce(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (s: number, p: any) => s + (p.itens_pedido ?? []).reduce((si: number, i: any) => si + Number(i.total_item), 0),
            0,
          );
          setEntradaCampanha(entrada);
        } else {
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

        const vendedorIds = Object.keys(vendedorAgg);
        const profileMap: Record<string, string> = {};
        if (vendedorIds.length > 0) {
          const { data: profilesData } = await supabase
            .from("profiles")
            .select("id, full_name, email")
            .in("id", vendedorIds);
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

          const vendedorFatCamp: Record<string, number> = {};
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((pedCampDetalhe ?? []) as any[]).forEach((p: any) => {
            if (!p.vendedor_id) return;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (p.itens_pedido ?? []).forEach((item: any) => {
              const marca = item.produto?.marca as string | undefined;
              const prodId = item.produto_id as string | undefined;
              if ((marca && marcasCampanha.has(marca)) || (prodId && produtosCampanha.has(prodId))) {
                if (!vendedorFatCamp[p.vendedor_id]) vendedorFatCamp[p.vendedor_id] = 0;
                vendedorFatCamp[p.vendedor_id] += Number(item.total_item);
              }
            });
          });

          // Metas individuais por vendedor
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: metasVendedorData } = await (supabase as any)
            .from("campanha_metas_vendedor")
            .select("vendedor_id, meta_valor, categoria")
            .eq("campanha_id", campanha.id);

          const metasVendedorMap: Record<string, { meta: number; categoria: string | null }> = {};
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((metasVendedorData ?? []) as any[]).forEach((m: any) => {
            metasVendedorMap[m.vendedor_id] = { meta: Number(m.meta_valor), categoria: m.categoria ?? null };
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const niveisCamp = [...((campanha.campanha_niveis ?? []) as any[])].sort(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (a: any, b: any) => Number(b.valor_minimo) - Number(a.valor_minimo)
          );

          const rankingCampList = rankingList
            .map((v) => {
              const fat = vendedorFatCamp[v.vendedor_id] ?? 0;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const nivel = (niveisCamp.find((n: any) => fat >= Number(n.valor_minimo)) as any)?.nome ?? null;
              const metaVendedor = metasVendedorMap[v.vendedor_id]?.meta ?? null;
              const categoriaInicial = metasVendedorMap[v.vendedor_id]?.categoria ?? null;
              return { vendedor_id: v.vendedor_id, nome: v.nome, fatCampanha: fat, nivel, metaVendedor, categoriaInicial, nivelExibido: nivelMaior(categoriaInicial, nivel) };
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
  }, [periodo, periodoKpi, dataInicio, dataFim]);

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
  const metaTotalCampanha = rankingCampanha.reduce((s, r) => s + (r.metaVendedor ?? 0), 0);
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

  // Pipeline card bar scale
  const maxKpi = Math.max(kpis.preFaturado, kpis.lancados, kpis.aguardandoFaturamento, kpis.problemas, 1);

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
                setPeriodoKpi(key);
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
                      const barColor = status === "verde" ? "#22c55e"
                        : status === "amarelo" ? "#eab308"
                        : status === "vermelho" ? "#ef4444"
                        : "#d1d5db";
                      const metaPorDia = metaVendedor && campanhaTotalDias > 0
                        ? metaVendedor / campanhaTotalDias
                        : null;
                      const metaAtingida = metaVendedor != null && fatCampanha >= metaVendedor;
                      const necessarioPorDia = metaVendedor != null && diasRestantes > 0
                        ? (metaVendedor - fatCampanha) / diasRestantes
                        : null;
                      const diffPct = pctAtingimento - pctEsperado;
                      const iniciais = r.nome.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();

                      return (
                        <div
                          key={r.vendedor_id}
                          className={`py-4 ${idx < rankingCampanha.length - 1 ? "border-b" : ""}`}
                        >
                          {/* Header */}
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-full bg-[#1A6B3A] text-white flex items-center justify-center text-xs font-bold shrink-0">
                              {iniciais}
                            </div>
                            <span className="flex-1 font-medium text-sm">{r.nome}</span>
                            <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${statusBadgeClass}`}>
                              {statusLabel}
                            </span>
                            {r.nivelExibido && (
                              <Badge className={`${nivelBadgeClass(r.nivelExibido)} text-xs`}>{r.nivelExibido}</Badge>
                            )}
                          </div>

                          {/* 4 metric cards */}
                          <div className="grid grid-cols-4 gap-2 mb-3">
                            <div className="rounded-md border p-2 text-center">
                              <div className="text-xs text-muted-foreground mb-1">Meta</div>
                              <div className="text-xs font-medium">
                                {metaVendedor ? formatBRL(metaVendedor) : "Sem meta"}
                              </div>
                            </div>
                            <div className="rounded-md border p-2 text-center">
                              <div className="text-xs text-muted-foreground mb-1">Realizado</div>
                              <div className={`text-xs font-medium ${status === "verde" ? "text-green-600" : status === "vermelho" ? "text-red-600" : ""}`}>
                                {formatBRL(fatCampanha)}
                              </div>
                            </div>
                            <div className="rounded-md border p-2 text-center">
                              <div className="text-xs text-muted-foreground mb-1">Meta/dia</div>
                              <div className="text-xs font-medium">
                                {metaPorDia != null ? `${formatBRL(metaPorDia)}/dia` : "—"}
                              </div>
                            </div>
                            <div className="rounded-md border p-2 text-center">
                              <div className="text-xs text-muted-foreground mb-1">Nec. p/ fechar</div>
                              <div className={`text-xs font-medium ${metaAtingida ? "text-green-600" : ""}`}>
                                {metaAtingida
                                  ? "Meta atingida!"
                                  : necessarioPorDia != null
                                  ? `${formatBRL(necessarioPorDia)}/dia`
                                  : "—"}
                              </div>
                            </div>
                          </div>

                          {/* Progress bar */}
                          {metaVendedor != null && (
                            <div>
                              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                                <span>{pctAtingimento.toFixed(1)}%</span>
                                <span>
                                  Deveria estar em {pctEsperado.toFixed(1)}%{" "}
                                  · {diffPct >= 0 ? "+" : ""}{diffPct.toFixed(1)}% {diffPct >= 0 ? "acima" : "abaixo"}
                                </span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-muted">
                                <div
                                  className="h-2 rounded-full transition-all"
                                  style={{ width: `${pctAtingimento}%`, backgroundColor: barColor }}
                                />
                              </div>
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

      {/* Seção 4 — KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border p-4 bg-yellow-50 border-yellow-300">
          <div className="text-sm font-medium text-yellow-800">Pré Faturado</div>
          <div className="text-3xl font-bold mt-1 text-yellow-900">{kpis.preFaturado}</div>
        </div>
        <div className="rounded-lg border p-4 bg-purple-50 border-purple-300">
          <div className="text-sm font-medium text-purple-800">No Sankhya</div>
          <div className="text-3xl font-bold mt-1 text-purple-900">{kpis.lancados}</div>
        </div>
        <div className="rounded-lg border p-4 bg-blue-50 border-blue-300">
          <div className="text-sm font-medium text-blue-800">Aguardando Faturamento</div>
          <div className="text-3xl font-bold mt-1 text-blue-900">{kpis.aguardandoFaturamento}</div>
        </div>
        <div className="rounded-lg border p-4 bg-red-50 border-red-300">
          <div className="text-sm font-medium text-red-800">Com Problema</div>
          <div className="text-3xl font-bold mt-1 text-red-900">{kpis.problemas}</div>
        </div>
      </div>

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

      {/* Seção 6 — Faturamento mensal + Pipeline */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Faturamento mensal — gráfico de barras div+Tailwind */}
        <Card className="lg:col-span-2">
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

        {/* Pipeline por status */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pipeline por status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { label: "Pré Faturado", value: kpis.preFaturado, color: "#CA8A04" },
                { label: "No Sankhya", value: kpis.lancados, color: "#9333EA" },
                { label: "Aguardando Fat.", value: kpis.aguardandoFaturamento, color: "#2563EB" },
                { label: "Com Problema", value: kpis.problemas, color: "#DC2626" },
              ].map(({ label, value, color }) => (
                <div key={label} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${(value / maxKpi) * 100}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
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
              <div className="max-h-[500px] overflow-y-auto">
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead className="text-right">Faturamento</TableHead>
                        <TableHead className="text-right">Pedidos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ranking.map((r, idx) => (
                        <TableRow key={r.vendedor_id}>
                          <TableCell className="font-bold">{idx + 1}</TableCell>
                          <TableCell className="text-sm">{r.nome}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{formatBRL(r.faturamento)}</TableCell>
                          <TableCell className="text-right text-sm">{r.numPedidos}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
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
                              <TableCell className="text-sm max-w-[100px] truncate" title={s.nome}>{s.nome}</TableCell>
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
                              <TableCell className="text-sm max-w-[100px] truncate" title={s.nome}>{s.nome}</TableCell>
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
    </div>
  );
}
