import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { formatCNPJ } from "@/lib/format";
import { PERFIS_CLIENTE, TABELAS_PRECO } from "@/lib/constants";
import { Loader2, Search, Users } from "lucide-react";

type Cliente = {
  id: string;
  razao_social: string;
  cnpj: string | null;
  cidade: string | null;
  uf: string | null;
  perfil_cliente: string | null;
  tabela_preco: string | null;
  vendedor_id: string | null;
  negativado: boolean;
  aceita_saldo: boolean;
  observacoes_trade: string | null;
};

type Vendedor = { id: string; nome: string };

function tabelaLabel(v: string | null): string {
  if (!v) return "—";
  const t = TABELAS_PRECO.find((x) => x.value === v);
  return t ? t.label : v;
}

export default function FaturamentoClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendedoresMap, setVendedoresMap] = useState<Record<string, string>>({});
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);

  const [busca, setBusca] = useState("");
  const [filtroPerfil, setFiltroPerfil] = useState<"todos" | "sem" | "com">("todos");
  const [filtroUF, setFiltroUF] = useState("todas");

  const [modalCliente, setModalCliente] = useState<Cliente | null>(null);
  const [editPerfil, setEditPerfil] = useState("");
  const [editTabela, setEditTabela] = useState("");
  const [editVendedorId, setEditVendedorId] = useState("");
  const [editNegativado, setEditNegativado] = useState(false);
  const [editAceitaSaldo, setEditAceitaSaldo] = useState(false);
  const [editObs, setEditObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [clientesRes, vendedoresRes] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, razao_social, cnpj, cidade, uf, perfil_cliente, tabela_preco, vendedor_id, negativado, aceita_saldo, observacoes_trade")
        .order("razao_social"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("profiles")
        .select("id, full_name, name, email")
        .eq("role", "vendedor")
        .order("full_name"),
    ]);

    if (clientesRes.error) {
      toast.error("Erro ao carregar clientes: " + clientesRes.error.message);
    } else {
      setClientes((clientesRes.data ?? []) as Cliente[]);
    }

    if (vendedoresRes.data) {
      const map: Record<string, string> = {};
      const lista: Vendedor[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vendedoresRes.data.forEach((p: any) => {
        const nome = p.full_name || p.name || p.email || "—";
        map[p.id] = nome;
        lista.push({ id: p.id, nome });
      });
      setVendedoresMap(map);
      setVendedores(lista);
    }

    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const ufsUnicas = useMemo(() => {
    const set = new Set(clientes.map((c) => c.uf).filter(Boolean));
    return [...set].sort() as string[];
  }, [clientes]);

  const clientesFiltrados = useMemo(() => {
    const lista = clientes.filter((c) => {
      const buscaLow = busca.toLowerCase();
      const buscaDigits = busca.replace(/\D/g, "");
      const cnpjDigits = (c.cnpj ?? "").replace(/\D/g, "");
      const matchBusca = !busca
        || c.razao_social.toLowerCase().includes(buscaLow)
        || (buscaDigits.length > 0 && cnpjDigits.includes(buscaDigits));
      const matchPerfil = filtroPerfil === "todos"
        || (filtroPerfil === "sem" && !c.perfil_cliente)
        || (filtroPerfil === "com" && !!c.perfil_cliente);
      const matchUF = filtroUF === "todas" || c.uf === filtroUF;
      return matchBusca && matchPerfil && matchUF;
    });

    lista.sort((a, b) => {
      if (!a.perfil_cliente && b.perfil_cliente) return -1;
      if (a.perfil_cliente && !b.perfil_cliente) return 1;
      return a.razao_social.localeCompare(b.razao_social, "pt-BR");
    });

    return lista;
  }, [clientes, busca, filtroPerfil, filtroUF]);

  const abrirModal = (c: Cliente) => {
    setModalCliente(c);
    setEditPerfil(c.perfil_cliente ?? "");
    setEditTabela(c.tabela_preco ?? "");
    setEditVendedorId(c.vendedor_id ?? "");
    setEditNegativado(c.negativado);
    setEditAceitaSaldo(c.aceita_saldo);
    setEditObs(c.observacoes_trade ?? "");
  };

  const salvar = async () => {
    if (!modalCliente) return;
    setSalvando(true);

    const eraSeemPerfil = !modalCliente.perfil_cliente;

    const { error } = await supabase
      .from("clientes")
      .update({
        perfil_cliente: editPerfil || null,
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

  const semPerfilCount = clientes.filter((c) => !c.perfil_cliente).length;

  return (
    <div className="space-y-6">
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

      {/* Filtros */}
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

        <span className="self-center text-sm text-muted-foreground">
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
                <TableHead>Cliente</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Cidade / UF</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Tabela</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Negativado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientesFiltrados.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => abrirModal(c)}
                >
                  <TableCell className="font-medium">{c.razao_social}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {c.cnpj ? formatCNPJ(c.cnpj) : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {[c.cidade, c.uf].filter(Boolean).join(" / ") || "—"}
                  </TableCell>
                  <TableCell>
                    {c.perfil_cliente ? (
                      <Badge variant="outline" className="text-xs">{c.perfil_cliente}</Badge>
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
                  <TableCell>
                    {c.negativado && (
                      <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300">
                        Sim
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modal de edição */}
      <Dialog open={!!modalCliente} onOpenChange={(o) => !o && setModalCliente(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar cliente — {modalCliente?.razao_social}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Perfil do cliente</Label>
                <Select value={editPerfil || "__none__"} onValueChange={(v) => setEditPerfil(v === "__none__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Sem perfil —</SelectItem>
                    {PERFIS_CLIENTE.map((p) => (
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
    </div>
  );
}
