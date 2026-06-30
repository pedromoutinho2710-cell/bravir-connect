import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDate, MESES_ABREV } from "@/lib/format";
import { STATUS_LABEL, STATUS_COLOR } from "@/lib/status";
import { exportDashboardExcel } from "@/lib/exportDashboardExcel";
import { exportarBaseDadosCompleta } from "@/lib/excel";
import { fetchRankingVendedores } from "@/lib/ranking";
import { corMarca } from "@/lib/marcas";
import { Download } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import CampanhaDashboardCard, { type CampanhaDashboardView } from "@/components/campanha/CampanhaDashboardCard";

type Periodo = "hoje" | "semana" | "mes" | "mes_anterior" | "ano";

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
    return { dataInicio: fmt(monday), dataFim: fmt(today) };
  }
  if (periodo === "mes") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { dataInicio: fmt(start), dataFim: fmt(today) };
  }
  if (periodo === "mes_anterior") {
    const ano = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
    const mes = today.getMonth() === 0 ? 11 : today.getMonth() - 1;
    const start = new Date(ano, mes, 1);
    const end = new Date(ano, mes + 1, 0);
    return { dataInicio: fmt(start), dataFim: fmt(end) };
  }
  // ano
  const start = new Date(today.getFullYear(), 0, 1);
  return { dataInicio: fmt(start), dataFim: fmt(today) };
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
  clientesCarteira: number;
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

type RankingCliente = {
  cliente_id: string;
  razao_social: string;
  vendedor_id: string | null;
  vendedor_nome: string;
  total: number;
  numPedidos: number;
};

type FiltroReativo = {
  tipo: "vendedor" | "marca" | "produto" | null;
  id: string | null;
  label: string | null;
};

// Benefício ativo do trade (campanhas.categoria = 'beneficio') — exibido em card próprio.
type Beneficio = {
  id: string;
  nome: string;
  descricao: string | null;
  tipo: string | null;
  valor: number | null;
  data_inicio: string | null;
  data_fim: string | null;
};

const BENEFICIO_TIPO_LABEL: Record<string, string> = {
  desconto: "Desconto",
  bonificacao: "Bonificação",
  outro: "Outro",
};

const BENEFICIO_TIPO_COLOR: Record<string, string> = {
  desconto: "bg-blue-100 text-blue-800 border-blue-300",
  bonificacao: "bg-green-100 text-green-800 border-green-300",
  outro: "bg-gray-100 text-gray-800 border-gray-300",
};

