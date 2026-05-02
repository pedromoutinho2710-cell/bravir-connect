import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL, formatDate } from "@/lib/format";
import { STATUS_LABEL, STATUS_COLOR } from "./MeusPedidos";
import { exportarTabelaPrecosExcel, type ProdutoTabela } from "@/lib/excel";
import { Loader2, AlertTriangle, Download, TrendingUp, ShoppingCart, Receipt, Users, Megaphone, RefreshCw, CheckSquare, CheckCircle2 } from "lucide-react";
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

type ClienteReativar = {
  cliente_id: string;
  razao_social: string;
  ltv: number;
  ultima_compra: string;
  dias_sem_compra: number;
};

type TarefaDia = {
  id: string;
  titulo: string;
  data_vencimento: string | null;
  concluida: boolean;
  cliente_id: string | null;
  cliente_nome?: string;
};

type Campanha = {
  id: string;
  nome: string;
  descricao: string | null;
  tipo: string | null;
  valor: number | null;
  data_fim: string | null;
  created_at: string;
};

const TIPO_COLOR: Record<string, string> = {
  desconto: "bg-blue-100 text-blue-800 border-blue-300",
  bonificacao: "bg-green-100 text-green-800 border-green-300",
  outro: "bg-gray-100 text-gray-800 border-gray-300",
};

const TIPO_LABEL: Record<string, string> = {
  desconto: "Desconto",
  bonificacao: "Bonificação",
  outro: "Outro",
};

export default function MeuPainel() {
  const { user } = useAuth();
  const [kpis, setKpis] = useState<KPIs>({ faturamento: 0, numPedidos: 0, ticketMedio: 0, rascunhos: 0, meta: 0 });
  const [ultimosPedidos, setUltimosPedidos] = useState<UltimoPedido[]>([]);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [clientesReativar, setClientesReativar] = useState<ClienteReativar[]>([]);
  const [tarefasDia, setTarefasDia] = useState<TarefaDia[]>([]);
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

      // Load campanhas ativas
      const hoje = agora.toISOString().slice(0, 10);
      const { data: campData } = await supabase
        .from("campanhas")
        .select("id, nome, descricao, tipo, valor, data_fim, created_at")
        .eq("ativa", true)
        .or(`data_fim.is.null,data_fim.gte.${hoje}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setCampanhas((campData ?? []) as any[]);

      // Clientes para reativar (sem pedido há 30+ dias)
      const limite30 = new Date(agora);
      limite30.setDate(limite30.getDate() - 30);
      const limite30Str = limite30.toISOString().slice(0, 10);
      const { data: pedidosTodos } = await supabase
        .from("pedidos")
        .select("cliente_id, data_pedido, itens_pedido(total_item), clientes(razao_social)")
        .eq("vendedor_id", user.id)
        .not("status", "in", '("rascunho","cancelado")');

      if (pedidosTodos) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const clienteMap = new Map<string, { razao_social: string; ltv: number; ultima_compra: string }>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pedidosTodos as any[]).forEach((p: any) => {
          if (!p.cliente_id) return;
          const entry = clienteMap.get(p.cliente_id) ?? {
            razao_social: p.clientes?.razao_social ?? "—",
            ltv: 0,
            ultima_compra: p.data_pedido,
          };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          entry.ltv += (p.itens_pedido ?? []).reduce((s: number, i: any) => s + Number(i.total_item), 0);
          if (p.data_pedido > entry.ultima_compra) entry.ultima_compra = p.data_pedido;
          entry.razao_social = p.clientes?.razao_social ?? entry.razao_social;
          clienteMap.set(p.cliente_id, entry);
        });

        const reativar: ClienteReativar[] = Array.from(clienteMap.entries())
          .filter(([, v]) => v.ultima_compra < limite30Str)
          .map(([cliente_id, v]) => {
            const dias = Math.floor((agora.getTime() - new Date(v.ultima_compra).getTime()) / (1000 * 60 * 60 * 24));
            return { cliente_id, razao_social: v.razao_social, ltv: v.ltv, ultima_compra: v.ultima_compra, dias_sem_compra: dias };
          })
          .sort((a, b) => b.ltv - a.ltv)
          .slice(0, 10);
        setClientesReativar(reativar);
      }

      // Tarefas do dia (vencendo hoje ou sem data, não concluídas)
      const { data: tarData } = await supabase
        .from("tarefas")
        .select("id, titulo, data_vencimento, concluida, cliente_id, clientes(razao_social)")
        .eq("vendedor_id", user.id)
        .eq("concluida", false)
        .or(`data_vencimento.is.null,data_vencimento.lte.${hoje}`)
        .order("data_vencimento", { ascending: true });
      if (tarData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setTarefasDia((tarData as any[]).map((t: any) => ({
          id: t.id,
          titulo: t.titulo,
          data_vencimento: t.data_vencimento,
          concluida: t.concluida,
          cliente_id: t.cliente_id,
          cliente_nome: t.clientes?.razao_social,
        })));
      }

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

      {/* Campanhas ativas */}
      {campanhas.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Megaphone className="h-5 w-5 text-primary" />
            <CardTitle>Campanhas ativas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {campanhas.map((c) => {
                const diasCriado = Math.floor(
                  (Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24)
                );
                return (
                  <div key={c.id} className="rounded-md border p-3 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{c.nome}</span>
                      {diasCriado < 7 && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                          Novo
                        </span>
                      )}
                      {c.tipo && (
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TIPO_COLOR[c.tipo] ?? "bg-gray-100 text-gray-800 border-gray-300"}`}>
                          {TIPO_LABEL[c.tipo] ?? c.tipo}
                        </span>
                      )}
                    </div>
                    {c.descricao && (
                      <p className="text-xs text-muted-foreground">{c.descricao}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {c.valor != null && <span className="font-medium text-foreground">{c.valor}%</span>}
                      {c.data_fim && <span>Válida até {formatDate(c.data_fim)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tarefas do dia */}
      {tarefasDia.length > 0 && (
        <Card className="border-blue-300">
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <CheckSquare className="h-5 w-5 text-blue-600" />
            <CardTitle>Tarefas do dia</CardTitle>
            <span className="ml-auto inline-flex items-center rounded-full bg-blue-600 text-white text-xs font-bold px-2 py-0.5">
              {tarefasDia.length}
            </span>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {tarefasDia.map((t) => (
                <div key={t.id} className="flex items-start gap-2 rounded-md border px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{t.titulo}</div>
                    {t.cliente_nome && (
                      <div className="text-xs text-muted-foreground">{t.cliente_nome}</div>
                    )}
                    {t.data_vencimento && (
                      <div className="text-xs text-red-600">
                        Vence: {new Date(t.data_vencimento + "T00:00:00").toLocaleDateString("pt-BR")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Clientes para reativar */}
      {clientesReativar.length > 0 && (
        <Card className="border-amber-300">
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <RefreshCw className="h-5 w-5 text-amber-600" />
            <CardTitle>Clientes para reativar</CardTitle>
            <span className="ml-auto text-xs text-muted-foreground">sem pedido há 30+ dias</span>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {clientesReativar.map((c) => (
                <div key={c.cliente_id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{c.razao_social}</div>
                    <div className="text-xs text-muted-foreground">
                      Último pedido: {new Date(c.ultima_compra).toLocaleDateString("pt-BR")} ({c.dias_sem_compra} dias)
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-muted-foreground">{formatBRL(c.ltv)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
