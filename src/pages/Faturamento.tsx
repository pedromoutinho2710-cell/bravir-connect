import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { PedidoDetalhesDialog } from "@/components/pedido/PedidoDetalhesDialog";
import { ImportarPedidoDialog } from "@/components/faturamento/ImportarPedidoDialog";
import { useNavigate } from "react-router-dom";

const PAGE_SIZE = 50;

type Aba = "todos" | "pendente" | "faturado" | "cancelado";

const STATUS_MAP: Record<Aba, string[] | null> = {
  todos: null,
  pendente: ["pendente", "em_faturamento"],
  faturado: ["faturado"],
  cancelado: ["cancelado"],
};

const ABA_LABELS: Record<Aba, string> = {
  todos: "Todos",
  pendente: "Pendentes",
  faturado: "Faturados",
  cancelado: "Cancelados",
};

export default function Faturamento() {
  const navigate = useNavigate();
  const [abaAtiva, setAbaAtiva] = useState<Aba>("todos");
  const [pagina, setPagina] = useState(0);
  const [pedidoSelecionado, setPedidoSelecionado] = useState<string | null>(null);

  function handleTrocarAba(aba: string) {
    setAbaAtiva(aba as Aba);
    setPagina(0);
  }

  const from = pagina * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["faturamento-pedidos", abaAtiva, pagina],
    queryFn: async () => {
      let query = supabase
        .from("pedidos")
        .select(
          `id, numero_pedido, status, valor_total, criado_em,
           cliente:clientes(razao_social, cnpj)`,
          { count: "exact" }
        )
        .order("criado_em", { ascending: false })
        .range(from, to);

      const statusFiltro = STATUS_MAP[abaAtiva];
      if (statusFiltro) {
        query = query.in("status", statusFiltro);
      }

      const { data: rows, error, count } = await query;
      if (error) throw error;
      return { rows: rows ?? [], total: count ?? 0 };
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.ceil(total / PAGE_SIZE);
  const temAnterior = pagina > 0;
  const temProxima = pagina < totalPaginas - 1;

  return (
    <AppLayout>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Faturamento</h1>
          <div className="flex gap-2">
            <ImportarPedidoDialog />
            <Button onClick={() => navigate("/faturamento/novo-pedido")}>
              Novo Pedido
            </Button>
          </div>
        </div>

        <Tabs value={abaAtiva} onValueChange={handleTrocarAba}>
          <TabsList>
            {(Object.keys(ABA_LABELS) as Aba[]).map((aba) => (
              <TabsTrigger key={aba} value={aba}>
                {ABA_LABELS[aba]}
              </TabsTrigger>
            ))}
          </TabsList>

          {(Object.keys(ABA_LABELS) as Aba[]).map((aba) => (
            <TabsContent key={aba} value={aba} className="mt-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nº Pedido</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>CNPJ</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Valor Total</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-12 text-center">
                          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : rows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-12 text-center text-muted-foreground"
                        >
                          Nenhum pedido encontrado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((pedido: any) => (
                        <TableRow
                          key={pedido.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setPedidoSelecionado(pedido.id)}
                        >
                          <TableCell className="font-mono">
                            {pedido.numero_pedido ?? "-"}
                          </TableCell>
                          <TableCell>
                            {pedido.cliente?.razao_social ?? "-"}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {pedido.cliente?.cnpj ?? "-"}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={pedido.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(pedido.valor_total)}
                          </TableCell>
                          <TableCell>
                            {formatDate(pedido.criado_em)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Controles de paginação */}
              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {total > 0
                    ? `${from + 1}–${Math.min(to + 1, total)} de ${total} pedidos`
                    : "0 pedidos"}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!temAnterior || isFetching}
                    onClick={() => setPagina((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <span className="px-2">
                    Página {totalPaginas === 0 ? 0 : pagina + 1} de{" "}
                    {totalPaginas}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!temProxima || isFetching}
                    onClick={() => setPagina((p) => p + 1)}
                  >
                    Próxima
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {pedidoSelecionado && (
        <PedidoDetalhesDialog
          pedidoId={pedidoSelecionado}
          open={!!pedidoSelecionado}
          onOpenChange={(open) => {
            if (!open) setPedidoSelecionado(null);
          }}
        />
      )}
    </AppLayout>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pendente: { label: "Pendente", variant: "secondary" },
    em_faturamento: { label: "Em Faturamento", variant: "default" },
    faturado: { label: "Faturado", variant: "default" },
    cancelado: { label: "Cancelado", variant: "destructive" },
  };
  const cfg = map[status] ?? { label: status, variant: "outline" };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
