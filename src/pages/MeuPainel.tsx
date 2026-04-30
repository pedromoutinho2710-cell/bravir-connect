import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL, formatDate } from "@/lib/format";
import { STATUS_LABEL, STATUS_COLOR } from "./MeusPedidos";
import { exportarTabelaPrecosExcel, type ProdutoTabela } from "@/lib/excel";
import { Loader2, AlertTriangle, Download, TrendingUp, ShoppingCart, Receipt, Users } from "lucide-react";
import { toast } from "sonner";

type KPIs = {
  faturamento: number;
  numPedidos: number;
  ticketMedio: number;
  rascunhos: number;
  meta: number;
};

type UltimoPedido = {
  id: string;
  numero_pedido: number;
  status: string;
  razao_social: string;
  total: number;
  data_pedido: string;
};

export default function MeuPainel() {
  const { user } = useAuth();
  const [kpis, setKpis] = useState<KPIs>({ faturamento: 0, numPedidos: 0, ticketMedio: 0, rascunhos: 0, meta: 0 });
  const [ultimosPedidos, setUltimosPedidos] = useState<UltimoPedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [baixandoTabela, setBaixandoTabela] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const agora = new Date();
      const mesInicio = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-01`;
      const mesFim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).toISOString().slice(0, 10);

      const [pedidosRes, rascunhosRes, metasRes, ultimosRes] = await Promise.all([
        supabase
          .from("pedidos")
          .select("id, itens_pedido(total_item)")
          .eq("vendedor_id", user.id)
          .gte("data_pedido", mesInicio)
          .lte("data_pedido", mesFim)
          .not("status", "in", '("rascunho","cancelado")'),
        supabase
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .eq("vendedor_id", user.id)
          .eq("status", "rascunho"),
        supabase
          .from("metas")
          .select("valor_meta_reais")
          .eq("vendedor_id", user.id)
          .eq("mes", agora.getMonth() + 1)
          .eq("ano", agora.getFullYear())
          .maybeSingle(),
        supabase
          .from("pedidos")
          .select("id, numero_pedido, status, data_pedido, itens_pedido(total_item), clientes(razao_social)")
          .eq("vendedor_id", user.id)
          .not("status", "in", '("rascunho")')
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pedidos = (pedidosRes.data ?? []) as any[];
      const faturamento = pedidos.reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: number, p: any) => s + (p.itens_pedido ?? []).reduce((si: number, i: any) => si + Number(i.total_item), 0),
        0,
      );
      const numPedidos = pedidos.length;
      const ticketMedio = numPedidos > 0 ? faturamento / numPedidos : 0;
      const rascunhos = rascunhosRes.count ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meta = Number((metasRes.data as any)?.valor_meta_reais ?? 0);

      setKpis({ faturamento, numPedidos, ticketMedio, rascunhos, meta });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setUltimosPedidos((ultimosRes.data ?? []).map((p: any) => ({
        id: p.id,
        numero_pedido: p.numero_pedido,
        status: p.status,
        razao_social: p.clientes?.razao_social ?? "—",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        total: (p.itens_pedido ?? []).reduce((s: number, i: any) => s + Number(i.total_item), 0),
        data_pedido: p.data_pedido,
      })));
    })().finally(() => setLoading(false));
  }, [user]);

  const metaPct = kpis.meta > 0 ? Math.min((kpis.faturamento / kpis.meta) * 100, 100) : 0;
  const metaColor = metaPct >= 80 ? "bg-green-500" : metaPct >= 50 ? "bg-yellow-400" : "bg-red-500";

  const baixarTabela = async () => {
    setBaixandoTabela(true);
    try {
      const [prodRes, precoRes] = await Promise.all([
        supabase.from("produtos").select("id, codigo_jiva, nome, marca").eq("ativo", true).order("marca").order("nome"),
        supabase.from("precos").select("produto_id, tabela, preco_bruto"),
      ]);

      const precoMap: Record<string, Record<string, number>> = {};
      (precoRes.data ?? []).forEach((p) => {
        (precoMap[p.produto_id] ||= {})[p.tabela] = Number(p.preco_bruto);
      });

      const produtos: ProdutoTabela[] = (prodRes.data ?? []).map((p) => ({
        codigo_jiva: p.codigo_jiva,
        nome: p.nome,
        marca: p.marca,
        preco_7: precoMap[p.id]?.["7"] ?? 0,
        preco_12: precoMap[p.id]?.["12"] ?? 0,
        preco_18: precoMap[p.id]?.["18"] ?? 0,
        preco_suframa: precoMap[p.id]?.["suframa"] ?? 0,
      }));

      await exportarTabelaPrecosExcel(produtos);
    } catch {
      toast.error("Erro ao gerar tabela de preços");
    } finally {
      setBaixandoTabela(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Meu Painel</h1>
          <p className="text-sm text-muted-foreground">Resumo do mês atual</p>
        </div>
        <Button variant="outline" onClick={baixarTabela} disabled={baixandoTabela}>
          {baixandoTabela ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Baixar tabela de preços
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Faturamento do mês</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(kpis.faturamento)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Meta mensal</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.meta > 0 ? formatBRL(kpis.meta) : "—"}</div>
            {kpis.meta > 0 && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{metaPct.toFixed(1)}% atingido</span>
                  <span>{formatBRL(kpis.faturamento)}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div
                    className={`h-2 rounded-full transition-all ${metaColor}`}
                    style={{ width: `${metaPct}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Número de pedidos</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.numPedidos}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ticket médio</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(kpis.ticketMedio)}</div>
          </CardContent>
        </Card>

        <Card className={kpis.rascunhos > 0 ? "border-amber-300" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Rascunhos abandonados</CardTitle>
            {kpis.rascunhos > 0 && <AlertTriangle className="h-4 w-4 text-amber-500" />}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${kpis.rascunhos > 0 ? "text-amber-600" : ""}`}>
              {kpis.rascunhos}
            </div>
            {kpis.rascunhos > 0 && (
              <p className="text-xs text-amber-600 mt-1">Pedidos não finalizados</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Últimos 5 pedidos */}
      <Card>
        <CardHeader>
          <CardTitle>Últimos pedidos</CardTitle>
        </CardHeader>
        <CardContent>
          {ultimosPedidos.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">Nenhum pedido encontrado</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ultimosPedidos.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono font-semibold">#{p.numero_pedido}</TableCell>
                      <TableCell className="text-sm">{formatDate(p.data_pedido)}</TableCell>
                      <TableCell className="text-sm">{p.razao_social}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[p.status] ?? "bg-gray-100 text-gray-800 border-gray-300"}`}>
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatBRL(p.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
