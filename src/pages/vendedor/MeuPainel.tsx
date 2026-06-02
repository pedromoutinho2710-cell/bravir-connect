import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL, formatDate } from "@/lib/format";
import { STATUS_LABEL, STATUS_COLOR } from "./MeusPedidos";
import { exportarTabelaPrecosExcel, type ProdutoTabela } from "@/lib/excel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, AlertTriangle, Download, TrendingUp, ShoppingCart, Users, Megaphone, RefreshCw, CheckSquare, CheckCircle2, ArrowDownToLine, CheckCheck, Clock, UserCheck, UserX, Briefcase, Gift, Trophy, PackageX } from "lucide-react";
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

type Periodo = "hoje" | "semana" | "mes" | "ano";

const PERIODO_LABEL: Record<Periodo, string> = {
  hoje: "Hoje",
  semana: "Esta semana",
  mes: "Este mês",
  ano: "Este ano",
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
    const fim = new Date(y, m, d - dow + 6);
    return { inicio: fmt(inicio), fim: fmt(fim) };
  }
  if (p === "ano") {
    return { inicio: `${y}-01-01`, fim: `${y}-12-31` };
  }
  return { inicio: fmt(new Date(y, m, 1)), fim: fmt(new Date(y, m + 1, 0)) };
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

const MARCA_CORES: Record<string, string> = {
  "Bendita Cânfora": "#7f77dd",
  "Laby": "#378add",
  "Bravir": "#888780",
  "Alivik": "#1d9e75",
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
  const navigate = useNavigate();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [customInicio, setCustomInicio] = useState("");
  const [customFim, setCustomFim] = useState("");
  const [customAtivo, setCustomAtivo] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [periodTotais, setPeriodTotais] = useState<PeriodTotais>({ entrada: 0, faturado: 0, aFaturar: 0 });
  const [loadingPeriodo, setLoadingPeriodo] = useState(false);
  const [kpis, setKpis] = useState<KPIs>({ faturamento: 0, numPedidos: 0, ticketMedio: 0, rascunhos: 0, meta: 0, aFaturar: 0, pedidosSemEstoque: 0, valorSemEstoque: 0 });
  const [ultimosPedidos, setUltimosPedidos] = useState<UltimoPedido[]>([]);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [clientesReativar, setClientesReativar] = useState<ClienteReativar[]>([]);
  const [tarefasDia, setTarefasDia] = useState<TarefaDia[]>([]);
  const [loading, setLoading] = useState(true);
  const [baixandoTabela, setBaixandoTabela] = useState(false);
  const [clientesPeriodo, setClientesPeriodo] = useState<ClientesPeriodo>({ carteira: 0, comPedido: 0, semPedidoList: [] });
  const [modalSemPedidoOpen, setModalSemPedidoOpen] = useState(false);
  const [campanhaAtiva, setCampanhaAtiva] = useState<CampanhaAtiva | null>(null);
  const [campanhaMarcas, setCampanhaMarcas] = useState<string[]>([]);
  const [campanhaEntrada, setCampanhaEntrada] = useState(0);
  const [campanhaEntradaPorMarca, setCampanhaEntradaPorMarca] = useState<Record<string, number>>({});
  const [campanhaMetaVendedor, setCampanhaMetaVendedor] = useState<number | null>(null);
  const [faturadoMesAtual, setFaturadoMesAtual] = useState(0);
  const [faturamentoRealMes, setFaturamentoRealMes] = useState<number | null>(null);
  const [faturamentoRealMesAnterior, setFaturamentoRealMesAnterior] = useState<number | null>(null);
  const [vendedorFullName, setVendedorFullName] = useState<string | null>(null);
  const [produtosIndisponiveis, setProdutosIndisponiveis] = useState<{ id: string; nome: string }[]>([]);
  const [modalIndispOpen, setModalIndispOpen] = useState(false);
  const [historicoMeses, setHistoricoMeses] = useState<HistoricoMes[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: campanha } = await (supabase as any)
        .from("campanhas")
        .select("*, campanha_niveis(*)")
        .eq("ativa", true)
        .maybeSingle();

      if (!campanha) {
        setCampanhaAtiva(null);
        setCampanhaMarcas([]);
        setCampanhaEntrada(0);
        setCampanhaEntradaPorMarca({});
        setCampanhaMetaVendedor(null);
        return;
      }

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

      setCampanhaAtiva(campanha as CampanhaAtiva);
      setCampanhaMarcas(marcasArr);

      // Itens do vendedor no período da campanha
      const { data: pedidosCampData } = await supabase
        .from("pedidos")
        .select("id, vendedor_id, data_pedido, status, itens_pedido(quantidade, total_item, produto_id, produtos(marca))")
        .eq("vendedor_id", user.id)
        .gte("data_pedido", campanha.data_inicio)
        .lte("data_pedido", campanha.data_fim)
        .not("status", "in", '("rascunho","cancelado")');

      let entrada = 0;
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
            const chaveMarca = marca ?? "Outros";
            porMarca[chaveMarca] = (porMarca[chaveMarca] ?? 0) + valor;
          }
        }
      }
      setCampanhaEntrada(entrada);
      setCampanhaEntradaPorMarca(porMarca);

      // Meta individual do vendedor na campanha
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: metaData } = await (supabase as any)
        .from("campanha_metas_vendedor")
        .select("meta_valor")
        .eq("campanha_id", campanha.id)
        .eq("vendedor_id", user.id)
        .maybeSingle();

      setCampanhaMetaVendedor(metaData?.meta_valor != null ? Number(metaData.meta_valor) : null);
    })();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const agora = new Date();
      const mesInicio = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-01`;
      const mesFim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).toISOString().slice(0, 10);

      const [pedidosRes, rascunhosRes, metasRes, ultimosRes] = await Promise.all([
        supabase
          .from("pedidos")
          .select("id, status, itens_pedido(total_item)")
          .eq("vendedor_id", user.id)
          .gte("data_pedido", mesInicio)
          .lte("data_pedido", mesFim)
          .not("status", "in", '("rascunho","cancelado")'),
        supabase
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .eq("vendedor_id", user.id)
          .eq("status", "rascunho"),
        supabase
          .from("metas")
          .select("valor_meta_reais")
          .eq("vendedor_id", user.id)
          .eq("mes", agora.getMonth() + 1)
          .eq("ano", agora.getFullYear())
          .maybeSingle(),
        supabase
          .from("pedidos")
          .select("id, numero_pedido, status, data_pedido, itens_pedido(total_item), clientes(razao_social, nome_parceiro)")
          .eq("vendedor_id", user.id)
          .not("status", "in", '("rascunho")')
          .order("created_at", { ascending: false }),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pedidos = (pedidosRes.data ?? []) as any[];
      let faturamento = 0;
      let pedidosSemEstoque = 0;
      let valorSemEstoque = 0;
      let aFaturar = 0;
      pedidos.forEach((p) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const total = (p.itens_pedido ?? []).reduce((si: number, i: any) => si + Number(i.total_item), 0);
        faturamento += total;
        if (p.status === "sem_estoque") {
          pedidosSemEstoque++;
          valorSemEstoque += total;
        }
        if (p.status === "no_sankhya" || p.status === "parcialmente_faturado") {
          aFaturar += total;
        }
      });
      const numPedidos = pedidos.length;
      const ticketMedio = numPedidos > 0 ? faturamento / numPedidos : 0;
      const rascunhos = rascunhosRes.count ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meta = Number((metasRes.data as any)?.valor_meta_reais ?? 0);

      setKpis({ faturamento, numPedidos, ticketMedio, rascunhos, meta, aFaturar, pedidosSemEstoque, valorSemEstoque });

      // Second wave: campanhas, reativação via RPC, tarefas — all in parallel
      const hoje = agora.toISOString().slice(0, 10);

      const [campRes, ltvRes, tarRes] = await Promise.all([
        supabase
          .from("campanhas")
          .select("id, nome, descricao, tipo, valor, data_inicio, data_fim, created_at")
          .eq("ativa", true)
          .or(`data_fim.is.null,data_fim.gte.${hoje}`),
        // RPC returns aggregated rows (≤10) instead of entire order history
        supabase.rpc("vendedor_ltv_clientes", { _vendedor_id: user.id }),
        supabase
          .from("tarefas")
          .select("id, titulo, data_vencimento, concluida, cliente_id, clientes(razao_social, nome_parceiro)")
          .eq("vendedor_id", user.id)
          .eq("concluida", false)
          .or(`data_vencimento.is.null,data_vencimento.lte.${hoje}`)
          .order("data_vencimento", { ascending: true }),
      ]);

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
    })().finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelado = false;
    setLoadingPeriodo(true);
    (async () => {
      const { inicio, fim } = rangeEfetivo(periodo, customAtivo, customInicio, customFim);
      const { data, error } = await supabase
        .from("pedidos")
        .select("status, itens_pedido(total_item)")
        .eq("vendedor_id", user.id)
        .gte("data_pedido", inicio)
        .lte("data_pedido", fim)
        .not("status", "in", '("rascunho","cancelado")');
      if (cancelado) return;
      if (error) {
        toast.error("Erro ao carregar totais do período");
        setPeriodTotais({ entrada: 0, faturado: 0, aFaturar: 0 });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pedidos = (data ?? []) as any[];
        let entrada = 0, faturado = 0, aFaturar = 0;
        for (const p of pedidos) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const total = (p.itens_pedido ?? []).reduce((s: number, i: any) => s + Number(i.total_item), 0);
          entrada += total;
          if (p.status === "faturado" || p.status === "parcialmente_faturado") faturado += total;
          if (p.status === "no_sankhya" || p.status === "parcialmente_faturado") aFaturar += total;
        }
        setPeriodTotais({ entrada, faturado, aFaturar });
      }
      setLoadingPeriodo(false);
    })();
    return () => { cancelado = true; };
  }, [user, periodo, customAtivo, customInicio, customFim]);

  // Faturado do mês — agora vem de faturamentos_sankhya casado por nome_vendedor.
  // Busca profiles.full_name → ILIKE em faturamentos_sankhya.nome_vendedor.
  useEffect(() => {
    if (!user) return;
    let cancelado = false;
    (async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      const fullName = prof?.full_name?.trim() || null;
      if (cancelado) return;
      setVendedorFullName(fullName);

      if (!fullName) {
        setFaturadoMesAtual(0);
        setFaturamentoRealMes(null);
        setFaturamentoRealMesAnterior(null);
        return;
      }

      const agora = new Date();
      const mesInicio = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-01`;
      const mesFim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).toISOString().slice(0, 10);
      const antAno = agora.getMonth() === 0 ? agora.getFullYear() - 1 : agora.getFullYear();
      const antMes = agora.getMonth() === 0 ? 12 : agora.getMonth();
      const antInicio = `${antAno}-${String(antMes).padStart(2, "0")}-01`;
      const antFim = new Date(antAno, antMes, 0).toISOString().slice(0, 10);

      // TODO: adicionar faturamentos_sankhya ao types.ts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [atualRes, antRes] = await Promise.all([
        (supabase as any)
          .from("faturamentos_sankhya")
          .select("valor_liquido")
          .ilike("nome_vendedor", `%${fullName}%`)
          .gte("data_faturamento", mesInicio)
          .lte("data_faturamento", mesFim)
          .not("tipo_operacao", "ilike", "%devolução%"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("faturamentos_sankhya")
          .select("valor_liquido")
          .ilike("nome_vendedor", `%${fullName}%`)
          .gte("data_faturamento", antInicio)
          .lte("data_faturamento", antFim)
          .not("tipo_operacao", "ilike", "%devolução%"),
      ]);
      if (cancelado) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sumAtual = ((atualRes.data ?? []) as any[]).reduce((s, r) => s + Number(r.valor_liquido ?? 0), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sumAnt = ((antRes.data ?? []) as any[]).reduce((s, r) => s + Number(r.valor_liquido ?? 0), 0);
      setFaturadoMesAtual(sumAtual);
      setFaturamentoRealMes(sumAtual);
      setFaturamentoRealMesAnterior(sumAnt);
    })();
    return () => { cancelado = true; };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
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
            .eq("vendedor_id", user.id)
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
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const { inicio, fim } = rangeEfetivo(periodo, customAtivo, customInicio, customFim);
    (async () => {
      const [carteiraRes, pedidosRes] = await Promise.all([
        supabase
          .from("clientes")
          .select("id, razao_social, nome_parceiro, cidade", { count: "exact" })
          .eq("vendedor_id", user.id)
          .eq("status", "ativo"),
        supabase
          .from("pedidos")
          .select("cliente_id, data_pedido")
          .eq("vendedor_id", user.id)
          .gte("data_pedido", inicio)
          .lte("data_pedido", fim)
          .not("status", "in", '("cancelado","devolvido")'),
      ]);

      if (carteiraRes.error || pedidosRes.error) {
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
          .eq("vendedor_id", user.id)
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
        semPedidoList,
      });
    })();
  }, [user, periodo, customAtivo, customInicio, customFim]);

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

  const metaPct = kpis.meta > 0 ? Math.min((kpis.faturamento / kpis.meta) * 100, 100) : 0;
  const metaColor = metaPct >= 80 ? "bg-green-500" : metaPct >= 50 ? "bg-yellow-400" : "bg-red-500";

  const baixarTabela = async () => {
    setBaixandoTabela(true);
    try {
      const [prodRes, precoRes] = await Promise.all([
        supabase.from("produtos").select("id, codigo_jiva, nome, marca").eq("ativo", true).order("marca").order("nome"),
        supabase.from("precos").select("produto_id, tabela, preco_bruto"),
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                    style={{ width: `${metaPct}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

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
      {campanhaAtiva && (() => {
        const niveis = [...((campanhaAtiva.campanha_niveis ?? []) as CampanhaNivel[])].sort(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (a: any, b: any) => (a.ordem ?? a.valor_minimo ?? 0) - (b.ordem ?? b.valor_minimo ?? 0),
        );
        const meta = campanhaMetaVendedor ?? 0;
        const pct = meta > 0 ? Math.min((campanhaEntrada / meta) * 100, 100) : 0;
        const falta = meta > 0 ? Math.max(0, meta - campanhaEntrada) : 0;
        const diasRestantes = campanhaAtiva.data_fim
          ? Math.max(0, Math.ceil((new Date(campanhaAtiva.data_fim).getTime() - Date.now()) / 86400000))
          : 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nivelAtual: any = niveis.reduce((acc: any, n: any) => {
          if (campanhaEntrada >= Number(n.valor_minimo ?? 0)) {
            if (!acc || Number(n.valor_minimo ?? 0) >= Number(acc.valor_minimo ?? 0)) return n;
          }
          return acc;
        }, null);
        const barColor = pct >= 80 ? "#22c55e" : pct >= 50 ? "#eab308" : "#ef4444";

        return (
          <Card>
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
                  <h3 className="text-lg font-bold">{campanhaAtiva.nome}</h3>
                  {campanhaAtiva.descricao && (
                    <p className="text-sm text-muted-foreground">{campanhaAtiva.descricao}</p>
                  )}
                  {campanhaMarcas.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {campanhaMarcas.map((m) => (
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

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {meta > 0 ? (
                      <>
                        Meta: {formatBRL(meta)} → Entrada: {formatBRL(campanhaEntrada)} · {pct.toFixed(1)}% atingido
                      </>
                    ) : (
                      <>Entrada na campanha: {formatBRL(campanhaEntrada)} · sem meta definida</>
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    {meta > 0 && falta > 0 && <>Faltam {formatBRL(falta)} · </>}
                    {diasRestantes} dias restantes
                  </span>
                </div>
                {meta > 0 && (
                  <div className="h-2 w-full rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: barColor }}
                    />
                  </div>
                )}
              </div>

              {Object.keys(campanhaEntradaPorMarca).length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">Entrada por marca</div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {Object.entries(campanhaEntradaPorMarca)
                      .sort(([, a], [, b]) => b - a)
                      .map(([marca, valor]) => {
                        const pctMarca = campanhaEntrada > 0 ? (valor / campanhaEntrada) * 100 : 0;
                        return (
                          <div key={marca} className="flex items-center gap-2 text-xs">
                            <span
                              className="shrink-0"
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: 2,
                                backgroundColor: MARCA_CORES[marca] ?? "#888780",
                              }}
                            />
                            <span className="flex-1 truncate">{marca}</span>
                            <span className="text-muted-foreground tabular-nums">{pctMarca.toFixed(1)}%</span>
                            <span className="font-medium tabular-nums">{formatBRL(valor)}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

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
