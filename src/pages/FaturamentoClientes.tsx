import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { formatBRL, formatCNPJ, formatDate } from "@/lib/format";
import { CLUSTERS, TABELAS_PRECO, UFS } from "@/lib/constants";
import { Loader2, Search, Users, Pencil, Trash2, SlidersHorizontal, X, UserPlus } from "lucide-react";

type Cliente = {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  email: string | null;
  telefone: string | null;
  comprador: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  codigo_parceiro: string | null;
  codigo_cliente: string | null;
  cluster: string | null;
  tabela_preco: string | null;
  vendedor_id: string | null;
  status: string | null;
  negativado: boolean;
  aceita_saldo: boolean;
  observacoes_trade: string | null;
};

type Vendedor = { id: string; nome: string };
type LastOrder = { data_pedido: string; total: number };

function tabelaLabel(v: string | null): string {
  if (!v) return "—";
  const t = TABELAS_PRECO.find((x) => x.value === v);
  return t ? t.label : v;
}

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

const STATUS_OPTIONS = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
  { value: "aguardando_trade", label: "Aguardando Trade" },
];

function computeAtividade(data: string | null): "ativo" | "em_risco" | "inativo" {
  if (!data) return "inativo";
  const dias = Math.floor((Date.now() - new Date(data).getTime()) / 86_400_000);
  return dias <= 30 ? "ativo" : dias <= 90 ? "em_risco" : "inativo";
}