const PERIODOS: { key: Periodo; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês" },
  { key: "mes_anterior", label: "Mês anterior" },
  { key: "ano", label: "Ano" },
];

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
  const { role } = useAuth();
  const podeExportarBase = role === "admin" || role === "gestora";
  const [exportandoBase, setExportandoBase] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPIs>({
    recebidos: 0,
    agFaturamento: 0,
    semEstoque: 0,
    faturado: 0,
    problemas: 0,
  });
  const [metaTotal, setMetaTotal] = useState(0);
  const [metaFaturamento, setMetaFaturamento] = useState(0);
  const [fatMesAtual, setFatMesAtual] = useState(0);
  const [fatFaturadoPeriodo, setFatFaturadoPeriodo] = useState(0);
  const [pipelineTotal, setPipelineTotal] = useState(0);
  const [ranking, setRanking] = useState<RankingVendedor[]>([]);
  const [topSkus, setTopSkus] = useState<RankingSku[]>([]);
  const [tabProdutos, setTabProdutos] = useState<"quantidade" | "valor">("quantidade");
  const [topSkusValor, setTopSkusValor] = useState<RankingSkuValor[]>([]);
  // Todas as campanhas ativas (categoria='campanha') — pode haver várias simultâneas.
  const [campanhasView, setCampanhasView] = useState<CampanhaDashboardView[]>([]);
  // Benefícios ativos (categoria='beneficio').
  const [beneficios, setBeneficios] = useState<Beneficio[]>([]);
  const [entradaMarca, setEntradaMarca] = useState<Record<string, number>>({});
  const [fatMensal, setFatMensal] = useState<{ mes: string; valor: number }[]>([]);

  // Ranking de clientes reativo
  const [rankingClientes, setRankingClientes] = useState<RankingCliente[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [filtroReativo, setFiltroReativo] = useState<FiltroReativo>({ tipo: null, id: null, label: null });

  // Filtro de período customizado
  const initialRange = getDateRange("mes");
  const [dataInicio, setDataInicio] = useState(initialRange.dataInicio);
  const [dataFim, setDataFim] = useState(initialRange.dataFim);
  // Valor efetivo aplicado (separado do valor visual digitado nos inputs)
  const [dataInicioEfetiva, setDataInicioEfetiva] = useState("");
  const [dataFimEfetiva, setDataFimEfetiva] = useState("");
  const [mostrarPersonalizar, setMostrarPersonalizar] = useState(false);
  // Mês/ano de referência da meta exibida (derivado do início do período filtrado)
  const [mesRef, setMesRef] = useState(0);
  const [anoRef, setAnoRef] = useState(0);

  // Drill-down dos cards
  const [cardAberto, setCardAberto] = useState<DrillCardKey | null>(null);
  const [drillPedidos, setDrillPedidos] = useState<PedidoDrillRow[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillProfiles, setDrillProfiles] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);

    // Determine effective date range
    const { dataInicio: periodoInicio, dataFim: periodoFim } = getDateRange(periodo);
    const effectiveInicio = (dataInicioEfetiva && dataFimEfetiva) ? dataInicioEfetiva : periodoInicio;
    const effectiveFim = (dataInicioEfetiva && dataFimEfetiva) ? dataFimEfetiva : periodoFim;

    // Mês/ano derivados do período filtrado (T12:00:00 evita o off-by-one de timezone)
    const periodoDate = new Date(effectiveInicio + "T12:00:00");
    const mesFiltro = periodoDate.getMonth() + 1;
    const anoFiltro = periodoDate.getFullYear();
    setMesRef(mesFiltro);
    setAnoRef(anoFiltro);

    const now = new Date();
    const anoAtual = now.getFullYear();
    const pad = (n: number) => String(n).padStart(2, "0");

    // Build array of last 6 months (oldest first, current month last)
    const meses6 = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(anoAtual, now.getMonth() - (5 - i), 1);
      const ano = d.getFullYear();
      const mes = d.getMonth(); // 0-based
      const inicio = `${ano}-${pad(mes + 1)}-01`;
      const fim = new Date(ano, mes + 1, 0).toISOString().slice(0, 10);
      return { label: MESES_ABREV[mes], inicio, fim, mes: mes + 1, ano };
    });

    // Para o filtro "hoje" (mesmo dia), incluir todo o horário do dia no limite superior
    const mesmoDia = effectiveInicio === effectiveFim;
    const kpiInicio = effectiveInicio;
    const kpiFim = mesmoDia ? `${effectiveFim}T23:59:59` : effectiveFim;

    (async () => {
      try {
        const [pedidosRes, metasGlobalRes, metasVendedorRes, pedidosMesRes, pipelineRes, preFatRes, lancadosRes, aguardRes, fatKpiRes, probRes, campanhaRes, beneficiosRes, mensaisRes, fatPeriodoRes, metasVisaoMacroRes] = await Promise.all([
          // Pedidos do período — base para ranking e top SKUs
          supabase
            .from("pedidos")
            .select("id, vendedor_id, status, data_pedido, itens_pedido(total_item, produto_id, quantidade)")
            .gte("data_pedido", effectiveInicio)
            .lte("data_pedido", effectiveFim)
            .not("status", "in", '("rascunho")'),
          // Meta global da empresa do mês do período filtrado (card "Meta de entrada")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("metas_globais")
            .select("valor_meta_reais")
            .eq("mes", mesFiltro)
            .eq("ano", anoFiltro)
            .maybeSingle(),
          // Metas individuais por vendedor (ranking individual)
          supabase
            .from("metas")
            .select("vendedor_id, valor_meta_reais")
            .eq("mes", mesFiltro)
            .eq("ano", anoFiltro),
          // Entrada de pedidos do período para cálculo de % da meta + clientes ativos por vendedor
          supabase
            .from("pedidos")
            .select("id, vendedor_id, cliente_id, status, itens_pedido(total_item)")
            .gte("data_pedido", kpiInicio)
            .lte("data_pedido", kpiFim)
            .not("status", "in", '("rascunho","cancelado","devolvido")'),
          // Pedidos em pipeline (a faturar) dentro do período
          supabase
            .from("pedidos")
            .select("id, itens_pedido(total_item)")
            .in("status", ["pendente_sankhya", "em_faturamento"])
            .gte("data_pedido", kpiInicio)
            .lte("data_pedido", kpiFim),
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
          // Campanhas ativas — TODAS as de categoria='campanha' (mesmo filtro do Meu Painel).
          // Sistema permite várias campanhas ativas ao mesmo tempo (sem .limit(1)).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("campanhas")
            .select("*, campanha_niveis(*)")
            .eq("ativa", true)
            .eq("categoria", "campanha")
            .order("data_fim", { ascending: true }),
          // Benefícios ativos — categoria='beneficio' (card próprio no Dashboard).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("campanhas")
            .select("id, nome, descricao, tipo, valor, data_inicio, data_fim")
            .eq("ativa", true)
            .eq("categoria", "beneficio")
            .order("data_fim", { ascending: true }),
          // Faturamento mensal — últimos 6 meses (dados reais do Sankhya)
          // TODO: adicionar faturamentos_sankhya ao types.ts
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("faturamentos_sankhya")
            .select("data_faturamento, valor_total_itens, valor_liquido")
            .gte("data_faturamento", meses6[0].inicio)
            .lte("data_faturamento", meses6[meses6.length - 1].fim)
            .eq("canal", "BRAVIR"),
          // Total faturado (Sankhya) do período — valor BRUTO (valor_total_itens),
          // incluindo devoluções (valor negativo subtrai) e SOMENTE Marcas Bravir
          // (canal "BRAVIR" = B2B; exclui Marca Própria/terceiros).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("faturamentos_sankhya")
            .select("valor_total_itens, valor_liquido")
            .gte("data_faturamento", effectiveInicio)
            .lte("data_faturamento", effectiveFim)
            .eq("canal", "BRAVIR"),
          // Meta de faturamento real (Visão Macro) — soma de B2B + Marca Própria + Online
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("metas_visao_macro")
            .select("meta_b2b, meta_marca_propria, meta_online")
            .eq("mes", mesFiltro)
            .eq("ano", anoFiltro)
            .maybeSingle(),
        ]);

        // Total faturado do período (soma do Sankhya). Usa o bruto (valor_total_itens);
        // cai para o líquido em registros antigos ainda sem bruto (pré re-importação).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fatFaturadoSum = ((fatPeriodoRes.data ?? []) as any[]).reduce(
          (s: number, r: any) => s + Number(r.valor_total_itens ?? r.valor_liquido ?? 0),
          0,
        );
        setFatFaturadoPeriodo(fatFaturadoSum);

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

        // Meta total do mês (entrada de pedidos — metas_globais)
        const metaSum = metasGlobalRes.data ? Number(metasGlobalRes.data.valor_meta_reais) : 0;
        setMetaTotal(metaSum);

        // Meta de faturamento real (Visão Macro) — soma B2B + Marca Própria + Online
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mvmData = (metasVisaoMacroRes as any).data;
        const metaFatSum = mvmData
          ? Number(mvmData.meta_b2b ?? 0) + Number(mvmData.meta_marca_propria ?? 0) + Number(mvmData.meta_online ?? 0)
          : 0;
        setMetaFaturamento(metaFatSum);

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
        (metasVendedorRes.data ?? []).forEach((m) => {
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

        // Clientes na carteira por vendedor (status = 'ativo')
        const clientesCarteiraPorVendedor: Record<string, number> = {};
        {
          const { data: clientesCarteiraData } = await supabase
            .from("clientes")
            .select("vendedor_id")
            .eq("status", "ativo");
          (clientesCarteiraData ?? []).forEach((c) => {
            if (!c.vendedor_id) return;
            clientesCarteiraPorVendedor[c.vendedor_id] = (clientesCarteiraPorVendedor[c.vendedor_id] ?? 0) + 1;
          });
        }

        // profileMap — usado também pela seção de ranking por campanha (abaixo)
        const profileMap: Record<string, string> = {};
        {
          const { data: profilesData } = await supabase
            .from("profiles")
            .select("id, full_name, email");
          (profilesData ?? []).forEach((p) => {
            profileMap[p.id] = p.full_name || p.email;
          });
        }

        // Ranking vendedores — fonte ÚNICA compartilhada com o Painel do Vendedor
        // (src/lib/ranking.ts), para que as posições sejam idênticas nos dois.
        // Aqui só enriquecemos a base ordenada com colunas exclusivas do admin.
        const baseRanking = await fetchRankingVendedores(effectiveInicio, effectiveFim);
        const rankingList: RankingVendedor[] = baseRanking.map((r) => ({
          vendedor_id: r.vendedor_id,
          nome: r.nome,
          faturamento: r.faturamento,
          numPedidos: r.numPedidos,
          clientesAtivos: clientesAtivosPorVendedor[r.vendedor_id]?.size ?? 0,
          clientesCarteira: clientesCarteiraPorVendedor[r.vendedor_id] ?? 0,
          metaMes: metasPorVendedor[r.vendedor_id] ?? null,
        }));
        setRanking(rankingList);

        // ── Campanhas ativas (categoria='campanha') — pode haver várias simultâneas ──
        // Deriva-se o desempenho POR campanha (loop). Para evitar N+1, as marcas/
        // produtos e as metas de todas as campanhas saem de uma query cada (.in),
        // e os pedidos do período que cobre todas elas saem de um único select,
        // filtrado em memória por campanha.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const campanhasAtivas = (campanhaRes.data ?? []) as any[];

        if (campanhasAtivas.length === 0) {
          setCampanhasView([]);
        } else {
          const campanhaIds = campanhasAtivas.map((c) => c.id as string);

          // Marcas/produtos de cada campanha (1 query) → agrupado por campanha
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: cpData } = await (supabase as any)
            .from("campanha_produtos")
            .select("campanha_id, tipo, produto_id, marca")
            .in("campanha_id", campanhaIds);
          const marcasPorCampanha: Record<string, Set<string>> = {};
          const produtosPorCampanha: Record<string, Set<string>> = {};
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((cpData ?? []) as any[]).forEach((cp: any) => {
            if (!marcasPorCampanha[cp.campanha_id]) marcasPorCampanha[cp.campanha_id] = new Set();
            if (!produtosPorCampanha[cp.campanha_id]) produtosPorCampanha[cp.campanha_id] = new Set();
            if (cp.tipo === "marca" && cp.marca) marcasPorCampanha[cp.campanha_id].add(cp.marca as string);
            if (cp.tipo === "produto" && cp.produto_id) produtosPorCampanha[cp.campanha_id].add(cp.produto_id as string);
          });

          // Período efetivo de cada campanha = interseção do filtro do dashboard com o intervalo da campanha
          const periodos = campanhasAtivas.map((c) => {
            const ini = effectiveInicio > c.data_inicio ? effectiveInicio : c.data_inicio;
            const fim = effectiveFim < c.data_fim ? effectiveFim : c.data_fim;
            return { id: c.id as string, ini: ini as string, fim: fim as string, valido: ini <= fim };
          });
          const periodosValidos = periodos.filter((p) => p.valido);

          // Metas individuais por vendedor de TODAS as campanhas (1 query) → agrupado
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: metasCampData } = await (supabase as any)
            .from("campanha_metas_vendedor")
            .select("campanha_id, vendedor_id, meta_valor, categoria")
            .in("campanha_id", campanhaIds);
          const metasPorCampanha: Record<string, { vendedor_id: string; meta: number; categoria: string | null }[]> = {};
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((metasCampData ?? []) as any[]).forEach((m: any) => {
            if (!metasPorCampanha[m.campanha_id]) metasPorCampanha[m.campanha_id] = [];
            metasPorCampanha[m.campanha_id].push({ vendedor_id: m.vendedor_id, meta: Number(m.meta_valor), categoria: m.categoria ?? null });
          });

          // Pedidos do período que cobre todas as campanhas ativas (1 query — evita N+1)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let pedCampDetalhe: any[] = [];
          if (periodosValidos.length > 0) {
            const globalInicio = periodosValidos.reduce((min, p) => (p.ini < min ? p.ini : min), periodosValidos[0].ini);
            const globalFim = periodosValidos.reduce((max, p) => (p.fim > max ? p.fim : max), periodosValidos[0].fim);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data } = await (supabase as any)
              .from("pedidos")
              .select("vendedor_id, data_pedido, itens_pedido(total_item, produto_id, produto:produtos(marca))")
              .gte("data_pedido", globalInicio)
              .lte("data_pedido", globalFim)
              .not("status", "in", '("cancelado","devolvido","rascunho")');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pedCampDetalhe = (data ?? []) as any[];
          }

          // Garantir nomes de todos os vendedores com meta (1 query p/ os faltantes)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const allMetaVendedorIds = [...new Set(((metasCampData ?? []) as any[]).map((m: any) => m.vendedor_id as string))];
          const idsFaltantes = allMetaVendedorIds.filter((id) => !profileMap[id]);
          if (idsFaltantes.length > 0) {
            const { data: extraProfiles } = await supabase.from("profiles").select("id, full_name, email").in("id", idsFaltantes);
            (extraProfiles ?? []).forEach((p) => { profileMap[p.id] = p.full_name || p.email; });
          }

          // Monta a view (entrada + meta + ranking) de cada campanha
          const views: CampanhaDashboardView[] = campanhasAtivas.map((campanha) => {
            const periodo = periodos.find((p) => p.id === campanha.id)!;
            const marcasSet = marcasPorCampanha[campanha.id] ?? new Set<string>();
            const produtosSet = produtosPorCampanha[campanha.id] ?? new Set<string>();

            let entrada = 0;
            const vendedorFatCamp: Record<string, number> = {};
            if (periodo.valido) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              pedCampDetalhe.forEach((p: any) => {
                if (p.data_pedido < periodo.ini || p.data_pedido > periodo.fim) return;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (p.itens_pedido ?? []).forEach((item: any) => {
                  const marca = item.produto?.marca as string | undefined;
                  const prodId = item.produto_id as string | undefined;
                  if ((marca && marcasSet.has(marca)) || (prodId && produtosSet.has(prodId))) {
                    const v = Number(item.total_item);
                    entrada += v;
                    if (p.vendedor_id) vendedorFatCamp[p.vendedor_id] = (vendedorFatCamp[p.vendedor_id] ?? 0) + v;
                  }
                });
              });
            }

            const metas = metasPorCampanha[campanha.id] ?? [];
            const metaTotalCampanha = metas.reduce((s, m) => s + m.meta, 0);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const niveisCamp = [...((campanha.campanha_niveis ?? []) as any[])].sort(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (a: any, b: any) => Number(b.valor_minimo) - Number(a.valor_minimo)
            );

            const ranking = metas
              .map((m) => {
                const fat = vendedorFatCamp[m.vendedor_id] ?? 0;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const nivel = (niveisCamp.find((n: any) => fat >= Number(n.valor_minimo)) as any)?.nome ?? null;
                const nome = profileMap[m.vendedor_id] ?? m.vendedor_id;
                return {
                  vendedor_id: m.vendedor_id,
                  nome,
                  fatCampanha: fat,
                  nivel,
                  metaVendedor: m.meta,
                  categoriaInicial: m.categoria,
                  nivelExibido: nivelMaior(m.categoria, nivel),
                };
              })
              .sort((a, b) => b.fatCampanha - a.fatCampanha);

            return { campanha, entrada, metaTotalCampanha, ranking };
          });

          setCampanhasView(views);
        }

        // ── Benefícios ativos (categoria='beneficio') ──
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setBeneficios(((beneficiosRes.data ?? []) as any[]).map((b: any): Beneficio => ({
          id: b.id,
          nome: b.nome,
          descricao: b.descricao ?? null,
          tipo: b.tipo ?? null,
          valor: b.valor != null ? Number(b.valor) : null,
          data_inicio: b.data_inicio ?? null,
          data_fim: b.data_fim ?? null,
        })));

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

        // Faturamento mensal — agrupar o valor BRUTO (valor_total_itens) por mês usando
        // data_faturamento, incluindo devoluções. Cai para o líquido em meses ainda sem
        // bruto (registros antigos pré re-importação) para não zerar o histórico.
        const fatMensalArr = meses6.map((m) => ({
          mes: m.label,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          valor: ((mensaisRes.data ?? []) as any[])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((r: any) => {
              if (!r.data_faturamento) return false;
              return r.data_faturamento >= m.inicio && r.data_faturamento <= m.fim;
            })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .reduce((s: number, r: any) => s + Number(r.valor_total_itens ?? r.valor_liquido ?? 0), 0),
        }));
        setFatMensal(fatMensalArr);
      } catch {
        toast.error("Erro ao carregar dashboard");
      }
    })().finally(() => setLoading(false));
  }, [periodo, dataInicioEfetiva, dataFimEfetiva]);

  const metaPct = metaTotal > 0 ? Math.min((fatMesAtual / metaTotal) * 100, 100) : 0;
  const previsaoMes = fatMesAtual + pipelineTotal;
  const previsaoPct = metaTotal > 0 ? Math.min((previsaoMes / metaTotal) * 100, 100) : 0;

  // Fluxo de metas
  const fatFaturadoMes = fatFaturadoPeriodo;
  const entradaPct = metaTotal > 0 ? (fatMesAtual / metaTotal) * 100 : 0;
  const faturadoPct = metaFaturamento > 0 ? (fatFaturadoMes / metaFaturamento) * 100 : 0;

  const badgeColor = (pct: number) => {
    if (pct >= 80) return "bg-green-100 text-green-800";
    if (pct >= 50) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
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
    const { dataInicio: periodoInicio, dataFim: periodoFim } = getDateRange(periodo);
    const effectiveInicio = (dataInicioEfetiva && dataFimEfetiva) ? dataInicioEfetiva : periodoInicio;
    const effectiveFim = (dataInicioEfetiva && dataFimEfetiva) ? dataFimEfetiva : periodoFim;
    const mesmoDia = effectiveInicio === effectiveFim;
    const inicio = effectiveInicio;
    const fim = mesmoDia ? `${effectiveFim}T23:59:59` : effectiveFim;
    setDrillLoading(true);
    setDrillPedidos([]);

    let query = supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("pedidos") as any;

    query = query
      .select("id, numero_pedido, data_pedido, status, vendedor_id, clientes(razao_social, nome_parceiro), itens_pedido(total_item)")
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
      razao_social: (p.clientes as any)?.nome_parceiro || (p.clientes as any)?.razao_social || "—",
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

  const carregarRankingClientes = useCallback(async (filtro: FiltroReativo) => {
    setLoadingClientes(true);
    try {
      const { dataInicio: periodoInicio, dataFim: periodoFim } = getDateRange(periodo);
      const effectiveInicio = (dataInicioEfetiva && dataFimEfetiva) ? dataInicioEfetiva : periodoInicio;
      const effectiveFim = (dataInicioEfetiva && dataFimEfetiva) ? dataFimEfetiva : periodoFim;

      // Buscar pedidos do período com itens
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = supabase
        .from("pedidos")
        .select("id, cliente_id, vendedor_id, itens_pedido(total_item, produto_id, produtos(marca))")
        .gte("data_pedido", effectiveInicio)
        .lte("data_pedido", effectiveFim)
        .not("status", "in", '("rascunho","cancelado","devolvido")');

      if (filtro.tipo === "vendedor" && filtro.id) {
        query = query.eq("vendedor_id", filtro.id);
      }

      const { data: pedidosData } = await query;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pedidos = (pedidosData ?? []) as any[];

      // Agregar por cliente filtrando por marca/produto se necessário
      const clienteAgg: Record<string, { total: number; numPedidos: number; vendedor_id: string | null }> = {};

      for (const p of pedidos) {
        if (!p.cliente_id) continue;
        let totalPedido = 0;

        if (filtro.tipo === "marca" && filtro.id) {
          // Só somar itens da marca selecionada
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const item of (p.itens_pedido ?? []) as any[]) {
            if (item.produtos?.marca === filtro.id) {
              totalPedido += Number(item.total_item ?? 0);
            }
          }
          if (totalPedido === 0) continue;
        } else if (filtro.tipo === "produto" && filtro.id) {
          // Só somar itens do produto selecionado
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const item of (p.itens_pedido ?? []) as any[]) {
            if (item.produto_id === filtro.id) {
              totalPedido += Number(item.total_item ?? 0);
            }
          }
          if (totalPedido === 0) continue;
        } else {
          // Sem filtro de produto/marca — somar tudo
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          totalPedido = (p.itens_pedido ?? []).reduce((s: number, i: any) => s + Number(i.total_item ?? 0), 0);
        }

        if (!clienteAgg[p.cliente_id]) {
          clienteAgg[p.cliente_id] = { total: 0, numPedidos: 0, vendedor_id: p.vendedor_id };
        }
        clienteAgg[p.cliente_id].total += totalPedido;
        clienteAgg[p.cliente_id].numPedidos += 1;
      }

      const clienteIds = Object.keys(clienteAgg);
      if (clienteIds.length === 0) {
        setRankingClientes([]);
        setLoadingClientes(false);
        return;
      }

      // Buscar razao_social dos clientes
      const { data: clientesData } = await supabase
        .from("clientes")
        .select("id, razao_social, nome_parceiro, vendedor_id")
        .in("id", clienteIds);

      // Buscar profiles dos vendedores
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vendedorIds = [...new Set((clientesData ?? []).map((c: any) => c.vendedor_id).filter(Boolean))];
      const profileMapLocal: Record<string, string> = {};
      if (vendedorIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", vendedorIds as string[]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (profilesData ?? []).forEach((p: any) => {
          profileMapLocal[p.id] = p.full_name || p.email || "—";
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lista: RankingCliente[] = (clientesData ?? []).map((c: any) => ({
        cliente_id: c.id,
        razao_social: c.nome_parceiro || c.razao_social || "—",
        vendedor_id: c.vendedor_id,
        vendedor_nome: profileMapLocal[c.vendedor_id] ?? "—",
        total: clienteAgg[c.id]?.total ?? 0,
        numPedidos: clienteAgg[c.id]?.numPedidos ?? 0,
      }));

      lista.sort((a, b) => b.total - a.total);
      setRankingClientes(lista.slice(0, 30));
    } catch (e) {
      console.error("Erro ao carregar ranking clientes:", e);
    } finally {
      setLoadingClientes(false);
    }
  }, [periodo, dataInicioEfetiva, dataFimEfetiva]);

  useEffect(() => {
    carregarRankingClientes(filtroReativo);
  }, [carregarRankingClientes, filtroReativo]);

  function handleCardClick(card: DrillCardKey) {
    if (cardAberto === card) {
      setCardAberto(null);
      setDrillPedidos([]);
    } else {
      setCardAberto(card);
      carregarDrill(card);
    }
  }

  async function handleExportExcel() {
    const { dataInicio: periodoInicio, dataFim: periodoFim } = getDateRange(periodo);
    const effectiveInicio = (dataInicioEfetiva && dataFimEfetiva) ? dataInicioEfetiva : periodoInicio;
    const effectiveFim = (dataInicioEfetiva && dataFimEfetiva) ? dataFimEfetiva : periodoFim;
    // A aba "Campanha" do Excel mostra a primeira campanha ativa (mais próxima de encerrar).
    const campanhaExport = campanhasView[0];
    try {
      await exportDashboardExcel({
        periodo,
        dataInicio: formatDate(effectiveInicio),
        dataFim: formatDate(effectiveFim),
        metaTotal,
        fatMesAtual,
        fatFaturadoPeriodo,
        pipelineTotal,
        kpis,
        ranking,
        topSkus,
        topSkusValor,
        fatMensal,
        entradaMarca,
        campanhaAtiva: campanhaExport?.campanha ?? null,
        rankingCampanha: campanhaExport?.ranking ?? [],
        entradaCampanha: campanhaExport?.entrada ?? 0,
        metaTotalCampanha: campanhaExport?.metaTotalCampanha ?? 0,
      });
    } catch {
      toast.error("Erro ao exportar Excel");
    }
  }

  async function handleExportBaseDados() {
    setExportandoBase(true);
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      const linhas = await exportarBaseDadosCompleta(`base_dados_${hoje}.xlsx`);
      if (linhas === 0) {
        toast.error("Nenhum pedido encontrado para exportar.");
        return;
      }
      toast.success(`Base exportada — ${linhas} linhas.`);
    } catch (e) {
      console.error("Erro ao exportar base de dados:", e);
      toast.error("Erro ao exportar base de dados.");
    } finally {
      setExportandoBase(false);
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
          <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral do negócio</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {/* Linha 1: botões rápidos + personalizar */}
          <div className="flex flex-wrap items-center gap-2">
            {PERIODOS.map(({ key, label }) => (
              <Button
                key={key}
                variant={periodo === key && !dataInicioEfetiva ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setPeriodo(key);
                  setDataInicio("");
                  setDataFim("");
                  setDataInicioEfetiva("");
                  setDataFimEfetiva("");
                  setMostrarPersonalizar(false);
                  const range = getDateRange(key);
                  setDataInicio(range.dataInicio);
                  setDataFim(range.dataFim);
                }}
              >
                {label}
              </Button>
            ))}

            <div className="border-l h-6 mx-1" />

            <Button
              size="sm"
              variant={dataInicioEfetiva && dataFimEfetiva ? "default" : "outline"}
              onClick={() => setMostrarPersonalizar(!mostrarPersonalizar)}
            >
              Personalizar {mostrarPersonalizar ? "▲" : "▼"}
            </Button>

            <div className="border-l h-6 mx-1" />

            <Button size="sm" variant="outline" onClick={handleExportExcel}>
              <Download className="h-4 w-4 mr-1.5" />
              Exportar Excel
            </Button>

            {podeExportarBase && (
              <Button size="sm" variant="outline" onClick={handleExportBaseDados} disabled={exportandoBase}>
                {exportandoBase ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-1.5" />
                )}
                Exportar base de dados
              </Button>
            )}
          </div>

          {/* Linha 2: painel personalizar — só aparece se mostrarPersonalizar */}
          {mostrarPersonalizar && (
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
                variant="default"
                onClick={() => {
                  if (dataInicio && dataFim) {
                    setDataInicioEfetiva(dataInicio);
                    setDataFimEfetiva(dataFim);
                  }
                }}
              >
                Aplicar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const range = getDateRange("mes");
                  setDataInicio(range.dataInicio);
                  setDataFim(range.dataFim);
                  setDataInicioEfetiva("");
                  setDataFimEfetiva("");
                  setPeriodo("mes");
                  setMostrarPersonalizar(false);
                }}
              >
                Limpar
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Seção 2 — Fluxo de Metas */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Nó 1: Meta de entrada */}
        <div className="rounded-lg border p-4 flex-1 min-w-[160px]">
          <div className="text-xs text-muted-foreground mb-1">Meta de entrada</div>
          <div className="text-xl font-bold">{formatBRL(metaTotal)}</div>
          <span className="inline-block mt-2 rounded-full px-2 py-0.5 text-xs bg-gray-100 text-gray-700">
            Meta de {MESES_ABREV[mesRef - 1]}/{anoRef}
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
          {metaFaturamento > 0 ? (
            <span className={`inline-block mt-2 rounded-full px-2 py-0.5 text-xs ${badgeColor(faturadoPct)}`}>
              {faturadoPct.toFixed(0)}% da meta ({formatBRL(metaFaturamento)})
            </span>
          ) : (
            <span className="inline-block mt-2 rounded-full px-2 py-0.5 text-xs bg-gray-100 text-gray-500">
              sem meta cadastrada
            </span>
          )}
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
                  {donutSlices.map(({ marca, dash, offset }) => {
                    const selecionada = filtroReativo.tipo === "marca" && filtroReativo.id === marca;
                    return (
                      <circle
                        key={marca}
                        cx="100" cy="100" r="70"
                        fill="none"
                        stroke={corMarca(marca)}
                        strokeWidth={selecionada ? "40" : "38"}
                        strokeDasharray={`${dash} ${donutCircumference - dash}`}
                        strokeDashoffset={offset}
                        transform="rotate(-90 100 100)"
                        className="cursor-pointer"
                        onClick={() => {
                          const novoFiltro = filtroReativo.tipo === "marca" && filtroReativo.id === marca
                            ? { tipo: null, id: null, label: null }
                            : { tipo: "marca" as const, id: marca, label: marca };
                          setFiltroReativo(novoFiltro);
                        }}
                      />
                    );
                  })}
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
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      const novoFiltro = filtroReativo.tipo === "marca" && filtroReativo.id === marca
                        ? { tipo: null, id: null, label: null }
                        : { tipo: "marca" as const, id: marca, label: marca };
                      setFiltroReativo(novoFiltro);
                    }}
                    className={`flex items-center gap-2 text-sm cursor-pointer rounded px-1 -mx-1 transition-colors hover:bg-muted/50 ${
                      filtroReativo.tipo === "marca" && filtroReativo.id === marca ? "ring-2 ring-green-500" : ""
                    }`}
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
                        backgroundColor: corMarca(marca),
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
                      backgroundColor: idx === fatMensal.length - 1 ? "hsl(var(--primary))" : "#A7C7B7",
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
                    <div
                      key={r.vendedor_id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        const novoFiltro = filtroReativo.tipo === "vendedor" && filtroReativo.id === r.vendedor_id
                          ? { tipo: null, id: null, label: null }
                          : { tipo: "vendedor" as const, id: r.vendedor_id, label: r.nome };
                        setFiltroReativo(novoFiltro);
                      }}
                      className={`py-3 flex items-start gap-3 cursor-pointer rounded-md px-2 -mx-2 transition-colors hover:bg-muted/50 ${
                        filtroReativo.tipo === "vendedor" && filtroReativo.id === r.vendedor_id ? "ring-2 ring-green-500" : ""
                      }`}
                    >
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
                          <span className="text-xs text-muted-foreground">{r.clientesCarteira} cliente(s) na carteira</span>
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
                            <TableRow
                              key={s.produto_id}
                              className={`cursor-pointer hover:bg-muted/50 ${filtroReativo.tipo === "produto" && filtroReativo.id === s.produto_id ? "bg-green-50" : ""}`}
                              onClick={() => {
                                const id = s.produto_id;
                                const novoFiltro = filtroReativo.tipo === "produto" && filtroReativo.id === id
                                  ? { tipo: null, id: null, label: null }
                                  : { tipo: "produto" as const, id, label: s.nome };
                                setFiltroReativo(novoFiltro);
                              }}
                            >
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
                            <TableRow
                              key={s.produto_id}
                              className={`cursor-pointer hover:bg-muted/50 ${filtroReativo.tipo === "produto" && filtroReativo.id === s.produto_id ? "bg-green-50" : ""}`}
                              onClick={() => {
                                const id = s.produto_id;
                                const novoFiltro = filtroReativo.tipo === "produto" && filtroReativo.id === id
                                  ? { tipo: null, id: null, label: null }
                                  : { tipo: "produto" as const, id, label: s.nome };
                                setFiltroReativo(novoFiltro);
                              }}
                            >
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

      {/* Ranking de clientes — reativo aos filtros */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Ranking de clientes</CardTitle>
          {filtroReativo.tipo && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Filtrado por {filtroReativo.tipo === "vendedor" ? "vendedor" : filtroReativo.tipo === "marca" ? "marca" : "produto"}:
                <span className="font-medium text-foreground ml-1">{filtroReativo.label}</span>
              </span>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setFiltroReativo({ tipo: null, id: null, label: null })}>
                Limpar
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {loadingClientes ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rankingClientes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cliente no período</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-center">Pedidos</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankingClientes.map((c, idx) => (
                    <TableRow key={c.cliente_id}>
                      <TableCell className="font-bold text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-medium text-sm">{c.razao_social}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.vendedor_nome}</TableCell>
                      <TableCell className="text-center text-sm">{c.numPedidos}</TableCell>
                      <TableCell className="text-right font-bold text-sm text-green-700">{formatBRL(c.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seção 3 — Campanhas ativas (uma por campanha; pode haver várias) */}
      {campanhasView.map((view) => (
        <CampanhaDashboardCard key={view.campanha.id} view={view} />
      ))}

      {/* Seção 3b — Benefícios ativos do trade */}
      {beneficios.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Benefícios ativos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Vigência</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {beneficios.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>
                        <div className="font-medium">{b.nome}</div>
                        {b.descricao && (
                          <div className="text-xs text-muted-foreground">{b.descricao}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        {b.tipo && (
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${BENEFICIO_TIPO_COLOR[b.tipo] ?? "bg-gray-100 text-gray-800 border-gray-300"}`}>
                            {BENEFICIO_TIPO_LABEL[b.tipo] ?? b.tipo}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {b.valor == null
                          ? "—"
                          : b.tipo === "desconto"
                          ? `${b.valor}%`
                          : formatBRL(b.valor)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {b.data_inicio && b.data_fim
                          ? `${formatDate(b.data_inicio)} – ${formatDate(b.data_fim)}`
                          : b.data_fim
                          ? `até ${formatDate(b.data_fim)}`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
