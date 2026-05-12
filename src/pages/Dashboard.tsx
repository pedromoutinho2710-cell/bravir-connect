import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, TrendingUp, Trophy, Package, Calendar } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";

type Periodo = "hoje" | "semana" | "mes" | "ano";


function getDateRange(periodo: Periodo): { dataInicio: string; dataFim: string } {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (periodo === "hoje") {
    const s = fmt(today);
    return { dataInicio: s, dataFim: s };
  }
  if (periodo === "semana") {
    const day = today.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { dataInicio: fmt(monday), dataFim: fmt(sunday) };
  }
  if (periodo === "mes") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { dataInicio: fmt(start), dataFim: fmt(end) };
  }
  // ano
  const start = new Date(today.getFullYear(), 0, 1);
  const end = new Date(today.getFullYear(), 11, 31);
  return { dataInicio: fmt(start), dataFim: fmt(end) };
}

type KPIs = {
  preFaturado: number;
  lancados: number;
  aguardandoFaturamento: number;
  faturado: number;
  problemas: number;
};

type RankingVendedor = {
  vendedor_id: string;
  nome: string;
  faturamento: number;
  numPedidos: number;
};

type RankingSku = {
  produto_id: string;
  codigo_jiva: string;
  nome: string;
  marca: string;
  quantidade: number;
};

const PERIODOS: { key: Periodo; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês" },
  { key: "ano", label: "Ano" },
];


