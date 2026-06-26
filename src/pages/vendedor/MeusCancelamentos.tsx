import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatBRL, formatDate, MESES } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";

const MOTIVO_LABEL: Record<string, string> = {
  desistencia: "Desistência",
  inadimplencia: "Inadimplência",
  erro_comercial: "Erro Comercial",
  logistica: "Logística",
  outro: "Outro",
};

type Cancelamento = {
  id: string;
  numero_pedido: string;
  cliente_nome: string | null;
  valor_cancelado: number;
  data_cancelamento: string;
  motivo: string;
};

type ResultadoMes = {
  vendas_brutas: number;
  total_cancelado: number;
  resultado_liquido: number;
};

export default function MeusCancelamentos() {
  const { user } = useAuth();
  const hoje = new Date();
  const [filtroMes, setFiltroMes] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`);

  const [anoStr, mesStr] = filtroMes.split("-");
  const ano = parseInt(anoStr, 10);
  const mes = parseInt(mesStr, 10);
  const iniDate = filtroMes ? `${filtroMes}-01` : undefined;
  const fimDate = filtroMes ? `${filtroMes}-${String(new Date(ano, mes, 0).getDate()).padStart(2, "0")}` : undefined;

  const { data: cancelamentos = [], isLoading: loadingList } = useQuery<Cancelamento[]>({
    queryKey: ["meus-cancelamentos", user?.id, filtroMes],
    queryFn: async () => {
      if (!user?.id) return [];
      let q = (supabase as any)
        .from("pedidos_cancelados")
        .select("id, numero_pedido, cliente_nome, valor_cancelado, data_cancelamento, motivo")
        .eq("vendedor_id", user.id)
        .order("data_cancelamento", { ascending: false });
      if (iniDate) q = q.gte("data_cancelamento", iniDate);
      if (fimDate) q = q.lte("data_cancelamento", fimDate);
      const { data, error } = await q;
      if (error) { toast.error("Erro ao carregar cancelamentos."); throw error; }
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: resultado, isLoading: loadingRpc } = useQuery<ResultadoMes>({
    queryKey: ["resultado-vendedor-mes", user?.id, ano, mes],
    queryFn: async () => {
      if (!user?.id) return { vendas_brutas: 0, total_cancelado: 0, resultado_liquido: 0 };
      const { data, error } = await (supabase as any).rpc("get_resultado_vendedor_mes", {
        p_vendedor_id: user.id,
        p_ano: ano,
        p_mes: mes,
      });
      if (error) { toast.error("Erro ao carregar resultado do mês."); throw error; }
      const row = Array.isArray(data) ? data[0] : data;
      return {
        vendas_brutas: Number(row?.vendas_brutas ?? 0),
        total_cancelado: Number(row?.total_cancelado ?? 0),
        resultado_liquido: Number(row?.resultado_liquido ?? 0),
      };
    },
    enabled: !!user?.id && !!ano && !!mes,
  });

  const nomeMes = MESES[mes - 1] ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Ban className="h-6 w-6" /> Meus Cancelamentos
        </h1>
        <p className="text-sm text-muted-foreground">Cancelamentos registrados pelo faturamento que impactam seu resultado</p>
      </div>

      {/* Filtro de período */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Período:</span>
        <Input
          type="month"
          value={filtroMes}
          onChange={(e) => setFiltroMes(e.target.value)}
          className="w-40"
        />
      </div>

      {/* Card resumo do mês */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Vendas Brutas — {nomeMes}/{anoStr}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingRpc ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <p className="text-2xl font-bold">{formatBRL(resultado?.vendas_brutas ?? 0)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Cancelamentos — {nomeMes}/{anoStr}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingRpc ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <p className="text-2xl font-bold text-destructive">- {formatBRL(resultado?.total_cancelado ?? 0)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Resultado Líquido — {nomeMes}/{anoStr}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingRpc ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <p className={`text-2xl font-bold ${(resultado?.resultado_liquido ?? 0) < 0 ? "text-destructive" : "text-green-700"}`}>
                {formatBRL(resultado?.resultado_liquido ?? 0)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Cancelamentos em {nomeMes}/{anoStr}
            {!loadingList && <span className="ml-2 text-sm font-normal text-muted-foreground">({cancelamentos.length} registros)</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingList ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : cancelamentos.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">Nenhum cancelamento neste período</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cancelamentos.map((c) => (
                    <TableRow key={c.id} className="text-sm">
                      <TableCell className="font-mono font-medium">{c.numero_pedido}</TableCell>
                      <TableCell className="max-w-48 truncate">{c.cliente_nome ?? "—"}</TableCell>
                      <TableCell className="text-right text-destructive font-medium">{formatBRL(c.valor_cancelado)}</TableCell>
                      <TableCell>{formatDate(c.data_cancelamento)}</TableCell>
                      <TableCell>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                          {MOTIVO_LABEL[c.motivo] ?? c.motivo}
                        </span>
                      </TableCell>
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
