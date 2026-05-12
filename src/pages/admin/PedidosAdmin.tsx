import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { formatBRL, formatDate } from "@/lib/format";
import { Loader2, Eye } from "lucide-react";
import { MARCAS } from "@/lib/constants";
import { PedidoDetalhesDialog } from "@/components/pedido/PedidoDetalhesDialog";

const STATUS_LABEL: Record<string, string> = {
  pendente_sankhya: "Pendente Sankhya",
  em_faturamento: "Em faturamento",
  faturado: "Faturado",
  parcialmente_faturado: "Parc. faturado",
  devolvido: "Devolvido",
  cancelado: "Cancelado",
  rascunho: "Rascunho",
};

const STATUS_COLOR: Record<string, string> = {
  pendente_sankhya: "bg-yellow-100 text-yellow-800 border-yellow-300",
  em_faturamento: "bg-blue-100 text-blue-800 border-blue-300",
  faturado: "bg-green-100 text-green-800 border-green-300",
  parcialmente_faturado: "bg-teal-100 text-teal-800 border-teal-300",
  devolvido: "bg-orange-100 text-orange-800 border-orange-300",
  cancelado: "bg-red-100 text-red-800 border-red-300",
  rascunho: "bg-gray-100 text-gray-600 border-gray-300",
};

type Pedido = {
  id: string;
  numero_pedido: number;
  tipo: string;
  data_pedido: string;
  status: string;
  vendedor_id: string;
  razao_social: string;
  total: number;
  marcas: string[];
};

export default function PedidosAdmin() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [vendedores, setVendedores] = useState<{ id: string; label: string }[]>([]);

  const [filtroVendedor, setFiltroVendedor] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");
  const [filtroMarca, setFiltroMarca] = useState("todas");

  const [detalhesId, setDetalhesId] = useState<string | null>(null);
  const [detalhesOpen, setDetalhesOpen] = useState(false);

  useEffect(() => {
    supabase.from("profiles").select("id, email, full_name").then(({ data }) => {
      if (!data) return;
      const map: Record<string, string> = {};
      data.forEach((p) => { map[p.id] = p.full_name || p.email; });
      setProfiles(map);
      setVendedores(data.map((p) => ({ id: p.id, label: p.full_name || p.email })));
    });
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from("pedidos")
      .select(`
        id, numero_pedido, tipo, data_pedido, status, vendedor_id,
        clientes(razao_social),
        itens_pedido(total_item, produtos(marca))
      `)
      .order("created_at", { ascending: false });

    if (filtroVendedor !== "todos") query = query.eq("vendedor_id", filtroVendedor);
    if (filtroStatus !== "todos") query = query.eq("status", filtroStatus);
    if (filtroDataInicio) query = query.gte("data_pedido", filtroDataInicio);
    if (filtroDataFim) query = query.lte("data_pedido", filtroDataFim);

    const { data, error } = await query;
    if (error) { toast.error("Erro ao carregar pedidos"); setLoading(false); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mapped: Pedido[] = (data ?? []).map((p: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itens = (p.itens_pedido ?? []) as any[];
      const marcas = [...new Set(itens.map((i) => i.produtos?.marca).filter(Boolean))] as string[];
      const total = itens.reduce((s: number, i) => s + Number(i.total_item), 0);
      return {
        id: p.id,
        numero_pedido: p.numero_pedido,
        tipo: p.tipo,
        data_pedido: p.data_pedido,
        status: p.status,
        vendedor_id: p.vendedor_id,
        razao_social: p.clientes?.razao_social ?? "—",
        total,
        marcas,
      };
    });

    if (filtroMarca !== "todas") {
      mapped = mapped.filter((p) => p.marcas.includes(filtroMarca));
    }

    setPedidos(mapped);
    setLoading(false);
  }, [filtroVendedor, filtroStatus, filtroDataInicio, filtroDataFim, filtroMarca]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pedidos</h1>
        <p className="text-sm text-muted-foreground">Todos os pedidos da equipe de vendas</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
          <SelectTrigger><SelectValue placeholder="Vendedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os vendedores</SelectItem>
            {vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>

        <Input type="date" value={filtroDataInicio} onChange={(e) => setFiltroDataInicio(e.target.value)} title="De" />
        <Input type="date" value={filtroDataFim} onChange={(e) => setFiltroDataFim(e.target.value)} title="Até" />

        <Select value={filtroMarca} onValueChange={setFiltroMarca}>
          <SelectTrigger><SelectValue placeholder="Marca" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as marcas</SelectItem>
            {MARCAS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Mobile */}
          <div className="grid gap-3 md:hidden">
            {pedidos.length === 0 && (
              <p className="text-center text-muted-foreground py-12">Nenhum pedido encontrado</p>
            )}
            {pedidos.map((p) => (
              <Card key={p.id} className="cursor-pointer active:opacity-70"
                onClick={() => { setDetalhesId(p.id); setDetalhesOpen(true); }}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm">#{p.numero_pedido}</span>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[p.status] ?? ""}`}>
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </div>
                      <div className="font-medium text-sm mt-0.5">{p.razao_social}</div>
                      <div className="text-xs text-muted-foreground">{profiles[p.vendedor_id] ?? "—"}</div>
                    </div>
                    <div className="text-right text-sm font-semibold">{formatBRL(p.total)}</div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {p.marcas.map((m) => <Badge key={m} variant="outline" className="text-xs">{m}</Badge>)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop */}
          <div className="hidden md:block rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">#</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Marcas</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16">Ver</TableHead>
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
                  <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50"
                    onClick={() => { setDetalhesId(p.id); setDetalhesOpen(true); }}>
                    <TableCell className="font-mono font-semibold text-sm">#{p.numero_pedido}</TableCell>
                    <TableCell className="text-sm">{formatDate(p.data_pedido)}</TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{p.razao_social}</div>
                      <div className="text-xs text-muted-foreground">{p.tipo}</div>
                    </TableCell>
                    <TableCell className="text-sm">{profiles[p.vendedor_id] ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {p.marcas.map((m) => <Badge key={m} variant="outline" className="text-xs">{m}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm">{formatBRL(p.total)}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[p.status] ?? ""}`}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="ghost"
                        onClick={() => { setDetalhesId(p.id); setDetalhesOpen(true); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <PedidoDetalhesDialog pedidoId={detalhesId} open={detalhesOpen} onOpenChange={setDetalhesOpen} />
    </div>
  );
}
