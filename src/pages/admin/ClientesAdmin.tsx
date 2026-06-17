import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { formatBRL, formatCNPJ, formatDate } from "@/lib/format";
import { CLUSTERS, TABELAS_PRECO, MARCAS } from "@/lib/constants";
import { Loader2, Search, ArrowRightLeft, Trash2, SlidersHorizontal, X, ExternalLink, ShoppingCart, FileText, CalendarClock } from "lucide-react";
import { TabelaPrecos } from "@/components/cliente/TabelaPrecos";

const STATUS_LABEL: Record<string, string> = {
  pendente_cadastro: "Pendente cadastro",
  aguardando_trade: "Aguardando trade",
  ativo: "Ativo",
  inativo: "Inativo",
};

const STATUS_COLOR: Record<string, string> = {
  pendente_cadastro: "bg-yellow-100 text-yellow-800 border-yellow-300",
  aguardando_trade: "bg-blue-100 text-blue-800 border-blue-300",
  ativo: "bg-green-100 text-green-800 border-green-300",
  inativo: "bg-gray-100 text-gray-600 border-gray-300",
};

const PIPELINE_ORDER = ["pendente_cadastro", "aguardando_trade", "ativo", "inativo"];

const ATIVIDADE_LABEL: Record<string, string> = {
  ativo: "Ativo (≤30 dias)",
  em_risco: "Em risco (31-90 dias)",
  inativo: "Inativo (>90 dias)",
};

const ATIVIDADE_COLOR: Record<string, string> = {
  ativo: "bg-green-100 text-green-800 border-green-300",
  em_risco: "bg-yellow-100 text-yellow-800 border-yellow-300",
  inativo: "bg-red-100 text-red-800 border-red-300",
};

function computeAtividade(data: string | null): "ativo" | "em_risco" | "inativo" {
  if (!data) return "inativo";
  const dias = Math.floor((Date.now() - new Date(data).getTime()) / 86_400_000);
  return dias <= 30 ? "ativo" : dias <= 90 ? "em_risco" : "inativo";
}

function calcCicloMedio(dates: Date[]): number | null {
  if (dates.length < 2) return null;
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  let totalDiff = 0;
  for (let i = 1; i < sorted.length; i++) {
    totalDiff += (sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24);
  }
  return totalDiff / (sorted.length - 1);
}

