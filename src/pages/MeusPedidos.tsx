import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { formatBRL, formatDate } from "@/lib/format";
import { Loader2, PlusCircle, Clock } from "lucide-react";
import { MARCAS } from "@/lib/constants";
import { PedidoDetalhesDialog } from "@/components/pedido/PedidoDetalhesDialog";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

type MeuPedido = {
  id: string;
  numero_pedido: number;
  tipo: string;
  data_pedido: string;
  status: string;
  status_atualizado_em: string | null;
  cond_pagamento: string | null;
  motivo: string | null;
  razao_social: string;
  marcas: string[];
  total: number;
};

export const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_faturamento: "Aguardando faturamento",
  no_sankhya: "Cadastrado no Sankhya",
  faturado: "Faturado",
  parcialmente_faturado: "Parc. faturado",
  com_problema: "Com problema",
  devolvido: "Devolvido",
  cancelado: "Cancelado",
  em_faturamento: "Em faturamento",
  em_cadastro: "Em cadastro",
  pendente: "Pendente",
  em_rota: "Em rota",
  entregue: "Entregue",
  revisao_necessaria: "Revisão necessária",
};

export const STATUS_COLOR: Record<string, string> = {
  rascunho: "bg-gray-100 text-gray-600 border-gray-300",
  aguardando_faturamento: "bg-yellow-100 text-yellow-800 border-yellow-300",
  no_sankhya: "bg-blue-100 text-blue-800 border-blue-300",
  faturado: "bg-green-100 text-green-800 border-green-300",
  parcialmente_faturado: "bg-emerald-100 text-emerald-800 border-emerald-300",
  com_problema: "bg-red-100 text-red-800 border-red-300",
  devolvido: "bg-orange-100 text-orange-800 border-orange-300",
  cancelado: "bg-gray-800 text-gray-100 border-gray-700",
  em_faturamento: "bg-blue-100 text-blue-800 border-blue-300",
  em_cadastro: "bg-blue-100 text-blue-800 border-blue-300",
  pendente: "bg-orange-100 text-orange-800 border-orange-300",
  em_rota: "bg-gray-700 text-gray-100 border-gray-800",
  entregue: "bg-lime-100 text-lime-800 border-lime-300",
  revisao_necessaria: "bg-red-100 text-red-800 border-red-300",
};

const NOTIF: Record<string, (num: number, motivo?: string) => string> = {
  faturado:                (n) => `Pedido #${n} foi faturado!`,
  em_faturamento:          (n) => `Pedido #${n} está sendo processado pelo faturamento.`,
  devolvido:               (n, m) => `Pedido #${n} foi devolvido${m ? `: ${m}` : "."}`,
  cancelado:               (n, m) => `Pedido #${n} foi cancelado${m ? `: ${m}` : "."}`,
  pendente:                (n, m) => `Pedido #${n} está pendente${m ? `: ${m}` : "."}`,
  revisao_necessaria:      (n, m) => `Pedido #${n} precisa de revisão${m ? `: ${m}` : "."}`,
  entregue:                (n) => `Pedido #${n} foi entregue!`,
  em_rota:                 (n) => `Pedido #${n} está em rota de entrega.`,
};

function tempoNoStatus(dt: string | null) {
  if (!dt) return null;
  try {
    return formatDistanceToNow(new Date(dt), { addSuffix: true, locale: ptBR });
  } catch {
    return null;
  }
}