export default function FaturamentoClientes() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendedoresMap, setVendedoresMap] = useState<Record<string, string>>({});
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [lastOrders, setLastOrders] = useState<Record<string, LastOrder>>({});

  // Filtros básicos
  const [busca, setBusca] = useState("");
  const [filtroPerfil, setFiltroPerfil] = useState<"todos" | "sem" | "com">("todos");
  const [filtroUF, setFiltroUF] = useState("todas");

  // Filtros avançados
  const [showFiltros, setShowFiltros] = useState(false);
  const [filtroVendedor, setFiltroVendedor] = useState("todos");
  const [filtroCluster, setFiltroCluster] = useState("todos");
  const [filtroTabela, setFiltroTabela] = useState("todos");
  const [filtroAtividade, setFiltroAtividade] = useState("todos");

  // Modal edição
  const [modalCliente, setModalCliente] = useState<Cliente | null>(null);
  const [editRazaoSocial, setEditRazaoSocial] = useState("");
  const [editNomeFantasia, setEditNomeFantasia] = useState("");
  const [editCodigoCliente, setEditCodigoCliente] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editTelefone, setEditTelefone] = useState("");
  const [editPerfil, setEditPerfil] = useState("");
  const [editTabela, setEditTabela] = useState("");
  const [editVendedorId, setEditVendedorId] = useState("");
  const [editNegativado, setEditNegativado] = useState(false);
  const [editAceitaSaldo, setEditAceitaSaldo] = useState(false);
  const [editComprador, setEditComprador] = useState("");
  const [editCidade, setEditCidade] = useState("");
  const [editUF, setEditUF] = useState("");
  const [editCep, setEditCep] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editObs, setEditObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Analise de crédito
  const [analiseCliente, setAnaliseCliente] = useState<Cliente | null>(null);
  const [analiseObs, setAnaliseObs] = useState("");
  const [salvandoAnalise, setSalvandoAnalise] = useState(false);

  // Excluir
  const [excluirCliente, setExcluirCliente] = useState<Cliente | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [clientesRes, roleRes, loRes] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, razao_social, nome_fantasia, cnpj, email, telefone, comprador, cidade, uf, cep, codigo_parceiro, codigo_cliente, cluster, tabela_preco, vendedor_id, status, negativado, aceita_saldo, observacoes_trade")
        .order("razao_social")
        .range(0, 9999),
      supabase.from("user_roles").select("user_id").eq("role", "vendedor"),
      supabase
        .from("pedidos")
        .select("cliente_id, data_pedido, itens_pedido(total_item)")
        .neq("status", "rascunho")
        .order("data_pedido", { ascending: false }),
    ]);

    if (clientesRes.error) {
      toast.error("Erro ao carregar clientes: " + clientesRes.error.message);
    } else {
      setClientes((clientesRes.data ?? []) as Cliente[]);
    }

    // Busca nomes dos vendedores via user_roles + profiles
    if (roleRes.data && roleRes.data.length > 0) {
      const vendedorIds = roleRes.data.map((r) => r.user_id);
      const profRes = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", vendedorIds);

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

    // Monta mapa de último pedido por cliente
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

    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const ufsUnicas = useMemo(() =>
    Array.from(new Set(clientes.map((c) => c.uf).filter(Boolean))).sort() as string[],
    [clientes]
  );

  const filtrosAtivos = filtroVendedor !== "todos" || filtroCluster !== "todos" ||
    filtroTabela !== "todos" || filtroAtividade !== "todos";

  const limparFiltros = () => {
    setFiltroVendedor("todos");
    setFiltroCluster("todos");
    setFiltroTabela("todos");
    setFiltroAtividade("todos");
  };

  const clientesFiltrados = useMemo(() => {
    let lista = clientes.filter((c) => {
      const buscaLow = busca.toLowerCase();
      const buscaDigits = busca.replace(/\D/g, "");
      const cnpjDigits = (c.cnpj ?? "").replace(/\D/g, "");
      const matchBusca = !busca
        || c.razao_social.toLowerCase().includes(buscaLow)
        || (buscaDigits.length > 0 && cnpjDigits.includes(buscaDigits))
        || (c.codigo_parceiro?.toLowerCase().includes(buscaLow) ?? false)
        || (c.cidade?.toLowerCase().includes(buscaLow) ?? false);
      const matchPerfil = filtroPerfil === "todos"
        || (filtroPerfil === "sem" && !c.cluster)
        || (filtroPerfil === "com" && !!c.cluster);
      const matchUF = filtroUF === "todas" || c.uf === filtroUF;
      return matchBusca && matchPerfil && matchUF;
    });

    if (filtroVendedor !== "todos") lista = lista.filter((c) => c.vendedor_id === filtroVendedor);
    if (filtroCluster !== "todos") lista = lista.filter((c) => c.cluster === filtroCluster);
    if (filtroTabela !== "todos") lista = lista.filter((c) => c.tabela_preco === filtroTabela);
    if (filtroAtividade !== "todos") {
      lista = lista.filter((c) => computeAtividade(lastOrders[c.id]?.data_pedido ?? null) === filtroAtividade);
    }

    lista.sort((a, b) => {
      if (!a.cluster && b.cluster) return -1;
      if (a.cluster && !b.cluster) return 1;
      return a.razao_social.localeCompare(b.razao_social, "pt-BR");
    });

    return lista;
  }, [clientes, busca, filtroPerfil, filtroUF, filtroVendedor, filtroCluster, filtroTabela, filtroAtividade, lastOrders]);

  const abrirModal = (c: Cliente) => {
    setModalCliente(c);
    setEditRazaoSocial(c.razao_social);
    setEditNomeFantasia(c.nome_fantasia ?? "");
    setEditCodigoCliente(c.codigo_cliente ?? "");
    setEditEmail(c.email ?? "");
    setEditTelefone(c.telefone ?? "");
    setEditPerfil(c.cluster ?? "");
    setEditTabela(c.tabela_preco ?? "");
    setEditVendedorId(c.vendedor_id ?? "");
    setEditComprador(c.comprador ?? "");
    setEditCidade(c.cidade ?? "");
    setEditUF(c.uf ?? "");
    setEditCep(c.cep ?? "");
    setEditStatus(c.status ?? "ativo");
    setEditNegativado(c.negativado);
    setEditAceitaSaldo(c.aceita_saldo);
    setEditObs(c.observacoes_trade ?? "");
  };

  const salvar = async () => {
    if (!modalCliente) return;
    setSalvando(true);

    const eraSeemPerfil = !modalCliente.cluster;

    const { error } = await supabase
      .from("clientes")
      .update({
        razao_social: editRazaoSocial.trim() || modalCliente.razao_social,
        nome_fantasia: editNomeFantasia.trim() || null,
        codigo_cliente: editCodigoCliente.trim() || null,
        email: editEmail.trim() || null,
        telefone: editTelefone.trim() || null,
        comprador: editComprador.trim() || null,
        cidade: editCidade.trim() || null,
        uf: editUF || null,
        cep: editCep.trim() || null,
        status: editStatus || "ativo",
        cluster: editPerfil || null,
        tabela_preco: editTabela || null,
        vendedor_id: editVendedorId || null,
        negativado: editNegativado,
        aceita_saldo: editAceitaSaldo,
        observacoes_trade: editObs.trim() || null,
      })
      .eq("id", modalCliente.id);

    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      setSalvando(false);
      return;
    }

    if (eraSeemPerfil && editPerfil && editVendedorId) {
      await supabase.from("notificacoes").insert({
        destinatario_id: editVendedorId,
        destinatario_role: "vendedor",
        mensagem: `Cliente ${modalCliente.razao_social} teve perfil definido: ${editPerfil} — Tabela: ${tabelaLabel(editTabela)}`,
        tipo: "perfil_definido",
        lida: false,
      });
    }

    toast.success("Cliente atualizado com sucesso!");
    setModalCliente(null);
    setSalvando(false);
    await carregar();
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

  const enviarAnalise = async () => {
    if (!analiseCliente) return;
    setSalvandoAnalise(true);
    const { error } = await (supabase.from("solicitacoes_analise") as any).insert({
      cliente_id: analiseCliente.id,
      observacoes: analiseObs.trim() || null,
      status: "pendente",
    });
    setSalvandoAnalise(false);
    if (error) { toast.error("Erro ao enviar: " + error.message); return; }
    toast.success("Solicitação enviada!");
    setAnaliseCliente(null);
    setAnaliseObs("");
  };

  const semPerfilCount = clientes.filter((c) => !c.cluster).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie perfis, tabelas e vendedores de todos os clientes
            {semPerfilCount > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-red-100 text-red-800 border border-red-300 px-2 py-0.5 text-xs font-semibold">
                {semPerfilCount} sem perfil
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => navigate("/faturamento/cadastrar-cliente")}>
          <UserPlus className="h-4 w-4 mr-2" />
          Cadastrar cliente
        </Button>
      </div>

      {/* Filtros básicos */}
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

        <div className="flex gap-1">
          {(["todos", "sem", "com"] as const).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={filtroPerfil === v ? "default" : "outline"}
              onClick={() => setFiltroPerfil(v)}
            >
              {v === "todos" ? "Todos" : v === "sem" ? "Sem perfil" : "Com perfil"}
            </Button>
          ))}
        </div>

        <Select value={filtroUF} onValueChange={setFiltroUF}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="UF" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as UFs</SelectItem>
            {ufsUnicas.map((uf) => (
              <SelectItem key={uf} value={uf}>{uf}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={showFiltros ? "default" : "outline"}
          size="sm"
          onClick={() => setShowFiltros((v) => !v)}
          className="gap-2"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtros avançados
          {filtrosAtivos && <span className="rounded-full bg-primary-foreground text-primary text-xs px-1.5">✓</span>}
        </Button>
        {filtrosAtivos && (
          <Button variant="ghost" size="icon" onClick={limparFiltros} title="Limpar filtros avançados">
            <X className="h-4 w-4" />
          </Button>
        )}

        <span className="self-center text-sm text-muted-foreground">
          {clientesFiltrados.length} cliente{clientesFiltrados.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Painel de filtros avançados */}
      {showFiltros && (
        <div className="rounded-md border bg-muted/20 p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Vendedor</label>
            <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Cluster</label>
            <Select value={filtroCluster} onValueChange={setFiltroCluster}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {CLUSTERS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
                <TableHead>Cliente</TableHead>
                <TableHead>CNPJ / Cód.</TableHead>
                <TableHead>Cidade / UF</TableHead>
                <TableHead>Cluster</TableHead>
                <TableHead>Tabela</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Último Pedido</TableHead>
                <TableHead>Negativado</TableHead>
                <TableHead className="w-28">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientesFiltrados.map((c) => {
                const lo = lastOrders[c.id];
                const atv = computeAtividade(lo?.data_pedido ?? null);
                return (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/clientes/${c.id}`)}
                  >
                    <TableCell className="font-medium">{c.razao_social}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="font-mono">{c.cnpj ? formatCNPJ(c.cnpj) : "—"}</div>
                      {c.codigo_parceiro && <div className="text-xs">Cód: {c.codigo_parceiro}</div>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {[c.cidade, c.uf].filter(Boolean).join(" / ") || "—"}
                    </TableCell>
                    <TableCell>
                      {c.cluster ? (
                        <Badge variant="outline" className="text-xs">{c.cluster}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300">
                          Sem perfil
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{tabelaLabel(c.tabela_preco)}</TableCell>
                    <TableCell className="text-sm">
                      {c.vendedor_id
                        ? (vendedoresMap[c.vendedor_id] ?? "—")
                        : (
                          <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300">
                            Sem vendedor
                          </Badge>
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
                    <TableCell>
                      {c.negativado && (
                        <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300">⚠ Negativado</Badge>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7"
                          title="Editar cadastro"
                          onClick={() => abrirModal(c)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm" variant="ghost" className="h-7 px-2 text-xs"
                          title="Solicitar análise de crédito"
                          onClick={() => { setAnaliseCliente(c); setAnaliseObs(""); }}
                        >
                          Crédito
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

      {/* Modal de edição */}
      <Dialog open={!!modalCliente} onOpenChange={(o) => !o && setModalCliente(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar cliente — {modalCliente?.razao_social}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Razão social</Label>
              <Input value={editRazaoSocial} onChange={(e) => setEditRazaoSocial(e.target.value)} placeholder="Razão social" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nome fantasia</Label>
                <Input value={editNomeFantasia} onChange={(e) => setEditNomeFantasia(e.target.value)} placeholder="Nome fantasia" />
              </div>
              <div className="space-y-1.5">
                <Label>Código do cliente</Label>
                <Input value={editCodigoCliente} onChange={(e) => setEditCodigoCliente(e.target.value)} placeholder="Código do cliente" />
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
                    {UFS.map((uf) => (
                      <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>CEP</Label>
              <Input value={editCep} onChange={(e) => setEditCep(e.target.value)} placeholder="00000-000" maxLength={9} />
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Cluster</Label>
                <Select value={editPerfil || "__none__"} onValueChange={(v) => setEditPerfil(v === "__none__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Sem perfil —</SelectItem>
                    {CLUSTERS.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Tabela de preço</Label>
                <Select value={editTabela || "__none__"} onValueChange={(v) => setEditTabela(v === "__none__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a tabela" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Sem tabela —</SelectItem>
                    {TABELAS_PRECO.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Vendedor responsável</Label>
              <Select
                value={editVendedorId || "__nenhum__"}
                onValueChange={(v) => setEditVendedorId(v === "__nenhum__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__nenhum__">— Sem vendedor —</SelectItem>
                  {vendedores.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-8">
              <div className="flex items-center gap-3">
                <Switch
                  checked={editNegativado}
                  onCheckedChange={setEditNegativado}
                  id="switch-negativado"
                />
                <Label htmlFor="switch-negativado">Negativado</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={editAceitaSaldo}
                  onCheckedChange={setEditAceitaSaldo}
                  id="switch-aceita-saldo"
                />
                <Label htmlFor="switch-aceita-saldo">Aceita saldo</Label>
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
            <Button variant="outline" onClick={() => setModalCliente(null)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog — Análise de crédito */}
      <Dialog open={!!analiseCliente} onOpenChange={(o) => !o && setAnaliseCliente(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Solicitar análise de crédito — {analiseCliente?.razao_social}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Observações</Label>
            <Textarea
              rows={4}
              value={analiseObs}
              onChange={(e) => setAnaliseObs(e.target.value)}
              placeholder="Informe o motivo da solicitação, histórico relevante..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnaliseCliente(null)}>Cancelar</Button>
            <Button onClick={enviarAnalise} disabled={salvandoAnalise}>
              {salvandoAnalise && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Enviar solicitação
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