export default function Dashboard() {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [periodoKpi, setPeriodoKpi] = useState<Periodo>("mes");
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPIs>({
    preFaturado: 0,
    lancados: 0,
    aguardandoFaturamento: 0,
    faturado: 0,
    problemas: 0,
  });
  const [metaTotal, setMetaTotal] = useState(0);
  const [fatMesAtual, setFatMesAtual] = useState(0);
  const [pipelineTotal, setPipelineTotal] = useState(0);
  const [ranking, setRanking] = useState<RankingVendedor[]>([]);
  const [topSkus, setTopSkus] = useState<RankingSku[]>([]);

  useEffect(() => {
    setLoading(true);
    const { dataInicio, dataFim } = getDateRange(periodo);
    const now = new Date();
    const mesAtual = now.getMonth() + 1;
    const anoAtual = now.getFullYear();
    const pad = (n: number) => String(n).padStart(2, "0");
    const mesInicio = `${anoAtual}-${pad(mesAtual)}-01`;
    const mesFim = new Date(anoAtual, mesAtual, 0).toISOString().slice(0, 10);

    (async () => {
      try {
        const { dataInicio: kpiInicio, dataFim: kpiFim } = getDateRange(periodoKpi);

        const [pedidosRes, metasRes, pedidosMesRes, pipelineRes, preFatRes, lancadosRes, aguardRes, fatKpiRes, probRes] = await Promise.all([
          // Pedidos do período — base para ranking e top SKUs
          supabase
            .from("pedidos")
            .select("id, vendedor_id, status, itens_pedido(total_item, produto_id, quantidade)")
            .gte("data_pedido", dataInicio)
            .lte("data_pedido", dataFim)
            .not("status", "in", '("rascunho")'),
          // Meta total da empresa do mês atual (independente do filtro de período)
          supabase
            .from("metas")
            .select("valor_meta_reais")
            .eq("mes", mesAtual)
            .eq("ano", anoAtual),
          // Faturamento do mês atual para cálculo de % da meta (sempre mês corrente)
          supabase
            .from("pedidos")
            .select("id, itens_pedido(total_item)")
            .gte("data_pedido", mesInicio)
            .lte("data_pedido", mesFim)
            .not("status", "in", '("rascunho","cancelado")'),
          // Pedidos em pipeline (aguardando + em_faturamento) para previsão do mês
          supabase
            .from("pedidos")
            .select("id, itens_pedido(total_item)")
            .in("status", ["pendente_sankhya", "em_faturamento"]),
          // Pendente Sankhya — pendente_sankhya no período
          supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "pendente_sankhya").gte("data_pedido", kpiInicio).lte("data_pedido", kpiFim),
          // Pedidos Lançados — no_sankhya no período
          supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "no_sankhya").gte("data_pedido", kpiInicio).lte("data_pedido", kpiFim),
          // Aguardando Faturamento — parcialmente_faturado no período
          supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "parcialmente_faturado").gte("data_pedido", kpiInicio).lte("data_pedido", kpiFim),
          // Faturado — faturado no período
          supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "faturado").gte("data_pedido", kpiInicio).lte("data_pedido", kpiFim),
          // Problemas — com_problema no período
          supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "com_problema").gte("data_pedido", kpiInicio).lte("data_pedido", kpiFim),
        ]);

        // KPIs
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pedidos = (pedidosRes.data ?? []) as any[];
        const pedidosSemCancelado = pedidos.filter((p) => p.status !== "cancelado");

        setKpis({
          preFaturado: preFatRes.count ?? 0,
          lancados: lancadosRes.count ?? 0,
          aguardandoFaturamento: aguardRes.count ?? 0,
          faturado: fatKpiRes.count ?? 0,
          problemas: probRes.count ?? 0,
        });

        // Meta total do mês
        const metaSum = (metasRes.data ?? []).reduce((s, m) => s + Number(m.valor_meta_reais), 0);
        setMetaTotal(metaSum);

        // Faturamento mês atual para % da meta
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fatMes = (pedidosMesRes.data ?? []).reduce(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (s: number, p: any) => s + (p.itens_pedido ?? []).reduce((si: number, i: any) => si + Number(i.total_item), 0),
          0,
        );
        setFatMesAtual(fatMes);

        // Pipeline total para previsão
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pipeline = (pipelineRes.data ?? []).reduce(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (s: number, p: any) => s + (p.itens_pedido ?? []).reduce((si: number, i: any) => si + Number(i.total_item), 0),
          0,
        );
        setPipelineTotal(pipeline);

        // Ranking top 5 vendedores
        const vendedorAgg: Record<string, { faturamento: number; numPedidos: number }> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pedidosSemCancelado.forEach((p: any) => {
          if (!vendedorAgg[p.vendedor_id]) vendedorAgg[p.vendedor_id] = { faturamento: 0, numPedidos: 0 };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const total = (p.itens_pedido ?? []).reduce((s: number, i: any) => s + Number(i.total_item), 0);
          vendedorAgg[p.vendedor_id].faturamento += total;
          vendedorAgg[p.vendedor_id].numPedidos += 1;
        });

        const vendedorIds = Object.keys(vendedorAgg);
        const profileMap: Record<string, string> = {};
        if (vendedorIds.length > 0) {
          const { data: profilesData } = await supabase
            .from("profiles")
            .select("id, full_name, email")
            .in("id", vendedorIds);
          (profilesData ?? []).forEach((p) => {
            profileMap[p.id] = p.full_name || p.email;
          });
        }

        const rankingList: RankingVendedor[] = Object.entries(vendedorAgg)
          .map(([vendedor_id, data]) => ({
            vendedor_id,
            nome: profileMap[vendedor_id] ?? "—",
            faturamento: data.faturamento,
            numPedidos: data.numPedidos,
          }))
          .sort((a, b) => b.faturamento - a.faturamento)
          .slice(0, 5);
        setRanking(rankingList);

        // Top 5 SKUs por quantidade
        const skuAgg: Record<string, { quantidade: number }> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pedidosSemCancelado.forEach((p: any) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p.itens_pedido ?? []).forEach((i: any) => {
            if (!i.produto_id) return;
            if (!skuAgg[i.produto_id]) skuAgg[i.produto_id] = { quantidade: 0 };
            skuAgg[i.produto_id].quantidade += Number(i.quantidade);
          });
        });

        const topSkuIds = Object.keys(skuAgg)
          .sort((a, b) => skuAgg[b].quantidade - skuAgg[a].quantidade)
          .slice(0, 5);

        if (topSkuIds.length > 0) {
          const { data: produtosData } = await supabase
            .from("produtos")
            .select("id, codigo_jiva, nome, marca")
            .in("id", topSkuIds);

          const prodMap: Record<string, { codigo_jiva: string; nome: string; marca: string }> = {};
          (produtosData ?? []).forEach((p) => {
            prodMap[p.id] = { codigo_jiva: p.codigo_jiva, nome: p.nome, marca: p.marca };
          });

          setTopSkus(
            topSkuIds.map((id) => ({
              produto_id: id,
              codigo_jiva: prodMap[id]?.codigo_jiva ?? "—",
              nome: prodMap[id]?.nome ?? "—",
              marca: prodMap[id]?.marca ?? "—",
              quantidade: skuAgg[id].quantidade,
            })),
          );
        } else {
          setTopSkus([]);
        }
      } catch {
        toast.error("Erro ao carregar dashboard");
      }
    })().finally(() => setLoading(false));
  }, [periodo, periodoKpi]);

  const metaPct = metaTotal > 0 ? Math.min((fatMesAtual / metaTotal) * 100, 100) : 0;
  const previsaoMes = fatMesAtual + pipelineTotal;
  const previsaoPct = metaTotal > 0 ? Math.min((previsaoMes / metaTotal) * 100, 100) : 0;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-[#1A6B3A]">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral do negócio</p>
      </div>

      {/* Filtro de período */}
      <div className="flex gap-2">
        {PERIODOS.map(({ key, label }) => (
          <Button
            key={key}
            variant={periodo === key ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriodo(key)}
            style={periodo === key ? { backgroundColor: "#1A6B3A", borderColor: "#1A6B3A" } : undefined}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Previsão do mês */}
      {metaTotal > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Previsão do mês</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-2xl font-bold">{formatBRL(previsaoMes)}</div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Meta: {formatBRL(metaTotal)}</span>
                <span className="font-medium">{previsaoPct.toFixed(1)}% previsto</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted">
                <div
                  className={`h-2 rounded-full transition-all ${
                    previsaoPct >= 80 ? "" : previsaoPct >= 50 ? "bg-yellow-400" : "bg-red-500"
                  }`}
                  style={{
                    width: `${previsaoPct}%`,
                    ...(previsaoPct >= 80 ? { backgroundColor: "#1A6B3A" } : {}),
                  }}
                />
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Faturado: {formatBRL(fatMesAtual)}</span>
                <span>Pipeline: {formatBRL(pipelineTotal)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Meta geral da empresa */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Meta geral da empresa</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {metaTotal === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma meta cadastrada para o mês atual</p>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Meta: {formatBRL(metaTotal)}</span>
                <span className="font-medium">{metaPct.toFixed(1)}% atingido</span>
              </div>
              <div className="text-sm text-muted-foreground">
                Faturado no mês: {formatBRL(fatMesAtual)}
              </div>
              <div className="h-2 w-full rounded-full bg-muted">
                <div
                  className={`h-2 rounded-full transition-all ${
                    metaPct >= 80 ? "" : metaPct >= 50 ? "bg-yellow-400" : "bg-red-500"
                  }`}
                  style={{
                    width: `${metaPct}%`,
                    ...(metaPct >= 80 ? { backgroundColor: "#1A6B3A" } : {}),
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ranking e Top SKUs */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top 5 vendedores */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Top 5 vendedores</CardTitle>
            <Trophy className="h-4 w-4" style={{ color: "#1A6B3A" }} />
          </CardHeader>
          <CardContent>
            {ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum dado no período</p>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead className="text-right">Faturamento</TableHead>
                      <TableHead className="text-right">Pedidos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ranking.map((r, idx) => (
                      <TableRow key={r.vendedor_id}>
                        <TableCell className="font-bold">{idx + 1}</TableCell>
                        <TableCell className="text-sm">{r.nome}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatBRL(r.faturamento)}</TableCell>
                        <TableCell className="text-right text-sm">{r.numPedidos}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top 5 produtos por quantidade */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Top 5 produtos</CardTitle>
            <Package className="h-4 w-4" style={{ color: "#1A6B3A" }} />
          </CardHeader>
          <CardContent>
            {topSkus.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum dado no período</p>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topSkus.map((s, idx) => (
                      <TableRow key={s.produto_id}>
                        <TableCell className="font-bold">{idx + 1}</TableCell>
                        <TableCell className="font-mono text-sm">{s.codigo_jiva}</TableCell>
                        <TableCell className="text-sm max-w-[100px] truncate" title={s.nome}>{s.nome}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{s.marca}</Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">{s.quantidade}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Painel de pedidos por status do fluxo */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Painel de pedidos
          </h2>
          <div className="flex gap-1">
            {PERIODOS.map(({ key, label }) => (
              <Button
                key={key}
                variant={periodoKpi === key ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriodoKpi(key)}
                style={periodoKpi === key
                  ? { backgroundColor: "#1A6B3A", borderColor: "#1A6B3A" }
                  : undefined}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg border p-4 bg-yellow-50 border-yellow-300">
            <div className="text-sm font-medium text-yellow-800">Pré Faturado</div>
            <div className="text-3xl font-bold mt-1 text-yellow-900">{kpis.preFaturado}</div>
            <div className="text-xs text-yellow-700 mt-1">Pedidos recebidos</div>
          </div>
          <div className="rounded-lg border p-4 bg-purple-50 border-purple-300">
            <div className="text-sm font-medium text-purple-800">Pedidos Lançados</div>
            <div className="text-3xl font-bold mt-1 text-purple-900">{kpis.lancados}</div>
            <div className="text-xs text-purple-700 mt-1">Cadastrados no Sankhya</div>
          </div>
          <div className="rounded-lg border p-4 bg-blue-50 border-blue-300">
            <div className="text-sm font-medium text-blue-800">Aguardando Faturamento</div>
            <div className="text-3xl font-bold mt-1 text-blue-900">{kpis.aguardandoFaturamento}</div>
            <div className="text-xs text-blue-700 mt-1">Enviados à logística</div>
          </div>
          <div className="rounded-lg border p-4 bg-green-50 border-green-300">
            <div className="text-sm font-medium text-green-800">Faturado</div>
            <div className="text-3xl font-bold mt-1 text-green-900">{kpis.faturado}</div>
            <div className="text-xs text-green-700 mt-1">Efetivamente faturados</div>
          </div>
          <div className={`rounded-lg border p-4 ${
            kpis.problemas > 0 ? "bg-red-50 border-red-300" : "bg-gray-50 border-gray-200"
          }`}>
            <div className={`text-sm font-medium ${kpis.problemas > 0 ? "text-red-800" : "text-gray-600"}`}>
              Problemas
            </div>
            <div className={`text-3xl font-bold mt-1 ${kpis.problemas > 0 ? "text-red-900" : "text-gray-700"}`}>
              {kpis.problemas}
            </div>
            <div className={`text-xs mt-1 ${kpis.problemas > 0 ? "text-red-700" : "text-gray-500"}`}>
              Com problema
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
