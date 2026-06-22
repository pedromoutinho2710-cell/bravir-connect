import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import { startOfMonth, endOfMonth, subMonths, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { TrendingUp, Users, Package, Tag } from "lucide-react";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface PainelRow {
  pedido_id: string;
  pedido_data: string;
  pedido_status: string;
  cliente_id: string;
  cliente_nome: string;
  item_sku: string;
  item_marca: string;
  item_descricao: string;
  item_total: number;
}

interface MesHistorico {
  mes: string;        // "Jan", "Fev", …
  mesLabel: string;   // "Janeiro/2025"
  total: number;
}

interface TopCliente {
  cliente_id: string;
  cliente_nome: string;
  total: number;
}

interface EntradaMarca {
  marca: string;
  total: number;
}

interface TopSku {
  sku: string;
  descricao: string;
  total: number;
}

// ---------------------------------------------------------------------------
// Helpers de intervalo (3 meses fechados)
// ---------------------------------------------------------------------------
function buildIntervalo() {
  const hoje = new Date();
  // mês atual + 2 meses anteriores
  const inicio = startOfMonth(subMonths(hoje, 2));
  const fim = endOfMonth(hoje);
  return {
    inicio: format(inicio, "yyyy-MM-dd"),
    fim: format(fim, "yyyy-MM-dd"),
  };
}

function labelMes(dataStr: string) {
  const d = parseISO(dataStr);
  return {
    curto: format(d, "MMM", { locale: ptBR }),
    longo: format(d, "MMMM/yyyy", { locale: ptBR }),
    chave: format(d, "yyyy-MM"),
  };
}

// ---------------------------------------------------------------------------
// Agregações client-side (uma única passagem sobre os dados)
// ---------------------------------------------------------------------------
function agregar(rows: PainelRow[]) {
  const porMes = new Map<string, { curto: string; longo: string; total: number }>();
  const porCliente = new Map<string, { nome: string; total: number }>();
  const porMarca = new Map<string, number>();
  const porSku = new Map<string, { descricao: string; total: number }>();

  for (const row of rows) {
    const valor = Number(row.item_total) || 0;
    const { curto, longo, chave } = labelMes(row.pedido_data);

    // Histórico mensal
    const m = porMes.get(chave) ?? { curto, longo, total: 0 };
    m.total += valor;
    porMes.set(chave, m);

    // Top clientes
    const c = porCliente.get(row.cliente_id) ?? { nome: row.cliente_nome, total: 0 };
    c.total += valor;
    porCliente.set(row.cliente_id, c);

    // Entrada por marca
    porMarca.set(row.item_marca, (porMarca.get(row.item_marca) ?? 0) + valor);

    // Top SKUs
    const s = porSku.get(row.item_sku) ?? { descricao: row.item_descricao, total: 0 };
    s.total += valor;
    porSku.set(row.item_sku, s);
  }

  // Garante que os 3 meses apareçam mesmo sem dados
  const hoje = new Date();
  for (let i = 2; i >= 0; i--) {
    const d = subMonths(hoje, i);
    const chave = format(d, "yyyy-MM");
    if (!porMes.has(chave)) {
      porMes.set(chave, {
        curto: format(d, "MMM", { locale: ptBR }),
        longo: format(d, "MMMM/yyyy", { locale: ptBR }),
        total: 0,
      });
    }
  }

  const historicoMeses: MesHistorico[] = Array.from(porMes.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({ mes: v.curto, mesLabel: v.longo, total: v.total }));

  const topClientes: TopCliente[] = Array.from(porCliente.entries())
    .map(([id, v]) => ({ cliente_id: id, cliente_nome: v.nome, total: v.total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const entradaMarca: EntradaMarca[] = Array.from(porMarca.entries())
    .map(([marca, total]) => ({ marca: marca || "Sem marca", total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const topSkus: TopSku[] = Array.from(porSku.entries())
    .map(([sku, v]) => ({ sku, descricao: v.descricao, total: v.total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const totalGeral = historicoMeses.reduce((acc, m) => acc + m.total, 0);

  return { historicoMeses, topClientes, entradaMarca, topSkus, totalGeral };
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------
export default function MeuPainel() {
  const { user } = useAuth();
  const { impersonatedUser } = useImpersonation();
  const vendedorId = impersonatedUser?.id ?? user?.id;

  const { inicio, fim } = useMemo(() => buildIntervalo(), []);

  // -------------------------------------------------------------------------
  // ÚNICA query para o intervalo completo
  // -------------------------------------------------------------------------
  const { data: rows = [], isLoading } = useQuery<PainelRow[]>({
    queryKey: ["painel-vendedor", vendedorId, inicio, fim],
    enabled: !!vendedorId,
    staleTime: 5 * 60 * 1000, // 5 min
    queryFn: async () => {
      const { data, error } = await supabase.rpc("painel_vendedor_consolidado", {
        p_vendedor_id: vendedorId,
        p_inicio: inicio,
        p_fim: fim,
      });
      if (error) throw error;
      return (data ?? []) as PainelRow[];
    },
  });

  // -------------------------------------------------------------------------
  // Agregação client-side (memoizada)
  // -------------------------------------------------------------------------
  const { historicoMeses, topClientes, entradaMarca, topSkus, totalGeral } =
    useMemo(() => agregar(rows), [rows]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-2">
        <TrendingUp className="text-primary" />
        <h1 className="text-2xl font-bold">Meu Painel</h1>
      </div>

      {/* KPI total */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total nos últimos 3 meses
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-primary">{formatCurrency(totalGeral)}</p>
        </CardContent>
      </Card>

      {/* Histórico mensal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp size={18} />
            Histórico Mensal
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historicoMeses.every((m) => m.total === 0) ? (
            <p className="text-sm text-muted-foreground">Sem pedidos no período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={historicoMeses}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis tickFormatter={(v) => formatCurrency(v)} width={90} />
                <Tooltip
                  formatter={(v: number) => formatCurrency(v)}
                  labelFormatter={(label, payload) =>
                    payload?.[0]
                      ? (payload[0].payload as MesHistorico).mesLabel
                      : label
                  }
                />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Clientes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users size={18} />
              Top 5 Clientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topClientes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados no período.</p>
            ) : (
              <ul className="space-y-2">
                {topClientes.map((c) => (
                  <li key={c.cliente_id} className="flex justify-between items-center text-sm">
                    <span className="truncate max-w-[60%]" title={c.cliente_nome}>
                      {c.cliente_nome}
                    </span>
                    <span className="font-semibold text-primary">
                      {formatCurrency(c.total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Entrada por Marca */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag size={18} />
              Entrada por Marca
            </CardTitle>
          </CardHeader>
          <CardContent>
            {entradaMarca.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={entradaMarca} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} width={80} />
                  <YAxis type="category" dataKey="marca" width={80} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top SKUs */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package size={18} />
              Top 5 SKUs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topSkus.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados no período.</p>
            ) : (
              <ul className="space-y-2">
                {topSkus.map((s) => (
                  <li key={s.sku} className="flex justify-between items-center text-sm">
                    <span className="truncate max-w-[70%]" title={`${s.sku} – ${s.descricao}`}>
                      <span className="font-mono text-xs bg-muted px-1 rounded mr-2">{s.sku}</span>
                      {s.descricao}
                    </span>
                    <span className="font-semibold text-primary">
                      {formatCurrency(s.total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
