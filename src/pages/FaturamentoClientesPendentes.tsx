import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { formatCNPJ, formatDate } from "@/lib/format";
import { Loader2, Users, Search, Trash2 } from "lucide-react";

type ClientePendente = {
  id: string;
  nome_cliente: string | null;
  razao_social: string | null;
  cnpj: string | null;
  contato_principal: string | null;
  email: string | null;
  telefone: string | null;
  classificacao: string | null;
  cluster_sugerido: string | null;
  vendedor_id: string | null;
  vendedor_nome: string | null;
  origem: string;
  status: string;
  negativado: boolean | null;
  created_at: string;
};

type ClienteTodos = {
  id: string;
  razao_social: string;
  cnpj: string;
  cidade: string | null;
  uf: string | null;
  codigo_parceiro: string | null;
  tabela_preco: string | null;
  suframa: boolean | null;
  vendedor_id: string | null;
  canal: string | null;
  negativado: boolean | null;
  status: string | null;
};

export default function FaturamentoClientesPendentes() {
  const [clientes, setClientes] = useState<ClientePendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [profileList, setProfileList] = useState<{ id: string; nome: string }[]>([]);

  const [cadastrarDialog, setCadastrarDialog] = useState<ClientePendente | null>(null);
  const [codigoParceiro, setCodigoParceiro] = useState("");
  const [negativado, setNegativado] = useState(false);
  const [cadastrando, setCadastrando] = useState(false);

  const [excluirCliente, setExcluirCliente] = useState<ClientePendente | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  // Todos os clientes
  const [todos, setTodos] = useState<ClienteTodos[]>([]);
  const [loadingTodos, setLoadingTodos] = useState(false);
  const [buscaTodos, setBuscaTodos] = useState("");
  const [filtroVendedorTodos, setFiltroVendedorTodos] = useState("todos");
  const [filtroSuframa, setFiltroSuframa] = useState("todos");

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase.from("cadastros_pendentes") as any)
      .select("id, nome_cliente, razao_social, cnpj, contato_principal, email, telefone, classificacao, cluster_sugerido, vendedor_id, vendedor_nome, origem, status, negativado, created_at")
      .eq("status", "pendente_sankhya")
      .order("created_at", { ascending: true });
    if (error) toast.error("Erro ao carregar cadastros");
    else setClientes((data ?? []) as ClientePendente[]);
    setLoading(false);
  }, []);

  const carregarTodos = useCallback(async () => {
    setLoadingTodos(true);
    const { data, error } = await supabase
      .from("clientes")
      .select("id, razao_social, cnpj, cidade, uf, codigo_parceiro, tabela_preco, suframa, vendedor_id, canal, negativado, status")
      .order("razao_social");
    if (error) toast.error("Erro ao carregar clientes");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    else setTodos((data ?? []) as any[]);
    setLoadingTodos(false);
  }, []);

  useEffect(() => {
    carregar();
    supabase.from("profiles").select("id, full_name, email").then(({ data }) => {
      if (!data) return;
      const map: Record<string, string> = {};
      data.forEach((p) => { map[p.id] = p.full_name || p.email; });
      setProfiles(map);
      setProfileList(data.map((p) => ({ id: p.id, nome: p.full_name || p.email })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
    });
  }, [carregar]);

  const confirmarCadastro = async () => {
    if (!cadastrarDialog) return;
    if (!codigoParceiro.trim()) {
      toast.error("Informe o código do cliente no Sankhya.");
      return;
    }
    setCadastrando(true);

    // Create client in clientes table
    const { error: insErr } = await supabase.from("clientes").insert({
      razao_social: cadastrarDialog.razao_social ?? cadastrarDialog.nome_cliente ?? "Sem nome",
      cnpj: cadastrarDialog.cnpj ?? "00000000000000",
      email: cadastrarDialog.email ?? null,
      telefone: cadastrarDialog.telefone ?? null,
      cluster: cadastrarDialog.cluster_sugerido ?? null,
      negativado,
      vendedor_id: cadastrarDialog.vendedor_id ?? null,
      codigo_parceiro: codigoParceiro.trim(),
      status: "aguardando_trade",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    if (insErr) {
      toast.error("Erro ao criar cliente: " + insErr.message);
      setCadastrando(false);
      return;
    }

    // Update status in cadastros_pendentes
    const { error: upErr } = await (supabase.from("cadastros_pendentes") as any)
      .update({ status: "cadastrado" })
      .eq("id", cadastrarDialog.id);

    if (upErr) {
      toast.error("Erro ao atualizar status: " + upErr.message);
      setCadastrando(false);
      return;
    }

    await supabase.from("notificacoes").insert({
      destinatario_role: "trade",
      mensagem: `${cadastrarDialog.nome_cliente ?? cadastrarDialog.razao_social} foi cadastrado no Sankhya e aguarda configuração de perfil`,
      tipo: "cliente_aguardando_trade",
    });

    toast.success("Cliente cadastrado com sucesso!");
    setCadastrarDialog(null);
    setCodigoParceiro("");
    setCadastrando(false);
    carregar();
  };

  const excluir = async () => {
    if (!excluirCliente) return;
    setExcluindo(true);
    const { error } = await (supabase.from("cadastros_pendentes") as any)
      .delete()
      .eq("id", excluirCliente.id);
    setExcluindo(false);
    if (error) { toast.error("Erro ao excluir: " + error.message); return; }
    toast.success(`${excluirCliente.nome_cliente ?? excluirCliente.razao_social} excluído`);
    setClientes((prev) => prev.filter((c) => c.id !== excluirCliente.id));
    setExcluirCliente(null);
  };

  const toggleNegativado = async (c: ClienteTodos) => {
    const novo = !c.negativado;
    const { error } = await supabase.from("clientes").update({ negativado: novo }).eq("id", c.id);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success(`${c.razao_social} atualizado`);
    setTodos((prev) => prev.map((x) => x.id === c.id ? { ...x, negativado: novo } : x));
  };

  const todosFiltrados = useMemo(() => {
    let lista = todos;
    if (buscaTodos.trim()) {
      const bl = buscaTodos.toLowerCase();
      const bd = buscaTodos.replace(/\D/g, "");
      lista = lista.filter((c) =>
        c.razao_social.toLowerCase().includes(bl) ||
        (bd.length > 0 && c.cnpj.replace(/\D/g, "").includes(bd)) ||
        (c.codigo_parceiro ?? "").toLowerCase().includes(bl)
      );
    }
    if (filtroVendedorTodos !== "todos") {
      lista = lista.filter((c) => c.vendedor_id === filtroVendedorTodos);
    }
    if (filtroSuframa === "sim") lista = lista.filter((c) => c.suframa);
    return lista;
  }, [todos, buscaTodos, filtroVendedorTodos, filtroSuframa]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Clientes</h1>
      </div>

      <Tabs defaultValue="pendentes">
        <TabsList>
          <TabsTrigger value="pendentes">
            Aguardando cadastro
            {clientes.length > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-red-100 text-red-800 border border-red-300 px-1.5 py-0.5 text-[10px] font-bold leading-none">
                {clientes.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="todos" onClick={() => { if (todos.length === 0) carregarTodos(); }}>
            Todos os clientes
          </TabsTrigger>
        </TabsList>

        {/* ABA PENDENTES */}
        <TabsContent value="pendentes" className="mt-4">
          <p className="text-sm text-muted-foreground mb-4">
            Cadastros enviados por vendedores ou aprovados pela gestora aguardando registro no Sankhya
          </p>

          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : clientes.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">Nenhum cliente pendente de cadastro</p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Data envio</TableHead>
                    <TableHead className="min-w-[160px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {c.nome_cliente ?? c.razao_social ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {c.cnpj ? formatCNPJ(c.cnpj) : "—"}
                      </TableCell>
                      <TableCell>
                        {c.origem === "vendedor" ? (
                          <Badge variant="outline" className="border-green-400 bg-green-50 text-green-700">Vendedor</Badge>
                        ) : (
                          <Badge variant="outline" className="border-blue-400 bg-blue-50 text-blue-700">Site</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.vendedor_nome ?? (c.vendedor_id ? (profiles[c.vendedor_id] ?? "—") : "—")}
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(c.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2 items-center">
                          <Button
                            size="sm"
                            onClick={() => { setCadastrarDialog(c); setNegativado(false); setCodigoParceiro(""); }}
                          >
                            Marcar como cadastrado
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title="Excluir"
                            onClick={() => setExcluirCliente(c)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ABA TODOS OS CLIENTES */}
        <TabsContent value="todos" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">Todos os clientes cadastrados no sistema</p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nome, CNPJ ou código..."
                value={buscaTodos}
                onChange={(e) => setBuscaTodos(e.target.value)}
              />
            </div>
            <Select value={filtroVendedorTodos} onValueChange={setFiltroVendedorTodos}>
              <SelectTrigger className="w-full sm:w-52">
                <SelectValue placeholder="Vendedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os vendedores</SelectItem>
                {profileList.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroSuframa} onValueChange={setFiltroSuframa}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="SUFRAMA" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="sim">Apenas SUFRAMA</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loadingTodos ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{todosFiltrados.length} clientes</p>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Razão Social</TableHead>
                      <TableHead>CNPJ</TableHead>
                      <TableHead>Cód. Parceiro</TableHead>
                      <TableHead>Cidade/UF</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Canal</TableHead>
                      <TableHead>Tabela</TableHead>
                      <TableHead>SUFRAMA</TableHead>
                      <TableHead>Negativado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {todosFiltrados.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.razao_social}</TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {formatCNPJ(c.cnpj)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {c.codigo_parceiro ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {[c.cidade, c.uf].filter(Boolean).join(" / ") || "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {c.vendedor_id ? (profiles[c.vendedor_id] ?? "—") : "—"}
                        </TableCell>
                        <TableCell>
                          {c.canal ? (
                            <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300 text-xs">
                              {c.canal}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{c.tabela_preco ?? "—"}</TableCell>
                        <TableCell>
                          {c.suframa ? (
                            <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs">Sim</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Não</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={!!c.negativado}
                            onCheckedChange={() => toggleNegativado(c)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* AlertDialog — Excluir cadastro */}
      <AlertDialog open={!!excluirCliente} onOpenChange={(o) => !o && setExcluirCliente(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deseja excluir este cadastro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. <strong>{excluirCliente?.nome_cliente ?? excluirCliente?.razao_social}</strong> será removido permanentemente da fila.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={excluir}
              disabled={excluindo}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {excluindo && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog — Confirmar cadastro */}
      <Dialog open={!!cadastrarDialog} onOpenChange={(o) => !o && setCadastrarDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cadastrar no Sankhya</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Informe o código do cliente <strong>{cadastrarDialog?.nome_cliente ?? cadastrarDialog?.razao_social}</strong> gerado no Sankhya.
            </p>
            <div className="space-y-1.5">
              <Label>Código do cliente *</Label>
              <Input
                value={codigoParceiro}
                onChange={(e) => setCodigoParceiro(e.target.value)}
                placeholder="Ex: 00123"
                autoFocus
              />
            </div>
            <div className="flex items-center gap-3 rounded-md border px-4 py-3">
              <Switch checked={negativado} onCheckedChange={setNegativado} />
              <div>
                <div className="text-sm font-medium">Cliente negativado</div>
                <div className="text-xs text-muted-foreground">Apenas pagamento à vista disponível</div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCadastrarDialog(null)}>Cancelar</Button>
            <Button onClick={confirmarCadastro} disabled={cadastrando || !codigoParceiro.trim()}>
              {cadastrando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar cadastro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
