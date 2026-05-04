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
import { CLUSTERS, TABELAS_PRECO } from "@/lib/constants";
import { Loader2, Search, ArrowRightLeft, Trash2, SlidersHorizontal, X } from "lucide-react";

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
  codigo_parceiro: string | null;
  nome_parceiro: string | null;
  canal: string | null;
  suframa: boolean | null;
};

type LastOrder = { data_pedido: string; total: number };

export default function ClientesAdmin() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [profileList, setProfileList] = useState<{ id: string; nome: string }[]>([]);
  const [lastOrders, setLastOrders] = useState<Record<string, LastOrder>>({});

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
        .select("id, razao_social, cnpj, status, cluster, tabela_preco, vendedor_id, negativado, cidade, uf, codigo_parceiro, nome_parceiro, canal, suframa")
        .order("razao_social"),
      supabase.from("profiles").select("id, full_name, email"),
      supabase.from("user_roles").select("user_id").in("role", ["vendedor", "admin"]),
      supabase
        .from("pedidos")
        .select("cliente_id, data_pedido, itens_pedido(total_item)")
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (loRes.data as any[]).forEach((p) => {
        if (!map[p.cliente_id]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const total = (p.itens_pedido ?? []).reduce((s: number, i: any) => s + Number(i.total_item), 0);
          map[p.cliente_id] = { data_pedido: p.data_pedido, total };
        }
      });
      setLastOrders(map);
    }
  };

  useEffect(() => {
    carregar().finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    toast.success(`${transferirCliente.razao_social} transferido`);
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
    toast.success(`${excluirCliente.razao_social} excluído`);
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
                    <TableHead>Razão Social</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Cidade / UF</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Cluster</TableHead>
                    <TableHead>Tabela</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Último Pedido</TableHead>
                    <TableHead>Negativado</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtrados.map((c) => {
                    const lo = lastOrders[c.id];
                    const atv = computeAtividade(lo?.data_pedido ?? null);
                    return (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/clientes/${c.id}`)}>
                        <TableCell className="font-medium">{c.razao_social}</TableCell>
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
                        <TableCell>
                          {c.negativado ? (
                            <Badge variant="destructive" className="text-xs">Sim</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Não</span>
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7"
                            title="Excluir cliente"
                            onClick={() => setExcluirCliente(c)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
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
                    <TableHead className="w-24">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {carteira.map((c) => {
                    const lo = lastOrders[c.id];
                    return (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/clientes/${c.id}`)}>
                        <TableCell className="font-medium">{c.razao_social}</TableCell>
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
              Transferir <strong>{transferirCliente?.razao_social}</strong> para:
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
              Esta ação é irreversível. <strong>{excluirCliente?.razao_social}</strong> e todos os seus dados serão removidos do banco.
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
    </div>
  );
}
