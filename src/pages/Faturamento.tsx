import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import { getStatusLabel, getStatusColor } from "@/lib/status";
import PedidoDetalhesDialog from "@/components/pedido/PedidoDetalhesDialog";
import ImportarPedidoDialog from "@/components/faturamento/ImportarPedidoDialog";
import { Search, RefreshCw } from "lucide-react";

const PAGE_SIZE = 100;
const HISTORICO_LIMIT = 5000;
const HISTORICO_DIAS = 90;

export default function Faturamento() {
  const [search, setSearch] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [pedidoSelecionado, setPedidoSelecionado] = useState<string | null>(null);
  const [pagina, setPagina] = useState(0);

  // Query principal de pedidos com paginação
  const {
    data: pedidosData,
    isLoading: loadingPedidos,
    refetch: refetchPedidos,
  } = useQuery({
    queryKey: ["faturamento-pedidos", statusFiltro, search, pagina],
    queryFn: async () => {
      let query = supabase
        .from("pedidos")
        .select(
          `id, numero_pedido, cliente_id, status, valor_total, created_at, updated_at,
           clientes(id, nome_loja, nome_responsavel)`,
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .range(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE - 1);

      if (statusFiltro !== "todos") {
        query = query.eq("status", statusFiltro);
      }

      if (search.trim()) {
        query = query.ilike("numero_pedido", `%${search.trim()}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { pedidos: data ?? [], total: count ?? 0 };
    },
    staleTime: 30_000,
  });

  const pedidos = pedidosData?.pedidos ?? [];
  const totalPedidos = pedidosData?.total ?? 0;
  const pedidoIds = useMemo(() => pedidos.map((p: any) => p.id), [pedidos]);

  // Query única de histórico de status — sem N+1
  // Filtra apenas pelos IDs da página atual, com limite de data (últimos HISTORICO_DIAS dias)
  // e limite de registros absoluto para evitar payloads gigantes.
  const { data: historicoData } = useQuery({
    queryKey: ["faturamento-historico", pedidoIds],
    queryFn: async () => {
      if (pedidoIds.length === 0) return {};

      const dataCorte = new Date();
      dataCorte.setDate(dataCorte.getDate() - HISTORICO_DIAS);

      const { data, error } = await supabase
        .from("historico_status")
        .select("id, pedido_id, status, observacao, created_at, usuario_id")
        .in("pedido_id", pedidoIds)
        .gte("created_at", dataCorte.toISOString())
        .order("created_at", { ascending: false })
        .limit(HISTORICO_LIMIT);

      if (error) throw error;

      // Indexa por pedido_id para lookup O(1) no render
      const porPedido: Record<string, any[]> = {};
      for (const h of data ?? []) {
        if (!porPedido[h.pedido_id]) porPedido[h.pedido_id] = [];
        porPedido[h.pedido_id].push(h);
      }
      return porPedido;
    },
    enabled: pedidoIds.length > 0,
    staleTime: 30_000,
  });

  const historicoPorPedido: Record<string, any[]> = historicoData ?? {};

  const totalPaginas = Math.ceil(totalPedidos / PAGE_SIZE);

  return (
    <AppLayout>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Faturamento</h1>
          <div className="flex gap-2">
            <ImportarPedidoDialog onImportado={() => refetchPedidos()} />
            <Button variant="outline" size="icon" onClick={() => refetchPedidos()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por número do pedido…"
              className="pl-8"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPagina(0); }}
            />
          </div>
          <Select
            value={statusFiltro}
            onValueChange={(v) => { setStatusFiltro(v); setPagina(0); }}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="rascunho">Rascunho</SelectItem>
              <SelectItem value="aguardando_aprovacao">Aguardando aprovação</SelectItem>
              <SelectItem value="aprovado">Aprovado</SelectItem>
              <SelectItem value="em_faturamento">Em faturamento</SelectItem>
              <SelectItem value="faturado">Faturado</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tabela */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">
              {loadingPedidos ? "Carregando…" : `${totalPedidos} pedido(s)`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead>Último histórico</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingPedidos
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : pedidos.map((pedido: any) => {
                      const historico = historicoPorPedido[pedido.id] ?? [];
                      const ultimoHistorico = historico[0];
                      return (
                        <TableRow
                          key={pedido.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setPedidoSelecionado(pedido.id)}
                        >
                          <TableCell className="font-mono text-sm">
                            {pedido.numero_pedido ?? pedido.id.slice(0, 8)}
                          </TableCell>
                          <TableCell>
                            {pedido.clientes?.nome_loja ||
                              pedido.clientes?.nome_responsavel ||
                              "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={getStatusColor(pedido.status)}
                            >
                              {getStatusLabel(pedido.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(pedido.valor_total ?? 0)}
                          </TableCell>
                          <TableCell>{formatDate(pedido.created_at)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {ultimoHistorico
                              ? `${getStatusLabel(ultimoHistorico.status)} — ${formatDate(ultimoHistorico.created_at)}`
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPedidoSelecionado(pedido.id);
                              }}
                            >
                              Ver
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Paginação */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Página {pagina + 1} de {totalPaginas}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagina === 0}
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagina >= totalPaginas - 1}
                onClick={() => setPagina((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>

      {pedidoSelecionado && (
        <PedidoDetalhesDialog
          pedidoId={pedidoSelecionado}
          open={!!pedidoSelecionado}
          onOpenChange={(open) => { if (!open) setPedidoSelecionado(null); }}
        />
      )}
    </AppLayout>
  );
}