function abcBadge(abc: "A" | "B" | "C") {
  const cls = {
    A: "bg-green-100 text-green-800 border-green-400",
    B: "bg-yellow-100 text-yellow-800 border-yellow-400",
    C: "bg-orange-100 text-orange-800 border-orange-400",
  }[abc];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${cls}`}>
      {abc}
    </span>
  );
}

type Cliente = {
  id: string;
  razao_social: string;
  cnpj: string;
  status: string | null;
  cluster: string | null;
  tabela_preco: string | null;
  vendedor_id: string | null;
  negativado: boolean | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  comprador: string | null;
  codigo_parceiro: string | null;
  nome_parceiro: string | null;
  canal: string | null;
  suframa: boolean | null;
  desconto_adicional: number | null;
};

type LastOrder = { data_pedido: string; total: number };

type Agregado = { ltv: number; num_pedidos: number; marcas: string[]; dates: Date[] };

type Metrica = {
  rank: number;
  abc: "A" | "B" | "C";
  ltv: number;
  num_pedidos: number;
  ticket_medio: number;
  ciclo_medio: number | null;
  proxima_compra: Date | null;
  marcas: string[];
};

export default function ClientesAdmin() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [profileList, setProfileList] = useState<{ id: string; nome: string }[]>([]);
  const [lastOrders, setLastOrders] = useState<Record<string, LastOrder>>({});
  const [aggMap, setAggMap] = useState<Record<string, Agregado>>({});

  // Tabela de preços do cliente
  const [tabelaCliente, setTabelaCliente] = useState<Cliente | null>(null);
  const [tabelaClienteOpen, setTabelaClienteOpen] = useState(false);

  // Pipeline filters
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [showFiltros, setShowFiltros] = useState(false);
  const [filtroVendedor, setFiltroVendedor] = useState("todos");
  const [filtroCluster, setFiltroCluster] = useState("todos");
  const [filtroUFPipeline, setFiltroUFPipeline] = useState("todas");
  const [filtroTabela, setFiltroTabela] = useState("todos");
  const [filtroAtividade, setFiltroAtividade] = useState("todos");

  // Carteira filters
  const [buscaCarteira, setBuscaCarteira] = useState("");
  const [filtroVendedorCarteira, setFiltroVendedorCarteira] = useState("todos");
  const [filtroUF, setFiltroUF] = useState("todas");

  // Dados do mês atual por cliente
  const [fatMesCliente, setFatMesCliente] = useState<Record<string, number>>({});
  const [fatCampanhaCliente, setFatCampanhaCliente] = useState<Record<string, number>>({});
  const [metaVendedorMes, setMetaVendedorMes] = useState<Record<string, number>>({});
  const [metaCampVendedor, setMetaCampVendedor] = useState<Record<string, number>>({});
  const [campanhaAtiva, setCampanhaAtiva] = useState<{ nome: string; marcas: Set<string> } | null>(null);
  const [clientesComMetaTrade, setClientesComMetaTrade] = useState<Set<string>>(new Set());

  // Transferir
  const [transferirCliente, setTransferirCliente] = useState<Cliente | null>(null);
  const [novoVendedorId, setNovoVendedorId] = useState("");
  const [salvandoTransferencia, setSalvandoTransferencia] = useState(false);

  // Excluir
  const [excluirCliente, setExcluirCliente] = useState<Cliente | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = async () => {
    const [clRes, prRes, roleRes, loRes] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, razao_social, cnpj, status, cluster, tabela_preco, vendedor_id, negativado, cidade, uf, cep, comprador, codigo_parceiro, nome_parceiro, canal, suframa, desconto_adicional")
        .order("razao_social"),
      supabase.from("profiles").select("id, full_name, email"),
      supabase.from("user_roles").select("user_id").in("role", ["vendedor", "admin"]),
      supabase
        .from("pedidos")
        .select("cliente_id, data_pedido, itens_pedido(total_item, produtos(marca))")
        .neq("status", "rascunho")
        .order("data_pedido", { ascending: false }),
    ]);

    if (clRes.error) { toast.error("Erro ao carregar clientes"); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setClientes((clRes.data ?? []) as any[]);

    if (prRes.data) {
      const map: Record<string, string> = {};
      prRes.data.forEach((p) => { map[p.id] = p.full_name || p.email; });
      setProfiles(map);

      const vendedorIds = new Set((roleRes.data ?? []).map((r) => r.user_id));
      setProfileList(
        prRes.data
          .filter((p) => vendedorIds.has(p.id))
          .map((p) => ({ id: p.id, nome: p.full_name || p.email }))
          .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      );
    }

    if (loRes.data) {
      const map: Record<string, LastOrder> = {};
      const agg: Record<string, { ltv: number; num_pedidos: number; marcas: Set<string>; dates: Date[] }> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (loRes.data as any[]).forEach((p) => {
        if (!p.cliente_id) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const total = (p.itens_pedido ?? []).reduce((s: number, i: any) => s + Number(i.total_item), 0);
        // Pedidos vêm ordenados por data desc — o primeiro de cada cliente é o último pedido
        if (!map[p.cliente_id]) {
          map[p.cliente_id] = { data_pedido: p.data_pedido, total };
        }
        if (!agg[p.cliente_id]) agg[p.cliente_id] = { ltv: 0, num_pedidos: 0, marcas: new Set(), dates: [] };
        const e = agg[p.cliente_id];
        e.num_pedidos += 1;
        if (p.data_pedido) e.dates.push(new Date(p.data_pedido));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p.itens_pedido ?? []).forEach((item: any) => {
          e.ltv += Number(item.total_item);
          if (item.produtos?.marca) e.marcas.add(item.produtos.marca);
        });
      });
      setLastOrders(map);
      const aggOut: Record<string, Agregado> = {};
      Object.entries(agg).forEach(([k, v]) => {
        aggOut[k] = { ltv: v.ltv, num_pedidos: v.num_pedidos, marcas: Array.from(v.marcas), dates: v.dates };
      });
      setAggMap(aggOut);
    }

    // Dados adicionais do mês atual
    const now = new Date();
    const mesAtual = now.getMonth() + 1;
    const anoAtual = now.getFullYear();
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const mesInicio = `${anoAtual}-${pad2(mesAtual)}-01`;
    const mesFim = new Date(anoAtual, mesAtual, 0).toISOString().slice(0, 10);

    const [pedMesRes, metasMesRes, campRes] = await Promise.all([
      supabase
        .from("pedidos")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("cliente_id, vendedor_id, itens_pedido(total_item, produto:produtos(marca))" as any)
        .gte("data_pedido", mesInicio)
        .lte("data_pedido", mesFim)
        .not("status", "in", '("rascunho","cancelado","devolvido")'),
      supabase
        .from("metas")
        .select("vendedor_id, valor_meta_reais")
        .eq("mes", mesAtual)
        .eq("ano", anoAtual),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("campanhas").select("id, nome").eq("ativa", true).maybeSingle(),
    ]);

    // Faturamento do mês por cliente
    const fatMesMap: Record<string, number> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((pedMesRes.data ?? []) as any[]).forEach((p: any) => {
      if (!p.cliente_id) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const total = (p.itens_pedido ?? []).reduce((s: number, i: any) => s + Number(i.total_item), 0);
      fatMesMap[p.cliente_id] = (fatMesMap[p.cliente_id] ?? 0) + total;
    });
    setFatMesCliente(fatMesMap);

    // Meta mensal por vendedor
    const metaVendMap: Record<string, number> = {};
    (metasMesRes.data ?? []).forEach((m) => {
      if (m.vendedor_id) metaVendMap[m.vendedor_id] = Number(m.valor_meta_reais);
    });
    setMetaVendedorMes(metaVendMap);

    // Campanha ativa
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const campanha = (campRes as any).data ?? null;
    if (campanha) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: campProdData } = await (supabase as any)
        .from("campanha_produtos")
        .select("tipo, marca")
        .eq("campanha_id", campanha.id);

      const marcasCamp = new Set<string>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((campProdData ?? []) as any[])
          .filter((cp: any) => cp.tipo === "marca")
          .map((cp: any) => cp.marca as string)
      );
      setCampanhaAtiva({ nome: campanha.nome, marcas: marcasCamp });

      // Faturamento campanha por cliente
      const fatCampMap: Record<string, number> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((pedMesRes.data ?? []) as any[]).forEach((p: any) => {
        if (!p.cliente_id) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p.itens_pedido ?? []).forEach((item: any) => {
          const marca = item.produto?.marca as string | undefined;
          if (marca && marcasCamp.has(marca)) {
            fatCampMap[p.cliente_id] = (fatCampMap[p.cliente_id] ?? 0) + Number(item.total_item);
          }
        });
      });
      setFatCampanhaCliente(fatCampMap);

      // Meta campanha por vendedor
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: campMetasData } = await (supabase as any)
        .from("campanha_metas_vendedor")
        .select("vendedor_id, meta_valor")
        .eq("campanha_id", campanha.id);
      const metaCampMap: Record<string, number> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((campMetasData ?? []) as any[]).forEach((m: any) => {
        metaCampMap[m.vendedor_id] = Number(m.meta_valor);
      });
      setMetaCampVendedor(metaCampMap);
    } else {
      setCampanhaAtiva(null);
      setFatCampanhaCliente({});
      setMetaCampVendedor({});
    }

    // Clientes com meta definida pelo trade (em qualquer campanha ativa)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: campAtivas } = await (supabase as any)
        .from("campanhas")
        .select("id")
        .eq("ativa", true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ids = ((campAtivas ?? []) as any[]).map((c) => c.id);
      if (ids.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: mcs, error: mcsErr } = await (supabase as any)
          .from("campanha_metas_clientes")
          .select("cliente_id")
          .in("campanha_id", ids);
        if (!mcsErr && mcs) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setClientesComMetaTrade(new Set((mcs as any[]).map((r) => r.cliente_id)));
        }
      } else {
        setClientesComMetaTrade(new Set());
      }
    } catch {
      setClientesComMetaTrade(new Set());
    }
  };

  useEffect(() => {
    carregar().finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Curva ABC + métricas (LTV, ticket, ciclo, próxima compra) — ranking global por LTV
  const metricas = useMemo(() => {
    const list = clientes.map((c) => {
      const a = aggMap[c.id];
      const ltv = a?.ltv ?? 0;
      const num = a?.num_pedidos ?? 0;
      return {
        id: c.id,
        ltv,
        num_pedidos: num,
        ticket_medio: num > 0 ? ltv / num : 0,
        marcas: a?.marcas ?? [],
        dates: a?.dates ?? [],
      };
    });
    list.sort((x, y) => y.ltv - x.ltv);
    const total = list.length;
    const cutA = Math.ceil(total * 0.2);
    const cutB = Math.ceil(total * 0.5);
    const map: Record<string, Metrica> = {};
    list.forEach((c, idx) => {
      const abc: "A" | "B" | "C" = idx < cutA ? "A" : idx < cutB ? "B" : "C";
      const ciclo_medio = calcCicloMedio(c.dates);
      const sortedDates = [...c.dates].sort((a, b) => b.getTime() - a.getTime());
      const ultima = sortedDates[0] ?? null;
      let proxima_compra: Date | null = null;
      if (ultima && ciclo_medio) {
        proxima_compra = new Date(ultima.getTime() + ciclo_medio * 24 * 60 * 60 * 1000);
      }
      map[c.id] = {
        rank: idx + 1,
        abc,
        ltv: c.ltv,
        num_pedidos: c.num_pedidos,
        ticket_medio: c.ticket_medio,
        ciclo_medio,
        proxima_compra,
        marcas: c.marcas,
      };
    });
    return map;
  }, [clientes, aggMap]);

  const novoPedidoParaCliente = (c: Cliente) => {
    navigate("/novo-pedido", {
      state: {
        fromCliente: {
          cliente_id: c.id,
          cnpj: c.cnpj,
          razao_social: c.razao_social,
          cidade: c.cidade,
          uf: c.uf,
          cep: c.cep,
          comprador: c.comprador,
          cluster: c.cluster,
          tabela_preco: c.tabela_preco,
        },
      },
    });
  };

  const ufsUnicas = useMemo(() =>
    Array.from(new Set(clientes.map((c) => c.uf).filter(Boolean))).sort() as string[],
    [clientes]
  );

  const clustersUnicos = useMemo(() =>
    Array.from(new Set(clientes.map((c) => c.cluster).filter(Boolean))).sort() as string[],
    [clientes]
  );

  const tabelasUnicas = useMemo(() =>
    Array.from(new Set(clientes.map((c) => c.tabela_preco).filter(Boolean))).sort() as string[],
    [clientes]
  );

  const filtrosAtivos = filtroVendedor !== "todos" || filtroCluster !== "todos" ||
    filtroUFPipeline !== "todas" || filtroTabela !== "todos" || filtroAtividade !== "todos";

  const limparFiltros = () => {
    setFiltroVendedor("todos");
    setFiltroCluster("todos");
    setFiltroUFPipeline("todas");
    setFiltroTabela("todos");
    setFiltroAtividade("todos");
    setFiltroStatus("todos");
  };

  const filtrados = useMemo(() => {
    let lista = clientes;
    if (filtroStatus !== "todos") lista = lista.filter((c) => c.status === filtroStatus);
    if (filtroVendedor !== "todos") lista = lista.filter((c) => c.vendedor_id === filtroVendedor);
    if (filtroCluster !== "todos") lista = lista.filter((c) => c.cluster === filtroCluster);
    if (filtroUFPipeline !== "todas") lista = lista.filter((c) => c.uf === filtroUFPipeline);
    if (filtroTabela !== "todos") lista = lista.filter((c) => c.tabela_preco === filtroTabela);
    if (filtroAtividade !== "todos") {
      lista = lista.filter((c) => computeAtividade(lastOrders[c.id]?.data_pedido ?? null) === filtroAtividade);
    }
    if (busca.trim()) {
      const buscaL = busca.toLowerCase();
      const buscaD = busca.replace(/\D/g, "");
      lista = lista.filter((c) => {
        const matchNome = c.razao_social.toLowerCase().includes(buscaL);
        const matchCnpj = buscaD.length > 0 && c.cnpj.replace(/\D/g, "").includes(buscaD);
        return matchNome || matchCnpj;
      });
    }
    return lista;
  }, [clientes, filtroStatus, filtroVendedor, filtroCluster, filtroUFPipeline, filtroTabela, filtroAtividade, busca, lastOrders]);

  const carteira = useMemo(() => {
    let lista = clientes.filter((c) => c.vendedor_id != null || c.canal != null);
    if (buscaCarteira.trim()) {
      const bl = buscaCarteira.toLowerCase();
      const bd = buscaCarteira.replace(/\D/g, "");
      lista = lista.filter((c) =>
        c.razao_social.toLowerCase().includes(bl) ||
        (bd.length > 0 && c.cnpj.replace(/\D/g, "").includes(bd)) ||
        (c.codigo_parceiro ?? "").toLowerCase().includes(bl)
      );
    }
    if (filtroVendedorCarteira === "__sem_vendedor__") {
      lista = lista.filter((c) => !c.vendedor_id);
    } else if (filtroVendedorCarteira !== "todos") {
      lista = lista.filter((c) => c.vendedor_id === filtroVendedorCarteira);
    }
    if (filtroUF !== "todas") lista = lista.filter((c) => c.uf === filtroUF);
    return lista;
  }, [clientes, buscaCarteira, filtroVendedorCarteira, filtroUF]);

  const contagens = useMemo(() => {
    const counts: Record<string, number> = {};
    PIPELINE_ORDER.forEach((s) => { counts[s] = 0; });
    clientes.forEach((c) => { const s = c.status ?? "ativo"; counts[s] = (counts[s] ?? 0) + 1; });
    return counts;
  }, [clientes]);

  const transferir = async () => {
    if (!transferirCliente) return;
    setSalvandoTransferencia(true);
    const { error } = await supabase
      .from("clientes")
      .update({ vendedor_id: novoVendedorId || null, canal: null })
      .eq("id", transferirCliente.id);
    setSalvandoTransferencia(false);
    if (error) { toast.error("Erro ao transferir: " + error.message); return; }
    toast.success(`${transferirCliente.nome_parceiro || transferirCliente.razao_social} transferido`);
    setTransferirCliente(null);
    setNovoVendedorId("");
    setClientes((prev) =>
      prev.map((c) => c.id === transferirCliente.id ? { ...c, vendedor_id: novoVendedorId || null, canal: null } : c)
    );
  };

  const excluir = async () => {
    if (!excluirCliente) return;
    setExcluindo(true);
    const { error } = await supabase.from("clientes").delete().eq("id", excluirCliente.id);
    setExcluindo(false);
    if (error) { toast.error("Erro ao excluir: " + error.message); return; }
    toast.success(`${excluirCliente.nome_parceiro || excluirCliente.razao_social} excluído`);
    setExcluirCliente(null);
    setClientes((prev) => prev.filter((c) => c.id !== excluirCliente.id));
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
      <div>
        <h1 className="text-2xl font-bold">Clientes</h1>
        <p className="text-sm text-muted-foreground">Todos os clientes da carteira</p>
      </div>

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="carteira">Carteira</TabsTrigger>
        </TabsList>

        {/* ABA PIPELINE */}
        <TabsContent value="pipeline" className="space-y-4 mt-4">
          {/* Kanban */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PIPELINE_ORDER.map((status) => (
              <button
                key={status}
                onClick={() => setFiltroStatus(filtroStatus === status ? "todos" : status)}
                className={`rounded-lg border p-4 text-left transition-all hover:shadow-sm ${filtroStatus === status ? "ring-2 ring-primary" : ""} ${STATUS_COLOR[status] ?? "bg-gray-50 border-gray-200"}`}
              >
                <div className="text-xs font-medium uppercase tracking-wide opacity-70">{STATUS_LABEL[status] ?? status}</div>
                <div className="text-3xl font-bold mt-1">{contagens[status] ?? 0}</div>
              </button>
            ))}
          </div>

          {/* Busca + toggle filtros */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por nome ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {PIPELINE_ORDER.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              variant={showFiltros ? "default" : "outline"}
              onClick={() => setShowFiltros((v) => !v)}
              className="gap-2"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
              {filtrosAtivos && <span className="ml-1 rounded-full bg-primary-foreground text-primary text-xs px-1.5">✓</span>}
            </Button>
            {filtrosAtivos && (
              <Button variant="ghost" size="icon" onClick={limparFiltros} title="Limpar filtros">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Painel de filtros avançados */}
          {showFiltros && (
            <div className="rounded-md border bg-muted/20 p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Vendedor</label>
                <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {profileList.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Cluster</label>
                <Select value={filtroCluster} onValueChange={setFiltroCluster}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {clustersUnicos.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    {CLUSTERS.filter((c) => !clustersUnicos.includes(c)).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">UF</label>
                <Select value={filtroUFPipeline} onValueChange={setFiltroUFPipeline}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    {ufsUnicas.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Tabela de preço</label>
                <Select value={filtroTabela} onValueChange={setFiltroTabela}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    {TABELAS_PRECO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    {tabelasUnicas.filter((t) => !TABELAS_PRECO.find((x) => x.value === t)).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Status de atividade</label>
                <Select value={filtroAtividade} onValueChange={setFiltroAtividade}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="ativo">Ativo (≤30 dias)</SelectItem>
                    <SelectItem value="em_risco">Em risco (31-90 dias)</SelectItem>
                    <SelectItem value="inativo">Inativo (&gt;90 dias)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <p className="text-sm text-muted-foreground">{filtrados.length} cliente(s)</p>

          {filtrados.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum cliente encontrado</CardContent></Card>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead className="w-10">ABC</TableHead>
                    <TableHead>Razão Social</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Cidade / UF</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Cluster</TableHead>
                    <TableHead>Tabela</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">LTV</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                    <TableHead className="text-right">Ticket médio</TableHead>
                    <TableHead>Ciclo médio</TableHead>
                    <TableHead>Próxima compra</TableHead>
                    <TableHead>Último Pedido</TableHead>
                    <TableHead>Mês Atual</TableHead>
                    <TableHead>Marcas</TableHead>
                    <TableHead>Negativado</TableHead>
                    <TableHead className="w-32">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtrados.map((c) => {
                    const lo = lastOrders[c.id];
                    const atv = computeAtividade(lo?.data_pedido ?? null);
                    const m = metricas[c.id];
                    const vencida = m?.proxima_compra && m.proxima_compra.getTime() < Date.now();
                    return (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/clientes/${c.id}`)}>
                        <TableCell className="font-mono text-muted-foreground text-sm">{m?.rank ?? "—"}</TableCell>
                        <TableCell>{m ? abcBadge(m.abc) : <span className="text-muted-foreground text-sm">—</span>}</TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>{c.nome_parceiro || c.razao_social}</span>
                            {clientesComMetaTrade.has(c.id) && (
                              <Badge className="bg-purple-100 text-purple-800 border-purple-300 text-xs">Meta trade</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">{formatCNPJ(c.cnpj)}</TableCell>
                        <TableCell className="text-sm">{[c.cidade, c.uf].filter(Boolean).join(" / ") || "—"}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[c.status ?? ""] ?? "bg-gray-100 text-gray-600 border-gray-300"}`}>
                            {STATUS_LABEL[c.status ?? ""] ?? (c.status ?? "—")}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {c.cluster ? <Badge variant="outline">{c.cluster}</Badge> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm">{c.tabela_preco ?? "—"}</TableCell>
                        <TableCell className="text-sm">{c.vendedor_id ? (profiles[c.vendedor_id] ?? "—") : "—"}</TableCell>
                        <TableCell className="text-right font-semibold">{formatBRL(m?.ltv ?? 0)}</TableCell>
                        <TableCell className="text-right text-sm">{m?.num_pedidos ?? 0}</TableCell>
                        <TableCell className="text-right text-sm">{formatBRL(m?.ticket_medio ?? 0)}</TableCell>
                        <TableCell className="text-sm">
                          {m?.ciclo_medio != null ? `${Math.round(m.ciclo_medio)} dias` : "—"}
                        </TableCell>
                        <TableCell>
                          {m?.proxima_compra ? (
                            <span className={`flex items-center gap-1 text-sm ${vencida ? "text-red-600 font-medium" : "text-foreground"}`}>
                              {vencida && <CalendarClock className="h-3 w-3" />}
                              {m.proxima_compra.toLocaleDateString("pt-BR")}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {lo ? (
                            <div>
                              <div className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs font-medium mb-0.5 ${ATIVIDADE_COLOR[atv]}`}>
                                {ATIVIDADE_LABEL[atv]}
                              </div>
                              <div className="text-xs text-muted-foreground">{formatDate(lo.data_pedido)}</div>
                              <div className="text-xs font-medium">{formatBRL(lo.total)}</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs min-w-[160px]">
                          {(() => {
                            const fatMes = fatMesCliente[c.id] ?? 0;
                            const fatCamp = fatCampanhaCliente[c.id] ?? 0;
                            const metaVend = c.vendedor_id ? (metaVendedorMes[c.vendedor_id] ?? null) : null;
                            const metaCamp = c.vendedor_id ? (metaCampVendedor[c.vendedor_id] ?? null) : null;
                            if (fatMes === 0 && !metaVend && !metaCamp) return <span className="text-muted-foreground">—</span>;
                            const pctMes = metaVend && metaVend > 0 ? Math.min((fatMes / metaVend) * 100, 100) : 0;
                            const barColor = pctMes >= 70 ? "#22c55e" : "#ef4444";
                            return (
                              <div className="space-y-1">
                                {fatMes > 0 && (
                                  <div>
                                    <div className="font-medium text-foreground">{formatBRL(fatMes)}</div>
                                    <div className="text-muted-foreground">realizado no mês</div>
                                  </div>
                                )}
                                {campanhaAtiva && fatCamp > 0 && (
                                  <div className="text-muted-foreground">
                                    {campanhaAtiva.nome}: <span className="font-medium text-foreground">{formatBRL(fatCamp)}</span>
                                  </div>
                                )}
                                {metaVend && (
                                  <div>
                                    <div className="text-muted-foreground">Meta vendedor: {formatBRL(metaVend)}</div>
                                    <div className="h-1 w-full rounded-full bg-muted overflow-hidden mt-0.5">
                                      <div className="h-full rounded-full" style={{ width: `${pctMes}%`, backgroundColor: barColor }} />
                                    </div>
                                    <div className="text-muted-foreground">{pctMes.toFixed(0)}%{pctMes >= 100 ? " ✓" : ""}</div>
                                  </div>
                                )}
                                {campanhaAtiva && metaCamp && (
                                  <div className="text-muted-foreground">
                                    Meta camp.: {formatBRL(metaCamp)}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {MARCAS.map((marca) => {
                              const tem = (m?.marcas ?? []).includes(marca);
                              return (
                                <Badge
                                  key={marca}
                                  variant="outline"
                                  className={`text-xs ${tem ? "border-green-400 bg-green-50 text-green-700" : "border-red-300 bg-red-50 text-red-600"}`}
                                >
                                  {marca}
                                </Badge>
                              );
                            })}
                          </div>
                        </TableCell>
                        <TableCell>
                          {c.negativado ? (
                            <Badge variant="destructive" className="text-xs">Sim</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Não</span>
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon" variant="ghost" className="h-7 w-7 text-primary hover:bg-primary/10"
                              title="Novo pedido para este cliente"
                              onClick={() => novoPedidoParaCliente(c)}
                            >
                              <ShoppingCart className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon" variant="ghost" className="h-7 w-7"
                              title="Ver tabela de preços"
                              onClick={() => { setTabelaCliente(c); setTabelaClienteOpen(true); }}
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon" variant="ghost" className="h-7 w-7"
                              title="Abrir detalhes (preços, histórico, financeiro)"
                              onClick={() => navigate(`/clientes/${c.id}`)}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon" variant="ghost" className="h-7 w-7"
                              title="Excluir cliente"
                              onClick={() => setExcluirCliente(c)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ABA CARTEIRA */}
        <TabsContent value="carteira" className="space-y-4 mt-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por nome, CNPJ ou código..." value={buscaCarteira} onChange={(e) => setBuscaCarteira(e.target.value)} />
            </div>
            <Select value={filtroVendedorCarteira} onValueChange={setFiltroVendedorCarteira}>
              <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Vendedor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="__sem_vendedor__">Sem vendedor (canal digital)</SelectItem>
                {profileList.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroUF} onValueChange={setFiltroUF}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="UF" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as UFs</SelectItem>
                {ufsUnicas.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <p className="text-sm text-muted-foreground">{carteira.length} clientes</p>

          {carteira.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum cliente encontrado</CardContent></Card>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Razão Social</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Tabela</TableHead>
                    <TableHead>UF</TableHead>
                    <TableHead>Último Pedido</TableHead>
                    <TableHead className="w-32">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {carteira.map((c) => {
                    const lo = lastOrders[c.id];
                    return (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/clientes/${c.id}`)}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>{c.nome_parceiro || c.razao_social}</span>
                            {clientesComMetaTrade.has(c.id) && (
                              <Badge className="bg-purple-100 text-purple-800 border-purple-300 text-xs">Meta trade</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">{formatCNPJ(c.cnpj)}</TableCell>
                        <TableCell>
                          {c.canal ? (
                            <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300 text-xs">{c.canal}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{c.vendedor_id ? (profiles[c.vendedor_id] ?? "—") : "—"}</TableCell>
                        <TableCell className="text-sm">{c.tabela_preco ?? "—"}</TableCell>
                        <TableCell className="text-sm">{c.uf ?? "—"}</TableCell>
                        <TableCell className="text-sm">
                          {lo ? (
                            <div className="text-xs">
                              <div className="text-muted-foreground">{formatDate(lo.data_pedido)}</div>
                              <div className="font-medium">{formatBRL(lo.total)}</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" title="Abrir detalhes (preços, histórico, financeiro)"
                              onClick={() => navigate(`/clientes/${c.id}`)}>
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" title="Transferir vendedor"
                              onClick={() => { setTransferirCliente(c); setNovoVendedorId(c.vendedor_id ?? ""); }}>
                              <ArrowRightLeft className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" title="Excluir cliente"
                              onClick={() => setExcluirCliente(c)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog — Transferir */}
      <Dialog open={!!transferirCliente} onOpenChange={(o) => !o && setTransferirCliente(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Transferir cliente</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Transferir <strong>{transferirCliente?.nome_parceiro || transferirCliente?.razao_social}</strong> para:
            </p>
            <Select value={novoVendedorId} onValueChange={setNovoVendedorId}>
              <SelectTrigger><SelectValue placeholder="Selecionar vendedor..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— Sem vendedor —</SelectItem>
                {profileList.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferirCliente(null)}>Cancelar</Button>
            <Button onClick={transferir} disabled={salvandoTransferencia}>
              {salvandoTransferencia && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog — Excluir */}
      <AlertDialog open={!!excluirCliente} onOpenChange={(o) => !o && setExcluirCliente(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. <strong>{excluirCliente?.nome_parceiro || excluirCliente?.razao_social}</strong> e todos os seus dados serão removidos do banco.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluir} disabled={excluindo} className="bg-red-600 hover:bg-red-700">
              {excluindo && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Excluir permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog — Tabela de preços do cliente */}
      <Dialog open={tabelaClienteOpen} onOpenChange={setTabelaClienteOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tabela de Preços — {tabelaCliente?.nome_parceiro || tabelaCliente?.razao_social}</DialogTitle>
          </DialogHeader>
          {tabelaCliente && (
            <TabelaPrecos
              clienteId={tabelaCliente.id}
              clienteRazaoSocial={tabelaCliente.nome_parceiro || tabelaCliente.razao_social}
              clienteCnpj={tabelaCliente.cnpj ?? ""}
              clienteCidade={tabelaCliente.cidade}
              clienteUf={tabelaCliente.uf}
              clienteTabela={tabelaCliente.tabela_preco}
              clienteCluster={tabelaCliente.cluster}
              clienteDescontoAdicional={tabelaCliente.desconto_adicional}
              suframa={tabelaCliente.suframa}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
