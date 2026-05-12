import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDate, formatCNPJ } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type HistoricoEntry = {
  id: string;
  pedido_id: string;
  numero_pedido: number;
  razao_social: string;
  cnpj: string | null;
  status_anterior: string;
  status_novo: string;
  usuario_nome: string | null;
  usuario_email: string | null;
  acao: string | null;
  observacao: string | null;
  created_at: string;
};

const ACAO_LABEL: Record<string, string> = {
  assumiu: "Assumiu o pedido",
  cadastrou_sankhya: "Cadastrou no Sankhya",
  devolveu: "Devolveu ao vendedor",
  cancelou: "Cancelou o pedido",
  marcou_problema: "Marcou com problema",
  faturou: "Registrou faturamento",
};

const ACAO_COLOR: Record<string, string> = {
  assumiu: "bg-blue-100 text-blue-800 border-blue-300",
  cadastrou_sankhya: "bg-purple-100 text-purple-800 border-purple-300",
  faturou: "bg-green-100 text-green-800 border-green-300",
  devolveu: "bg-orange-100 text-orange-800 border-orange-300",
  cancelou: "bg-red-100 text-red-800 border-red-300",
  marcou_problema: "bg-red-100 text-red-800 border-red-300",
};

function toLocalDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function HistoricoFaturamento() {
  const [entradas, setEntradas] = useState<HistoricoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroAcao, setFiltroAcao] = useState("todas");
  const [filtroData, setFiltroData] = useState(() => toLocalDate(new Date()));

  const carregar = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("historico_status")
      .select(`
        id, pedido_id, status_anterior, status_novo,
        usuario_nome, usuario_email, acao, observacao, created_at,
        pedidos(numero_pedido, clientes(razao_social, cnpj))
      `)
      .order("created_at", { ascending: false })
      .limit(500);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped: HistoricoEntry[] = (data ?? []).map((h: any) => ({
      id: h.id,
      pedido_id: h.pedido_id,
      numero_pedido: h.pedidos?.numero_pedido ?? 0,
      razao_social: h.pedidos?.clientes?.razao_social ?? "—",
      cnpj: h.pedidos?.clientes?.cnpj ?? null,
      status_anterior: h.status_anterior,
      status_novo: h.status_novo,
      usuario_nome: h.usuario_nome,
      usuario_email: h.usuario_email,
      acao: h.acao,
      observacao: h.observacao,
      created_at: h.created_at,
    }));

    setEntradas(mapped);
    setLoading(false);
  };

  useEffect(() => {
    carregar();

    const channel = supabase
      .channel("historico-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "historico_status" }, () => {
        carregar();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hoje = toLocalDate(new Date());

  const entradasHoje = useMemo(
    () => entradas.filter((e) => e.created_at.slice(0, 10) === hoje),
    [entradas, hoje]
  );

  const kpiAssumidosHoje = useMemo(
    () => entradasHoje.filter((e) => e.acao === "assumiu").length,
    [entradasHoje]
  );

  const kpiFaturadosHoje = useMemo(
    () => entradasHoje.filter((e) => e.acao === "faturou").length,
    [entradasHoje]
  );

  const kpiMaisAtiva = useMemo(() => {
    const counts: Record<string, number> = {};
    entradasHoje.forEach((e) => {
      const nome = e.usuario_nome ?? e.usuario_email ?? "Desconhecido";
      counts[nome] = (counts[nome] ?? 0) + 1;
    });
    const entries = Object.entries(counts);
    if (entries.length === 0) return "—";
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  }, [entradasHoje]);

  const filtradas = useMemo(() => {
    let result = entradas;
    if (filtroData) {
      result = result.filter((e) => e.created_at.slice(0, 10) === filtroData);
    }
    if (filtroAcao !== "todas") {
      result = result.filter((e) => e.acao === filtroAcao);
    }
    const q = busca.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (e) =>
          e.razao_social.toLowerCase().includes(q) ||
          (e.usuario_nome ?? "").toLowerCase().includes(q) ||
          (e.usuario_email ?? "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [entradas, filtroData, filtroAcao, busca]);

  return (
    <div className="space-y-6 pb-6">
      <div>
        <h1 className="text-2xl font-bold">Histórico de Faturamento</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe em tempo real tudo que acontece nos pedidos
        </p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ações hoje</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{entradasHoje.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Assumidos hoje</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{kpiAssumidosHoje}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Faturamentos hoje</CardTitle>
            <Clock className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{kpiFaturadosHoje}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Mais ativa hoje</CardTitle>
            <Clock className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-semibold text-purple-700 truncate" title={kpiMaisAtiva}>
              {kpiMaisAtiva}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar cliente ou colaboradora…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Select value={filtroAcao} onValueChange={setFiltroAcao}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Todas as ações" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as ações</SelectItem>
            {Object.entries(ACAO_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={filtroData}
          onChange={(e) => setFiltroData(e.target.value)}
          className="w-44"
        />
        <Button variant="outline" size="sm" onClick={() => setFiltroData(hoje)}>
          Hoje
        </Button>
        <Button variant="outline" size="sm" onClick={() => setFiltroData("")}>
          Tudo
        </Button>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Quando</TableHead>
                <TableHead>Colaboradora</TableHead>
                <TableHead className="w-28">Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="w-48">Ação</TableHead>
                <TableHead>Observação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                    Nenhuma entrada encontrada
                  </TableCell>
                </TableRow>
              )}
              {filtradas.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">
                    <div className="font-medium">
                      {formatDistanceToNow(new Date(e.created_at), { locale: ptBR, addSuffix: true })}
                    </div>
                    <div className="text-muted-foreground">
                      {new Date(e.created_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {e.usuario_nome ?? e.usuario_email ?? "—"}
                  </TableCell>
                  <TableCell>
                    {e.numero_pedido > 0 ? (
                      <span className="inline-flex items-center rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-xs font-mono font-semibold text-gray-700">
                        #{e.numero_pedido}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{e.razao_social}</div>
                    {e.cnpj && (
                      <div className="text-xs text-muted-foreground font-mono">{formatCNPJ(e.cnpj)}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {e.acao ? (
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${ACAO_COLOR[e.acao] ?? "bg-gray-100 text-gray-700 border-gray-300"}`}>
                        {ACAO_LABEL[e.acao] ?? e.acao}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={e.observacao ?? undefined}>
                    {e.observacao ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
