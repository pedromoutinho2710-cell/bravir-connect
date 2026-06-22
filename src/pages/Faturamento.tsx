import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import { statusLabel, statusColor } from "@/lib/status";
import PedidoDetalhesDialog from "@/components/pedido/PedidoDetalhesDialog";
import ImportarPedidoDialog from "@/components/faturamento/ImportarPedidoDialog";
import { Search, RefreshCw, FileDown } from "lucide-react";

const PAGE_SIZE = 50;

type PeriodoFiltro = "30" | "60" | "90" | "180";

function getDataInicio(periodo: PeriodoFiltro): string {
  const d = new Date();
  d.setDate(d.getDate() - parseInt(periodo));
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function Faturamento() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [buscaInput, setBuscaInput] = useState("");
  const [periodo, setPeriodo] = useState<PeriodoFiltro>("90");
  const [pagina, setPagina] = useState(1);
  const [pedidoSelecionado, setPedidoSelecionado] = useState<string | null>(null);
  const [importarOpen, setImportarOpen] = useState(false);

  // Reseta página ao mudar filtros
  useEffect(() => {
    setPagina(1);
  }, [busca, periodo]);

  const dataInicio = getDataInicio(periodo);
  const offset = (pagina - 1) * PAGE_SIZE;

  // Query paginada server-side com filtro de data
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["faturamento-pedidos", periodo, busca, pagina],
    queryFn: async () => {
      let query = supabase
        .from("pedidos")
        .select(
          `id, created_at, numero_pedido, status, valor_total,
           cliente:clientes(id, razao_social, cnpj),
           vendedor:profiles!pedidos_vendedor_id_fkey(id, full_name)`,
          { count: "exact" }
        )
        .neq("status", "rascunho")
        .gte("created_at", dataInicio)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (busca.trim()) {
        // Filtra por número do pedido ou razão social (ilike no lado JS após fetch é inviável
        // com paginação server-side; usamos or com textSearch limitado)
        query = query.or(
          `numero_pedido.ilike.%${busca.trim()}%`
        );
      }

      const { data: rows, count, error } = await query;
      if (error) throw error;
      return { rows: rows ?? [], total: count ?? 0 };
    },
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });

  // Lazy-load do histórico: apenas para o pedido aberto no dialog
  const { data: historicoPedido } = useQuery({
    queryKey: ["historico-status", pedidoSelecionado],
    queryFn: async () => {
      if (!pedidoSelecionado) return [];
      const { data: hist, error } = await supabase
        .from("historico_status")
        .select("id, status, criado_em, usuario:profiles(full_name), observacao")
        .eq("pedido_id", pedidoSelecionado)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return hist ?? [];
    },
    enabled: !!pedidoSelecionado,
    staleTime: 30_000,
  });

  const pedidos = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleBuscaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBusca(buscaInput);
  };

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["faturamento-pedidos"] });
  }, [queryClient]);

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Faturamento</h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button size="sm" onClick={() => setImportarOpen(true)}>
              <FileDown className="h-4 w-4 mr-1" />
              Importar pedido
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3">
          <form onSubmit={handleBuscaSubmit} className="flex gap-2 flex-1">
            <Input
              placeholder="Buscar por número do pedido…"
              value={buscaInput}
              onChange={(e) => setBuscaInput(e.target.value)}
              className="max-w-sm"
            />
            <Button type="submit" variant="outline" size="icon">
              <Search className="h-4 w-4" />
            </Button>
          </form>

          <Select
            value={periodo}
            onValueChange={(v) => setPeriodo(v as PeriodoFiltro)}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="60">Últimos 60 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="180">Últimos 6 meses</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tabela */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº Pedido</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : pedidos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    Nenhum pedido encontrado para o período selecionado.
                  </TableCell>
                </TableRow>
              ) : (
                pedidos.map((pedido: any) => (
                  <TableRow
                    key={pedido.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setPedidoSelecionado(pedido.id)}
                  >
                    <TableCell className="font-mono text-sm">
                      {pedido.numero_pedido ?? "—"}
                    </TableCell>
                    <TableCell>{formatDate(pedido.created_at)}</TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {pedido.cliente?.razao_social ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {pedido.cliente?.cnpj ?? ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      {pedido.vendedor?.full_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColor(pedido.status)}>
                        {statusLabel(pedido.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(pedido.valor_total ?? 0)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Rodapé: total + paginação */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {total} pedido{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}
          </span>

          {totalPaginas > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                    aria-disabled={pagina === 1}
                    className={pagina === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
                <PaginationItem>
                  <span className="px-4 py-2 text-sm">
                    Página {pagina} de {totalPaginas}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                    aria-disabled={pagina === totalPaginas}
                    className={pagina === totalPaginas ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      </div>

      {/* Dialog de detalhes com histórico lazy-loaded */}
      {pedidoSelecionado && (
        <PedidoDetalhesDialog
          pedidoId={pedidoSelecionado}
          historico={historicoPedido ?? []}
          open={!!pedidoSelecionado}
          onOpenChange={(open) => {
            if (!open) setPedidoSelecionado(null);
          }}
        />
      )}

      <ImportarPedidoDialog
        open={importarOpen}
        onOpenChange={setImportarOpen}
        onSuccess={handleRefresh}
      />
    </AppLayout>
  );
}
