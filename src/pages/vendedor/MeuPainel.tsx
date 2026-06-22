import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Target, ShoppingBag, Users, Award } from "lucide-react";

// ─── tipos ───────────────────────────────────────────────────────────────────
interface PainelVendedor {
  meta_mes: number | null;
  realizado_mes: number | null;
  pedidos_mes: number | null;
  clientes_ativos: number | null;
}

interface CampanhaAtiva {
  id: string;
  nome: string;
  descricao: string | null;
  data_inicio: string;
  data_fim: string;
  meta_global: number | null;
}

interface MetaCampanha {
  marca: string;
  meta_valor: number;
  realizado: number;
}

// ─── constante de marcas ──────────────────────────────────────────────────────
const MARCAS_ORDEM = [
  "Bravir",
  "Alivik",
  "Bendita Cânfora",
  "Laby",
  "Tattoo do Bem",
];

// ─── helpers ─────────────────────────────────────────────────────────────────
function pct(realizado: number, meta: number): number {
  if (!meta || meta <= 0) return 0;
  return Math.min(100, Math.round((realizado / meta) * 100));
}

function corProgresso(pct: number): string {
  if (pct >= 100) return "bg-green-500";
  if (pct >= 70) return "bg-yellow-500";
  return "bg-red-500";
}

