import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatBRL, formatCNPJ, formatDate } from "@/lib/format";
import { MARCAS } from "@/lib/constants";
import { Loader2, Search, CalendarClock, CheckCircle2, Plus, UserMinus, ShoppingCart, FileText, Download } from "lucide-react";
import { toast } from "sonner";
import { STATUS_LABEL, STATUS_COLOR } from "./MeusPedidos";
import { PedidoDetalhesDialog } from "@/components/pedido/PedidoDetalhesDialog";
import { TabelaPrecos } from "@/components/cliente/TabelaPrecos";
import { StatusClienteBadge } from "@/components/cliente/StatusClienteBadge";

type PedidoHistorico = {
  id: string;
  numero_pedido: number;
  status: string;
  data_pedido: string;
  total: number;
};

type Tarefa = {
  id: string;
  titulo: string;
  data_vencimento: string | null;
  concluida: boolean;
  created_at: string;
};

type ClienteAgregado = {
  cliente_id: string;
  razao_social: string;
  cnpj: string | null;
  codigo_cliente: string | null;
  aceita_saldo: boolean;
  ltv: number;
  num_pedidos: number;
  ticket_medio: number;
  marcas_compradas: string[];
  rank: number;
  abc: "A" | "B" | "C";
  ciclo_medio: number | null;
  ultima_compra: string | null;
  proxima_compra: Date | null;
  canal: string | null;
  nome_parceiro: string | null;
  tabela_preco: string | null;
  cluster: string | null;
  grupo_cliente: string | null;
  desconto_adicional: number | null;
  suframa: boolean | null;
  cidade: string | null;
  uf: string | null;
  status: string | null;
  ativo: boolean;
};

type CadastroPendente = {
  id: string;
  nome_cliente: string | null;
  razao_social: string | null;
  cnpj: string | null;
  status: string;
  motivo_reprovacao: string | null;
  created_at: string;
};

type OrdemCampo = "ltv" | "ticket_medio" | "razao_social" | "num_pedidos";

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

