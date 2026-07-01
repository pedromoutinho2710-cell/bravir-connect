import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatBRL, formatDate, MESES_ABREV, hojeISO } from "@/lib/format";
import { STATUS_LABEL, STATUS_COLOR } from "./MeusPedidos";
import { exportarTabelaPrecosExcel, type ProdutoTabela } from "@/lib/excel";
import { fetchRankingVendedores } from "@/lib/ranking";
import { corMarca } from "@/lib/marcas";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, AlertTriangle, Download, TrendingUp, ShoppingCart, Users, Megaphone, RefreshCw, CheckSquare, CheckCircle2, ArrowDownToLine, CheckCheck, Clock, UserCheck, UserX, UserPlus, Briefcase, Gift, Trophy, PackageX } from "lucide-react";
import { toast } from "sonner";

type KPIs = {
  faturamento: number;
  numPedidos: number;
  ticketMedio: number;
  rascunhos: number;
  meta: number;
  aFaturar: number;
  pedidosSemEstoque: number;
  valorSemEstoque: number;
};

type UltimoPedido = {
  id: string;
  numero_pedido: number;
  status: string;
  razao_social: string;
  total: number;
  data_pedido: string;
};

type ClienteReativar = {
  cliente_id: string;
  razao_social: string;
  ltv: number;
  ultima_compra: string;
  dias_sem_compra: number;
};

type TarefaDia = {
  id: string;
  titulo: string;
  data_vencimento: string | null;
  concluida: boolean;
  cliente_id: string | null;
  cliente_nome?: string;
};

type Campanha = {
  id: string;
  nome: string;
  descricao: string | null;
  tipo: string | null;
  valor: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  created_at: string;
};

const TIPO_COLOR: Record<string, string> = {
  desconto: "bg-blue-100 text-blue-800 border-blue-300",
  bonificacao: "bg-green-100 text-green-800 border-green-300",
  outro: "bg-gray-100 text-gray-800 border-gray-300",
};

const TIPO_LABEL: Record<string, string> = {
  desconto: "Desconto",
  bonificacao: "Bonificação",
  outro: "Outro",
};

type HistoricoMes = {
  mes: string;
  ano: number;
  mesNum: number;
  totalEntrada: number;
  numPedidos: number;
};

type Periodo = "hoje" | "semana" | "mes" | "mes_anterior" | "ano" | "ano_passado";

const PERIODO_LABEL: Record<Periodo, string> = {
  hoje: "Hoje",
  semana: "Esta semana",
  mes: "Este mês",
  mes_anterior: "Mês anterior",
  ano: "Este ano",
  ano_passado: "Ano passado",
};

function rangePeriodo(p: Periodo): { inicio: string; fim: string } {
  const agora = new Date();
  const y = agora.getFullYear();
  const m = agora.getMonth();
  const d = agora.getDate();
  const fmt = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  if (p === "hoje") {
    const hoje = fmt(agora);
    return { inicio: hoje, fim: hoje };
  }
  if (p === "semana") {
    const dow = agora.getDay();
    const inicio = new Date(y, m, d - dow);
    return { inicio: fmt(inicio), fim: fmt(agora) };
  }
  if (p === "ano") {
    return { inicio: `${y}-01-01`, fim: fmt(agora) };
  }
  if (p === "ano_passado") {
    return { inicio: `${y - 1}-01-01`, fim: `${y - 1}-12-31` };
  }
  if (p === "mes_anterior") {
    const ano = m === 0 ? y - 1 : y;
    const mes = m === 0 ? 11 : m - 1;
    const inicio = new Date(ano, mes, 1);
    const fim = new Date(ano, mes + 1, 0);
    return { inicio: fmt(inicio), fim: fmt(fim) };
  }
  return { inicio: fmt(new Date(y, m, 1)), fim: fmt(agora) };
}

function rangeEfetivo(p: Periodo, customAtivo: boolean, customInicio: string, customFim: string) {
  if (customAtivo && customInicio && customFim) return { inicio: customInicio, fim: customFim };
  return rangePeriodo(p);
}

