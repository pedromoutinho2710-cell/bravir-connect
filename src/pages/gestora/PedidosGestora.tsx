import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { formatBRL, formatDate } from "@/lib/format";
import { Loader2, PlusCircle } from "lucide-react";
import { PedidoDetalhesDialog } from "@/components/pedido/PedidoDetalhesDialog";
import { STATUS_LABEL, STATUS_COLOR } from "@/pages/vendedor/MeusPedidos";

type Pedido = {
  id: string;
  numero_pedido: number;
  tipo: string;
  data_pedido: string;
  status: string;
  razao_social: string;
  vendedor_id: string | null;
  total: number;
};

export default function PedidosGestora() {
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});

  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroCliente, setFiltroCliente] = useState("");

  const [detalhesId, setDetalhesId] = useState<string | null>(null);
  const [detalhesOpen, setDetalhesOpen] = useState(false);

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

  useEffect(() => {
    setLoading(true);
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = supabase
        .from("pedidos")
        .select("id, numero_pedido, tipo, data_pedido, status, vendedor_id, clientes(razao_social), itens_pedido(total_item)")
        .order("created_at", { ascending: false });

      if (filtroStatus !== "todos") query = query.eq("status", filtroStatus);

      const { data, error } = await query;
      if (error) { toast.error("Erro ao carregar pedidos"); setLoading(false); return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let lista: Pedido[] = (data ?? []).map((p: any) => ({
        id: p.id,
        numero_pedido: p.numero_pedido,
        tipo: p.tipo,
        data_pedido: p.data_pedido,
        status: p.status,
        razao_social: p.clientes?.razao_social ?? "—",
        vendedor_id: p.vendedor_id ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        total: (p.itens_pedido ?? []).reduce((s: number, i: any) => s + Number(i.total_item), 0),
      }));

      if (filtroCliente.trim()) {
        const q = filtroCliente.trim().toLowerCase();
        lista = lista.filter((p) => p.razao_social.toLowerCase().includes(q));
      }

      setPedidos(lista);
    })().finally(() => setLoading(false));
  }, [filtroStatus, filtroCliente]);

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
      <div className="flex flex-wrap gap-3">
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

        <span className="self-center text-sm text-muted-foreground">
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
