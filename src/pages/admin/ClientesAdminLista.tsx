import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatBRL, formatCNPJ } from "@/lib/format";
import { CLUSTERS, TABELAS_PRECO, UFS, MARCAS } from "@/lib/constants";
import { Loader2, Search, Users, UserX, AlertTriangle, ShieldAlert, Pencil, UserPlus, CalendarClock, ShoppingCart, FileText, ExternalLink } from "lucide-react";
import { StatusClienteBadge } from "@/components/cliente/StatusClienteBadge";
import { TabelaPrecos } from "@/components/cliente/TabelaPrecos";

type ClienteAgregado = {
  id: string;
  razao_social: string;
  nome_parceiro: string | null;
  nome_fantasia: string | null;
  cnpj: string | null;
  email: string | null;
  telefone: string | null;
  comprador: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  cluster: string | null;
  grupo_cliente: string | null;
  tabela_preco: string | null;
  vendedor_id: string | null;
  status: string | null;
  negativado: boolean | null;
  aceita_saldo: boolean;
  observacoes_trade: string | null;
  codigo_cliente: string | null;
  codigo_parceiro: string | null;
  canal: string | null;
  desconto_adicional: number | null;
  suframa: boolean | null;
  // agregados de pedidos
  ltv: number;
  num_pedidos: number;
  ticket_medio: number;
  marcas_compradas: string[];
  rank: number;
  abc: "A" | "B" | "C";
  ciclo_medio: number | null;
  ultima_compra: string | null;
  proxima_compra: Date | null;
};

type Vendedor = { id: string; nome: string };

type Resumo = { ativos: number; semVendedor: number; aguardandoTrade: number; negativados: number };

type OrdemCampo = "ltv" | "ticket_medio" | "razao_social" | "num_pedidos";

const STATUS_OPTIONS = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
  { value: "aguardando_trade", label: "Aguardando Trade" },
];

