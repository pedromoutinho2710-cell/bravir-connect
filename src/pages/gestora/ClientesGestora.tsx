import { useEffect, useState, useMemo, useCallback } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatCNPJ } from "@/lib/format";
import { CLUSTERS, TABELAS_PRECO, UFS } from "@/lib/constants";
import { Loader2, Search, Users, UserX, AlertTriangle, ShieldAlert, Pencil } from "lucide-react";

type Cliente = {
  id: string;
  razao_social: string;
  cnpj: string | null;
  email: string | null;
  telefone: string | null;
  comprador: string | null;
  cidade: string | null;
  uf: string | null;
  cluster: string | null;
  tabela_preco: string | null;
  vendedor_id: string | null;
  status: string | null;
  negativado: boolean | null;
  aceita_saldo: boolean;
  observacoes_trade: string | null;
};

type Vendedor = { id: string; nome: string };

const STATUS_OPTIONS = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
  { value: "aguardando_trade", label: "Aguardando Trade" },
];

const STATUS_COLOR: Record<string, string> = {
  ativo: "bg-green-100 text-green-800 border-green-300",
  inativo: "bg-gray-100 text-gray-700 border-gray-300",
  aguardando_trade: "bg-yellow-100 text-yellow-800 border-yellow-300",
};

function tabelaLabel(v: string | null): string {
  if (!v) return "—";
  const t = TABELAS_PRECO.find((x) => x.value === v);
  return t ? t.label : v;
}

function statusLabel(v: string | null): string {
  if (!v) return "—";
  return STATUS_OPTIONS.find((s) => s.value === v)?.label ?? v;
}

export default function ClientesGestora() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [vendedoresMap, setVendedoresMap] = useState<Record<string, string>>({});

  // Filtros
  const [busca, setBusca] = useState("");
  const [filtroVendedor, setFiltroVendedor] = useState("todos");
  const [filtroCluster, setFiltroCluster] = useState("todos");
  const [filtroTabela, setFiltroTabela] = useState("todos");
  const [filtroUF, setFiltroUF] = useState("todas");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [apenasSemVendedor, setApenasSemVendedor] = useState(false);

  // Modal edição
  const [modalCliente, setModalCliente] = useState<Cliente | null>(null);
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
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [clientesRes, rolesRes] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, razao_social, cnpj, email, telefone, comprador, cidade, uf, cluster, tabela_preco, vendedor_id, status, negativado, aceita_saldo, observacoes_trade")
        .order("razao_social"),
      supabase.from("user_roles").select("user_id").eq("role", "vendedor"),
    ]);

    if (clientesRes.error) {
      toast.error("Erro ao carregar clientes: " + clientesRes.error.message);
    } else {
      setClientes((clientesRes.data ?? []) as Cliente[]);
    }

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

    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirModal = (c: Cliente) => {
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
  };

  const salvar = async () => {
    if (!modalCliente) return;
    setSalvando(true);
    const { error } = await supabase
      .from("clientes")
      .update({
        razao_social: editRazaoSocial.trim() || modalCliente.razao_social,
        email: editEmail.trim() || null,
        telefone: editTelefone.trim() || null,
        comprador: editComprador.trim() || null,
        cidade: editCidade.trim() || null,
        uf: editUF || null,
        cluster: editCluster || null,
        tabela_preco: editTabela || null,
        vendedor_id: editVendedorId || null,
        status: editStatus || "ativo",
        negativado: editNegativado,
        aceita_saldo: editAceitaSaldo,
        observacoes_trade: editObs.trim() || null,
      })
      .eq("id", modalCliente.id);

    setSalvando(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    toast.success("Cliente atualizado com sucesso!");
    setModalCliente(null);
    await carregar();
  };

  // Resumo
  const totalAtivos = useMemo(() => clientes.filter((c) => c.status === "ativo").length, [clientes]);
  const totalSemVendedor = useMemo(() => clientes.filter((c) => !c.vendedor_id).length, [clientes]);
  const totalAguardandoTrade = useMemo(() => clientes.filter((c) => c.status === "aguardando_trade").length, [clientes]);
  const totalNegativados = useMemo(() => clientes.filter((c) => c.negativado).length, [clientes]);

  const clientesFiltrados = useMemo(() => {
    return clientes.filter((c) => {
      const buscaLow = busca.toLowerCase();
      const buscaDigits = busca.replace(/\D/g, "");
      const cnpjDigits = (c.cnpj ?? "").replace(/\D/g, "");
      const matchBusca = !busca
        || c.razao_social.toLowerCase().includes(buscaLow)
        || (buscaDigits.length > 0 && cnpjDigits.includes(buscaDigits));
      const matchVendedor = filtroVendedor === "todos" || c.vendedor_id === filtroVendedor;
      const matchCluster = filtroCluster === "todos" || c.cluster === filtroCluster;
      const matchTabela = filtroTabela === "todos" || c.tabela_preco === filtroTabela;
      const matchUF = filtroUF === "todas" || c.uf === filtroUF;
      const matchStatus = filtroStatus === "todos" || c.status === filtroStatus;
      const matchSemVendedor = !apenasSemVendedor || !c.vendedor_id;
      return matchBusca && matchVendedor && matchCluster && matchTabela && matchUF && matchStatus && matchSemVendedor;
    });
  }, [clientes, busca, filtroVendedor, filtroCluster, filtroTabela, filtroUF, filtroStatus, apenasSemVendedor]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Clientes</h1>
        <p className="text-sm text-muted-foreground">Visão completa da carteira — edite perfil, vendedor e status</p>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Clientes Ativos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAtivos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sem Vendedor</CardTitle>
            <UserX className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{totalSemVendedor}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Aguardando Trade</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{totalAguardandoTrade}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Negativados</CardTitle>
            <ShieldAlert className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{totalNegativados}</div>
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
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Checkbox
              id="sem-vendedor"
              checked={apenasSemVendedor}
              onCheckedChange={(v) => setApenasSemVendedor(!!v)}
            />
            <label htmlFor="sem-vendedor" className="text-sm cursor-pointer select-none">
              Apenas sem vendedor
            </label>
          </div>
          <span className="text-sm text-muted-foreground">
            {clientesFiltrados.length} cliente{clientesFiltrados.length !== 1 ? "s" : ""}
          </span>
        </div>
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
                <TableHead>Cliente / CNPJ</TableHead>
                <TableHead>Cidade / UF</TableHead>
                <TableHead>Cluster</TableHead>
                <TableHead>Tabela</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientesFiltrados.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-medium">{c.razao_social}</div>
                    {c.cnpj && (
                      <div className="text-xs text-muted-foreground font-mono">{formatCNPJ(c.cnpj)}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {[c.cidade, c.uf].filter(Boolean).join(" / ") || "—"}
                  </TableCell>
                  <TableCell>
                    {c.cluster ? (
                      <Badge variant="outline" className="text-xs">{c.cluster}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{tabelaLabel(c.tabela_preco)}</TableCell>
                  <TableCell className="text-sm">
                    {c.vendedor_id ? (
                      vendedoresMap[c.vendedor_id] ?? "—"
                    ) : (
                      <Badge variant="outline" className="text-xs bg-orange-100 text-orange-700 border-orange-300">
                        Sem vendedor
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.status ? (
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[c.status] ?? "bg-gray-100 text-gray-600 border-gray-300"}`}>
                        {statusLabel(c.status)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title="Editar cliente"
                      onClick={() => abrirModal(c)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
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
              <Input value={editRazaoSocial} onChange={(e) => setEditRazaoSocial(e.target.value)} />
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
