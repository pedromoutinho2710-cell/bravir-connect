import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatCNPJ, formatDate } from "@/lib/format";
import { TABELAS_PRECO, PERFIS_CLIENTE, UFS } from "@/lib/constants";
import { Loader2, Users, UserCheck } from "lucide-react";

type ClientePendente = {
  id: string;
  razao_social: string;
  cnpj: string;
  cidade: string | null;
  uf: string | null;
  vendedor_id: string | null;
  perfil_cliente: string | null;
  created_at: string;
};

type Campanha = { id: string; nome: string };
type Vendedor = { id: string; nome: string };

export default function Trade() {
  // ── Aba 1: aguardando_trade ───────────────────────────────────────────────
  const [clientes, setClientes] = useState<ClientePendente[]>([]);
  const [loadingAguardando, setLoadingAguardando] = useState(true);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);

  const [modalCliente, setModalCliente] = useState<ClientePendente | null>(null);
  const [perfil, setPerfil] = useState("");
  const [tabela, setTabela] = useState("");
  const [desconto, setDesconto] = useState("");
  const [campanhaId, setCampanhaId] = useState("nenhuma");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);

  // ── Aba 2: definir perfil ─────────────────────────────────────────────────
  const [todosCli, setTodosCli] = useState<ClientePendente[]>([]);
  const [loadingTodos, setLoadingTodos] = useState(true);
  const [filtroPerfil, setFiltroPerfil] = useState<"sem" | "com" | "todos">("sem");
  const [filtroUF, setFiltroUF] = useState("todas");
  const [filtroVendedor, setFiltroVendedor] = useState("todos");

  const [modalPerfil, setModalPerfil] = useState<ClientePendente | null>(null);
  const [novoPerfil, setNovoPerfil] = useState("");
  const [novoVendedorId, setNovoVendedorId] = useState("");
  const [novaObs, setNovaObs] = useState("");
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);

  const carregarAguardando = useCallback(async () => {
    setLoadingAguardando(true);
    const { data, error } = await supabase
      .from("clientes")
      .select("id, razao_social, cnpj, cidade, uf, vendedor_id, perfil_cliente, created_at")
      .eq("status", "aguardando_trade")
      .order("created_at", { ascending: true });
    if (error) toast.error("Erro ao carregar clientes");
    else setClientes((data ?? []) as ClientePendente[]);
    setLoadingAguardando(false);
  }, []);

  const carregarTodos = useCallback(async () => {
    setLoadingTodos(true);
    const { data, error } = await supabase
      .from("clientes")
      .select("id, razao_social, cnpj, cidade, uf, vendedor_id, perfil_cliente, created_at")
      .order("razao_social");
    if (error) toast.error("Erro ao carregar clientes");
    else setTodosCli((data ?? []) as ClientePendente[]);
    setLoadingTodos(false);
  }, []);

  useEffect(() => {
    carregarAguardando();
    carregarTodos();

    supabase.from("campanhas").select("id, nome").eq("ativa", true).then(({ data }) => {
      setCampanhas((data ?? []) as Campanha[]);
    });

    supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "vendedor")
      .then(async ({ data: roles }) => {
        const ids = (roles ?? []).map((r) => r.user_id);
        if (ids.length === 0) return;
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email, name")
          .in("id", ids)
          .eq("ativo", true)
          .order("full_name");
        if (!profs) return;
        const map: Record<string, string> = {};
        const lista: Vendedor[] = [];
        profs.forEach((p) => {
          const nome = p.full_name || p.name || p.email;
          map[p.id] = nome;
          lista.push({ id: p.id, nome });
        });
        setProfiles(map);
        setVendedores(lista);
      });
  }, [carregarAguardando, carregarTodos]);

  // ── Aba 1: confirmar configuração (ativa cliente) ─────────────────────────
  const confirmar = async () => {
    if (!modalCliente || !perfil || !tabela) {
      toast.error("Preencha perfil e tabela de preço");
      return;
    }
    setSalvando(true);
    const { error } = await supabase.from("clientes").update({
      status: "ativo",
      perfil_cliente: perfil,
      tabela_preco: tabela,
      desconto_adicional: desconto ? Number(desconto) : null,
      campanha_id: campanhaId !== "nenhuma" ? campanhaId : null,
      observacoes_trade: observacoes.trim() || null,
    }).eq("id", modalCliente.id);

    if (error) { toast.error("Erro: " + error.message); setSalvando(false); return; }

    if (modalCliente.vendedor_id) {
      await supabase.from("notificacoes").insert({
        destinatario_id: modalCliente.vendedor_id,
        destinatario_role: "vendedor",
        mensagem: `${modalCliente.razao_social} foi ativado e já pode receber pedidos`,
        tipo: "cliente_ativo",
      });
    }

    toast.success(`${modalCliente.razao_social} ativado!`);
    setModalCliente(null);
    setSalvando(false);
    carregarAguardando();
    carregarTodos();
  };

  // ── Aba 2: salvar perfil do cliente ──────────────────────────────────────
  const salvarPerfil = async () => {
    if (!modalPerfil || !novoPerfil) {
      toast.error("Selecione o perfil do cliente");
      return;
    }
    setSalvandoPerfil(true);

    const updates: Record<string, unknown> = {
      perfil_cliente: novoPerfil,
      observacoes_trade: novaObs.trim() || null,
    };
    if (novoVendedorId) updates.vendedor_id = novoVendedorId;

    const { error } = await supabase.from("clientes").update(updates).eq("id", modalPerfil.id);

    if (error) { toast.error("Erro: " + error.message); setSalvandoPerfil(false); return; }

    const vendedorDestino = novoVendedorId || modalPerfil.vendedor_id;
    if (vendedorDestino) {
      await supabase.from("notificacoes").insert({
        destinatario_id: vendedorDestino,
        destinatario_role: "vendedor",
        mensagem: `Perfil de ${modalPerfil.razao_social} definido como "${novoPerfil}"`,
        tipo: "perfil_definido",
      });
    }

    toast.success(`Perfil de ${modalPerfil.razao_social} atualizado!`);
    setModalPerfil(null);
    setSalvandoPerfil(false);
    carregarTodos();
  };

  // ── Filtros aba 2 ─────────────────────────────────────────────────────────
  const clientesFiltrados = todosCli.filter((c) => {
    if (filtroPerfil === "sem" && c.perfil_cliente) return false;
    if (filtroPerfil === "com" && !c.perfil_cliente) return false;
    if (filtroUF !== "todas" && c.uf !== filtroUF) return false;
    if (filtroVendedor === "__sem_vendedor__" && c.vendedor_id) return false;
    if (filtroVendedor !== "todos" && filtroVendedor !== "__sem_vendedor__" && c.vendedor_id !== filtroVendedor) return false;
    return true;
  });

  const semPerfilCount = todosCli.filter((c) => !c.perfil_cliente).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Trade</h1>
        <p className="text-sm text-muted-foreground">Configure clientes e defina perfis comerciais</p>
      </div>

      <Tabs defaultValue="aguardando">
        <TabsList>
          <TabsTrigger value="aguardando">
            Aguardando trade
            {clientes.length > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs h-5 min-w-5 px-1">
                {clientes.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="perfil">
            Definir perfil
            {semPerfilCount > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs h-5 min-w-5 px-1 bg-orange-100 text-orange-800 border-orange-300">
                {semPerfilCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── ABA 1: Aguardando trade ─────────────────────────────────────── */}
        <TabsContent value="aguardando" className="mt-4">
          {loadingAguardando ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : clientes.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">Nenhum cliente aguardando configuração</p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Cidade / UF</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Data envio</TableHead>
                    <TableHead className="w-28">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.razao_social}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {formatCNPJ(c.cnpj)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {[c.cidade, c.uf].filter(Boolean).join(" / ") || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.vendedor_id ? (profiles[c.vendedor_id] ?? "—") : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(c.created_at)}</TableCell>
                      <TableCell>
                        <Button size="sm" onClick={() => {
                          setModalCliente(c);
                          setPerfil(""); setTabela(""); setDesconto(""); setCampanhaId("nenhuma"); setObservacoes("");
                        }}>
                          Configurar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── ABA 2: Definir perfil ───────────────────────────────────────── */}
        <TabsContent value="perfil" className="mt-4 space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap gap-3">
            <div className="flex gap-1">
              {(["sem", "com", "todos"] as const).map((v) => (
                <Button
                  key={v}
                  size="sm"
                  variant={filtroPerfil === v ? "default" : "outline"}
                  onClick={() => setFiltroPerfil(v)}
                >
                  {v === "sem" ? "Sem perfil" : v === "com" ? "Com perfil" : "Todos"}
                </Button>
              ))}
            </div>
            <Select value={filtroUF} onValueChange={setFiltroUF}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="UF" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as UFs</SelectItem>
                {UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Vendedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="__sem_vendedor__">Sem vendedor</SelectItem>
                {vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="self-center text-sm text-muted-foreground">
              {clientesFiltrados.length} clientes
            </span>
          </div>

          {loadingTodos ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : clientesFiltrados.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <UserCheck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">Nenhum cliente encontrado</p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Cidade / UF</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Perfil atual</TableHead>
                    <TableHead className="w-28">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientesFiltrados.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.razao_social}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {formatCNPJ(c.cnpj)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {[c.cidade, c.uf].filter(Boolean).join(" / ") || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.vendedor_id ? (profiles[c.vendedor_id] ?? "—") : "—"}
                      </TableCell>
                      <TableCell>
                        {c.perfil_cliente ? (
                          <Badge variant="outline" className="text-xs">{c.perfil_cliente}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-300">
                            Sem perfil
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => {
                          setModalPerfil(c);
                          setNovoPerfil(c.perfil_cliente ?? "");
                          setNovoVendedorId(c.vendedor_id ?? "");
                          setNovaObs("");
                        }}>
                          Definir
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Modal: configurar cliente aguardando_trade */}
      <Dialog open={!!modalCliente} onOpenChange={(o) => !o && setModalCliente(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Configurar — {modalCliente?.razao_social}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Perfil do cliente *</Label>
                <Select value={perfil} onValueChange={setPerfil}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {PERFIS_CLIENTE.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tabela de preço *</Label>
                <Select value={tabela} onValueChange={setTabela}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {TABELAS_PRECO.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Desconto adicional (%)</Label>
                <Input type="number" min={0} max={100} step={0.5}
                  value={desconto} onChange={(e) => setDesconto(e.target.value)}
                  placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Campanha ativa</Label>
                <Select value={campanhaId} onValueChange={setCampanhaId}>
                  <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhuma">Nenhuma</SelectItem>
                    {campanhas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea rows={3} value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Informações adicionais…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalCliente(null)}>Cancelar</Button>
            <Button onClick={confirmar} disabled={salvando || !perfil || !tabela}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Ativar cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: definir perfil */}
      <Dialog open={!!modalPerfil} onOpenChange={(o) => !o && setModalPerfil(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Definir perfil — {modalPerfil?.razao_social}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Perfil do cliente *</Label>
              <Select value={novoPerfil} onValueChange={setNovoPerfil}>
                <SelectTrigger><SelectValue placeholder="Selecione o perfil" /></SelectTrigger>
                <SelectContent>
                  {PERFIS_CLIENTE.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Vendedor responsável</Label>
              <Select value={novoVendedorId || "__nenhum__"} onValueChange={(v) => setNovoVendedorId(v === "__nenhum__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar vendedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__nenhum__">— Manter atual —</SelectItem>
                  {vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Observações (opcional)</Label>
              <Textarea rows={3} value={novaObs}
                onChange={(e) => setNovaObs(e.target.value)}
                placeholder="Comentários adicionais sobre este cliente…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalPerfil(null)}>Cancelar</Button>
            <Button onClick={salvarPerfil} disabled={salvandoPerfil || !novoPerfil}>
              {salvandoPerfil && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar perfil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