export default function MeusPedidos() {
  const { user } = useAuth();
  const [pedidos, setPedidos] = useState<MeuPedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroMarca, setFiltroMarca] = useState("todas");
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");

  const [detalhesId, setDetalhesId] = useState<string | null>(null);
  const [detalhesOpen, setDetalhesOpen] = useState(false);

  const carregar = () => setRefreshKey((k) => k + 1);
  usePullToRefresh(carregar);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = supabase
        .from("pedidos")
        .select(`
          id, numero_pedido, tipo, data_pedido, status, status_atualizado_em,
          cond_pagamento, motivo,
          clientes(razao_social),
          itens_pedido(total_item, produtos(marca))
        `)
        .eq("vendedor_id", user.id)
        .order("created_at", { ascending: false });

      if (filtroStatus !== "todos") query = query.eq("status", filtroStatus);
      if (filtroDataInicio) query = query.gte("data_pedido", filtroDataInicio);
      if (filtroDataFim) query = query.lte("data_pedido", filtroDataFim);

      const { data, error } = await query;
      if (error) { toast.error("Erro ao carregar pedidos"); return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let lista: MeuPedido[] = (data ?? []).map((p: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const itensList = (p.itens_pedido ?? []) as any[];
        const marcas = [...new Set(itensList.map((i) => i.produtos?.marca).filter(Boolean))] as string[];
        return {
          id: p.id,
          numero_pedido: p.numero_pedido,
          tipo: p.tipo,
          data_pedido: p.data_pedido,
          status: p.status,
          status_atualizado_em: p.status_atualizado_em ?? null,
          cond_pagamento: p.cond_pagamento,
          motivo: p.motivo,
          razao_social: p.clientes?.razao_social ?? "—",
          marcas,
          total: itensList.reduce((s: number, i) => s + Number(i.total_item), 0),
        };
      });

      // Filtros client-side
      if (filtroCliente.trim()) {
        const q = filtroCliente.trim().toLowerCase();
        lista = lista.filter((p) => p.razao_social.toLowerCase().includes(q));
      }
      if (filtroMarca !== "todas") {
        lista = lista.filter((p) => p.marcas.includes(filtroMarca));
      }

      setPedidos(lista);
    })().finally(() => setLoading(false));
  }, [user, filtroStatus, filtroDataInicio, filtroDataFim, filtroCliente, filtroMarca, refreshKey]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`meus-pedidos-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pedidos", filter: `vendedor_id=eq.${user.id}` },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const { numero_pedido, status, motivo } = payload.new;
          const msg = NOTIF[status]?.(numero_pedido, motivo) ?? `Pedido #${numero_pedido}: ${STATUS_LABEL[status] ?? status}`;
          const isPositivo = ["faturado", "entregue", "em_rota", "em_faturamento"].includes(status);
          const isNegativo = ["devolvido", "cancelado", "revisao_necessaria", "pendente"].includes(status);
          if (isPositivo) toast.success(msg, { duration: 8000 });
          else if (isNegativo) toast.warning(msg, { duration: 10000 });
          else toast.info(msg, { duration: 6000 });
          setRefreshKey((k) => k + 1);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const limparFiltros = () => {
    setFiltroStatus("todos");
    setFiltroCliente("");
    setFiltroMarca("todas");
    setFiltroDataInicio("");
    setFiltroDataFim("");
  };

  const temFiltro = filtroStatus !== "todos" || filtroCliente || filtroMarca !== "todas" || filtroDataInicio || filtroDataFim;

  const abrirDetalhes = (id: string) => {
    setDetalhesId(id);
    setDetalhesOpen(true);
  };

  function StatusBadge({ status }: { status: string }) {
    return (
      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[status] ?? "bg-gray-100 text-gray-800 border-gray-300"}`}>
        {STATUS_LABEL[status] ?? status}
      </span>
    );
  }

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Meus Pedidos</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe seus pedidos em tempo real — notificações automáticas ao mudar de status
          </p>
        </div>
        <Button asChild className="hidden sm:flex">
          <Link to="/novo-pedido">
            <PlusCircle className="mr-2 h-4 w-4" />
            Novo Pedido
          </Link>
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Buscar cliente…"
          value={filtroCliente}
          onChange={(e) => setFiltroCliente(e.target.value)}
          className="w-[180px]"
        />

        <Select value={filtroMarca} onValueChange={setFiltroMarca}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Marca" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as marcas</SelectItem>
            {MARCAS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={filtroDataInicio}
          onChange={(e) => setFiltroDataInicio(e.target.value)}
          className="w-[140px]"
          title="Data inicial"
        />
        <Input
          type="date"
          value={filtroDataFim}
          onChange={(e) => setFiltroDataFim(e.target.value)}
          className="w-[140px]"
          title="Data final"
        />

        {temFiltro && (
          <Button variant="ghost" size="sm" onClick={limparFiltros}>
            Limpar filtros
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="grid gap-3 md:hidden">
            {pedidos.length === 0 && (
              <p className="text-center text-muted-foreground py-12">Nenhum pedido encontrado</p>
            )}
            {pedidos.map((p) => (
              <Card key={p.id} className="cursor-pointer active:opacity-70" onClick={() => abrirDetalhes(p.id)}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono font-bold text-sm">#{p.numero_pedido}</span>
                      <div className="font-medium text-sm mt-0.5">{p.razao_social}</div>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatDate(p.data_pedido)} · {p.tipo}</span>
                    <span className="font-semibold text-foreground">{formatBRL(p.total)}</span>
                  </div>
                  {p.status_atualizado_em && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {tempoNoStatus(p.status_atualizado_em)}
                    </div>
                  )}
                  {p.motivo && (
                    <div className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">{p.motivo}</div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop: tabela */}
          <div className="hidden md:block rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>No status há</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pedidos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                      Nenhum pedido encontrado
                    </TableCell>
                  </TableRow>
                )}
                {pedidos.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => abrirDetalhes(p.id)}>
                    <TableCell className="font-mono font-semibold text-sm">#{p.numero_pedido}</TableCell>
                    <TableCell className="text-sm">{formatDate(p.data_pedido)}</TableCell>
                    <TableCell className="font-medium text-sm">{p.razao_social}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.tipo}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.cond_pagamento || "—"}</TableCell>
                    <TableCell className="text-right font-semibold text-sm">{formatBRL(p.total)}</TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} />
                      {p.motivo && (
                        <div className="text-xs text-muted-foreground mt-1 max-w-[200px] truncate" title={p.motivo}>
                          {p.motivo}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {tempoNoStatus(p.status_atualizado_em) ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* FAB mobile */}
      <Link
        to="/novo-pedido"
        className="fixed bottom-6 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg md:hidden"
      >
        <PlusCircle className="h-6 w-6" />
      </Link>

      <PedidoDetalhesDialog
        pedidoId={detalhesId}
        open={detalhesOpen}
        onOpenChange={setDetalhesOpen}
      />
    </div>
  );
}
