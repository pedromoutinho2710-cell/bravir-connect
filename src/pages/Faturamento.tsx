import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatarMoeda, formatarData } from "@/lib/format";
import { statusLabel, statusColor } from "@/lib/status";
import { useNavigate } from "react-router-dom";
import { PedidoDetalhesDialog } from "@/components/pedido/PedidoDetalhesDialog";
import { ImportarPedidoDialog } from "@/components/faturamento/ImportarPedidoDialog";
import { Search, RefreshCw, Plus, Upload } from "lucide-react";

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: "todos", label: "Todos os status" },
  { value: "aguardando_faturamento", label: "Aguardando Faturamento" },
  { value: "em_faturamento", label: "Em Faturamento" },
  { value: "faturado", label: "Faturado" },
  { value: "cancelado", label: "Cancelado" },
];

export default function Faturamento() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [pagina, setPagina] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pedidoSelecionado, setPedidoSelecionado] = useState<string | null>(null);
  const [importarAberto, setImportarAberto] = useState(false);

  // Ref para debounce do realtime — evita tempestade de recarregamentos
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerRefreshDebounced = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setRefreshKey((k) => k + 1);
    }, 800);
  }, []);

  const queryKey = ["faturamento-pedidos", refreshKey, pagina, busca, statusFiltro];

  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: async () => {
      let query = supabase
        .from("pedidos")
        .select(
          `id, numero, created_at, updated_at, status, valor_total, desconto_percentual,
           cliente:clientes(id, razao_social, cnpj),
           vendedor:profiles!pedidos_vendedor_id_fkey(id, full_name)`,
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .range((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE - 1);

      if (statusFiltro !== "todos") {
        query = query.eq("status", statusFiltro);
      }

      if (busca.trim()) {
        query = query.or(
          `numero.ilike.%${busca.trim()}%,clientes.razao_social.ilike.%${busca.trim()}%`
        );
      }

      const { data: rows, error, count } = await query;
      if (error) throw error;
      return { rows: rows ?? [], total: count ?? 0 };
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  // Realtime: atualiza apenas o pedido afetado para UPDATE;
  // usa debounce para INSERT/DELETE evitando tempestade de recarregamentos.
  useEffect(() => {
    const channel = supabase
      .channel("faturamento-pedidos-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos" },
        (payload) => {
          if (payload.eventType === "UPDATE" && payload.new) {
            const updated = payload.new as Record<string, unknown>;
            // Atualiza o pedido afetado em TODOS os caches dessa query sem recarregar tudo
            queryClient.setQueriesData<{ rows: unknown[]; total: number }>(
              { queryKey: ["faturamento-pedidos"], exact: false },
              (old) => {
                if (!old) return old;
                return {
                  ...old,
                  rows: old.rows.map((row) => {
                    const r = row as Record<string, unknown>;
                    if (r.id === updated.id) {
                      return { ...r, ...updated };
                    }
                    return row;
                  }),
                };
              }
            );
          } else {
            // INSERT ou DELETE: debounce para não recarregar a cada evento
            triggerRefreshDebounced();
          }
        }
      )
      .subscribe();

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [queryClient, triggerRefreshDebounced]);

  const pedidos = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.ceil(total / PAGE_SIZE);

  return (
    <AppLayout>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        {/* Cabeçalho */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Faturamento</h1>
            <p className="text-muted-foreground text-sm">
              Gerencie os pedidos em processo de faturamento
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportarAberto(true)}
            >
              <Upload className="mr-1 h-4 w-4" />
              Importar
            </Button>
            <Button
              size="sm"
              onClick={() => navigate("/faturamento/novo-pedido")}
            >
              <Plus className="mr-1 h-4 w-4" />
              Novo Pedido
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-col gap-2 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por número ou cliente…"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(1);
              }}
              className="pl-8"
            />
          </div>
          <Select
            value={statusFiltro}
            onValueChange={(v) => {
              setStatusFiltro(v);
              setPagina(1);
            }}
          >
            <SelectTrigger className="w-full md:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={isFetching}
            title="Atualizar"
          >
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
          </Button>
        </div>

        {/* Tabela */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    Carregando…
                  </TableCell>
                </TableRow>
              ) : pedidos.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-8 text-muted-foreground"
                  >
                    Nenhum pedido encontrado
                  </TableCell>
                </TableRow>
              ) : (
                pedidos.map((p: any) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setPedidoSelecionado(p.id)}
                  >
                    <TableCell className="font-mono text-sm">
                      {p.numero ?? "-"}
                    </TableCell>
                    <TableCell>
                      {p.cliente?.razao_social ?? "-"}
                    </TableCell>
                    <TableCell>
                      {p.vendedor?.full_name ?? "-"}
                    </TableCell>
                    <TableCell>
                      {formatarData(p.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusColor(p.status)}
                      >
                        {statusLabel(p.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatarMoeda(p.valor_total ?? 0)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Paginação */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {total} pedido{total !== 1 ? "s" : ""}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => p - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagina >= totalPaginas}
                onClick={() => setPagina((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      {pedidoSelecionado && (
        <PedidoDetalhesDialog
          pedidoId={pedidoSelecionado}
          open={!!pedidoSelecionado}
          onClose={() => setPedidoSelecionado(null)}
        />
      )}

      <ImportarPedidoDialog
        open={importarAberto}
        onClose={() => setImportarAberto(false)}
        onSuccess={() => {
          setImportarAberto(false);
          setRefreshKey((k) => k + 1);
        }}
      />
    </AppLayout>
  );
}
