import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Target, TrendingUp, ShoppingBag, Globe, Tag } from "lucide-react";

// ─── tipos ────────────────────────────────────────────────────────────────────
interface MetaRow {
  canal: string | null;
  marca: string | null;
  meta_valor: number;
}

interface FaturamentoRow {
  marca: string | null;
  valor_total: number;
}

interface MetaCanal {
  label: string;
  key: string;
  icon: React.ElementType;
  color: string;
}

// ─── constantes ───────────────────────────────────────────────────────────────
const CANAIS: MetaCanal[] = [
  { label: "B2B", key: "b2b", icon: ShoppingBag, color: "bg-blue-500" },
  { label: "Online", key: "online", icon: Globe, color: "bg-emerald-500" },
  { label: "Marca Própria", key: "marca_propria", icon: Tag, color: "bg-violet-500" },
];

const CANAL_NORMALIZE: Record<string, string> = {
  b2b: "b2b",
  online: "online",
  "marca própria": "marca_propria",
  marca_propria: "marca_propria",
};

// ─── helpers ──────────────────────────────────────────────────────────────────
function pct(realizado: number, meta: number): number {
  if (!meta) return 0;
  return Math.min(Math.round((realizado / meta) * 100), 100);
}

// ─── sub-componentes ──────────────────────────────────────────────────────────
function CardMetaTotal({
  meta,
  realizado,
  loading,
}: {
  meta: number;
  realizado: number;
  loading: boolean;
}) {
  const atingimento = pct(realizado, meta);

  return (
    <Card className="border-0 shadow-lg bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold opacity-90">
          <Target className="h-5 w-5" />
          Meta Total da Campanha
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-48 bg-primary-foreground/20" />
            <Skeleton className="h-4 w-32 bg-primary-foreground/20" />
          </div>
        ) : (
          <>
            <p className="text-4xl font-bold tracking-tight">
              {formatCurrency(meta)}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <Progress
                value={atingimento}
                className="flex-1 h-3 bg-primary-foreground/30 [&>div]:bg-primary-foreground"
              />
              <span className="text-sm font-semibold whitespace-nowrap">
                {atingimento}% atingido
              </span>
            </div>
            <p className="mt-1 text-sm opacity-80">
              Realizado: {formatCurrency(realizado)}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CardMetaCanal({
  canal,
  meta,
  realizado,
  loading,
}: {
  canal: MetaCanal;
  meta: number;
  realizado: number;
  loading: boolean;
}) {
  const atingimento = pct(realizado, meta);
  const Icon = canal.icon;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Icon className="h-4 w-4" />
          {canal.label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-3 w-full" />
          </div>
        ) : (
          <>
            <p className="text-2xl font-bold">{formatCurrency(meta)}</p>
            <div className="mt-2 flex items-center gap-2">
              <Progress value={atingimento} className="flex-1 h-2" />
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                {atingimento}%
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Realizado: {formatCurrency(realizado)}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface GraficoMarcaItem {
  marca: string;
  Meta: number;
  Realizado: number;
}

function GraficoMetaVsRealizadoMarca({
  data,
  loading,
}: {
  data: GraficoMarcaItem[];
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-5 w-5 text-primary" />
          Meta vs Realizado por Marca
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-64 w-full" />
          </div>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Nenhum dado disponível.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={data}
              margin={{ top: 8, right: 16, left: 16, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="marca"
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
              />
              <YAxis
                tickFormatter={(v) =>
                  new Intl.NumberFormat("pt-BR", {
                    notation: "compact",
                    style: "currency",
                    currency: "BRL",
                    maximumFractionDigits: 1,
                  }).format(v)
                }
                tick={{ fontSize: 11 }}
                width={80}
              />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                labelClassName="font-semibold"
              />
              <Legend />
              <Bar dataKey="Meta" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Realizado" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ─── página principal ─────────────────────────────────────────────────────────
export default function VisaoMacro() {
  // Metas cadastradas (por canal e por marca)
  const { data: metas = [], isLoading: loadingMetas } = useQuery<MetaRow[]>({
    queryKey: ["visao-macro-metas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("metas")
        .select("canal, marca, meta_valor")
        .order("marca");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Faturamentos realizados (consolidado geral)
  const { data: faturamentos = [], isLoading: loadingFat } = useQuery<
    FaturamentoRow[]
  >({
    queryKey: ["visao-macro-faturamentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faturamentos")
        .select("marca, valor_total")
        .eq("status", "faturado");
      if (error) throw error;
      return data ?? [];
    },
  });

  const loading = loadingMetas || loadingFat;

  // ── agregações ──────────────────────────────────────────────────────────────
  const metaTotal = metas.reduce((acc, m) => acc + (m.meta_valor ?? 0), 0);
  const realizadoTotal = faturamentos.reduce(
    (acc, f) => acc + (f.valor_total ?? 0),
    0
  );

  // Meta por canal
  const metaPorCanal: Record<string, number> = {};
  for (const m of metas) {
    const key = CANAL_NORMALIZE[(m.canal ?? "").toLowerCase()] ?? (m.canal ?? "outro");
    metaPorCanal[key] = (metaPorCanal[key] ?? 0) + (m.meta_valor ?? 0);
  }

  // Realizado por canal — faturamentos não costumam ter canal, então usamos
  // proporção da meta para estimar (fallback: 0 se sem dados de canal no fat.)
  // Se a tabela faturamentos tiver coluna canal, trocar pelo código real abaixo:
  const realizadoPorCanal: Record<string, number> = {};
  for (const canal of CANAIS) {
    // tentativa de somar faturamentos com coluna canal (se existir)
    const canalMeta = metaPorCanal[canal.key] ?? 0;
    // proporção aproximada: realizado_total * (meta_canal / meta_total)
    realizadoPorCanal[canal.key] =
      metaTotal > 0 ? (canalMeta / metaTotal) * realizadoTotal : 0;
  }

  // Gráfico por marca
  const marcas = Array.from(
    new Set([
      ...metas.map((m) => m.marca ?? "Sem Marca"),
      ...faturamentos.map((f) => f.marca ?? "Sem Marca"),
    ])
  );

  const metaPorMarca: Record<string, number> = {};
  for (const m of metas) {
    const key = m.marca ?? "Sem Marca";
    metaPorMarca[key] = (metaPorMarca[key] ?? 0) + (m.meta_valor ?? 0);
  }

  const realizadoPorMarca: Record<string, number> = {};
  for (const f of faturamentos) {
    const key = f.marca ?? "Sem Marca";
    realizadoPorMarca[key] = (realizadoPorMarca[key] ?? 0) + (f.valor_total ?? 0);
  }

  const graficoData: GraficoMarcaItem[] = marcas
    .filter((m) => (metaPorMarca[m] ?? 0) > 0 || (realizadoPorMarca[m] ?? 0) > 0)
    .map((m) => ({
      marca: m,
      Meta: metaPorMarca[m] ?? 0,
      Realizado: realizadoPorMarca[m] ?? 0,
    }))
    .sort((a, b) => b.Meta - a.Meta);

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Visão Macro</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Consolidado geral de metas e faturamento da campanha.
        </p>
      </div>

      {/* Card Meta Total */}
      <CardMetaTotal
        meta={metaTotal}
        realizado={realizadoTotal}
        loading={loading}
      />

      {/* Cards por Canal */}
      <div>
        <h2 className="text-base font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
          Meta por Canal
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {CANAIS.map((canal) => (
            <CardMetaCanal
              key={canal.key}
              canal={canal}
              meta={metaPorCanal[canal.key] ?? 0}
              realizado={realizadoPorCanal[canal.key] ?? 0}
              loading={loading}
            />
          ))}
        </div>
      </div>

      {/* Gráfico Meta vs Realizado por Marca */}
      <div>
        <h2 className="text-base font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
          Desempenho por Marca
        </h2>
        <GraficoMetaVsRealizadoMarca data={graficoData} loading={loading} />
      </div>
    </div>
  );
}