function tabelaLabel(v: string | null): string {
  if (!v) return "—";
  const t = TABELAS_PRECO.find((x) => x.value === v);
  return t ? t.label : v;
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

export default function ClientesAdminLista() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<ClienteAgregado[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [vendedoresMap, setVendedoresMap] = useState<Record<string, string>>({});
  const [resumo, setResumo] = useState<Resumo>({ ativos: 0, semVendedor: 0, aguardandoTrade: 0, negativados: 0 });
  const [exportando, setExportando] = useState(false);

  const hoje = new Date();

  // Filtros
  const [busca, setBusca] = useState("");
  const [filtroVendedor, setFiltroVendedor] = useState("todos");
  const [filtroCluster, setFiltroCluster] = useState("todos");
  const [filtroGrupo, setFiltroGrupo] = useState("todos");
  const [filtroTabela, setFiltroTabela] = useState("todos");
  const [filtroUF, setFiltroUF] = useState("todas");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [ordem, setOrdem] = useState<OrdemCampo>("ltv");

  // Tabela de preços do cliente
  const [tabelaClienteOpen, setTabelaClienteOpen] = useState(false);
  const [tabelaCliente, setTabelaCliente] = useState<ClienteAgregado | null>(null);

  // Modal edição
  const [modalCliente, setModalCliente] = useState<ClienteAgregado | null>(null);
  const [editRazaoSocial, setEditRazaoSocial] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editTelefone, setEditTelefone] = useState("");
  const [editComprador, setEditComprador] = useState("");
  const [editCidade, setEditCidade] = useState("");
  const [editUF, setEditUF] = useState("");
  const [editCluster, setEditCluster] = useState("");
  const [editTabela, setEditTabela] = useState("");
  const [editVendedorId, setEditVendedorId] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editNegativado, setEditNegativado] = useState(false);
  const [editAceitaSaldo, setEditAceitaSaldo] = useState(false);
  const [editObs, setEditObs] = useState("");
  const [editNomeFantasia, setEditNomeFantasia] = useState("");
  const [editCodigoCliente, setEditCodigoCliente] = useState("");
  const [editCep, setEditCep] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Carrega resumo global (sem filtros) uma vez
  useEffect(() => {
    (async () => {
      const [ativos, semVendedor, aguardandoTrade, negativados] = await Promise.all([
        supabase.from("clientes").select("id", { count: "exact", head: true }).eq("status", "ativo"),
        supabase.from("clientes").select("id", { count: "exact", head: true }).is("vendedor_id", null),
        supabase.from("clientes").select("id", { count: "exact", head: true }).eq("status", "aguardando_trade"),
        supabase.from("clientes").select("id", { count: "exact", head: true }).eq("negativado", true),
      ]);
      setResumo({
        ativos: ativos.count ?? 0,
        semVendedor: semVendedor.count ?? 0,
        aguardandoTrade: aguardandoTrade.count ?? 0,
        negativados: negativados.count ?? 0,
      });
    })();
  }, []);

  // Carrega vendedores uma vez
  useEffect(() => {
    (async () => {
      const rolesRes = await supabase.from("user_roles").select("user_id").eq("role", "vendedor");
      if (rolesRes.data && rolesRes.data.length > 0) {
        const ids = rolesRes.data.map((r) => r.user_id);
        const profRes = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
        if (profRes.data) {
          const map: Record<string, string> = {};
          const lista: Vendedor[] = [];
          profRes.data.forEach((p) => {
            const nome = p.full_name || p.email || "—";
            map[p.id] = nome;
            lista.push({ id: p.id, nome });
          });
          lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
          setVendedoresMap(map);
          setVendedores(lista);
        }
      }
    })();
  }, []);

  // Carrega todos os clientes + pedidos e calcula curva ABC, LTV, ciclo, etc.
  useEffect(() => {
    (async () => {
      const [clRes, pedRes] = await Promise.all([
        supabase
          .from("clientes")
          .select("id, razao_social, nome_parceiro, nome_fantasia, cnpj, email, telefone, comprador, cidade, uf, cep, cluster, grupo_cliente, tabela_preco, vendedor_id, status, negativado, aceita_saldo, observacoes_trade, codigo_cliente, codigo_parceiro, canal, desconto_adicional, suframa")
          .is("deleted_at", null),
        supabase
          .from("pedidos")
          .select("cliente_id, data_pedido, itens_pedido(total_item, produtos(marca))")
          .not("status", "in", '("rascunho","cancelado")'),
      ]);

      if (clRes.error) {
        toast.error("Erro ao carregar clientes: " + clRes.error.message);
        setLoading(false);
        return;
      }

      const agg = new Map<string, { ltv: number; num_pedidos: number; marcas: Set<string>; dates: Date[] }>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pedRes.data ?? []).forEach((p: any) => {
        if (!p.cliente_id) return;
        if (!agg.has(p.cliente_id)) {
          agg.set(p.cliente_id, { ltv: 0, num_pedidos: 0, marcas: new Set(), dates: [] });
        }
        const entry = agg.get(p.cliente_id)!;
        entry.num_pedidos += 1;
        if (p.data_pedido) entry.dates.push(new Date(p.data_pedido));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p.itens_pedido ?? []).forEach((item: any) => {
          entry.ltv += Number(item.total_item);
          if (item.produtos?.marca) entry.marcas.add(item.produtos.marca);
        });
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawList = (clRes.data ?? []).map((c: any) => {
        const a = agg.get(c.id) ?? { ltv: 0, num_pedidos: 0, marcas: new Set<string>(), dates: [] as Date[] };
        return {
          ...c,
          ltv: a.ltv,
          num_pedidos: a.num_pedidos,
          ticket_medio: a.num_pedidos > 0 ? a.ltv / a.num_pedidos : 0,
          marcas_compradas: Array.from(a.marcas),
          dates: a.dates,
        };
      });

      rawList.sort((a, b) => b.ltv - a.ltv);
      const total = rawList.length;
      const cutA = Math.ceil(total * 0.2);
      const cutB = Math.ceil(total * 0.5);

      const agregados: ClienteAgregado[] = rawList.map((c, idx) => {
        const abc: "A" | "B" | "C" = idx < cutA ? "A" : idx < cutB ? "B" : "C";
        const ciclo_medio = calcCicloMedio(c.dates);
        const sortedDates = [...c.dates].sort((a, b) => b.getTime() - a.getTime());
        const ultima_compra = sortedDates[0]?.toISOString().slice(0, 10) ?? null;
        let proxima_compra: Date | null = null;
        if (ultima_compra && ciclo_medio) {
          proxima_compra = new Date(sortedDates[0].getTime() + ciclo_medio * 24 * 60 * 60 * 1000);
        }
        return {
          id: c.id,
          razao_social: c.razao_social,
          nome_parceiro: c.nome_parceiro,
          nome_fantasia: c.nome_fantasia,
          cnpj: c.cnpj,
          email: c.email,
          telefone: c.telefone,
          comprador: c.comprador,
          cidade: c.cidade,
          uf: c.uf,
          cep: c.cep,
          cluster: c.cluster,
          grupo_cliente: c.grupo_cliente,
          tabela_preco: c.tabela_preco,
          vendedor_id: c.vendedor_id,
          status: c.status,
          negativado: c.negativado,
          aceita_saldo: c.aceita_saldo ?? false,
          observacoes_trade: c.observacoes_trade,
          codigo_cliente: c.codigo_cliente,
          codigo_parceiro: c.codigo_parceiro,
          canal: c.canal,
          desconto_adicional: c.desconto_adicional,
          suframa: c.suframa,
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
      });

      setClientes(agregados);
      setLoading(false);
    })();
  }, []);

  const abrirModal = (c: ClienteAgregado) => {
    setModalCliente(c);
    setEditRazaoSocial(c.razao_social);
    setEditEmail(c.email ?? "");
    setEditTelefone(c.telefone ?? "");
    setEditComprador(c.comprador ?? "");
    setEditCidade(c.cidade ?? "");
    setEditUF(c.uf ?? "");
    setEditCluster(c.cluster ?? "");
    setEditTabela(c.tabela_preco ?? "");
    setEditVendedorId(c.vendedor_id ?? "");
    setEditStatus(c.status ?? "ativo");
    setEditNegativado(c.negativado ?? false);
    setEditAceitaSaldo(c.aceita_saldo);
    setEditObs(c.observacoes_trade ?? "");
    setEditNomeFantasia(c.nome_fantasia ?? "");
    setEditCodigoCliente(c.codigo_cliente ?? "");
    setEditCep(c.cep ?? "");
  };

  const salvar = async () => {
    if (!modalCliente) return;
    setSalvando(true);
    const novoVendedor = editVendedorId || null;
    const { error } = await supabase
      .from("clientes")
      .update({
        razao_social: editRazaoSocial.trim() || modalCliente.razao_social,
        nome_fantasia: editNomeFantasia.trim() || null,
        codigo_cliente: editCodigoCliente.trim() || null,
        cep: editCep.trim() || null,
        email: editEmail.trim() || null,
        telefone: editTelefone.trim() || null,
        comprador: editComprador.trim() || null,
        cidade: editCidade.trim() || null,
        uf: editUF || null,
        cluster: editCluster || null,
        tabela_preco: editTabela || null,
        vendedor_id: novoVendedor,
        status: editStatus || "ativo",
        negativado: editNegativado,
        aceita_saldo: editAceitaSaldo,
        observacoes_trade: editObs.trim() || null,
      })
      .eq("id", modalCliente.id);

    setSalvando(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    toast.success("Cliente atualizado com sucesso!");
    // Atualiza a linha em memória (mantém os agregados de pedidos já calculados)
    setClientes((prev) =>
      prev.map((c) =>
        c.id === modalCliente.id
          ? {
              ...c,
              razao_social: editRazaoSocial.trim() || c.razao_social,
              nome_fantasia: editNomeFantasia.trim() || null,
              codigo_cliente: editCodigoCliente.trim() || null,
              cep: editCep.trim() || null,
              email: editEmail.trim() || null,
              telefone: editTelefone.trim() || null,
              comprador: editComprador.trim() || null,
              cidade: editCidade.trim() || null,
              uf: editUF || null,
              cluster: editCluster || null,
              tabela_preco: editTabela || null,
              vendedor_id: novoVendedor,
              status: editStatus || "ativo",
              negativado: editNegativado,
              aceita_saldo: editAceitaSaldo,
              observacoes_trade: editObs.trim() || null,
            }
          : c
      )
    );
    setModalCliente(null);
  };

  const novoPedidoParaCliente = (c: ClienteAgregado) => {
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

  const gruposDistintos = useMemo(
    () =>
      Array.from(new Set(clientes.map((c) => c.grupo_cliente).filter((g): g is string => !!g)))
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [clientes]
  );

  const clientesFiltrados = useMemo(() => {
    let lista = clientes;

    if (busca.trim()) {
      const buscaL = busca.toLowerCase();
      const buscaD = busca.replace(/\D/g, "");
      lista = lista.filter((c) => {
        const matchNome = (c.nome_parceiro || c.razao_social).toLowerCase().includes(buscaL);
        const cnpjDigits = (c.cnpj ?? "").replace(/\D/g, "");
        const matchCnpj = buscaD.length > 0 && cnpjDigits.includes(buscaD);
        return matchNome || matchCnpj;
      });
    }

    if (filtroVendedor === "__sem_vendedor__") lista = lista.filter((c) => !c.vendedor_id);
    else if (filtroVendedor !== "todos") lista = lista.filter((c) => c.vendedor_id === filtroVendedor);
    if (filtroCluster !== "todos") lista = lista.filter((c) => c.cluster === filtroCluster);
    if (filtroGrupo !== "todos") lista = lista.filter((c) => c.grupo_cliente === filtroGrupo);
    if (filtroTabela !== "todos") lista = lista.filter((c) => c.tabela_preco === filtroTabela);
    if (filtroUF !== "todas") lista = lista.filter((c) => c.uf === filtroUF);
    if (filtroStatus !== "todos") lista = lista.filter((c) => (c.status ?? "ativo") === filtroStatus);

    return [...lista].sort((a, b) => {
      if (ordem === "ltv") return b.ltv - a.ltv;
      if (ordem === "ticket_medio") return b.ticket_medio - a.ticket_medio;
      if (ordem === "num_pedidos") return b.num_pedidos - a.num_pedidos;
      return (a.nome_parceiro || a.razao_social).localeCompare(b.nome_parceiro || b.razao_social, "pt-BR");
    });
  }, [clientes, busca, filtroVendedor, filtroCluster, filtroGrupo, filtroTabela, filtroUF, filtroStatus, ordem]);

  const exportarExcel = async () => {
    setExportando(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Clientes");

      const colunas = [
        { header: "Código Sankhya", key: "codigo_sankhya" },
        { header: "#", key: "rank" },
        { header: "ABC", key: "abc" },
        { header: "Razão Social", key: "razao_social" },
        { header: "Nome Parceiro", key: "nome_parceiro" },
        { header: "CNPJ", key: "cnpj" },
        { header: "Canal", key: "canal" },
        { header: "Cidade", key: "cidade" },
        { header: "UF", key: "uf" },
        { header: "Cluster", key: "cluster" },
        { header: "Grupo", key: "grupo_cliente" },
        { header: "Tabela Preço", key: "tabela_preco" },
        { header: "Vendedor", key: "vendedor" },
        { header: "Status", key: "status" },
        { header: "LTV", key: "ltv" },
        { header: "Pedidos", key: "num_pedidos" },
        { header: "Ticket Médio", key: "ticket_medio" },
        { header: "Ciclo Médio (dias)", key: "ciclo_medio" },
        { header: "Marcas", key: "marcas" },
      ];
      ws.columns = colunas.map((c) => ({ header: c.header, key: c.key }));

      clientesFiltrados.forEach((c) => {
        ws.addRow({
          codigo_sankhya: c.codigo_parceiro ?? c.codigo_cliente ?? "",
          rank: c.rank,
          abc: c.abc,
          razao_social: c.razao_social ?? "",
          nome_parceiro: c.nome_parceiro ?? "",
          cnpj: c.cnpj ?? "",
          canal: c.canal ?? "",
          cidade: c.cidade ?? "",
          uf: c.uf ?? "",
          cluster: c.cluster ?? "",
          grupo_cliente: c.grupo_cliente ?? "",
          tabela_preco: tabelaLabel(c.tabela_preco),
          vendedor: c.vendedor_id ? (vendedoresMap[c.vendedor_id] ?? "—") : "—",
          status: c.status ?? "",
          ltv: c.ltv,
          num_pedidos: c.num_pedidos,
          ticket_medio: c.ticket_medio,
          ciclo_medio: c.ciclo_medio != null ? Math.round(c.ciclo_medio) : "",
          marcas: c.marcas_compradas.join(", "),
        });
      });

      const header = ws.getRow(1);
      header.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF166534" } };
        cell.alignment = { vertical: "middle", horizontal: "left" };
      });

      for (let i = 2; i <= ws.rowCount; i++) {
        const cor = i % 2 === 0 ? "FFFFFFFF" : "FFF0FDF4";
        ws.getRow(i).eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor } };
        });
      }

      ws.columns.forEach((col) => {
        let maxLen = 0;
        col.eachCell?.({ includeEmpty: false }, (cell) => {
          const len = String(cell.value ?? "").length;
          if (len > maxLen) maxLen = len;
        });
        col.width = Math.max(12, Math.min(50, maxLen + 2));
      });

      ws.views = [{ state: "frozen", ySplit: 1 }];

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clientes-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">Portfólio com curva ABC, frequência e cobertura de marcas</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportarExcel} disabled={exportando}>
            {exportando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
            Exportar Excel
          </Button>
          <Button onClick={() => navigate("/cadastrar-cliente")}>
            <UserPlus className="h-4 w-4 mr-2" />
            Cadastrar Cliente
          </Button>
        </div>
      </div>

      {/* Cards de resumo — totais globais */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Clientes Ativos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resumo.ativos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sem Vendedor</CardTitle>
            <UserX className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{resumo.semVendedor}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Aguardando Trade</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{resumo.aguardandoTrade}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Negativados</CardTitle>
            <ShieldAlert className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{resumo.negativados}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nome ou CNPJ..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Vendedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os vendedores</SelectItem>
              <SelectItem value="__sem_vendedor__">Sem vendedor</SelectItem>
              {vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filtroCluster} onValueChange={setFiltroCluster}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Cluster" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os clusters</SelectItem>
              {CLUSTERS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filtroGrupo} onValueChange={setFiltroGrupo}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Grupo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os grupos</SelectItem>
              {gruposDistintos.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filtroTabela} onValueChange={setFiltroTabela}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Tabela" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as tabelas</SelectItem>
              <SelectItem value="7">7%</SelectItem>
              <SelectItem value="12">12%</SelectItem>
              <SelectItem value="18">18%</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filtroUF} onValueChange={setFiltroUF}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="UF" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as UFs</SelectItem>
              {UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
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

        <span className="text-sm text-muted-foreground">
          {clientesFiltrados.length} cliente{clientesFiltrados.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : clientesFiltrados.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhum cliente encontrado</p>
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
                <TableHead>Vendedor</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Grupo</TableHead>
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
                const proximaStr = c.proxima_compra ? c.proxima_compra.toLocaleDateString("pt-BR") : "—";
                return (
                  <TableRow key={c.id} className="hover:bg-muted/50">
                    <TableCell className="font-mono text-muted-foreground text-sm">{c.rank}</TableCell>
                    <TableCell>{abcBadge(c.abc)}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{c.nome_parceiro || c.razao_social}</span>
                        <StatusClienteBadge status={c.status ?? "ativo"} className="shrink-0" />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-primary hover:bg-primary/10 shrink-0"
                          title="Novo pedido para este cliente"
                          onClick={() => novoPedidoParaCliente(c)}
                        >
                          <ShoppingCart className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:bg-muted shrink-0"
                          title="Ver tabela de preços"
                          onClick={() => { setTabelaCliente(c); setTabelaClienteOpen(true); }}
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:bg-muted shrink-0"
                          title="Abrir detalhes (preços, histórico, financeiro)"
                          onClick={() => navigate(`/clientes/${c.id}`)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:bg-muted shrink-0"
                          title="Editar cliente"
                          onClick={() => abrirModal(c)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.vendedor_id ? (
                        vendedoresMap[c.vendedor_id] ?? "—"
                      ) : (
                        <span className="text-muted-foreground">Sem vendedor</span>
                      )}
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
                    <TableCell className="text-sm">
                      {c.grupo_cliente ? (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 text-xs">
                          {c.grupo_cliente}
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
                      {c.ciclo_medio != null ? `${Math.round(c.ciclo_medio)} dias` : "—"}
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

      {/* Tabela de preços do cliente */}
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

      {/* Modal de edição */}
      <Dialog open={!!modalCliente} onOpenChange={(o) => !o && setModalCliente(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar cliente — {modalCliente?.nome_parceiro || modalCliente?.razao_social}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Razão social</Label>
              <Input value={editRazaoSocial} onChange={(e) => setEditRazaoSocial(e.target.value)} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nome fantasia</Label>
                <Input value={editNomeFantasia} onChange={(e) => setEditNomeFantasia(e.target.value)} placeholder="Como o cliente é conhecido" />
              </div>
              <div className="space-y-1.5">
                <Label>Código do cliente</Label>
                <Input value={editCodigoCliente} onChange={(e) => setEditCodigoCliente(e.target.value)} placeholder="Código interno" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="email@empresa.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={editTelefone} onChange={(e) => setEditTelefone(e.target.value)} placeholder="(00) 00000-0000" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Comprador / Contato</Label>
              <Input value={editComprador} onChange={(e) => setEditComprador(e.target.value)} placeholder="Nome do responsável" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Cidade</Label>
                <Input value={editCidade} onChange={(e) => setEditCidade(e.target.value)} placeholder="Cidade" />
              </div>
              <div className="space-y-1.5">
                <Label>UF</Label>
                <Select value={editUF || "__none__"} onValueChange={(v) => setEditUF(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Sem UF —</SelectItem>
                    {UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>CEP</Label>
              <Input value={editCep} onChange={(e) => setEditCep(e.target.value)} placeholder="00000-000" maxLength={9} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Cluster</Label>
                <Select value={editCluster || "__none__"} onValueChange={(v) => setEditCluster(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Sem cluster —</SelectItem>
                    {CLUSTERS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tabela de preço</Label>
                <Select value={editTabela || "__none__"} onValueChange={(v) => setEditTabela(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Sem tabela —</SelectItem>
                    {TABELAS_PRECO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Vendedor responsável</Label>
              <Select value={editVendedorId || "__nenhum__"} onValueChange={(v) => setEditVendedorId(v === "__nenhum__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar vendedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__nenhum__">— Sem vendedor —</SelectItem>
                  {vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={editStatus || "ativo"} onValueChange={setEditStatus}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-8">
              <div className="flex items-center gap-3">
                <Switch checked={editNegativado} onCheckedChange={setEditNegativado} id="edit-negativado" />
                <Label htmlFor="edit-negativado">Negativado</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={editAceitaSaldo} onCheckedChange={setEditAceitaSaldo} id="edit-aceita-saldo" />
                <Label htmlFor="edit-aceita-saldo">Aceita saldo</Label>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observações internas</Label>
              <Textarea
                rows={3}
                value={editObs}
                onChange={(e) => setEditObs(e.target.value)}
                placeholder="Observações internas sobre o cliente..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalCliente(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