function formatDataBR(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

type PeriodTotais = { entrada: number; faturado: number; aFaturar: number };

type ClienteSemPedido = {
  id: string;
  razao_social: string;
  cidade: string | null;
  ultimo_pedido: string | null;
};

type ClientesPeriodo = {
  carteira: number;
  comPedido: number;
  novos: number;
  semPedidoList: ClienteSemPedido[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CampanhaNivel = any;

type CampanhaAtiva = {
  id: string;
  nome: string;
  descricao: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  marcas?: string[];
  campanha_niveis?: CampanhaNivel[];
};

// View-model de uma campanha ativa já com o desempenho do vendedor calculado.
// O painel renderiza um card destes por campanha ativa (podem ser 2-3 ao mesmo tempo).
type CampanhaView = {
  campanha: CampanhaAtiva;
  marcas: string[];
  entrada: number;
  entradaPorMarca: Record<string, number>;
  metaVendedor: number | null;
  metaTipo: "valor" | "unidades";
  metaQuantidade: number | null;
  categoria: string | null;
};

type RankProduto = {
  produto_id: string;
  codigo: string;
  nome: string;
  marca: string;
  quantidade: number;
  valor: number;
};

function nivelBadgeClass(nivel: string) {
  const n = nivel.toLowerCase();
  if (n.includes("diamante")) return "bg-purple-100 text-purple-800 hover:bg-purple-100";
  if (n.includes("ouro")) return "bg-yellow-100 text-yellow-800 hover:bg-yellow-100";
  if (n.includes("prata")) return "bg-gray-100 text-gray-700 hover:bg-gray-100";
  if (n.includes("bronze")) return "bg-orange-100 text-orange-800 hover:bg-orange-100";
  return "bg-gray-100 text-gray-700 hover:bg-gray-100";
}

export default function MeuPainel() {
  const { user } = useAuth();
  const { active, userId: impersonatedId } = useImpersonation();
  const effectiveUserId = active ? impersonatedId : user?.id;
  const navigate = useNavigate();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [customInicio, setCustomInicio] = useState("");
  const [customFim, setCustomFim] = useState("");
  const [customAtivo, setCustomAtivo] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [ultimosPedidos, setUltimosPedidos] = useState<UltimoPedido[]>([]);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [clientesReativar, setClientesReativar] = useState<ClienteReativar[]>([]);
  const [tarefasDia, setTarefasDia] = useState<TarefaDia[]>([]);
  const [baixandoTabela, setBaixandoTabela] = useState(false);
  const [clientesPeriodo, setClientesPeriodo] = useState<ClientesPeriodo>({ carteira: 0, comPedido: 0, novos: 0, semPedidoList: [] });
  const [modalSemPedidoOpen, setModalSemPedidoOpen] = useState(false);
  const [campanhasAtivas, setCampanhasAtivas] = useState<CampanhaView[]>([]);
  const [rankingPosicoes, setRankingPosicoes] = useState<{ nome: string; isVoce: boolean }[]>([]);
  const [fatMensalVendedor, setFatMensalVendedor] = useState<{ mes: string; valor: number }[]>([]);
  const [topClientes, setTopClientes] = useState<{ cliente_id: string; nome: string; total: number }[]>([]);
  const [entradaMarca, setEntradaMarca] = useState<Record<string, number>>({});
  const [topSkus, setTopSkus] = useState<RankProduto[]>([]);
  const [topSkusValor, setTopSkusValor] = useState<RankProduto[]>([]);
  const [tabProdutos, setTabProdutos] = useState<"quantidade" | "valor">("quantidade");
  const [produtosIndisponiveis, setProdutosIndisponiveis] = useState<{ id: string; nome: string }[]>([]);
  const [modalIndispOpen, setModalIndispOpen] = useState(false);
  const [historicoMeses, setHistoricoMeses] = useState<HistoricoMes[]>([]);

  const queryClient = useQueryClient();
  const agoraData = useMemo(() => new Date(), []);
  const mesAtual = agoraData.getMonth() + 1;
  const anoAtual = agoraData.getFullYear();
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!effectiveUserId) return;
    let cancelado = false;
    (async () => {
      // Todas as campanhas ativas (podem ser várias simultâneas)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: campanhasData } = await (supabase as any)
        .from("campanhas")
        .select("*, campanha_niveis(*)")
        .eq("ativa", true)
        .order("data_fim", { ascending: true });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ativas = (campanhasData ?? []) as any[];
      if (ativas.length === 0) {
        if (!cancelado) setCampanhasAtivas([]);
        return;
      }

      const views = await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ativas.map(async (campanha: any): Promise<CampanhaView> => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: campanhaProdutosData } = await (supabase as any)
            .from("campanha_produtos")
            .select("tipo, marca, produto_id")
            .eq("campanha_id", campanha.id);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cps = (campanhaProdutosData ?? []) as any[];
          const marcasSet = new Set<string>(
            cps.filter((cp) => cp.tipo === "marca").map((cp) => cp.marca as string),
          );
          const produtosSet = new Set<string>(
            cps.filter((cp) => cp.tipo === "produto").map((cp) => cp.produto_id as string),
          );
          const marcasArr = Array.from(marcasSet);

          // Itens do vendedor no período da campanha
          const { data: pedidosCampData } = await supabase
            .from("pedidos")
            .select("id, vendedor_id, data_pedido, status, itens_pedido(quantidade, total_item, produto_id, produtos(marca))")
            .eq("vendedor_id", effectiveUserId)
            .gte("data_pedido", campanha.data_inicio)
            .lte("data_pedido", campanha.data_fim)
            .not("status", "in", '("rascunho","cancelado","devolvido")');

          let entrada = 0;
          let entradaUnidades = 0;
          const porMarca: Record<string, number> = {};
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const p of (pedidosCampData ?? []) as any[]) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const it of (p.itens_pedido ?? []) as any[]) {
              const marca = it.produtos?.marca as string | undefined;
              const prodId = it.produto_id as string | undefined;
              if ((marca && marcasSet.has(marca)) || (prodId && produtosSet.has(prodId))) {
                const valor = Number(it.total_item ?? 0);
                entrada += valor;
                entradaUnidades += Number(it.quantidade ?? 0);
                const chaveMarca = marca ?? "Outros";
                porMarca[chaveMarca] = (porMarca[chaveMarca] ?? 0) + valor;
              }
            }
          }

          // Meta individual do vendedor na campanha
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: metaData } = await (supabase as any)
            .from("campanha_metas_vendedor")
            .select("meta_valor, categoria, tipo_meta, meta_quantidade")
            .eq("campanha_id", campanha.id)
            .eq("vendedor_id", effectiveUserId)
            .maybeSingle();

          const tipoMetaCamp = (metaData?.tipo_meta ?? "valor") as "valor" | "unidades";
          return {
            campanha: campanha as CampanhaAtiva,
            marcas: marcasArr,
            entrada: tipoMetaCamp === "unidades" ? entradaUnidades : entrada,
            entradaPorMarca: porMarca,
            metaVendedor: metaData?.meta_valor != null ? Number(metaData.meta_valor) : null,
            metaTipo: tipoMetaCamp,
            metaQuantidade: metaData?.meta_quantidade ?? null,
            categoria: metaData?.categoria ?? null,
          };
        }),
      );

      if (!cancelado) setCampanhasAtivas(views);
    })();
    return () => { cancelado = true; };
  }, [effectiveUserId]);

  // ── KPIs do período (pedidos) — agregação cacheada via TanStack Query.
  //    Consolida a antiga query redundante de "totais do período" (entrada/
  //    faturado/a faturar saem do mesmo fetch).
  const periodoQuery = useQuery({
    queryKey: ["painel-periodo", effectiveUserId, periodo, customAtivo, customInicio, customFim],
    enabled: !!effectiveUserId,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      // Período efetivo dos KPIs: filtro personalizado ou período selecionado
      const { inicio: kpiInicio, fim: kpiFim } = rangeEfetivo(periodo, customAtivo, customInicio, customFim);

      // Mês/ano da meta derivado do período filtrado (filtrar maio → meta de maio)
      const periodoDate = new Date(kpiInicio + "T12:00:00");
      const mesFiltro = periodoDate.getMonth() + 1;
      const anoFiltro = periodoDate.getFullYear();

      const [pedidosRes, rascunhosRes, metasRes] = await Promise.all([
        supabase
          .from("pedidos")
          .select("id, status, itens_pedido(total_item)")
          .eq("vendedor_id", effectiveUserId)
          .gte("data_pedido", kpiInicio)
          .lte("data_pedido", kpiFim)
          .not("status", "in", '("rascunho","cancelado")'),
        supabase
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .eq("vendedor_id", effectiveUserId)
          .eq("status", "rascunho"),
        supabase
          .from("metas")
          .select("valor_meta_reais")
          .eq("vendedor_id", effectiveUserId)
          .eq("mes", mesFiltro)
          .eq("ano", anoFiltro)
          .maybeSingle(),
      ]);
      if (pedidosRes.error) throw pedidosRes.error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pedidos = (pedidosRes.data ?? []) as any[];
      let faturamento = 0;
      let pedidosSemEstoque = 0;
      let valorSemEstoque = 0;
      let aFaturar = 0;
      let faturado = 0;
      pedidos.forEach((p) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const total = (p.itens_pedido ?? []).reduce((si: number, i: any) => si + Number(i.total_item), 0);
        faturamento += total;
        if (p.status === "sem_estoque") {
          pedidosSemEstoque++;
          valorSemEstoque += total;
        }
        if (p.status === "no_sankhya" || p.status === "parcialmente_faturado" || p.status === "nao_liberado_envio" || p.status === "liberado_envio") {
          aFaturar += total;
        }
        if (p.status === "faturado" || p.status === "parcialmente_faturado") {
          faturado += total;
        }
      });
      const numPedidos = pedidos.length;
      const ticketMedio = numPedidos > 0 ? faturamento / numPedidos : 0;
      const rascunhos = rascunhosRes.count ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meta = Number((metasRes.data as any)?.valor_meta_reais ?? 0);

      return {
        kpis: { faturamento, numPedidos, ticketMedio, rascunhos, meta, aFaturar, pedidosSemEstoque, valorSemEstoque } as KPIs,
        periodTotais: { entrada: faturamento, faturado, aFaturar } as PeriodTotais,
      };
    },
  });

  // ── Faturamento Real (Sankhya) — mês atual + anterior, agregado no banco
  //    via RPC. A RPC também devolve full_name/nome_sankhya (usados no ranking
  //    e no gráfico mensal), evitando uma query separada de profiles.
  const painelQuery = useQuery({
    queryKey: ["painel-vendedor", effectiveUserId, anoAtual, mesAtual],
    enabled: !!effectiveUserId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("get_painel_vendedor", {
        p_vendedor_id: effectiveUserId,
        p_mes: mesAtual,
        p_ano: anoAtual,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) ?? null;
      return row as {
        full_name: string | null;
        nome_sankhya: string | null;
        faturamento_mes: number | null;
        faturamento_mes_anterior: number | null;
      } | null;
    },
  });

  // Valores derivados das queries — mantêm os mesmos nomes usados no JSX.
  const kpis: KPIs = periodoQuery.data?.kpis ?? { faturamento: 0, numPedidos: 0, ticketMedio: 0, rascunhos: 0, meta: 0, aFaturar: 0, pedidosSemEstoque: 0, valorSemEstoque: 0 };
  const periodTotais: PeriodTotais = periodoQuery.data?.periodTotais ?? { entrada: 0, faturado: 0, aFaturar: 0 };
  const loading = !effectiveUserId || periodoQuery.isLoading;
  const loadingPeriodo = periodoQuery.isFetching;
  const painel = painelQuery.data;
  const vendedorFullName = painel?.full_name?.trim() || null;
  const vendedorNomeSankhya = painel?.nome_sankhya?.trim() || null;
  const faturadoMesAtual = Number(painel?.faturamento_mes ?? 0);
  const faturamentoRealMes = painel ? Number(painel.faturamento_mes ?? 0) : null;
  const faturamentoRealMesAnterior = painel ? Number(painel.faturamento_mes_anterior ?? 0) : null;

  // Segunda onda (não dependem do período): campanhas ativas, clientes para
  // reativar (RPC), tarefas do dia e últimos pedidos.
  useEffect(() => {
    if (!effectiveUserId) return;
    let cancelado = false;
    (async () => {
      const hoje = hojeISO();
      const [campRes, ltvRes, tarRes, ultimosRes] = await Promise.all([
        supabase
          .from("campanhas")
          .select("id, nome, descricao, tipo, valor, data_inicio, data_fim, created_at")
          .eq("ativa", true)
          .or(`data_fim.is.null,data_fim.gte.${hoje}`),
        // RPC returns aggregated rows (≤10) instead of entire order history
        supabase.rpc("vendedor_ltv_clientes", { _vendedor_id: effectiveUserId }),
        supabase
          .from("tarefas")
          .select("id, titulo, data_vencimento, concluida, cliente_id, clientes(razao_social, nome_parceiro)")
          .eq("vendedor_id", effectiveUserId)
          .eq("concluida", false)
          .or(`data_vencimento.is.null,data_vencimento.lte.${hoje}`)
          .order("data_vencimento", { ascending: true }),
        supabase
          .from("pedidos")
          .select("id, numero_pedido, status, data_pedido, itens_pedido(total_item), clientes(razao_social, nome_parceiro)")
          .eq("vendedor_id", effectiveUserId)
          .not("status", "in", '("rascunho")')
          .order("created_at", { ascending: false }),
      ]);
      if (cancelado) return;

      if (campRes.error) toast.error("Erro ao carregar campanhas");
      else setCampanhas((campRes.data ?? []) as Campanha[]);

      if (ltvRes.error) toast.error("Erro ao carregar clientes para reativar");
      else {
        setClientesReativar(
          (ltvRes.data ?? []).map((r) => ({
            cliente_id: r.cliente_id,
            razao_social: r.razao_social,
            ltv: Number(r.ltv),
            ultima_compra: r.ultima_compra,
            dias_sem_compra: r.dias_sem_compra,
          })),
        );
      }

      if (tarRes.error) toast.error("Erro ao carregar tarefas");
      else if (tarRes.data) {
        setTarefasDia(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (tarRes.data as any[]).map((t) => ({
            id: t.id,
            titulo: t.titulo,
            data_vencimento: t.data_vencimento,
            concluida: t.concluida,
            cliente_id: t.cliente_id,
            cliente_nome: (t.clientes as { razao_social: string; nome_parceiro: string | null } | null)?.nome_parceiro || (t.clientes as { razao_social: string; nome_parceiro: string | null } | null)?.razao_social,
          })),
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setUltimosPedidos((ultimosRes.data ?? []).map((p: any) => ({
        id: p.id,
        numero_pedido: p.numero_pedido,
        status: p.status,
        razao_social: p.clientes?.nome_parceiro || p.clientes?.razao_social || "—",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        total: (p.itens_pedido ?? []).reduce((s: number, i: any) => s + Number(i.total_item), 0),
        data_pedido: p.data_pedido,
      })));
    })();
    return () => { cancelado = true; };
  }, [effectiveUserId]);

  // Realtime com debounce de 1,5s: agrupa rajadas de eventos numa única
  // invalidação das queries do painel, evitando recarregar tudo a cada evento.
  useEffect(() => {
    if (!effectiveUserId) return;
    const agendarInvalidacao = () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      realtimeDebounceRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["painel-periodo"] });
        queryClient.invalidateQueries({ queryKey: ["painel-vendedor"] });
      }, 1500);
    };
    const channel = supabase
      .channel("meu-painel-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, agendarInvalidacao)
      .on("postgres_changes", { event: "*", schema: "public", table: "faturamentos_sankhya" }, agendarInvalidacao)
      .subscribe();
    return () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [effectiveUserId, queryClient]);

  useEffect(() => {
    if (!effectiveUserId) return;
    (async () => {
      const agora = new Date();
      const meses = Array.from({ length: 3 }, (_, i) => {
        const d = new Date(agora.getFullYear(), agora.getMonth() - (2 - i), 1);
        const ano = d.getFullYear();
        const mesNum = d.getMonth() + 1;
        const inicio = `${ano}-${String(mesNum).padStart(2, "0")}-01`;
        const fim = new Date(ano, mesNum, 0).toISOString().slice(0, 10);
        return { mes: MESES_ABREV[d.getMonth()], ano, mesNum, inicio, fim };
      });

      const resultados = await Promise.all(
        meses.map(async (m) => {
          const { data } = await supabase
            .from("pedidos")
            .select("id, itens_pedido(total_item)")
            .eq("vendedor_id", effectiveUserId)
            .gte("data_pedido", m.inicio)
            .lte("data_pedido", m.fim)
            .not("status", "in", '("rascunho","cancelado")');
          const pedidos = data ?? [];
          const totalEntrada = pedidos.reduce((s, p) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return s + (p.itens_pedido ?? []).reduce((si: number, i: any) => si + Number(i.total_item), 0);
          }, 0);
          return {
            mes: m.mes,
            ano: m.ano,
            mesNum: m.mesNum,
            totalEntrada,
            numPedidos: pedidos.length,
          };
        })
      );
      setHistoricoMeses(resultados);
    })();
  }, [effectiveUserId]);

  // Mini-ranking de posições — ENTRADA DE PEDIDOS por vendedor no período.
  // Fonte ÚNICA compartilhada com o Dashboard admin (src/lib/ranking.ts), para
  // que as posições fiquem idênticas nos dois. O próprio vendedor é destacado
  // por vendedor_id (em vez do antigo match textual por nome).
  useEffect(() => {
    if (!effectiveUserId) return;
    let cancelado = false;
    const { inicio, fim } = rangeEfetivo(periodo, customAtivo, customInicio, customFim);
    (async () => {
      const lista = await fetchRankingVendedores(inicio, fim);
      if (cancelado) return;
      setRankingPosicoes(
        lista.map((r) => ({ nome: r.nome, isVoce: r.vendedor_id === effectiveUserId })),
      );
    })();
    return () => { cancelado = true; };
  }, [effectiveUserId, periodo, customAtivo, customInicio, customFim]);

  // Faturamento mensal (Sankhya) do próprio vendedor — últimos 6 meses.
  // Mesma lógica/visual do Dashboard admin, filtrado por nome_vendedor
  // (nome_sankhya exato quando preenchido, senão %full_name%).
  useEffect(() => {
    if (!effectiveUserId) return;
    const matchPattern = vendedorNomeSankhya
      ? vendedorNomeSankhya
      : (vendedorFullName ? `%${vendedorFullName}%` : null);
    if (!matchPattern) { setFatMensalVendedor([]); return; }
    let cancelado = false;
    (async () => {
      const agora = new Date();
      const meses6 = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(agora.getFullYear(), agora.getMonth() - (5 - i), 1);
        const ano = d.getFullYear();
        const mesNum = d.getMonth() + 1;
        const inicio = `${ano}-${String(mesNum).padStart(2, "0")}-01`;
        const fim = new Date(ano, mesNum, 0).toISOString().slice(0, 10);
        return { mes: MESES_ABREV[d.getMonth()], inicio, fim };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("faturamentos_sankhya")
        .select("data_faturamento, valor_liquido")
        .ilike("nome_vendedor", matchPattern)
        .gte("data_faturamento", meses6[0].inicio)
        .lte("data_faturamento", meses6[meses6.length - 1].fim)
        .not("tipo_operacao", "ilike", "%devolução%");
      if (cancelado) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (data ?? []) as any[];
      const arr = meses6.map((m) => ({
        mes: m.mes,
        valor: rows
          .filter((r) => r.data_faturamento && r.data_faturamento >= m.inicio && r.data_faturamento <= m.fim)
          .reduce((s, r) => s + Number(r.valor_liquido ?? 0), 0),
      }));
      setFatMensalVendedor(arr);
    })();
    return () => { cancelado = true; };
  }, [effectiveUserId, vendedorFullName, vendedorNomeSankhya]);

  // Top 5 clientes do vendedor por valor de entrada no período (RLS limita aos próprios pedidos)
  useEffect(() => {
    if (!effectiveUserId) return;
    let cancelado = false;
    const { inicio, fim } = rangeEfetivo(periodo, customAtivo, customInicio, customFim);
    (async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("cliente_id, clientes(razao_social, nome_parceiro), itens_pedido(total_item)")
        .eq("vendedor_id", effectiveUserId)
        .gte("data_pedido", inicio)
        .lte("data_pedido", fim)
        .not("status", "in", '("rascunho","cancelado","devolvido")');
      if (cancelado) return;
      if (error || !data) { setTopClientes([]); return; }
      const agg: Record<string, { nome: string; total: number }> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data as any[]).forEach((p) => {
        if (!p.cliente_id) return;
        const nome = p.clientes?.nome_parceiro || p.clientes?.razao_social || "—";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const total = (p.itens_pedido ?? []).reduce((s: number, i: any) => s + Number(i.total_item ?? 0), 0);
        if (!agg[p.cliente_id]) agg[p.cliente_id] = { nome, total: 0 };
        agg[p.cliente_id].total += total;
      });
      const lista = Object.entries(agg)
        .map(([cliente_id, v]) => ({ cliente_id, nome: v.nome, total: v.total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
      setTopClientes(lista);
    })();
    return () => { cancelado = true; };
  }, [effectiveUserId, periodo, customAtivo, customInicio, customFim]);

  // Entrada por marca do vendedor no período (donut) — soma total_item por marca do produto
  useEffect(() => {
    if (!effectiveUserId) return;
    let cancelado = false;
    const { inicio, fim } = rangeEfetivo(periodo, customAtivo, customInicio, customFim);
    (async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("itens_pedido(total_item, produtos(marca))")
        .eq("vendedor_id", effectiveUserId)
        .gte("data_pedido", inicio)
        .lte("data_pedido", fim)
        .not("status", "in", '("rascunho","cancelado")');
      if (cancelado) return;
      if (error || !data) { setEntradaMarca({}); return; }
      const agg: Record<string, number> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data as any[]).forEach((p) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p.itens_pedido ?? []).forEach((i: any) => {
          const marca = i.produtos?.marca ?? "Outros";
          agg[marca] = (agg[marca] ?? 0) + Number(i.total_item ?? 0);
        });
      });
      setEntradaMarca(agg);
    })();
    return () => { cancelado = true; };
  }, [effectiveUserId, periodo, customAtivo, customInicio, customFim]);

  // Ranking de produtos do vendedor no período — top 10 por quantidade e por valor
  useEffect(() => {
    if (!effectiveUserId) return;
    let cancelado = false;
    const { inicio, fim } = rangeEfetivo(periodo, customAtivo, customInicio, customFim);
    (async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("itens_pedido(quantidade, total_item, produto_id, produtos(codigo_jiva, nome, marca))")
        .eq("vendedor_id", effectiveUserId)
        .gte("data_pedido", inicio)
        .lte("data_pedido", fim)
        .not("status", "in", '("rascunho","cancelado")');
      if (cancelado) return;
      if (error || !data) { setTopSkus([]); setTopSkusValor([]); return; }
      const agg: Record<string, RankProduto> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data as any[]).forEach((p) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p.itens_pedido ?? []).forEach((i: any) => {
          const pid = i.produto_id as string | undefined;
          if (!pid) return;
          if (!agg[pid]) {
            agg[pid] = {
              produto_id: pid,
              codigo: i.produtos?.codigo_jiva ?? "—",
              nome: i.produtos?.nome ?? "—",
              marca: i.produtos?.marca ?? "—",
              quantidade: 0,
              valor: 0,
            };
          }
          agg[pid].quantidade += Number(i.quantidade ?? 0);
          agg[pid].valor += Number(i.total_item ?? 0);
        });
      });
      const lista = Object.values(agg);
      setTopSkus([...lista].sort((a, b) => b.quantidade - a.quantidade).slice(0, 10));
      setTopSkusValor([...lista].sort((a, b) => b.valor - a.valor).slice(0, 10));
    })();
    return () => { cancelado = true; };
  }, [effectiveUserId, periodo, customAtivo, customInicio, customFim]);

  useEffect(() => {
    if (!effectiveUserId) return;
    const { inicio, fim } = rangeEfetivo(periodo, customAtivo, customInicio, customFim);
    (async () => {
      const [carteiraRes, pedidosRes, novosRes] = await Promise.all([
        supabase
          .from("clientes")
          .select("id, razao_social, nome_parceiro, cidade", { count: "exact" })
          .eq("vendedor_id", effectiveUserId)
          .eq("status", "ativo"),
        supabase
          .from("pedidos")
          .select("cliente_id, data_pedido")
          .eq("vendedor_id", effectiveUserId)
          .gte("data_pedido", inicio)
          .lte("data_pedido", fim)
          .not("status", "in", '("cancelado","devolvido")'),
        // Novos clientes: criados dentro do período filtrado
        supabase
          .from("clientes")
          .select("id", { count: "exact", head: true })
          .eq("vendedor_id", effectiveUserId)
          .eq("status", "ativo")
          .gte("created_at", inicio)
          .lte("created_at", `${fim}T23:59:59`),
      ]);

      if (carteiraRes.error || pedidosRes.error || novosRes.error) {
        toast.error("Erro ao carregar clientes");
        return;
      }

      const carteira = (carteiraRes.data ?? []) as { id: string; razao_social: string; nome_parceiro: string | null; cidade: string | null }[];
      const pedidos = (pedidosRes.data ?? []) as { cliente_id: string; data_pedido: string }[];

      const idsComPedido = new Set(pedidos.map((p) => p.cliente_id));
      const semPedidoIds = carteira.filter((c) => !idsComPedido.has(c.id)).map((c) => c.id);

      const ultimoPedidoMap: Record<string, string> = {};
      if (semPedidoIds.length > 0) {
        const { data: ultimosData } = await supabase
          .from("pedidos")
          .select("cliente_id, data_pedido")
          .eq("vendedor_id", effectiveUserId)
          .in("cliente_id", semPedidoIds)
          .not("status", "in", '("cancelado","devolvido","rascunho")')
          .order("data_pedido", { ascending: false });
        (ultimosData ?? []).forEach((p) => {
          if (!ultimoPedidoMap[p.cliente_id]) ultimoPedidoMap[p.cliente_id] = p.data_pedido;
        });
      }

      const semPedidoList: ClienteSemPedido[] = carteira
        .filter((c) => !idsComPedido.has(c.id))
        .map((c) => ({
          id: c.id,
          razao_social: c.nome_parceiro || c.razao_social,
          cidade: c.cidade,
          ultimo_pedido: ultimoPedidoMap[c.id] ?? null,
        }))
        .sort((a, b) => a.razao_social.localeCompare(b.razao_social));

      setClientesPeriodo({
        carteira: carteira.length,
        comPedido: idsComPedido.size,
        novos: novosRes.count ?? 0,
        semPedidoList,
      });
    })();
  }, [effectiveUserId, periodo, customAtivo, customInicio, customFim]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("produtos")
          .select("id, nome")
          .eq("disponivel", false)
          .order("nome", { ascending: true });
        if (error) throw error;
        if (!cancelado) setProdutosIndisponiveis((data ?? []) as { id: string; nome: string }[]);
      } catch {
        if (!cancelado) toast.error("Erro ao carregar produtos sem estoque disponível para faturar");
      }
    })();
    return () => { cancelado = true; };
  }, []);

  const maxFatMensalVendedor = Math.max(...fatMensalVendedor.map((m) => m.valor), 1);

  // Donut "Entrada por marca" — mesmos cálculos do Dashboard admin
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
  // metaPct é o valor REAL (pode passar de 100%); metaPctBarra trava a barra em 100% visualmente.
  const metaPct = kpis.meta > 0 ? (kpis.faturamento / kpis.meta) * 100 : 0;
  const metaPctBarra = Math.min(metaPct, 100);
  const metaColor = metaPct >= 80 ? "bg-green-500" : metaPct >= 50 ? "bg-yellow-400" : "bg-red-500";

  const baixarTabela = async () => {
    setBaixandoTabela(true);
    try {
      // Vigência ativa (mais recente): tabela de preços só deve refletir a vigência vigente.
      const { data: vig } = await supabase
        .from("tabelas_vigencia")
        .select("id")
        .eq("ativa", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!vig?.id) {
        toast.error("Nenhuma vigência ativa encontrada");
        return;
      }

      const [prodRes, precoRes] = await Promise.all([
        supabase.from("produtos").select("id, codigo_jiva, nome, marca").eq("ativo", true).order("marca").order("nome"),
        supabase.from("precos").select("produto_id, tabela, preco_bruto").eq("vigencia_id", vig.id).limit(5000),
      ]);

      const precoMap: Record<string, Record<string, number>> = {};
      (precoRes.data ?? []).forEach((p) => {
        (precoMap[p.produto_id] ||= {})[p.tabela] = Number(p.preco_bruto);
      });

      const produtos: ProdutoTabela[] = (prodRes.data ?? []).map((p) => ({
        codigo_jiva: p.codigo_jiva,
        nome: p.nome,
        marca: p.marca,
        preco_7: precoMap[p.id]?.["7"] ?? 0,
        preco_12: precoMap[p.id]?.["12"] ?? 0,
        preco_18: precoMap[p.id]?.["18"] ?? 0,
        preco_suframa: precoMap[p.id]?.["suframa"] ?? 0,
      }));

      await exportarTabelaPrecosExcel(produtos);
    } catch {
      toast.error("Erro ao gerar tabela de preços");
    } finally {
      setBaixandoTabela(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Meu Painel</h1>
          <p className="text-sm text-muted-foreground">Resumo do mês atual</p>
        </div>
        <Button variant="outline" onClick={baixarTabela} disabled={baixandoTabela}>
          {baixandoTabela ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Baixar tabela de preços
        </Button>
      </div>

      {/* Filtro de período + cards de totais */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground mr-1">Período:</span>
          {(Object.keys(PERIODO_LABEL) as Periodo[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={periodo === p && !customAtivo ? "default" : "outline"}
              onClick={() => {
                setPeriodo(p);
                setCustomAtivo(false);
                setCustomOpen(false);
              }}
            >
              {PERIODO_LABEL[p]}
            </Button>
          ))}
          <Button
            size="sm"
            variant={customAtivo ? "default" : "outline"}
            onClick={() => setCustomOpen((o) => !o)}
          >
            Personalizar {customOpen ? "▲" : "▼"}
          </Button>
          {customAtivo && customInicio && customFim && (
            <Badge variant="secondary" className="ml-1">
              {formatDataBR(customInicio)} – {formatDataBR(customFim)}
            </Badge>
          )}
        </div>
        {customOpen && (
          <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">De</label>
              <Input
                type="date"
                value={customInicio}
                onChange={(e) => setCustomInicio(e.target.value)}
                className="h-9 w-auto"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Até</label>
              <Input
                type="date"
                value={customFim}
                onChange={(e) => setCustomFim(e.target.value)}
                className="h-9 w-auto"
              />
            </div>
            <Button
              size="sm"
              disabled={!customInicio || !customFim}
              onClick={() => {
                setCustomAtivo(true);
                setCustomOpen(false);
              }}
            >
              Aplicar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCustomAtivo(false);
                setCustomInicio("");
                setCustomFim("");
                setCustomOpen(false);
              }}
            >
              Limpar
            </Button>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Meta mensal</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpis.meta > 0 ? formatBRL(kpis.meta) : "—"}</div>
              {kpis.meta > 0 && (
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{metaPct.toFixed(1)}% atingido</span>
                    <span>{formatBRL(kpis.faturamento)}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted">
                    <div
                      className={`h-2 rounded-full transition-all ${metaColor}`}
                      style={{ width: `${metaPctBarra}%` }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-[#166534] hover:shadow-sm transition"
            onClick={() => navigate("/meus-pedidos")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Entrada de pedidos</CardTitle>
              <ArrowDownToLine className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loadingPeriodo ? <Loader2 className="h-5 w-5 animate-spin" /> : formatBRL(periodTotais.entrada)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Clique para ver pedidos</p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-[#166534] hover:shadow-sm transition"
            onClick={() => navigate("/meus-pedidos", { state: { filtroStatus: "faturado" } })}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Faturado (mês)</CardTitle>
              <CheckCheck className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-700">{formatBRL(faturadoMesAtual)}</div>
              <p className="text-xs text-muted-foreground mt-1">Clique para ver pedidos</p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-[#166534] hover:shadow-sm transition"
            onClick={() => navigate("/meus-pedidos", { state: { filtroStatus: "no_sankhya" } })}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">A faturar</CardTitle>
              <Clock className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-700">
                {loadingPeriodo ? <Loader2 className="h-5 w-5 animate-spin" /> : formatBRL(periodTotais.aFaturar)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Clique para ver pedidos</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Meu Faturamento Real (Sankhya) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Meu Faturamento Real (Sankhya)</CardTitle>
          <CheckCheck className="h-4 w-4 text-green-700" />
        </CardHeader>
        <CardContent>
          {!vendedorFullName ? (
            <p className="text-sm text-muted-foreground">
              Configure seu nome completo no perfil para ver o faturamento real.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Mês atual</p>
                <p className="text-2xl font-bold text-green-700">{formatBRL(faturamentoRealMes ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Mês anterior</p>
                <p className="text-2xl font-bold">{formatBRL(faturamentoRealMesAnterior ?? 0)}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Faturamento mensal (Sankhya) — últimos 6 meses, gráfico de barras div+Tailwind */}
      {fatMensalVendedor.some((m) => m.valor > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Faturamento mensal (últimos 6 meses)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between gap-2 h-48">
              {fatMensalVendedor.map((m, idx) => (
                <div key={m.mes} className="flex flex-col items-center flex-1 h-full justify-end">
                  <span className="text-xs font-medium mb-1 text-center leading-tight">
                    {formatBRL(m.valor)}
                  </span>
                  <div
                    className="w-full rounded-t transition-all"
                    style={{
                      height: `${(m.valor / maxFatMensalVendedor) * 100}%`,
                      backgroundColor: idx === fatMensalVendedor.length - 1 ? "hsl(var(--primary))" : "#A7C7B7",
                      minHeight: m.valor > 0 ? "4px" : "0px",
                    }}
                  />
                  <span className="text-xs text-muted-foreground mt-1">{m.mes}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entrada por marca — donut (próprios pedidos no período) */}
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
                      stroke={corMarca(marca)}
                      strokeWidth="38"
                      strokeDasharray={`${dash} ${donutCircumference - dash}`}
                      strokeDashoffset={offset}
                      transform="rotate(-90 100 100)"
                    />
                  ))}
                </svg>
                {/* Centro: Total + valor */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xs text-muted-foreground leading-tight">Total</span>
                  <span className="text-sm font-semibold leading-tight">{formatBRL(totalGeralMarca)}</span>
                </div>
              </div>

              {/* Legenda compacta à direita */}
              <div className="flex flex-col flex-1" style={{ gap: 4 }}>
                {donutSlices.map(({ marca, valor, pct }, i) => (
                  <div
                    key={marca}
                    className="flex items-center gap-2 text-sm rounded px-1 -mx-1"
                    style={{
                      paddingBottom: 4,
                      borderBottom: i < donutSlices.length - 1 ? "0.5px solid #e5e7eb" : undefined,
                    }}
                  >
                    <span
                      className="shrink-0"
                      style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: corMarca(marca) }}
                    />
                    <span className="flex-1 min-w-0 truncate">{marca}</span>
                    <span className="text-muted-foreground shrink-0 tabular-nums" style={{ width: 44, textAlign: "right" }}>
                      {(pct * 100).toFixed(1)}%
                    </span>
                    <span className="shrink-0 tabular-nums" style={{ fontWeight: 500, width: 88, textAlign: "right" }}>
                      {formatBRL(valor)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Número de pedidos</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.numPedidos}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ticket médio</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(kpis.ticketMedio)}</div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-[#ea580c] hover:shadow-sm transition"
          onClick={() => navigate("/meus-pedidos", { state: { filtroStatus: "sem_estoque" } })}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pedidos sem estoque</CardTitle>
            <PackageX className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-700">{kpis.pedidosSemEstoque}</div>
            <p className="text-xs text-muted-foreground mt-1">{formatBRL(kpis.valorSemEstoque)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Clique para ver pedidos</p>
          </CardContent>
        </Card>

        <Card className={kpis.rascunhos > 0 ? "border-amber-300" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Rascunhos abandonados</CardTitle>
            {kpis.rascunhos > 0 && <AlertTriangle className="h-4 w-4 text-amber-500" />}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${kpis.rascunhos > 0 ? "text-amber-600" : ""}`}>
              {kpis.rascunhos}
            </div>
            {kpis.rascunhos > 0 && (
              <p className="text-xs text-amber-600 mt-1">Pedidos não finalizados</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Clientes — período: {PERIODO_LABEL[periodo]} */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Clientes na carteira</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clientesPeriodo.carteira}</div>
            <p className="text-xs text-muted-foreground mt-1">ativos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Com pedido no período</CardTitle>
            <UserCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{clientesPeriodo.comPedido}</div>
            <p className="text-xs text-muted-foreground mt-1">{customAtivo ? "Período personalizado" : PERIODO_LABEL[periodo]}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Novos clientes</CardTitle>
            <UserPlus className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{clientesPeriodo.novos}</div>
            <p className="text-xs text-muted-foreground mt-1">cadastrados no período</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-amber-400 hover:shadow-sm transition"
          onClick={() => setModalSemPedidoOpen(true)}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sem pedido no período</CardTitle>
            <UserX className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">{clientesPeriodo.semPedidoList.length}</div>
            <p className="text-xs text-amber-600 mt-1">Clique para ver lista</p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={modalSemPedidoOpen} onOpenChange={setModalSemPedidoOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Clientes sem pedido — {customAtivo ? "Período personalizado" : PERIODO_LABEL[periodo]}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto rounded-md border">
            {clientesPeriodo.semPedidoList.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">Todos os clientes compraram no período</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Cidade</TableHead>
                    <TableHead>Último pedido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientesPeriodo.semPedidoList.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/clientes/${c.id}`)}
                    >
                      <TableCell className="text-sm font-medium">{c.razao_social}</TableCell>
                      <TableCell className="text-sm">{c.cidade ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {c.ultimo_pedido ? formatDate(c.ultimo_pedido) : "Nunca"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Minha posição no ranking — posições de todos, sem valores */}
      {rankingPosicoes.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Trophy className="h-5 w-5 text-primary" />
            <CardTitle>Minha posição no ranking</CardTitle>
            <span className="ml-auto text-xs text-muted-foreground">entrada de pedidos no período · sem valores</span>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {rankingPosicoes.map((r, idx) => (
                <div
                  key={`${r.nome}-${idx}`}
                  className={`flex items-center gap-3 rounded-md border px-3 py-2 ${r.isVoce ? "bg-emerald-50 border-emerald-300" : ""}`}
                >
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold tabular-nums">
                    {idx + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium truncate">{r.nome}</span>
                  {r.isVoce && (
                    <span className="inline-flex items-center rounded-full bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5">
                      Você
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top clientes — top 5 do vendedor por valor de entrada no período */}
      {topClientes.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Trophy className="h-5 w-5 text-amber-500" />
            <CardTitle>Top clientes</CardTitle>
            <span className="ml-auto text-xs text-muted-foreground">por entrada no período</span>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {topClientes.map((c, idx) => (
                <div key={c.cliente_id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold tabular-nums">
                    {idx + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium truncate">{c.nome}</span>
                  <span className="text-sm font-semibold text-green-700 tabular-nums">{formatBRL(c.total)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ranking de produtos — top 10 do vendedor (quantidade/valor) */}
      {(topSkus.length > 0 || topSkusValor.length > 0) && (
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
                            <TableCell className="font-mono text-sm">{s.codigo}</TableCell>
                            <TableCell className="text-sm">{s.nome}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{s.marca}</Badge></TableCell>
                            <TableCell className="text-right text-sm font-medium">{s.quantidade}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="valor">
                {topSkusValor.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum dado no período</p>
                ) : (
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
                            <TableCell className="font-mono text-sm">{s.codigo}</TableCell>
                            <TableCell className="text-sm">{s.nome}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{s.marca}</Badge></TableCell>
                            <TableCell className="text-right text-sm font-medium">{formatBRL(s.valor)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Produtos indisponíveis — bloco discreto */}
      {produtosIndisponiveis.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <PackageX className="h-4 w-4 text-red-600" />
            <CardTitle className="text-sm font-medium">Produtos sem estoque</CardTitle>
            <Badge variant="destructive" className="ml-auto">{produtosIndisponiveis.length}</Badge>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Esses produtos estão sem estoque, mas podem ser vendidos. Serão faturados quando houver disponibilidade.
            </p>
            <ul className="space-y-1">
              {produtosIndisponiveis.slice(0, 5).map((p) => (
                <li key={p.id} className="text-sm text-muted-foreground truncate">
                  {p.nome}
                </li>
              ))}
            </ul>
            {produtosIndisponiveis.length > 5 && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 mt-2 text-xs"
                onClick={() => setModalIndispOpen(true)}
              >
                ver todos ({produtosIndisponiveis.length})
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={modalIndispOpen} onOpenChange={setModalIndispOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Produtos sem estoque ({produtosIndisponiveis.length})</DialogTitle>
          </DialogHeader>
          <ul className="overflow-y-auto space-y-1 rounded-md border p-3">
            {produtosIndisponiveis.map((p) => (
              <li key={p.id} className="text-sm">{p.nome}</li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      {/* Campanha ativa — visão individual */}
      {campanhasAtivas.map((cv) => {
        const campanha = cv.campanha;
        const niveis = [...((campanha.campanha_niveis ?? []) as CampanhaNivel[])].sort(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (a: any, b: any) => (a.ordem ?? a.valor_minimo ?? 0) - (b.ordem ?? b.valor_minimo ?? 0),
        );
        const meta = cv.metaVendedor ?? 0;
        const ehUnidades = cv.metaTipo === "unidades";
        const metaAlvo = ehUnidades ? (cv.metaQuantidade ?? 0) : meta;
        const pctGeral = metaAlvo > 0 ? (cv.entrada / metaAlvo) * 100 : 0;
        const pct = Math.min(pctGeral, 100);
        const falta = metaAlvo > 0 ? Math.max(0, metaAlvo - cv.entrada) : 0;
        const diasRestantes = campanha.data_fim
          ? Math.max(0, Math.ceil((new Date(campanha.data_fim).getTime() - Date.now()) / 86400000))
          : 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nivelAtual: any = niveis.reduce((acc: any, n: any) => {
          if (cv.entrada >= Number(n.valor_minimo ?? 0)) {
            if (!acc || Number(n.valor_minimo ?? 0) >= Number(acc.valor_minimo ?? 0)) return n;
          }
          return acc;
        }, null);
        const barColor = pct >= 80 ? "#22c55e" : pct >= 50 ? "#eab308" : "#ef4444";

        return (
          <Card key={campanha.id}>
            <CardHeader className="flex flex-row items-center gap-2 pb-3">
              <Trophy className="h-5 w-5 text-primary" />
              <CardTitle>Campanha ativa</CardTitle>
              {nivelAtual && (
                <Badge className={`${nivelBadgeClass(nivelAtual.nome)} ml-2 text-xs`}>
                  Nível atual: {nivelAtual.nome}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1 space-y-2">
                  <h3 className="text-lg font-bold">{campanha.nome}</h3>
                  {campanha.descricao && (
                    <p className="text-sm text-muted-foreground">{campanha.descricao}</p>
                  )}
                  {cv.marcas.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {cv.marcas.map((m) => (
                        <Badge
                          key={m}
                          style={{ backgroundColor: corMarca(m), color: "#fff", border: "none" }}
                        >
                          {m}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {niveis.length > 0 && (
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
                        {niveis.map((nivel) => {
                          const atual = nivelAtual && nivel.id === nivelAtual.id;
                          return (
                            <TableRow key={nivel.id} className={atual ? "bg-muted/60" : ""}>
                              <TableCell className="font-medium">{nivel.nome}</TableCell>
                              <TableCell>{formatBRL(Number(nivel.valor_minimo ?? 0))}</TableCell>
                              <TableCell>
                                {nivel.valor_maximo == null ? "Sem limite" : formatBRL(Number(nivel.valor_maximo))}
                              </TableCell>
                              <TableCell className="text-sm">{nivel.descricao_premio}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <div className="border-t" />

              {/* Resumo geral da meta da campanha */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Meta total</div>
                  <div className="text-xl font-bold">
                    {ehUnidades
                      ? `${cv.metaQuantidade ?? 0} un.`
                      : meta > 0 ? formatBRL(meta) : "—"}
                  </div>
                  {cv.categoria && (
                    <Badge className={`${nivelBadgeClass(cv.categoria)} mt-1.5 text-xs`}>
                      {cv.categoria}
                    </Badge>
                  )}
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Total realizado</div>
                  <div className="text-xl font-bold text-green-700">
                    {ehUnidades ? `${cv.entrada} un.` : formatBRL(cv.entrada)}
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">% atingido</div>
                  <div className="text-xl font-bold">{metaAlvo > 0 ? `${pctGeral.toFixed(1)}%` : "—"}</div>
                  {metaAlvo > 0 && (
                    <div className="mt-1.5 h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: barColor }}
                      />
                    </div>
                  )}
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Dias restantes</div>
                  <div className="text-xl font-bold">{diasRestantes}</div>
                  {metaAlvo > 0 && falta > 0 && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Faltam {ehUnidades ? `${falta} un.` : formatBRL(falta)}
                    </div>
                  )}
                </div>
              </div>

              {/* Cards de realizado por marca */}
              {cv.marcas.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">Realizado por marca</div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {cv.marcas.map((marca) => {
                      const realizado = cv.entradaPorMarca[marca] ?? 0;
                      const pctMeta = meta > 0 ? (realizado / meta) * 100 : 0;
                      const pctBarra = Math.min(pctMeta, 100);
                      return (
                        <div key={marca} className="rounded-md border p-3 space-y-2">
                          <Badge
                            style={{ backgroundColor: corMarca(marca), color: "#fff", border: "none" }}
                          >
                            {marca}
                          </Badge>
                          <div>
                            <div className="text-xs text-muted-foreground">Realizado</div>
                            <div className="text-lg font-bold">{formatBRL(realizado)}</div>
                          </div>
                          {meta > 0 && (
                            <div className="space-y-1">
                              <div className="text-xs text-muted-foreground tabular-nums">
                                {pctMeta.toFixed(1)}% da meta total
                              </div>
                              <div className="h-2 w-full rounded-full bg-muted">
                                <div
                                  className="h-2 rounded-full bg-green-500 transition-all"
                                  style={{ width: `${pctBarra}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Campanhas ativas */}
      {campanhas.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Megaphone className="h-5 w-5 text-primary" />
            <CardTitle>Campanhas ativas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {campanhas.map((c) => {
                const diasCriado = Math.floor(
                  (Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24)
                );
                return (
                  <div key={c.id} className="rounded-md border p-3 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{c.nome}</span>
                      {diasCriado < 7 && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                          Novo
                        </span>
                      )}
                      {c.tipo && (
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TIPO_COLOR[c.tipo] ?? "bg-gray-100 text-gray-800 border-gray-300"}`}>
                          {TIPO_LABEL[c.tipo] ?? c.tipo}
                        </span>
                      )}
                    </div>
                    {c.descricao && (
                      <p className="text-xs text-muted-foreground">{c.descricao}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {c.valor != null && <span className="font-medium text-foreground">{c.valor}%</span>}
                      {c.data_fim && <span>Válida até {formatDate(c.data_fim)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Benefícios para clientes — campanhas ativas formatadas para oferecer durante a ligação */}
      {campanhas.length > 0 && (
        <Card className="border-emerald-300">
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Gift className="h-5 w-5 text-emerald-600" />
            <CardTitle>Benefícios para clientes</CardTitle>
            <span className="ml-auto text-xs text-muted-foreground">o que oferecer durante a ligação</span>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {campanhas.map((c) => (
                <div key={c.id} className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{c.nome}</span>
                    {c.tipo && (
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TIPO_COLOR[c.tipo] ?? "bg-gray-100 text-gray-800 border-gray-300"}`}>
                        {TIPO_LABEL[c.tipo] ?? c.tipo}
                      </span>
                    )}
                  </div>
                  {c.descricao && (
                    <p className="text-xs text-muted-foreground">{c.descricao}</p>
                  )}
                  {c.valor != null && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Valor/prêmio: </span>
                      <span className="font-semibold text-foreground">{c.valor}%</span>
                    </div>
                  )}
                  {(c.data_inicio || c.data_fim) && (
                    <div className="text-xs text-muted-foreground">
                      Vigência: {c.data_inicio ? formatDate(c.data_inicio) : "—"} até {c.data_fim ? formatDate(c.data_fim) : "sem prazo"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tarefas do dia */}
      {tarefasDia.length > 0 && (
        <Card className="border-blue-300">
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <CheckSquare className="h-5 w-5 text-blue-600" />
            <CardTitle>Tarefas do dia</CardTitle>
            <span className="ml-auto inline-flex items-center rounded-full bg-blue-600 text-white text-xs font-bold px-2 py-0.5">
              {tarefasDia.length}
            </span>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {tarefasDia.map((t) => (
                <div key={t.id} className="flex items-start gap-2 rounded-md border px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{t.titulo}</div>
                    {t.cliente_nome && (
                      <div className="text-xs text-muted-foreground">{t.cliente_nome}</div>
                    )}
                    {t.data_vencimento && (
                      <div className="text-xs text-red-600">
                        Vence: {new Date(t.data_vencimento + "T00:00:00").toLocaleDateString("pt-BR")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Clientes para reativar */}
      {clientesReativar.length > 0 && (
        <Card className="border-amber-300">
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <RefreshCw className="h-5 w-5 text-amber-600" />
            <CardTitle>Clientes para reativar</CardTitle>
            <span className="ml-auto text-xs text-muted-foreground">sem pedido há 30+ dias</span>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {clientesReativar.map((c) => (
                <div key={c.cliente_id} className="flex items-center justify-between rounded-md border px-3 py-2 gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.razao_social}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.dias_sem_compra} dias sem compra · LTV {formatBRL(c.ltv)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs shrink-0"
                    onClick={() => navigate(`/clientes/${c.cliente_id}`)}
                  >
                    Ver cliente
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Histórico dos últimos 3 meses */}
      {historicoMeses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Histórico dos últimos 3 meses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              {historicoMeses.map((m) => (
                <div key={`${m.mes}-${m.ano}`} className="rounded-md border p-3 space-y-1">
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    {m.mes}/{m.ano}
                  </div>
                  <div className="text-lg font-bold">{formatBRL(m.totalEntrada)}</div>
                  <div className="text-xs text-muted-foreground">{m.numPedidos} pedido(s)</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Últimos 5 pedidos */}
      <Card>
        <CardHeader>
          <CardTitle>Últimos pedidos</CardTitle>
        </CardHeader>
        <CardContent>
          {ultimosPedidos.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">Nenhum pedido encontrado</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ultimosPedidos.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono font-semibold">#{p.numero_pedido}</TableCell>
                      <TableCell className="text-sm">{formatDate(p.data_pedido)}</TableCell>
                      <TableCell className="text-sm">{p.razao_social}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[p.status] ?? "bg-gray-100 text-gray-800 border-gray-300"}`}>
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatBRL(p.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
