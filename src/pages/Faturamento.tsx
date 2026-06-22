import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { PedidoDetalhesDialog } from "@/components/pedido/PedidoDetalhesDialog";
import { ImportarPedidoDialog } from "@/components/faturamento/ImportarPedidoDialog";
import { useAuth } from "@/hooks/useAuth";
import { STATUS_LABELS, STATUS_CORES } from "@/lib/status";
import { Search, RefreshCw, Upload, Eye } from "lucide-react";

const PAGE_SIZE = 20;

// Status relevantes para faturamento (exclui rascunho)
const STATUS_FATURAMENTO = [
  "aguardando_faturamento",
  "em_faturamento",
  "faturado",
  "cancelado",
  "pendente",
  "aprovado",
];

type Pedido = {
  id: string;
  numero?: number;
  cliente_id: string;
  clientes?: { razao_social: string; cnpj?: string };
  status: string;
  valor_total?: number;
  created_at: string;
  updated_at?: string;
  responsavel_id?: string;
  profiles?: { nome: string };
  observacoes?: string;
};

export default function Faturamento() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(0);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [pedidoSelecionado, setPedidoSelecionado] = useState<string | null>(null);
  const [importarOpen, setImportarOpen] = useState(false);

  // Query principal — chave estável, sem refreshKey
  const queryKey = ["faturamento-pedidos", page, busca, statusFiltro];

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      let query = supabase
        .from("pedidos")
        .select(
          `id, numero, cliente_id, status, valor_total, created_at, updated_at, responsavel_id, observacoes,
           clientes(razao_social, cnpj),
           profiles:responsavel_id(nome)`,
          { count: "exact" }
        )
        .neq("status", "rascunho")
        .order("updated_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (statusFiltro !== "todos") {
        query = query.eq("status", statusFiltro);
      }

      if (busca.trim()) {
        query = query.ilike("clientes.razao_social", `%${busca.trim()}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { pedidos: (data as Pedido[]) ?? [], total: count ?? 0 };
    },
    staleTime: 30_000,
  });

  const { data: historicoData } = useQuery({
    queryKey: ["faturamento-historico", page],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select(
          `id, numero, cliente_id, status, valor_total, created_at, updated_at,
           clientes(razao_social)`,
        )
        .eq("status", "faturado")
        .order("updated_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return (data as Pedido[]) ?? [];
    },
    staleTime: 60_000,
  });

  // ─── Realtime: invalidação SELETIVA ────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("faturamento-realtime")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pedidos",
          // Filtra no servidor: ignora pedidos que permanecem como rascunho
          filter: "status=neq.rascunho",
        },
        (payload) => {
          const novo = payload.new as { id?: string; status?: string };

          // Segurança extra no cliente: descarta status irrelevantes
          if (!novo?.id) return;
          if (novo.status === "rascunho") return;

          // Invalida apenas a entrada específica do pedido afetado
          queryClient.invalidateQueries({
            queryKey: ["faturamento-pedidos"],
            // Não força refetch imediato — aguarda o componente tornar-se ativo
            refetchType: "active",
          });

          // Invalida também o detalhe do pedido individual se estiver em cache
          queryClient.invalidateQueries({
            queryKey: ["pedido", novo.id],
            refetchType: "active",
          });

          // Atualiza o histórico apenas quando o pedido passa a 'faturado'
          if (novo.status === "faturado") {
            queryClient.invalidateQueries({
              queryKey: ["faturamento-historico"],
              refetchType: "active",
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
  // ──────────────────────────────────────────────────────────────────────────

  const pedidos = data?.pedidos ?? [];
  const total = data?.total ?? 0;
  const historico = historicoData ?? [];
  const totalPaginas = Math.ceil(total / PAGE_SIZE);

  const handleBusca = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setBusca(e.target.value);
    setPage(0);
  }, []);

  const handleStatusFiltro = useCallback((value: string) => {
    setStatusFiltro(value);
    setPage(0);
  }, []);

  return (
    <AppLayout>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Faturamento</h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            {profile?.role === "faturamento" && (
              <Button size="sm" onClick={() => setImportarOpen(true)}>
                <Upload className="h-4 w-4 mr-1" />
                Importar Pedido
              </Button>
            )}
          </div>
        </div>

        <Tabs defaultValue="pedidos">
          <TabsList>
            <TabsTrigger value="pedidos">Pedidos em Aberto</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="pedidos" className="space-y-4">
            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por cliente..."
                  value={busca}
                  onChange={handleBusca}
                  className="pl-9"
                />
              </div>
              <Select value={statusFiltro} onValueChange={handleStatusFiltro}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  {STATUS_FATURAMENTO.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s] ?? s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tabela */}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N°</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Atualizado em</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Carregando...
                        </TableCell>
                      </TableRow>
                    ) : pedidos.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Nenhum pedido encontrado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pedidos.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-sm">
                            #{p.numero ?? "—"}
                          </TableCell>
                          <TableCell>
                            {p.clientes?.razao_social ?? p.cliente_id}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={STATUS_CORES[p.status] ?? ""}
                            >
                              {STATUS_LABELS[p.status] ?? p.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {p.valor_total != null
                              ? formatCurrency(p.valor_total)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {p.updated_at
                              ? new Date(p.updated_at).toLocaleDateString("pt-BR")
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPedidoSelecionado(p.id)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Paginação */}
            {totalPaginas > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {total} pedido{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm self-center">
                    Página {page + 1} de {totalPaginas}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPaginas - 1, p + 1))}
                    disabled={page >= totalPaginas - 1}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="historico" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Histórico de Faturamento</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N°</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Faturado em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historico.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          Nenhum registro encontrado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      historico.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-sm">
                            #{p.numero ?? "—"}
                          </TableCell>
                          <TableCell>
                            {p.clientes?.razao_social ?? p.cliente_id}
                          </TableCell>
                          <TableCell>
                            {p.valor_total != null
                              ? formatCurrency(p.valor_total)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {p.updated_at
                              ? new Date(p.updated_at).toLocaleDateString("pt-BR")
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Modais */}
      {pedidoSelecionado && (
        <PedidoDetalhesDialog
          pedidoId={pedidoSelecionado}
          open={!!pedidoSelecionado}
          onClose={() => setPedidoSelecionado(null)}
        />
      )}

      <ImportarPedidoDialog
        open={importarOpen}
        onClose={() => setImportarOpen(false)}
      />
    </AppLayout>
  );
}
