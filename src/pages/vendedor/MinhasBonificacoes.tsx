import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatBRL, formatDate, MESES } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Gift, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Bonificacao = {
  id: string;
  data_bonificacao: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  numero_pedido: string | null;
  valor: number;
  motivo: string | null;
  status: "pendente" | "aprovada" | "paga";
  clientes?: { razao_social?: string | null; nome_parceiro?: string | null } | null;
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-amber-100 text-amber-800 border-amber-200" },
  aprovada: { label: "Aprovada", className: "bg-blue-100 text-blue-800 border-blue-200" },
  paga:     { label: "Paga",     className: "bg-green-100 text-green-800 border-green-200" },
};

export default function MinhasBonificacoes() {
  const { user } = useAuth();
  const hoje = new Date();
  const [filtroMes, setFiltroMes] = useState(
    `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`
  );

  const [anoStr, mesStr] = filtroMes.split("-");
  const ano = parseInt(anoStr, 10);
  const mes = parseInt(mesStr, 10);
  const iniDate = `${filtroMes}-01`;
  const fimDate = `${filtroMes}-${String(new Date(ano, mes, 0).getDate()).padStart(2, "0")}`;

  const { data: bonificacoesMes = [], isLoading: loadingMes } = useQuery<Bonificacao[]>({
    queryKey: ["minhas-bonificacoes", user?.id, filtroMes],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await (supabase as any)
        .from("bonificacoes")
        .select("id, data_bonificacao, cliente_id, cliente_nome, numero_pedido, valor, motivo, status, clientes(razao_social, nome_parceiro)")
        .eq("vendedor_id", user.id)
        .gte("data_bonificacao", iniDate)
        .lte("data_bonificacao", fimDate)
        .order("data_bonificacao", { ascending: false });
      if (error) { toast.error("Erro ao carregar bonificações."); throw error; }
      return (data ?? []).map((r: any) => ({ ...r, valor: Number(r.valor) }));
    },
    enabled: !!user?.id,
  });

  const { data: acumulado, isLoading: loadingAcum } = useQuery<number>({
    queryKey: ["minhas-bonificacoes-acumulado", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { data, error } = await (supabase as any)
        .from("bonificacoes")
        .select("valor")
        .eq("vendedor_id", user.id);
      if (error) throw error;
      return (data ?? []).reduce((s: number, r: any) => s + Number(r.valor), 0);
    },
    enabled: !!user?.id,
  });

  const totalMes = useMemo(() => bonificacoesMes.reduce((s, b) => s + b.valor, 0), [bonificacoesMes]);
  const nomeMes = MESES[mes - 1] ?? "";

  const nomeCliente = (b: Bonificacao) =>
    b.clientes?.nome_parceiro || b.clientes?.razao_social || b.cliente_nome || "—";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gift className="h-6 w-6" /> Minhas Bonificações
        </h1>
        <p className="text-sm text-muted-foreground">
          Bonificações concedidas pela gestão — não compõem metas ou comissões
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Período:</span>
        <Input
          type="month"
          value={filtroMes}
          onChange={(e) => setFiltroMes(e.target.value)}
          className="w-40"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Bonificações em {nomeMes}/{anoStr}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingMes ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <div>
                <p className="text-2xl font-bold">{formatBRL(totalMes)}</p>
                <p className="text-xs text-muted-foreground mt-1">{bonificacoesMes.length} registro(s)</p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Acumulado</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAcum ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <p className="text-2xl font-bold text-green-700">{formatBRL(acumulado ?? 0)}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Bonificações em {nomeMes}/{anoStr}
            {!loadingMes && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({bonificacoesMes.length} registros)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingMes ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : bonificacoesMes.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-muted-foreground gap-2">
              <Gift className="h-8 w-8 opacity-40" />
              <p className="text-sm">Nenhuma bonificação neste período</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Nº Pedido</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bonificacoesMes.map((b) => {
                    const badge = STATUS_BADGE[b.status] ?? STATUS_BADGE.pendente;
                    return (
                      <TableRow key={b.id} className="text-sm">
                        <TableCell>{formatDate(b.data_bonificacao)}</TableCell>
                        <TableCell className="max-w-48 truncate">{nomeCliente(b)}</TableCell>
                        <TableCell className="font-mono">{b.numero_pedido ?? "—"}</TableCell>
                        <TableCell className="text-right font-medium">{formatBRL(b.valor)}</TableCell>
                        <TableCell className="max-w-40 truncate text-muted-foreground">
                          {b.motivo ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={badge.className}>
                            {badge.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
