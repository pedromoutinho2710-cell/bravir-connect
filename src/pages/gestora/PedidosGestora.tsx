import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { formatBRL, formatDate } from "@/lib/format";
import { Loader2, PlusCircle, Clock, FileDown } from "lucide-react";
import { PedidoDetalhesDialog } from "@/components/pedido/PedidoDetalhesDialog";
import { STATUS_LABEL, STATUS_COLOR } from "@/lib/status";
import { MARCAS } from "@/lib/constants";
import { exportarPedidoExcel } from "@/lib/excel";
import type { PedidoParaExcel } from "@/lib/excel";

type Pedido = {
  id: string;
  numero_pedido: number;
  tipo: string;
  data_pedido: string;
  status: string;
  status_atualizado_em: string | null;
  cond_pagamento: string | null;
  razao_social: string;
  vendedor_id: string | null;
  total: number;
  marcas: string[];
};

function tempoNoStatus(dt: string | null) {
  if (!dt) return null;
  try {
    return formatDistanceToNow(new Date(dt), { addSuffix: true, locale: ptBR });
  } catch {
    return null;
  }
}

export default function PedidosGestora() {
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroMarca, setFiltroMarca] = useState("todas");

  const [detalhesId, setDetalhesId] = useState<string | null>(null);
  const [detalhesOpen, setDetalhesOpen] = useState(false);
  const [exportandoId, setExportandoId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const profRes = await supabase.from("profiles").select("id, full_name, email");
      if (profRes.data) {
        const map: Record<string, string> = {};
        profRes.data.forEach((p) => { map[p.id] = p.full_name || p.email || "—"; });
        setProfilesMap(map);
      }
    })();
  }, []);

  const carregarPedidos = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = supabase
        .from("pedidos")
        .select("id, numero_pedido, tipo, data_pedido, status, status_atualizado_em, cond_pagamento, vendedor_id, clientes(razao_social), itens_pedido(total_item, produtos(marca))")
        .order("created_at", { ascending: false });

      if (filtroStatus !== "todos") query = query.eq("status", filtroStatus);

      const { data, error } = await query;
      if (error) { toast.error("Erro ao carregar pedidos"); return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let lista: Pedido[] = (data ?? []).map((p: any) => {
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
          cond_pagamento: p.cond_pagamento ?? null,
          razao_social: p.clientes?.razao_social ?? "—",
          vendedor_id: p.vendedor_id ?? null,
          total: itensList.reduce((s: number, i) => s + Number(i.total_item), 0),
          marcas,
        };
      });

      if (filtroCliente.trim()) {
        const q = filtroCliente.trim().toLowerCase();
        lista = lista.filter((p) => p.razao_social.toLowerCase().includes(q));
      }
      if (filtroMarca !== "todas") {
        lista = lista.filter((p) => p.marcas.includes(filtroMarca));
      }

      setPedidos(lista);
    } finally {
      setLoading(false);
    }
  }, [filtroStatus, filtroCliente, filtroMarca]);

  useEffect(() => {
    carregarPedidos();
  }, [carregarPedidos, refreshKey]);

  useEffect(() => {
    const channel = supabase
      .channel("gestora-pedidos-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos" },
        () => { setRefreshKey((k) => k + 1); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const exportarPedido = async (e: React.MouseEvent, pedidoId: string) => {
    e.stopPropagation();
    setExportandoId(pedidoId);
    try {
      const { data, error } = await supabase
        .from("pedidos")
        .select(`
          numero_pedido, data_pedido, agendamento, observacoes, cond_pagamento,
          perfil_cliente, tabela_preco, vendedor_id,
          clientes(razao_social, cnpj, comprador, cidade, uf, cep),
          itens_pedido(
            quantidade, total_item, preco_unitario_bruto, desconto_comercial, desconto_trade,
            preco_apos_perfil, preco_apos_comercial, preco_final,
            produtos(codigo_jiva, cx_embarque, nome, peso_unitario)
          )
        `)
        .eq("id", pedidoId)
        .single();

      if (error || !data) { toast.error("Erro ao exportar pedido"); return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any;
      const pedidoExcel: PedidoParaExcel = {
        numero_pedido: d.numero_pedido,
        data_pedido: d.data_pedido,
        cliente: {
          razao_social: d.clientes?.razao_social ?? "—",
          cnpj: d.clientes?.cnpj ?? "—",
          comprador: d.clientes?.comprador ?? "—",
          cidade: d.clientes?.cidade ?? "—",
          uf: d.clientes?.uf ?? "—",
          cep: d.clientes?.cep ?? "—",
        },
        vendedor: profilesMap[d.vendedor_id] ?? "—",
        perfil: d.perfil_cliente ?? "—",
        tabela_preco: d.tabela_preco ?? "—",
        cond_pagamento: d.cond_pagamento ?? "—",
        agendamento: d.agendamento ?? false,
        observacoes: d.observacoes ?? "",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        itens: (d.itens_pedido ?? []).map((item: any) => ({
          codigo_jiva: item.produtos?.codigo_jiva ?? "—",
          cx_embarque: item.produtos?.cx_embarque ?? 1,
          quantidade: item.quantidade,
          nome: item.produtos?.nome ?? "—",
          preco_bruto: item.preco_unitario_bruto,
          desconto_perfil: 0,
          desconto_comercial: item.desconto_comercial ?? 0,
          desconto_trade: item.desconto_trade ?? 0,
          preco_apos_perfil: item.preco_apos_perfil ?? item.preco_unitario_bruto,
          preco_apos_comercial: item.preco_apos_comercial ?? item.preco_unitario_bruto,
          preco_final: item.preco_final ?? item.preco_unitario_bruto,
          total: item.total_item,
          peso_unitario: item.produtos?.peso_unitario ?? 0,
          total_peso: item.quantidade * (item.produtos?.peso_unitario ?? 0),
          qtd_volumes: item.produtos?.cx_embarque
            ? Math.ceil(item.quantidade / item.produtos.cx_embarque)
            : 0,
        })),
      };

      await exportarPedidoExcel(pedidoExcel);
    } finally {
      setExportandoId(null);
    }
  };

  const temFiltro = filtroStatus !== "todos" || filtroCliente || filtroMarca !== "todas";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pedidos</h1>
          <p className="text-sm text-muted-foreground">Todos os pedidos do sistema</p>
        </div>
        <Button onClick={() => navigate("/gestora/novo-pedido")}>
          <PlusCircle className="h-4 w-4 mr-2" />
          Novo Pedido
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-52">
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
          placeholder="Buscar cliente..."
          value={filtroCliente}
          onChange={(e) => setFiltroCliente(e.target.value)}
          className="w-52"
        />

        <Select value={filtroMarca} onValueChange={setFiltroMarca}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Marca" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as marcas</SelectItem>
            {MARCAS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>

        {temFiltro && (
          <Button variant="ghost" size="sm" onClick={() => { setFiltroStatus("todos"); setFiltroCliente(""); setFiltroMarca("todas"); }}>
            Limpar filtros
          </Button>
        )}

        <span className="self-center text-sm text-muted-foreground ml-auto">
          {pedidos.length} pedido{pedidos.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : pedidos.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Nenhum pedido encontrado
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">#</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Representante</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>No status há</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pedidos.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => { setDetalhesId(p.id); setDetalhesOpen(true); }}
                >
                  <TableCell className="font-mono font-semibold text-sm">#{p.numero_pedido}</TableCell>
                  <TableCell className="text-sm">{formatDate(p.data_pedido)}</TableCell>
                  <TableCell className="font-medium">{p.razao_social}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.vendedor_id ? (profilesMap[p.vendedor_id] ?? "—") : "—"}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-sm">{formatBRL(p.total)}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[p.status] ?? "bg-gray-100 text-gray-600 border-gray-300"}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.status_atualizado_em ? (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 flex-shrink-0" />
                        {tempoNoStatus(p.status_atualizado_em) ?? "—"}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      title="Exportar Excel"
                      onClick={(e) => exportarPedido(e, p.id)}
                      disabled={exportandoId === p.id}
                      className="p-1 rounded text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                    >
                      {exportandoId === p.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <FileDown className="h-3.5 w-3.5" />}
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PedidoDetalhesDialog
        pedidoId={detalhesId}
        open={detalhesOpen}
        onOpenChange={setDetalhesOpen}
      />
    </div>
  );
}
