import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABEL, type AppRole } from "@/lib/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Boxes, Search, ChevronsUpDown, History } from "lucide-react";
import { toast } from "sonner";

type Produto = {
  id: string;
  codigo_jiva: string;
  nome: string;
  marca: string;
  disponivel: boolean;
};

function fmtDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ══════════════════════════════════════════════════════════════════
// Aba: Produtos
// ══════════════════════════════════════════════════════════════════

function AbaProdutos() {
  const { user, fullName, role } = useAuth();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [soIndisponiveis, setSoIndisponiveis] = useState(false);
  const [marcasSelecionadas, setMarcasSelecionadas] = useState<string[]>([]);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("produtos")
          .select("id, codigo_jiva, nome, marca, disponivel")
          .eq("ativo", true)
          .order("nome", { ascending: true });
        if (error) throw error;
        setProdutos((data ?? []) as Produto[]);
      } catch {
        toast.error("Erro ao carregar produtos");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalIndisponiveis = useMemo(
    () => produtos.filter((p) => !p.disponivel).length,
    [produtos],
  );

  const marcasDisponiveis = useMemo(() => {
    const set = new Set<string>();
    produtos.forEach((p) => {
      if (p.marca) set.add(p.marca);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [produtos]);

  const produtosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      if (soIndisponiveis && p.disponivel) return false;
      if (marcasSelecionadas.length > 0 && !marcasSelecionadas.includes(p.marca)) return false;
      if (!q) return true;
      return (
        p.nome.toLowerCase().includes(q) ||
        p.codigo_jiva.toLowerCase().includes(q)
      );
    });
  }, [produtos, busca, soIndisponiveis, marcasSelecionadas]);

  const labelMarcas =
    marcasSelecionadas.length === 0
      ? "Todas as marcas"
      : marcasSelecionadas.length === 1
        ? marcasSelecionadas[0]
        : `${marcasSelecionadas.length} marcas`;

  const toggleMarca = (marca: string) => {
    setMarcasSelecionadas((prev) =>
      prev.includes(marca) ? prev.filter((m) => m !== marca) : [...prev, marca],
    );
  };

  const toggleDisponivel = async (produto: Produto, novoValor: boolean) => {
    setSalvandoId(produto.id);
    // Atualização otimista
    setProdutos((prev) =>
      prev.map((p) => (p.id === produto.id ? { ...p, disponivel: novoValor } : p)),
    );
    try {
      const { error } = await supabase
        .from("produtos")
        .update({ disponivel: novoValor })
        .eq("id", produto.id);
      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("historico_estoque").insert({
        produto_id: produto.id,
        campo: "disponivel",
        valor_anterior: String(produto.disponivel),
        valor_novo: String(novoValor),
        usuario_id: user?.id ?? null,
        usuario_nome: fullName || user?.email || "—",
        usuario_email: user?.email ?? null,
        usuario_role: role ?? null,
      });

      toast.success(
        novoValor
          ? `${produto.nome} marcado como disponível`
          : `${produto.nome} marcado como indisponível`,
      );
    } catch {
      // Reverte em caso de erro
      setProdutos((prev) =>
        prev.map((p) => (p.id === produto.id ? { ...p, disponivel: !novoValor } : p)),
      );
      toast.error("Erro ao atualizar disponibilidade");
    } finally {
      setSalvandoId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-4 flex-wrap">
        <Badge
          variant={totalIndisponiveis > 0 ? "destructive" : "secondary"}
          className="text-sm px-3 py-1"
        >
          {totalIndisponiveis} indisponíve{totalIndisponiveis === 1 ? "l" : "is"} de {produtos.length} totais
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Produtos</CardTitle>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou código..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
              />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-between min-w-[180px]">
                  <span className="truncate">{labelMarcas}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[260px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar marca..." />
                  <CommandList>
                    <CommandEmpty>Nenhuma marca encontrada</CommandEmpty>
                    <CommandGroup>
                      {marcasDisponiveis.map((marca) => (
                        <CommandItem
                          key={marca}
                          value={marca}
                          onSelect={() => toggleMarca(marca)}
                          className="gap-2"
                        >
                          <Checkbox checked={marcasSelecionadas.includes(marca)} />
                          <span className="truncate">{marca}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                  {marcasSelecionadas.length > 0 && (
                    <div className="border-t p-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-center text-sm"
                        onClick={() => setMarcasSelecionadas([])}
                      >
                        Limpar
                      </Button>
                    </div>
                  )}
                </Command>
              </PopoverContent>
            </Popover>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <Switch checked={soIndisponiveis} onCheckedChange={setSoIndisponiveis} />
              Mostrar só indisponíveis
            </label>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : produtosFiltrados.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">
              Nenhum produto encontrado
            </p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead className="text-right w-32">Disponível</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {produtosFiltrados.map((p) => (
                    <TableRow key={p.id} className={!p.disponivel ? "bg-red-50/40" : ""}>
                      <TableCell className="font-mono text-sm">{p.codigo_jiva}</TableCell>
                      <TableCell className="text-sm font-medium">{p.nome}</TableCell>
                      <TableCell className="text-sm">
                        <Badge variant="outline">{p.marca}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-2">
                          {salvandoId === p.id && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          )}
                          <Switch
                            checked={p.disponivel}
                            disabled={salvandoId === p.id}
                            onCheckedChange={(v) => toggleDisponivel(p, v)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-sm text-muted-foreground mt-3">
            {produtosFiltrados.length} produto(s) exibido(s)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// Aba: Histórico
// ══════════════════════════════════════════════════════════════════

type EventoEstoque = {
  id: string;
  tipo: "disponibilidade" | "sem_estoque";
  descricao: string;
  detalhe: string | null;
  usuario_nome: string | null;
  usuario_role: AppRole | null;
  created_at: string;
};

function AbaHistorico() {
  const [filtroUsuario, setFiltroUsuario] = useState("todos");
  const [busca, setBusca] = useState("");

  const { data: eventos = [], isLoading } = useQuery<EventoEstoque[]>({
    queryKey: ["historico-estoque-faturamento"],
    queryFn: async () => {
      const [estoqueRes, semEstoqueRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("historico_estoque")
          .select("id, campo, valor_anterior, valor_novo, usuario_nome, usuario_role, created_at, produtos(nome, codigo_jiva)")
          .order("created_at", { ascending: false })
          .limit(300),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("historico_status")
          .select("id, observacao, usuario_id, usuario_nome, created_at, pedidos(numero_pedido, clientes(razao_social, nome_parceiro))")
          .eq("acao", "marcou_sem_estoque")
          .order("created_at", { ascending: false })
          .limit(300),
      ]);

      if (estoqueRes.error) toast.error("Erro ao carregar histórico de disponibilidade.");
      if (semEstoqueRes.error) toast.error("Erro ao carregar histórico de pedidos sem estoque.");

      // Resolve o papel (role) de quem marcou "sem estoque", já que essas linhas
      // vêm de historico_status e não têm usuario_role denormalizado.
      const usuarioIds = new Set<string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (semEstoqueRes.data ?? []).forEach((r: any) => { if (r.usuario_id) usuarioIds.add(r.usuario_id); });
      const roleMap: Record<string, AppRole> = {};
      if (usuarioIds.size > 0) {
        const { data: profs } = await supabase.from("profiles").select("id, role").in("id", Array.from(usuarioIds));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (profs ?? []).forEach((p: any) => { if (p.role) roleMap[p.id] = p.role as AppRole; });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doEstoque: EventoEstoque[] = (estoqueRes.data ?? []).map((r: any) => ({
        id: r.id,
        tipo: "disponibilidade",
        descricao: `${r.produtos?.nome ?? "Produto"} (${r.produtos?.codigo_jiva ?? "—"})`,
        detalhe: `${r.valor_anterior === "true" ? "Disponível" : "Indisponível"} → ${r.valor_novo === "true" ? "Disponível" : "Indisponível"}`,
        usuario_nome: r.usuario_nome,
        usuario_role: (r.usuario_role as AppRole) ?? null,
        created_at: r.created_at,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doSemEstoque: EventoEstoque[] = (semEstoqueRes.data ?? []).map((r: any) => ({
        id: r.id,
        tipo: "sem_estoque",
        descricao: r.pedidos?.numero_pedido ? `Pedido #${r.pedidos.numero_pedido}` : "Pedido",
        detalhe: [r.pedidos?.clientes?.nome_parceiro || r.pedidos?.clientes?.razao_social, r.observacao].filter(Boolean).join(" — ") || null,
        usuario_nome: r.usuario_nome,
        usuario_role: r.usuario_id ? (roleMap[r.usuario_id] ?? null) : null,
        created_at: r.created_at,
      }));

      return [...doEstoque, ...doSemEstoque].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    },
  });

  const usuarios = useMemo(() => [...new Set(eventos.map((e) => e.usuario_nome).filter(Boolean))].sort(), [eventos]);

  const filtrados = useMemo(() => {
    let res = eventos;
    if (filtroUsuario !== "todos") res = res.filter((e) => e.usuario_nome === filtroUsuario);
    if (busca.trim()) {
      const t = busca.toLowerCase();
      res = res.filter((e) =>
        e.descricao.toLowerCase().includes(t) ||
        (e.detalhe ?? "").toLowerCase().includes(t) ||
        (e.usuario_nome ?? "").toLowerCase().includes(t),
      );
    }
    return res;
  }, [eventos, filtroUsuario, busca]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {isLoading ? "Carregando..." : `${filtrados.length} de ${eventos.length} registros`}
        </CardTitle>
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por produto, pedido, cliente, usuário..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Select value={filtroUsuario} onValueChange={setFiltroUsuario}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Todos os usuários" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os usuários</SelectItem>
              {usuarios.map((u) => <SelectItem key={u!} value={u!}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : filtrados.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground text-sm">Nenhuma movimentação de estoque encontrada</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Quem</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>O quê</TableHead>
                  <TableHead>Detalhe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((e) => (
                  <TableRow key={`${e.tipo}-${e.id}`} className="text-sm">
                    <TableCell className="whitespace-nowrap text-muted-foreground font-mono text-xs">
                      {fmtDataHora(e.created_at)}
                    </TableCell>
                    <TableCell className="font-medium">{e.usuario_nome ?? "—"}</TableCell>
                    <TableCell>
                      {e.usuario_role ? (
                        <Badge variant="outline">{ROLE_LABEL[e.usuario_role] ?? e.usuario_role}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                        {e.tipo === "disponibilidade" ? "Disponibilidade" : "Marcou sem estoque"}
                      </span>
                      <div className="text-xs text-muted-foreground mt-0.5">{e.descricao}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-56 truncate">{e.detalhe ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════
// Página
// ══════════════════════════════════════════════════════════════════

export default function GestaoEstoque() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Boxes className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Gestão de Estoque</h1>
          <p className="text-sm text-muted-foreground">
            Controle de disponibilidade dos produtos e histórico de movimentações
          </p>
        </div>
      </div>

      <Tabs defaultValue="produtos">
        <TabsList>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="historico" className="gap-1.5"><History className="h-3.5 w-3.5" /> Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="produtos" className="mt-4">
          <AbaProdutos />
        </TabsContent>
        <TabsContent value="historico" className="mt-4">
          <AbaHistorico />
        </TabsContent>
      </Tabs>
    </div>
  );
}