export default function MeusClientes() {
  const { user } = useAuth();
  const { active, userId: impersonatedId } = useImpersonation();
  const effectiveUserId = active ? impersonatedId : user?.id;
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<ClienteAgregado[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<OrdemCampo>("ltv");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroCluster, setFiltroCluster] = useState("todos");
  const [filtroUF, setFiltroUF] = useState("todos");
  const [filtroTabela, setFiltroTabela] = useState("todos");
  const [filtroGrupo, setFiltroGrupo] = useState("todos");
  const [mostrarInativos, setMostrarInativos] = useState(false);

  const hoje = new Date();
  const DIA_MS = 1000 * 60 * 60 * 24;

  const [sheetCliente, setSheetCliente] = useState<ClienteAgregado | null>(null);
  const [historico, setHistorico] = useState<PedidoHistorico[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [detalhesId, setDetalhesId] = useState<string | null>(null);
  const [detalhesOpen, setDetalhesOpen] = useState(false);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [novaTarefaTitulo, setNovaTarefaTitulo] = useState("");
  const [novaTarefaData, setNovaTarefaData] = useState("");
  const [salvandoTarefa, setSalvandoTarefa] = useState(false);
  const [removerCliente, setRemoverCliente] = useState<ClienteAgregado | null>(null);
  const [removendo, setRemovendo] = useState(false);
  const [cadastrosPendentes, setCadastrosPendentes] = useState<CadastroPendente[]>([]);
  const [tabelaClienteOpen, setTabelaClienteOpen] = useState(false);
  const [tabelaCliente, setTabelaCliente] = useState<ClienteAgregado | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [pedidosRes, carteiraRes] = await Promise.all([
        supabase
          .from("pedidos")
          .select(`
            cliente_id,
            data_pedido,
            itens_pedido(total_item, produtos(marca)),
            clientes(razao_social, cnpj, codigo_cliente, aceita_saldo, canal, nome_parceiro, tabela_preco, cluster, grupo_cliente, desconto_adicional, suframa, cidade, uf, status, ativo)
          `)
          .eq("vendedor_id", effectiveUserId ?? "")
          .not("status", "in", '("rascunho","cancelado")'),
        supabase
          .from("clientes")
          .select("id, razao_social, cnpj, codigo_cliente, aceita_saldo, canal, nome_parceiro, tabela_preco, cluster, grupo_cliente, desconto_adicional, suframa, cidade, uf, status, ativo")
          .eq("vendedor_id", effectiveUserId ?? "")
          .is("deleted_at", null),
      ]);

      if (pedidosRes.error) {
        toast.error("Erro ao carregar clientes");
        return;
      }

      const map = new Map<string, {
        razao_social: string;
        cnpj: string | null;
        codigo_cliente: string | null;
        aceita_saldo: boolean;
        canal: string | null;
        nome_parceiro: string | null;
        tabela_preco: string | null;
        cluster: string | null;
        grupo_cliente: string | null;
        desconto_adicional: number | null;
        suframa: boolean | null;
        cidade: string | null;
        uf: string | null;
        status: string | null;
        ativo: boolean;
        ltv: number;
        num_pedidos: number;
        marcas: Set<string>;
        dates: Date[];
      }>();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pedidosRes.data ?? []).forEach((p: any) => {
        if (!p.cliente_id) return;
        const cl = p.clientes;
        if (!map.has(p.cliente_id)) {
          map.set(p.cliente_id, {
            razao_social: cl?.nome_parceiro || cl?.razao_social || "—",
            cnpj: cl?.cnpj ?? null,
            codigo_cliente: cl?.codigo_cliente ?? null,
            aceita_saldo: cl?.aceita_saldo ?? false,
            canal: cl?.canal ?? null,
            nome_parceiro: cl?.nome_parceiro ?? null,
            tabela_preco: cl?.tabela_preco ?? null,
            cluster: cl?.cluster ?? null,
            grupo_cliente: cl?.grupo_cliente ?? null,
            desconto_adicional: cl?.desconto_adicional ?? null,
            suframa: cl?.suframa ?? null,
            cidade: cl?.cidade ?? null,
            uf: cl?.uf ?? null,
            status: cl?.status ?? null,
            ativo: cl?.ativo ?? true,
            ltv: 0,
            num_pedidos: 0,
            marcas: new Set(),
            dates: [],
          });
        }
        const entry = map.get(p.cliente_id)!;
        entry.num_pedidos += 1;
        if (p.data_pedido) entry.dates.push(new Date(p.data_pedido));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p.itens_pedido ?? []).forEach((item: any) => {
          entry.ltv += Number(item.total_item);
          if (item.produtos?.marca) entry.marcas.add(item.produtos.marca);
        });
      });

      // Merge clientes sem pedido da carteira
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (carteiraRes.data ?? []).forEach((cl: any) => {
        if (map.has(cl.id)) return;
        map.set(cl.id, {
          razao_social: cl.nome_parceiro || cl.razao_social || "—",
          cnpj: cl.cnpj ?? null,
          codigo_cliente: cl.codigo_cliente ?? null,
          aceita_saldo: cl.aceita_saldo ?? false,
          canal: cl.canal ?? null,
          nome_parceiro: cl.nome_parceiro ?? null,
          tabela_preco: cl.tabela_preco ?? null,
          cluster: cl.cluster ?? null,
          grupo_cliente: cl.grupo_cliente ?? null,
          desconto_adicional: cl.desconto_adicional ?? null,
          suframa: cl.suframa ?? null,
          cidade: cl.cidade ?? null,
          uf: cl.uf ?? null,
          status: cl.status ?? null,
          ativo: cl.ativo ?? true,
          ltv: 0,
          num_pedidos: 0,
          marcas: new Set(),
          dates: [],
        });
      });

      // ABC classification by descending LTV (Pareto-based revenue ranking)
      const rawList = Array.from(map.entries()).map(([cliente_id, v]) => ({
        cliente_id,
        ...v,
        ticket_medio: v.num_pedidos > 0 ? v.ltv / v.num_pedidos : 0,
        marcas_compradas: Array.from(v.marcas),
      }));

      rawList.sort((a, b) => b.ltv - a.ltv);
      const total = rawList.length;
      const cutA = Math.ceil(total * 0.2);
      const cutB = Math.ceil(total * 0.5);

      const agregados: ClienteAgregado[] = rawList
        .map((c, idx) => {
          const abc: "A" | "B" | "C" = idx < cutA ? "A" : idx < cutB ? "B" : "C";
          const ciclo_medio = calcCicloMedio(c.dates);
          const sortedDates = [...c.dates].sort((a, b) => b.getTime() - a.getTime());
          const ultima_compra = sortedDates[0]?.toISOString().slice(0, 10) ?? null;
          let proxima_compra: Date | null = null;
          if (ultima_compra && ciclo_medio) {
            proxima_compra = new Date(sortedDates[0].getTime() + ciclo_medio * 24 * 60 * 60 * 1000);
          }
          return {
            cliente_id: c.cliente_id,
            razao_social: c.razao_social,
            cnpj: c.cnpj,
            codigo_cliente: c.codigo_cliente,
            aceita_saldo: c.aceita_saldo,
            canal: c.canal,
            nome_parceiro: c.nome_parceiro,
            tabela_preco: c.tabela_preco,
            cluster: c.cluster,
            desconto_adicional: c.desconto_adicional,
            suframa: c.suframa,
            cidade: c.cidade,
            uf: c.uf,
            status: c.status,
            ativo: c.ativo,
            grupo_cliente: c.grupo_cliente,
            ltv: c.ltv,
            num_pedidos: c.num_pedidos,
            ticket_medio: c.ticket_medio,
            marcas_compradas: c.marcas_compradas,
            rank: idx + 1,
            abc,
            ciclo_medio,
            ultima_compra,
            proxima_compra,
          };
        })
        .sort((a, b) => b.ltv - a.ltv)
        .map((c, idx) => ({ ...c, rank: idx + 1 }));

      setClientes(agregados);

      const cadastrosRes = await supabase
        .from("cadastros_pendentes")
        .select("id, nome_cliente, razao_social, cnpj, status, motivo_reprovacao, created_at")
        .eq("vendedor_id", effectiveUserId ?? "")
        .in("status", ["pendente_cadastro", "pendente_sankhya", "devolvido"])
        .order("created_at", { ascending: false });
      setCadastrosPendentes((cadastrosRes.data ?? []) as CadastroPendente[]);
    })().finally(() => setLoading(false));
  }, [user, active, impersonatedId, effectiveUserId]);

  const abrirSheet = async (c: ClienteAgregado) => {
    setSheetCliente(c);
    setHistorico([]);
    setTarefas([]);
    setNovaTarefaTitulo("");
    setNovaTarefaData("");
    setLoadingSheet(true);
    const [pedRes, tarRes] = await Promise.all([
      supabase
        .from("pedidos")
        .select("id, numero_pedido, status, data_pedido, itens_pedido(total_item)")
        .eq("cliente_id", c.cliente_id)
        .not("status", "eq", "rascunho")
        .order("data_pedido", { ascending: false }),
      supabase
        .from("tarefas")
        .select("id, titulo, data_vencimento, concluida, created_at")
        .eq("cliente_id", c.cliente_id)
        .order("data_vencimento", { ascending: true }),
    ]);

    if (pedRes.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setHistorico(pedRes.data.map((p: any) => ({
        id: p.id,
        numero_pedido: p.numero_pedido,
        status: p.status,
        data_pedido: p.data_pedido,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        total: (p.itens_pedido ?? []).reduce((s: number, i: any) => s + Number(i.total_item), 0),
      })));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (tarRes.data) setTarefas(tarRes.data as any[]);
    setLoadingSheet(false);
  };

  const adicionarTarefa = async () => {
    if (!sheetCliente || !novaTarefaTitulo.trim() || !user) return;
    setSalvandoTarefa(true);
    const { data, error } = await supabase.from("tarefas").insert({
      vendedor_id: user.id,
      cliente_id: sheetCliente.cliente_id,
      titulo: novaTarefaTitulo.trim(),
      data_vencimento: novaTarefaData || null,
    }).select("id, titulo, data_vencimento, concluida, created_at").single();
    setSalvandoTarefa(false);
    if (error) { toast.error("Erro ao criar tarefa"); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setTarefas((prev) => [...prev, data as any]);
    setNovaTarefaTitulo("");
    setNovaTarefaData("");
  };

  const toggleTarefa = async (t: Tarefa) => {
    const { error } = await supabase.from("tarefas").update({ concluida: !t.concluida }).eq("id", t.id);
    if (error) { toast.error("Erro ao atualizar tarefa"); return; }
    setTarefas((prev) => prev.map((x) => x.id === t.id ? { ...x, concluida: !x.concluida } : x));
  };

  const confirmarRemover = async () => {
    if (!removerCliente) return;
    setRemovendo(true);
    const { error } = await supabase
      .from("clientes")
      .update({ vendedor_id: null })
      .eq("id", removerCliente.cliente_id);
    setRemovendo(false);
    if (error) { toast.error("Erro ao remover da carteira"); return; }
    toast.success(`${removerCliente.razao_social} removido da carteira`);
    setRemoverCliente(null);
    setSheetCliente(null);
    setClientes((prev) => prev.filter((c) => c.cliente_id !== removerCliente.cliente_id));
  };

  const novoPedidoParaCliente = async (clienteId: string) => {
    const { data, error } = await supabase
      .from("clientes")
      .select("id, cnpj, razao_social, cidade, uf, cep, comprador, cluster, tabela_preco")
      .eq("id", clienteId)
      .single();
    if (error || !data) {
      toast.error("Erro ao carregar dados do cliente");
      return;
    }
    navigate("/novo-pedido", {
      state: {
        fromCliente: {
          cliente_id: data.id,
          cnpj: data.cnpj,
          razao_social: data.razao_social,
          cidade: data.cidade,
          uf: data.uf,
          cep: data.cep,
          comprador: data.comprador,
          cluster: data.cluster,
          tabela_preco: data.tabela_preco,
        },
      },
    });
  };

  const clientesFiltrados = useMemo(() => {
    let filtrados = clientes.filter((c) => mostrarInativos ? !c.ativo : c.ativo !== false);

    if (busca.trim()) {
      filtrados = filtrados.filter((c) => {
        const buscaDigits = busca.replace(/\D/g, "");
        const cnpjDigits = (c.cnpj ?? "").replace(/\D/g, "");
        return (
          c.razao_social.toLowerCase().includes(busca.toLowerCase()) ||
          (buscaDigits.length > 0 && cnpjDigits.includes(buscaDigits))
        );
      });
    }

    if (filtroStatus !== "todos") {
      filtrados = filtrados.filter((c) => (c.status ?? "ativo") === filtroStatus);
    }
    if (filtroCluster !== "todos") {
      filtrados = filtrados.filter((c) => (c.cluster ?? "") === filtroCluster);
    }
    if (filtroUF !== "todos") {
      filtrados = filtrados.filter((c) => (c.uf ?? "") === filtroUF);
    }
    if (filtroTabela !== "todos") {
      filtrados = filtrados.filter((c) => (c.tabela_preco ?? "") === filtroTabela);
    }
    if (filtroGrupo !== "todos") {
      filtrados = filtrados.filter((c) => (c.grupo_cliente ?? "") === filtroGrupo);
    }

    return [...filtrados].sort((a, b) => {
      if (ordem === "ltv") return b.ltv - a.ltv;
      if (ordem === "ticket_medio") return b.ticket_medio - a.ticket_medio;
      if (ordem === "num_pedidos") return b.num_pedidos - a.num_pedidos;
      return a.razao_social.localeCompare(b.razao_social, "pt-BR");
    });
  }, [clientes, busca, ordem, filtroStatus, filtroCluster, filtroUF, filtroTabela, filtroGrupo, mostrarInativos]);

  // Valores únicos para os filtros dinâmicos
  const clustersUnicos = useMemo(() => [...new Set(clientes.map((c) => c.cluster).filter(Boolean))].sort(), [clientes]);
  const ufsUnicas = useMemo(() => [...new Set(clientes.map((c) => c.uf).filter(Boolean))].sort(), [clientes]);
  const tabelasUnicas = useMemo(() => [...new Set(clientes.map((c) => c.tabela_preco).filter(Boolean))].sort(), [clientes]);
  const gruposUnicos = useMemo(() => [...new Set(clientes.map((c) => c.grupo_cliente).filter(Boolean))].sort(), [clientes]);

  const exportarExcel = async () => {
    if (clientesFiltrados.length === 0) return;
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Clientes");
    ws.columns = [
      { header: "Código Sankhya", key: "codigo_cliente", width: 16 },
      { header: "Razão Social", key: "razao_social", width: 40 },
      { header: "CNPJ", key: "cnpj", width: 20 },
      { header: "Estado", key: "uf", width: 8 },
      { header: "Cidade", key: "cidade", width: 22 },
      { header: "Cluster", key: "cluster", width: 24 },
      { header: "Tabela", key: "tabela_preco", width: 14 },
      { header: "Grupo de Clientes", key: "grupo_cliente", width: 24 },
      { header: "Canal", key: "canal", width: 12 },
      { header: "LTV (R$)", key: "ltv", width: 14 },
      { header: "Pedidos", key: "num_pedidos", width: 10 },
      { header: "Ticket Médio (R$)", key: "ticket_medio", width: 18 },
      { header: "Última Compra", key: "ultima_compra", width: 16 },
      { header: "Status Comercial", key: "status", width: 18 },
    ];
    ws.getRow(1).font = { bold: true };
    clientesFiltrados.forEach((c) => {
      ws.addRow({
        codigo_cliente: c.codigo_cliente ?? "",
        razao_social: c.razao_social,
        cnpj: c.cnpj ? formatCNPJ(c.cnpj) : "",
        uf: c.uf ?? "",
        cidade: c.cidade ?? "",
        cluster: c.cluster ?? "",
        tabela_preco: c.tabela_preco ?? "",
        grupo_cliente: c.grupo_cliente ?? "",
        canal: c.canal ?? "",
        ltv: c.ltv,
        num_pedidos: c.num_pedidos,
        ticket_medio: c.ticket_medio,
        ultima_compra: c.ultima_compra ? formatDate(c.ultima_compra) : "",
        status: c.status ?? "ativo",
      });
    });
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meus-clientes-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const badgeCount = cadastrosPendentes.filter(
    (c) => c.status === "pendente_cadastro" || c.status === "devolvido"
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Meus Clientes</h1>
        <p className="text-sm text-muted-foreground">Portfólio com curva ABC, frequência e cobertura de marcas</p>
      </div>

      <Tabs defaultValue="carteira">
        <TabsList>
          <TabsTrigger value="carteira">Carteira</TabsTrigger>
          <TabsTrigger value="cadastros" className="gap-2">
            Cadastros enviados
            {badgeCount > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold h-5 min-w-5 px-1">
                {badgeCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="carteira" className="space-y-4 mt-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar por nome ou CNPJ..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                  <SelectItem value="aguardando_trade">Aguardando Trade</SelectItem>
                </SelectContent>
              </Select>
              <Select value={ordem} onValueChange={(v) => setOrdem(v as OrdemCampo)}>
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue placeholder="Ordenar por" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ltv">LTV (maior primeiro)</SelectItem>
                  <SelectItem value="num_pedidos">Pedidos (maior primeiro)</SelectItem>
                  <SelectItem value="ticket_medio">Ticket médio (maior primeiro)</SelectItem>
                  <SelectItem value="razao_social">Nome (A–Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              {clustersUnicos.length > 0 && (
                <Select value={filtroCluster} onValueChange={setFiltroCluster}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Cluster" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os clusters</SelectItem>
                    {clustersUnicos.map((c) => <SelectItem key={c!} value={c!}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {ufsUnicas.length > 0 && (
                <Select value={filtroUF} onValueChange={setFiltroUF}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os estados</SelectItem>
                    {ufsUnicas.map((uf) => <SelectItem key={uf!} value={uf!}>{uf}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {tabelasUnicas.length > 0 && (
                <Select value={filtroTabela} onValueChange={setFiltroTabela}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Tabela de preço" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas as tabelas</SelectItem>
                    {tabelasUnicas.map((t) => <SelectItem key={t!} value={t!}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {gruposUnicos.length > 0 && (
                <Select value={filtroGrupo} onValueChange={setFiltroGrupo}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Grupo de clientes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os grupos</SelectItem>
                    {gruposUnicos.map((g) => <SelectItem key={g!} value={g!}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none ml-auto">
                <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} className="rounded" />
                Mostrar inativos
              </label>
              {clientesFiltrados.length > 0 && (
                <Button size="sm" variant="outline" onClick={exportarExcel} className="gap-1.5 ml-auto">
                  <Download className="h-4 w-4" />
                  Exportar Excel
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-300 inline-block" />Comprou no mês</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-300 inline-block" />Até 60 dias</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-300 inline-block" />61–90 dias</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-300 inline-block" />Mais de 90 dias / sem compra</span>
            </div>
          </div>

          {clientesFiltrados.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {busca ? "Nenhum cliente encontrado para esta busca" : "Nenhum cliente encontrado"}
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead className="w-10">ABC</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead className="text-right">LTV</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                    <TableHead className="text-right">Ticket médio</TableHead>
                    <TableHead>Ciclo médio</TableHead>
                    <TableHead>Próxima compra</TableHead>
                    <TableHead>Marcas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientesFiltrados.map((c) => {
                    const vencida = c.proxima_compra && c.proxima_compra < hoje;
                    const proximaStr = c.proxima_compra
                      ? c.proxima_compra.toLocaleDateString("pt-BR")
                      : "—";
                    const diasSemCompra = c.ultima_compra
                      ? (hoje.getTime() - new Date(c.ultima_compra).getTime()) / DIA_MS
                      : Infinity;
                    const mesAtual = hoje.getMonth();
                    const anoAtual = hoje.getFullYear();
                    const compraNoMes = c.ultima_compra
                      ? (() => { const d = new Date(c.ultima_compra); return d.getMonth() === mesAtual && d.getFullYear() === anoAtual; })()
                      : false;
                    const rowCls = compraNoMes
                      ? "cursor-pointer bg-blue-50 hover:bg-blue-100"
                      : diasSemCompra <= 60
                      ? "cursor-pointer bg-green-50 hover:bg-green-100"
                      : diasSemCompra <= 90
                      ? "cursor-pointer bg-yellow-50 hover:bg-yellow-100"
                      : "cursor-pointer bg-red-50 hover:bg-red-100";
                    return (
                      <TableRow
                        key={c.cliente_id}
                        className={rowCls}
                        onClick={() => abrirSheet(c)}
                      >
                        <TableCell className="font-mono text-muted-foreground text-sm">{c.rank}</TableCell>
                        <TableCell>{abcBadge(c.abc)}</TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span className="truncate">{c.razao_social}</span>
                            <StatusClienteBadge status={c.status ?? "ativo"} className="shrink-0" />
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={active}
                              className="h-7 w-7 p-0 text-primary hover:bg-primary/10 shrink-0"
                              title={active ? "Indisponível no modo visualização" : "Novo pedido para este cliente"}
                              onClick={(e) => {
                                e.stopPropagation();
                                novoPedidoParaCliente(c.cliente_id);
                              }}
                            >
                              <ShoppingCart className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground hover:bg-muted shrink-0"
                              title="Ver tabela de preços"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTabelaCliente(c);
                                setTabelaClienteOpen(true);
                              }}
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          {c.canal ? (
                            <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-300 text-xs">
                              {c.canal}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono">
                          {c.cnpj ? formatCNPJ(c.cnpj) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{formatBRL(c.ltv)}</TableCell>
                        <TableCell className="text-right text-sm">{c.num_pedidos}</TableCell>
                        <TableCell className="text-right text-sm">{formatBRL(c.ticket_medio)}</TableCell>
                        <TableCell className="text-sm">
                          {c.ciclo_medio != null
                            ? `${Math.round(c.ciclo_medio)} dias`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {c.proxima_compra ? (
                            <span className={`flex items-center gap-1 text-sm ${vencida ? "text-red-600 font-medium" : "text-foreground"}`}>
                              {vencida && <CalendarClock className="h-3 w-3" />}
                              {proximaStr}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {MARCAS.map((marca) => {
                              const tem = c.marcas_compradas.includes(marca);
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
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="cadastros" className="space-y-2 mt-4">
          {cadastrosPendentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cadastro enviado ainda.</p>
          ) : (
            cadastrosPendentes.map((c) => {
              const isDevolvido = c.status === "devolvido";
              const isAprovado = c.status === "pendente_sankhya";
              const cardClass = isDevolvido
                ? "border-red-300 bg-red-50"
                : isAprovado
                ? "border-green-300 bg-green-50"
                : "border-yellow-300 bg-yellow-50";
              return (
                <div
                  key={c.id}
                  className={`rounded-md border px-4 py-3 flex items-start justify-between gap-3 ${cardClass}`}
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {c.nome_cliente ?? c.razao_social ?? "Sem nome"}
                      </span>
                      {isDevolvido && (
                        <span className="inline-flex items-center rounded-full border border-red-300 bg-red-100 text-red-800 px-2 py-0.5 text-xs font-medium">
                          Devolvido para correção
                        </span>
                      )}
                      {isAprovado && (
                        <span className="inline-flex items-center rounded-full border border-green-300 bg-green-100 text-green-800 px-2 py-0.5 text-xs font-medium">
                          Aprovado — na carteira
                        </span>
                      )}
                      {!isDevolvido && !isAprovado && (
                        <span className="inline-flex items-center rounded-full border border-yellow-300 bg-yellow-100 text-yellow-800 px-2 py-0.5 text-xs font-medium">
                          Aguardando faturamento
                        </span>
                      )}
                    </div>
                    {c.cnpj && (
                      <div className="text-xs text-muted-foreground">{formatCNPJ(c.cnpj)}</div>
                    )}
                    {isDevolvido && c.motivo_reprovacao && (
                      <div className="mt-1 rounded border border-red-200 bg-red-100 px-2 py-1 text-xs text-red-700">
                        <span className="font-medium">Motivo:</span> {c.motivo_reprovacao}
                      </div>
                    )}
                  </div>
                  {isDevolvido && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 border-red-300 text-red-700 hover:bg-red-100"
                      onClick={() => navigate(`/cadastrar-cliente?corrigir=${c.id}`)}
                    >
                      Corrigir cadastro
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </TabsContent>
      </Tabs>

      {/* Sheet: detalhe do cliente */}
      <Sheet open={!!sheetCliente} onOpenChange={(o) => !o && setSheetCliente(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between gap-2">
              <span className="truncate">{sheetCliente?.razao_social}</span>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => sheetCliente && navigate(`/clientes/${sheetCliente.cliente_id}`)}
                >
                  Ficha completa
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={active}
                  className="text-red-600 border-red-300 hover:bg-red-50"
                  title={active ? "Indisponível no modo visualização" : undefined}
                  onClick={() => sheetCliente && setRemoverCliente(sheetCliente)}
                >
                  <UserMinus className="h-3.5 w-3.5 mr-1" />
                  Remover da carteira
                </Button>
              </div>
            </SheetTitle>
          </SheetHeader>

          {sheetCliente && (
            <div className="mt-4 space-y-6">
              {/* KPIs do cliente */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md border p-3 text-center">
                  <div className="text-xs text-muted-foreground">LTV</div>
                  <div className="font-bold text-sm">{formatBRL(sheetCliente.ltv)}</div>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <div className="text-xs text-muted-foreground">Pedidos</div>
                  <div className="font-bold text-sm">{sheetCliente.num_pedidos}</div>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <div className="text-xs text-muted-foreground">Curva</div>
                  <div className="font-bold text-sm">{abcBadge(sheetCliente.abc)}</div>
                </div>
              </div>

              {/* Histórico de pedidos */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Histórico de pedidos</h3>
                {loadingSheet ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : historico.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum pedido</p>
                ) : (
                  <div className="space-y-2">
                    {historico.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50"
                        onClick={() => { setDetalhesId(p.id); setDetalhesOpen(true); }}
                      >
                        <div>
                          <span className="font-mono font-semibold text-sm">#{p.numero_pedido}</span>
                          <span className="text-xs text-muted-foreground ml-2">{formatDate(p.data_pedido)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[p.status] ?? "bg-gray-100 text-gray-600 border-gray-300"}`}>
                            {STATUS_LABEL[p.status] ?? p.status}
                          </span>
                          <span className="text-sm font-semibold">{formatBRL(p.total)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tarefas */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Tarefas</h3>
                {!loadingSheet && tarefas.length === 0 && (
                  <p className="text-sm text-muted-foreground mb-2">Nenhuma tarefa</p>
                )}
                {tarefas.map((t) => (
                  <div key={t.id} className="flex items-start gap-2 rounded-md border px-3 py-2 mb-1">
                    <Checkbox
                      checked={t.concluida}
                      onCheckedChange={() => toggleTarefa(t)}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <span className={`text-sm ${t.concluida ? "line-through text-muted-foreground" : ""}`}>
                        {t.titulo}
                      </span>
                      {t.data_vencimento && (
                        <div className="text-xs text-muted-foreground">
                          Vence: {new Date(t.data_vencimento + "T00:00:00").toLocaleDateString("pt-BR")}
                        </div>
                      )}
                    </div>
                    {t.concluida && <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />}
                  </div>
                ))}

                {/* Nova tarefa */}
                <div className="mt-3 rounded-md border p-3 space-y-2">
                  <Label className="text-xs font-medium">Nova tarefa</Label>
                  <Input
                    placeholder="Descrição da tarefa..."
                    value={novaTarefaTitulo}
                    onChange={(e) => setNovaTarefaTitulo(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={novaTarefaData}
                      onChange={(e) => setNovaTarefaData(e.target.value)}
                      className="h-8 text-sm flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={adicionarTarefa}
                      disabled={!novaTarefaTitulo.trim() || salvandoTarefa || active}
                      title={active ? "Indisponível no modo visualização" : undefined}
                    >
                      {salvandoTarefa
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Plus className="h-3 w-3" />
                      }
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!removerCliente} onOpenChange={(o) => !o && setRemoverCliente(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover da carteira?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{removerCliente?.razao_social}</strong> será desvinculado da sua carteira, mas não será excluído do sistema. O cliente ficará sem vendedor até ser reatribuído.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarRemover}
              disabled={removendo}
              className="bg-red-600 hover:bg-red-700"
            >
              {removendo && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Remover da carteira
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PedidoDetalhesDialog
        pedidoId={detalhesId}
        open={detalhesOpen}
        onOpenChange={setDetalhesOpen}
      />

      <Dialog open={tabelaClienteOpen} onOpenChange={setTabelaClienteOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tabela de Preços — {tabelaCliente?.razao_social}</DialogTitle>
          </DialogHeader>
          {tabelaCliente && (
            <TabelaPrecos
              clienteId={tabelaCliente.cliente_id}
              clienteRazaoSocial={tabelaCliente.razao_social}
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
