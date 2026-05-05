import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, CheckCircle2, Weight } from "lucide-react";
import { toast } from "sonner";

type PedidoRecente = {
  id: string;
  numero_pedido: number;
  data_pedido: string;
  razao_social: string;
  total: number;
  peso_total: number;
};

export default function DashboardLogistica() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [aguardando, setAguardando] = useState(0);
  const [faturadosHoje, setFaturadosHoje] = useState(0);
  const [pesoHoje, setPesoHoje] = useState(0);
  const [recentes, setRecentes] = useState<PedidoRecente[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const hoje = new Date();
      const hojeStr = hoje.toISOString().slice(0, 10);

      const [agRes, fatHojeRes, recentesRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .in("status", ["aguardando_faturamento", "parcialmente_faturado"]),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .eq("status", "faturado")
          .gte("faturado_em", `${hojeStr}T00:00:00`),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("pedidos")
          .select(`
            id, numero_pedido, data_pedido,
            clientes(razao_social),
            itens_pedido(quantidade, total_item, produtos(peso_unitario))
          `)
          .eq("status", "faturado")
          .order("faturado_em", { ascending: false })
          .limit(10),
      ]);

      if (agRes.error) toast.error("Erro ao carregar KPIs");

      setAguardando(agRes.count ?? 0);
      setFaturadosHoje(fatHojeRes.count ?? 0);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: PedidoRecente[] = (recentesRes.data ?? []).map((p: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const itensList = (p.itens_pedido ?? []) as any[];
        const total = itensList.reduce((s: number, i) => s + Number(i.total_item), 0);
        const peso = itensList.reduce(
          (s: number, i) => s + Number(i.produtos?.peso_unitario ?? 0) * Number(i.quantidade), 0
        );
        return {
          id: p.id,
          numero_pedido: p.numero_pedido,
          data_pedido: p.data_pedido,
          razao_social: p.clientes?.razao_social ?? "—",
          total,
          peso_total: peso,
        };
      });

      setRecentes(mapped);

      // Busca pedidos faturados hoje com itens para calcular peso
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: pedHoje } = await (supabase as any)
        .from("pedidos")
        .select("itens_pedido(quantidade, produtos(peso_unitario))")
        .eq("status", "faturado")
        .gte("faturado_em", `${hojeStr}T00:00:00`);

      if (pedHoje) {
        let peso = 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pedHoje as any[]).forEach((p: any) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p.itens_pedido ?? []).forEach((i: any) => {
            peso += Number(i.produtos?.peso_unitario ?? 0) * Number(i.quantidade);
          });
        });
        setPesoHoje(peso);
      }

      setLoading(false);
    };

    load();
  }, []);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard — Logística</h1>
        <p className="text-sm text-muted-foreground">Visão geral do faturamento</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate("/logistica/fila")}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Aguardando faturamento</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-700">{aguardando}</div>
            <div className="text-xs text-muted-foreground mt-1">Clique para ver a fila</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Faturados hoje</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-700">{faturadosHoje}</div>
            <div className="text-xs text-muted-foreground mt-1">pedidos confirmados</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Peso faturado hoje</CardTitle>
            <Weight className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-700">{pesoHoje.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground mt-1">kg expedidos</div>
          </CardContent>
        </Card>
      </div>

      {/* Últimos 10 faturados */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Últimos pedidos faturados</h2>
        {recentes.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum pedido faturado ainda.</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Peso</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentes.map((p) => (
                  <TableRow key={p.id} className="hover:bg-muted/40">
                    <TableCell className="font-mono font-semibold">#{p.numero_pedido}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(p.data_pedido)}</TableCell>
                    <TableCell className="font-medium text-sm">{p.razao_social}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {p.peso_total > 0 ? `${p.peso_total.toFixed(1)} kg` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-bold text-sm text-green-700">
                      {formatBRL(p.total)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 text-xs">
                        Pré-faturado
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