// ─── sub‑componente: card de marca ───────────────────────────────────────────
function CardMarca({ marca, meta_valor, realizado }: MetaCampanha) {
  const p = pct(realizado, meta_valor);
  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm text-foreground">{marca}</span>
        <Badge
          variant={p >= 100 ? "default" : p >= 70 ? "secondary" : "destructive"}
          className="text-xs"
        >
          {p}%
        </Badge>
      </div>

      <Progress
        value={p}
        className="h-2"
      />

      <div className="grid grid-cols-2 gap-2 mt-1">
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Meta</span>
          <span className="text-sm font-medium">{formatCurrency(meta_valor)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Realizado</span>
          <span className="text-sm font-medium">{formatCurrency(realizado)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── página principal ─────────────────────────────────────────────────────────
export default function MeuPainel() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // painel geral do vendedor (RPC)
  const { data: painel, isLoading: loadingPainel } = useQuery<PainelVendedor>({
    queryKey: ["painel-vendedor", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_painel_vendedor", {
        p_vendedor_id: user!.id,
      });
      if (error) throw error;
      return (data as PainelVendedor[])[0] ?? {};
    },
  });

  // campanha ativa
  const { data: campanha, isLoading: loadingCampanha } = useQuery<CampanhaAtiva | null>({
    queryKey: ["campanha-ativa"],
    queryFn: async () => {
      const hoje = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("campanhas")
        .select("id, nome, descricao, data_inicio, data_fim, meta_global")
        .lte("data_inicio", hoje)
        .gte("data_fim", hoje)
        .eq("ativa", true)
        .order("data_inicio", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // metas por marca da campanha para o vendedor
  const { data: metasMarca = [], isLoading: loadingMetas } = useQuery<MetaCampanha[]>({
    queryKey: ["campanha-metas-marca", campanha?.id, user?.id],
    enabled: !!campanha?.id && !!user?.id,
    queryFn: async () => {
      // Busca metas por marca cadastradas na campanha para o vendedor
      const { data: metas, error: erMetas } = await supabase
        .from("campanha_metas")
        .select("marca, meta_valor")
        .eq("campanha_id", campanha!.id)
        .eq("vendedor_id", user!.id);
      if (erMetas) throw erMetas;

      if (!metas || metas.length === 0) return [];

      // Busca realizado por marca no período da campanha
      const { data: fats, error: erFats } = await supabase
        .from("faturamentos")
        .select("marca, valor_total")
        .eq("vendedor_id", user!.id)
        .gte("data_faturamento", campanha!.data_inicio)
        .lte("data_faturamento", campanha!.data_fim);
      if (erFats) throw erFats;

      // Agrupa realizado por marca
      const realizadoMap: Record<string, number> = {};
      for (const f of fats ?? []) {
        if (f.marca) {
          realizadoMap[f.marca] = (realizadoMap[f.marca] ?? 0) + (f.valor_total ?? 0);
        }
      }

      // Monta lista final apenas com marcas que têm meta ou realizado > 0
      const resultado: MetaCampanha[] = [];
      for (const m of metas) {
        const realizado = realizadoMap[m.marca] ?? 0;
        resultado.push({
          marca: m.marca,
          meta_valor: m.meta_valor ?? 0,
          realizado,
        });
      }

      // Adiciona marcas com realizado mas sem meta cadastrada
      for (const marca of Object.keys(realizadoMap)) {
        if (!resultado.find((r) => r.marca === marca)) {
          resultado.push({ marca, meta_valor: 0, realizado: realizadoMap[marca] });
        }
      }

      // Filtra apenas marcas que possuem vendas (realizado > 0) ou meta definida
      return resultado
        .filter((r) => r.realizado > 0 || r.meta_valor > 0)
        .sort(
          (a, b) =>
            MARCAS_ORDEM.indexOf(a.marca) - MARCAS_ORDEM.indexOf(b.marca)
        );
    },
  });

  const loadingGeral = loadingPainel || loadingCampanha;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      {/* ── cabeçalho ── */}
      <div>
        <h1 className="text-2xl font-bold">Meu Painel</h1>
        <p className="text-muted-foreground text-sm">Acompanhe seu desempenho e metas.</p>
      </div>

      {/* ── cards de resumo ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {loadingGeral ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))
        ) : (
          <>
            <Card>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                  <Target className="w-3 h-3" /> Meta do Mês
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-lg font-bold">
                  {formatCurrency(painel?.meta_mes ?? 0)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Realizado
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-lg font-bold">
                  {formatCurrency(painel?.realizado_mes ?? 0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {pct(painel?.realizado_mes ?? 0, painel?.meta_mes ?? 0)}% da meta
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                  <ShoppingBag className="w-3 h-3" /> Pedidos
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-lg font-bold">{painel?.pedidos_mes ?? 0}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="w-3 h-3" /> Clientes Ativos
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-lg font-bold">{painel?.clientes_ativos ?? 0}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* ── campanha ativa ── */}
      {loadingCampanha ? (
        <Skeleton className="h-48 rounded-lg" />
      ) : campanha ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold">{campanha.nome}</h2>
            <Badge variant="outline" className="text-xs">
              Campanha Ativa
            </Badge>
          </div>

          {campanha.descricao && (
            <p className="text-sm text-muted-foreground">{campanha.descricao}</p>
          )}

          <p className="text-xs text-muted-foreground">
            {new Date(campanha.data_inicio + "T00:00:00").toLocaleDateString("pt-BR")} →{" "}
            {new Date(campanha.data_fim + "T00:00:00").toLocaleDateString("pt-BR")}
          </p>

          {/* cards por marca */}
          {loadingMetas ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-lg" />
              ))}
            </div>
          ) : metasMarca.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {metasMarca.map((m) => (
                <CardMarca key={m.marca} {...m} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma venda registrada nesta campanha ainda.
            </p>
          )}

          {/* total geral da campanha */}
          {metasMarca.length > 0 && (() => {
            const totalMeta = metasMarca.reduce((s, m) => s + m.meta_valor, 0);
            const totalReal = metasMarca.reduce((s, m) => s + m.realizado, 0);
            const totalPct = pct(totalReal, totalMeta);
            return (
              <div className="rounded-lg border bg-muted/40 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-1">
                <div className="flex flex-col gap-1 flex-1">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Total da Campanha
                  </span>
                  <Progress value={totalPct} className="h-2" />
                </div>
                <div className="flex gap-6 text-sm">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Meta</span>
                    <span className="font-semibold">{formatCurrency(totalMeta)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Realizado</span>
                    <span className="font-semibold">{formatCurrency(totalReal)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Atingido</span>
                    <Badge
                      variant={totalPct >= 100 ? "default" : totalPct >= 70 ? "secondary" : "destructive"}
                      className="text-xs w-fit"
                    >
                      {totalPct}%
                    </Badge>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      ) : null}
    </div>
  );
}
