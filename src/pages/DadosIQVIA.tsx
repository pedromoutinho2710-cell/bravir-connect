import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MESES, MESES_ABREV, formatBRL } from "@/lib/format";
import { TrendingUp, ChevronDown } from "lucide-react";

// ──────────────────────────────────────────────────────────────────────────
// Tipos e utilitários
// ──────────────────────────────────────────────────────────────────────────

const ANOS = [2024, 2025, 2026] as const;
const REGIOES = ["Todas", "Sudeste", "Nordeste", "Sul", "Centro-Oeste", "Norte"];

const VERDE = "#16a34a";
const VERMELHO = "#dc2626";

// Linhas de mercado (marca × ano × mês × região) — usadas em Alivik/Laby.
type MarketRow = { m: string; a: number; mi: number; r: string; u: number; f: number };
// Linhas da própria marca por UF (ano × mês × UF × região).
type OwnUFRow = { a: number; mi: number; uf: string; r: string; u: number; f: number };
// Linhas da Bendita (apresentação × ano × mês × UF × região).
type BenRow = { p: string; a: number; mi: number; uf: string; r: string; u: number; f: number };

type IqviaData = {
  alivik: { own: string; market: MarketRow[]; ownUF: OwnUFRow[] };
  laby: { own: string; market: MarketRow[]; ownUF: OwnUFRow[] };
  bendita: { own: string; rows: BenRow[] };
  geradoEm: string;
};

type Agg = { key: string; label: string; u: Record<number, number>; f: Record<number, number> };

// Remove acentos + uppercase + trim.
const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();

// Normalização com colapso de espaços — para casar apresentações ("28.0 G  X 128").
const normWs = (s: unknown) => norm(s).replace(/\s+/g, " ");

const fmtInt = (n: number) => Math.round(Number.isFinite(n) ? n : 0).toLocaleString("pt-BR");

// Crescimento percentual; null quando não há base de comparação.
const cresc = (cur: number, prev: number): number | null =>
  prev > 0 ? ((cur - prev) / prev) * 100 : null;

// Agregação genérica por chave, somando unidades e faturamento por ano.
function aggBy<T extends { a: number; u: number; f: number }>(
  rows: T[],
  keyFn: (r: T) => string,
  labelFn: (r: T) => string,
): Agg[] {
  const map = new Map<string, Agg>();
  for (const r of rows) {
    const k = keyFn(r);
    let e = map.get(k);
    if (!e) {
      e = { key: k, label: labelFn(r), u: {}, f: {} };
      map.set(k, e);
    }
    e.u[r.a] = (e.u[r.a] || 0) + r.u;
    e.f[r.a] = (e.f[r.a] || 0) + r.f;
  }
  return [...map.values()];
}

// ──────────────────────────────────────────────────────────────────────────
// Bendita — as 4 apresentações que entram no painel (normalizadas)
// ──────────────────────────────────────────────────────────────────────────

const BENDITA_APRES = [
  "BENDITA CANFORA SPRAY 100.0 ML X 1",
  "BENDITA CANFORA TABLETES 0.75 G X 200",
  "BENDITA CANFORA TABLETES 0.75 G X 30",
  "BENDITA CANFORA TABLETES 28.0 G X 128",
].map(normWs);

const prettyApres = (p: string) => p.replace(/^BENDITA CANFORA\s*/i, "").replace(/\s+/g, " ").trim();

// ──────────────────────────────────────────────────────────────────────────
// Identidade visual por marca
// ──────────────────────────────────────────────────────────────────────────

type BrandKey = "alivik" | "laby" | "bendita";

interface BrandTheme {
  key: BrandKey;
  label: string;
  tags: string[];
  dark: string; // header / linha 2026
  medium: string; // linha 2025
  light: string; // linha 2024 (tracejado)
  tagBg: string;
  tagFg: string;
  rowHighlight: string;
  palette: string[]; // tons p/ pizza de regiões
}

const BRANDS: Record<BrandKey, BrandTheme> = {
  alivik: {
    key: "alivik",
    label: "Alivik",
    tags: ["Dor e febre", "Gripes e resfriados", "Inalador", "Pomada"],
    dark: "#1a3668",
    medium: "#378ADD",
    light: "#B5D4F4",
    tagBg: "#e8edf5",
    tagFg: "#1a3668",
    rowHighlight: "#eaf1fb",
    palette: ["#1a3668", "#378ADD", "#6BA7E5", "#90b4dd", "#B5D4F4"],
  },
  laby: {
    key: "laby",
    label: "Laby",
    tags: ["Cuidados labiais", "Proteção solar"],
    dark: "#7c6bb0",
    medium: "#9b8dc4",
    light: "#d4cce8",
    tagBg: "#ede9f7",
    tagFg: "#6a57a8",
    rowHighlight: "#f1edfa",
    palette: ["#7c6bb0", "#9b8dc4", "#b9aed7", "#cabfe0", "#d4cce8"],
  },
  bendita: {
    key: "bendita",
    label: "Bendita Cânfora",
    tags: ["Bendita Cânfora", "Spray", "Tabletes"],
    dark: "#1a5c2a",
    medium: "#3d8b52",
    light: "#a8d8b2",
    tagBg: "#e2f0e6",
    tagFg: "#1a5c2a",
    rowHighlight: "#e9f4ec",
    palette: ["#1a5c2a", "#3d8b52", "#6bae7d", "#8cc69a", "#a8d8b2"],
  },
};

const BRAND_ORDER: BrandKey[] = ["alivik", "laby", "bendita"];

// ──────────────────────────────────────────────────────────────────────────
// Série mensal de faturamento por ano (3 linhas)
// ──────────────────────────────────────────────────────────────────────────

function buildMonthly(rows: { a: number; mi: number; f: number }[], modo: "compact" | "full") {
  const comDados = [...new Set(rows.filter((r) => r.mi >= 0).map((r) => r.mi))].sort((a, b) => a - b);
  const meses = modo === "compact" ? comDados : Array.from({ length: 12 }, (_, i) => i);
  return meses.map((mi) => {
    const linha: Record<string, number | string | null> = { mes: MESES_ABREV[mi] ?? String(mi) };
    for (const ano of ANOS) {
      const doMes = rows.filter((r) => r.a === ano && r.mi === mi);
      linha[String(ano)] = doMes.length ? doMes.reduce((a, r) => a + r.f, 0) : null;
    }
    return linha;
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Componentes de apresentação reutilizáveis
// ──────────────────────────────────────────────────────────────────────────

function Pct({ v }: { v: number | null }) {
  if (v === null || !Number.isFinite(v)) return <span className="text-muted-foreground">—</span>;
  const pos = v >= 0;
  return (
    <span className={pos ? "text-emerald-600" : "text-red-600"}>
      {pos ? "+" : ""}
      {v.toFixed(1)}%
    </span>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold leading-tight" style={accent ? { color: accent } : undefined}>
          {value}
        </p>
        {sub != null && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ToggleLinha({
  modo,
  setModo,
}: {
  modo: "compact" | "full";
  setModo: (m: "compact" | "full") => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border text-xs">
      <button
        type="button"
        onClick={() => setModo("compact")}
        className={`px-3 py-1 ${modo === "compact" ? "bg-muted font-medium" : "bg-background text-muted-foreground"}`}
      >
        Meses com dados
      </button>
      <button
        type="button"
        onClick={() => setModo("full")}
        className={`px-3 py-1 ${modo === "full" ? "bg-muted font-medium" : "bg-background text-muted-foreground"}`}
      >
        Ano completo
      </button>
    </div>
  );
}

// Seletor múltiplo genérico (meses / estados) com checkboxes em popover.
function MultiCheck({
  triggerLabel,
  items,
  selected,
  onToggle,
  onSelectAll,
  onClear,
  width = "w-[260px]",
}: {
  triggerLabel: React.ReactNode;
  items: { value: string; label: string }[];
  selected: Set<string>;
  onToggle: (v: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  width?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="justify-between gap-2 font-normal">
          {triggerLabel}
          <ChevronDown className="h-4 w-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={`${width} p-0`} align="start">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={onSelectAll}>
            Selecionar todos
          </button>
          <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={onClear}>
            Limpar
          </button>
        </div>
        <ScrollArea className="max-h-64">
          <div className="p-1">
            {items.map((it) => (
              <label
                key={it.value}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox checked={selected.has(it.value)} onCheckedChange={() => onToggle(it.value)} />
                <span>{it.label}</span>
              </label>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// Gráfico de linha mensal — reutilizado por todas as marcas.
function GraficoMensal({
  rows,
  theme,
}: {
  rows: { a: number; mi: number; f: number }[];
  theme: BrandTheme;
}) {
  const [modo, setModo] = useState<"compact" | "full">("compact");
  const data = useMemo(() => buildMonthly(rows, modo), [rows, modo]);
  return (
    <Panel title="Faturamento mensal" action={<ToggleLinha modo={modo} setModo={setModo} />}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtInt(Number(v))} width={70} />
          <Tooltip formatter={(v: number) => formatBRL(Number(v))} />
          <Legend />
          <Line type="monotone" dataKey="2024" name="2024" stroke={theme.light} strokeWidth={2} strokeDasharray="6 4" connectNulls={false} dot={false} />
          <Line type="monotone" dataKey="2025" name="2025" stroke={theme.medium} strokeWidth={2} connectNulls={false} dot={false} />
          <Line type="monotone" dataKey="2026" name="2026" stroke={theme.dark} strokeWidth={3} connectNulls={false} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </Panel>
  );
}

// Gráfico + tabela de faturamento por UF, com seletor de estados.
function PainelUF({
  ufAgg,
  theme,
  ufOptions,
  selUFs,
  onToggleUF,
  onSelectAllUF,
  onClearUF,
}: {
  ufAgg: Agg[];
  theme: BrandTheme;
  ufOptions: string[];
  selUFs: Set<string>;
  onToggleUF: (uf: string) => void;
  onSelectAllUF: () => void;
  onClearUF: () => void;
}) {
  const [verTodos, setVerTodos] = useState(false);
  const chartData = ufAgg
    .map((u) => ({ uf: u.label, fat: u.f[2026] || 0 }))
    .filter((d) => d.fat > 0)
    .sort((a, b) => b.fat - a.fat);
  const ufVisiveis = verTodos ? ufAgg : ufAgg.slice(0, 5);

  const selectorLabel =
    selUFs.size === 0 ? "Todos os estados" : `${selUFs.size} estado${selUFs.size > 1 ? "s" : ""}`;
  const selector = (
    <MultiCheck
      triggerLabel={selectorLabel}
      items={ufOptions.map((uf) => ({ value: uf, label: uf }))}
      selected={selUFs}
      onToggle={onToggleUF}
      onSelectAll={onSelectAllUF}
      onClear={onClearUF}
      width="w-[220px]"
    />
  );

  return (
    <div className="space-y-6">
      <Panel title="Faturamento por UF (2026)" action={selector}>
        {chartData.length ? (
          <ResponsiveContainer width="100%" height={Math.max(240, chartData.length * 26)}>
            <BarChart layout="vertical" data={chartData} margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtInt(Number(v))} />
              <YAxis type="category" dataKey="uf" width={48} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => formatBRL(Number(v))} />
              <Bar dataKey="fat" fill={theme.dark} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Sem dados de UF para os filtros.</p>
        )}
      </Panel>

      <Panel
        title="Detalhe por UF"
        action={
          ufAgg.length > 5 ? (
            <Button variant="ghost" size="sm" onClick={() => setVerTodos((v) => !v)}>
              {verTodos ? "Ver top 5" : `Ver todos os ${ufAgg.length} estados`}
            </Button>
          ) : undefined
        }
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>UF</TableHead>
                <TableHead className="text-right">Fat 2024</TableHead>
                <TableHead className="text-right">Fat 2025</TableHead>
                <TableHead className="text-right">%25v24</TableHead>
                <TableHead className="text-right">Fat 2026</TableHead>
                <TableHead className="text-right">%26v25</TableHead>
                <TableHead className="text-right">Unid 2025</TableHead>
                <TableHead className="text-right">Unid 2026</TableHead>
                <TableHead className="text-right">%26v25</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ufVisiveis.map((u) => (
                <TableRow key={u.key}>
                  <TableCell className="font-medium">{u.label}</TableCell>
                  <TableCell className="text-right">{formatBRL(u.f[2024] || 0)}</TableCell>
                  <TableCell className="text-right">{formatBRL(u.f[2025] || 0)}</TableCell>
                  <TableCell className="text-right"><Pct v={cresc(u.f[2025] || 0, u.f[2024] || 0)} /></TableCell>
                  <TableCell className="text-right">{formatBRL(u.f[2026] || 0)}</TableCell>
                  <TableCell className="text-right"><Pct v={cresc(u.f[2026] || 0, u.f[2025] || 0)} /></TableCell>
                  <TableCell className="text-right">{fmtInt(u.u[2025] || 0)}</TableCell>
                  <TableCell className="text-right">{fmtInt(u.u[2026] || 0)}</TableCell>
                  <TableCell className="text-right"><Pct v={cresc(u.u[2026] || 0, u.u[2025] || 0)} /></TableCell>
                </TableRow>
              ))}
              {!ufVisiveis.length && (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                    Sem dados por UF.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Visão de mercado (Alivik / Laby)
// ──────────────────────────────────────────────────────────────────────────

function MercadoView({
  theme,
  market,
  ownUF,
  ownName,
  months,
  regiao,
  selUFs,
  onToggleUF,
  onSelectAllUF,
  onClearUF,
}: {
  theme: BrandTheme;
  market: MarketRow[];
  ownUF: OwnUFRow[];
  ownName: string;
  months: Set<number>;
  regiao: string;
  selUFs: Set<string>;
  onToggleUF: (uf: string) => void;
  onSelectAllUF: () => void;
  onClearUF: () => void;
}) {
  const [verTodasMarcas, setVerTodasMarcas] = useState(false);
  const ownN = norm(ownName);
  const inReg = useCallback((r: string) => regiao === "Todas" || r === regiao, [regiao]);

  // Fatia de mercado (mês + região) — KPIs, ranking de marcas, crescimento.
  const mSliced = useMemo(
    () => market.filter((r) => months.has(r.mi) && inReg(r.r)),
    [market, months, inReg],
  );
  const marcas = useMemo(() => aggBy(mSliced, (r) => norm(r.m), (r) => r.m), [mSliced]);
  const own = marcas.find((m) => m.key === ownN);

  const totF = (ano: number) => marcas.reduce((a, m) => a + (m.f[ano] || 0), 0);
  const totU = (ano: number) => marcas.reduce((a, m) => a + (m.u[ano] || 0), 0);
  const fatMercado = totF(2026);
  const unidMercado = totU(2026);
  const shareUnid = own && unidMercado ? ((own.u[2026] || 0) / unidMercado) * 100 : 0;
  const shareFat = own && fatMercado ? ((own.f[2026] || 0) / fatMercado) * 100 : 0;
  const crescOwn = own ? cresc(own.f[2026] || 0, own.f[2025] || 0) : null;
  const crescMercado = cresc(totF(2026), totF(2025));

  // Ranking por unidades vendidas (2026) — maior para menor.
  const marcasOrd = useMemo(
    () => [...marcas].sort((a, b) => (b.u[2026] || 0) - (a.u[2026] || 0)),
    [marcas],
  );
  const fatTotal2026 = fatMercado;

  // Top 10 + marca própria fixada (mesmo fora do top 10).
  const visiveis = useMemo(() => {
    if (verTodasMarcas) return marcasOrd;
    const top = marcasOrd.slice(0, 10);
    if (own && !top.some((m) => m.key === ownN)) top.push(own);
    return top;
  }, [marcasOrd, verTodasMarcas, own, ownN]);

  // Crescimento 26v25 — top 12 marcas por volume (legibilidade).
  const crescPorMarca = useMemo(
    () =>
      marcasOrd
        .slice(0, 12)
        .map((m) => ({ marca: m.label, cresc: cresc(m.f[2026] || 0, m.f[2025] || 0) }))
        .filter((d): d is { marca: string; cresc: number } => d.cresc !== null)
        .sort((a, b) => b.cresc - a.cresc),
    [marcasOrd],
  );

  // Pizza de regiões — marca própria, unidades 2026 (filtro de mês, ignora região).
  const pizzaRegioes = useMemo(() => {
    const byReg = new Map<string, number>();
    market
      .filter((r) => norm(r.m) === ownN && months.has(r.mi) && r.a === 2026)
      .forEach((r) => byReg.set(r.r || "—", (byReg.get(r.r || "—") || 0) + r.u));
    return [...byReg.entries()]
      .map(([regiaoNome, value]) => ({ regiao: regiaoNome, value }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [market, ownN, months]);

  // Faturamento mensal da marca própria (filtro de região, todos os meses).
  const ownMonthly = useMemo(
    () => market.filter((r) => norm(r.m) === ownN && inReg(r.r)),
    [market, ownN, inReg],
  );

  // KPIs e tabela por UF da marca própria.
  const ufSliced = useMemo(
    () => ownUF.filter((r) => months.has(r.mi) && inReg(r.r) && (selUFs.size === 0 || selUFs.has(r.uf))),
    [ownUF, months, inReg, selUFs],
  );
  const ufAgg = useMemo(
    () => aggBy(ufSliced, (r) => r.uf, (r) => r.uf).sort((a, b) => (b.f[2026] || 0) - (a.f[2026] || 0)),
    [ufSliced],
  );
  const ufOptions = useMemo(
    () => [...new Set(ownUF.map((r) => r.uf))].sort(),
    [ownUF],
  );
  const ufsComCresc = ufAgg.filter((u) => {
    const c = cresc(u.f[2026] || 0, u.f[2025] || 0);
    return c !== null && c > 0;
  }).length;
  const maiorCrescUF = useMemo(() => {
    let best: { uf: string; c: number } | null = null;
    for (const u of ufAgg) {
      const c = cresc(u.f[2026] || 0, u.f[2025] || 0);
      if (c !== null && (best === null || c > best.c)) best = { uf: u.label, c };
    }
    return best;
  }, [ufAgg]);
  const maiorVolumeUF = useMemo(
    () => [...ufAgg].sort((a, b) => (b.u[2026] || 0) - (a.u[2026] || 0))[0] || null,
    [ufAgg],
  );

  return (
    <div className="space-y-6">
      {/* KPIs de mercado */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Fat. mercado total (2026)" value={formatBRL(fatMercado)} />
        <KpiCard label="Unid. mercado total (2026)" value={fmtInt(unidMercado)} />
        <KpiCard label={`Share ${theme.label} unid.`} value={`${shareUnid.toFixed(1)}%`} accent={theme.dark} />
        <KpiCard label={`Share ${theme.label} fat.`} value={`${shareFat.toFixed(1)}%`} accent={theme.dark} />
        <KpiCard
          label="Crescimento 26 vs 25 (fat.)"
          value={<Pct v={crescOwn} />}
          sub={<span>Mercado: <Pct v={crescMercado} /></span>}
        />
      </div>

      {/* Ranking de marcas */}
      <Panel
        title="Mercado completo — marcas (por unidades 2026)"
        action={
          marcasOrd.length > 10 ? (
            <Button variant="ghost" size="sm" onClick={() => setVerTodasMarcas((v) => !v)}>
              {verTodasMarcas ? "Ver top 10" : `Ver todas as ${marcasOrd.length} marcas`}
            </Button>
          ) : undefined
        }
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Marca</TableHead>
                <TableHead className="text-right">Unid 2024</TableHead>
                <TableHead className="text-right">Unid 2025</TableHead>
                <TableHead className="text-right">%25v24</TableHead>
                <TableHead className="text-right">Unid 2026</TableHead>
                <TableHead className="text-right">%26v25</TableHead>
                <TableHead className="text-right">Fat 2025</TableHead>
                <TableHead className="text-right">%26v25 Fat</TableHead>
                <TableHead className="text-right">Fat 2026</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((m) => {
                const isOwn = m.key === ownN;
                return (
                  <TableRow key={m.key} style={isOwn ? { backgroundColor: theme.rowHighlight } : undefined}>
                    <TableCell className={isOwn ? "font-semibold" : "font-medium"}>
                      {m.label}
                      {isOwn && (
                        <span
                          className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ backgroundColor: theme.dark, color: "#fff" }}
                        >
                          Nossa marca
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{fmtInt(m.u[2024] || 0)}</TableCell>
                    <TableCell className="text-right">{fmtInt(m.u[2025] || 0)}</TableCell>
                    <TableCell className="text-right"><Pct v={cresc(m.u[2025] || 0, m.u[2024] || 0)} /></TableCell>
                    <TableCell className="text-right">{fmtInt(m.u[2026] || 0)}</TableCell>
                    <TableCell className="text-right"><Pct v={cresc(m.u[2026] || 0, m.u[2025] || 0)} /></TableCell>
                    <TableCell className="text-right">{formatBRL(m.f[2025] || 0)}</TableCell>
                    <TableCell className="text-right"><Pct v={cresc(m.f[2026] || 0, m.f[2025] || 0)} /></TableCell>
                    <TableCell className="text-right">{formatBRL(m.f[2026] || 0)}</TableCell>
                    <TableCell className="text-right">
                      {fatTotal2026 ? (((m.f[2026] || 0) / fatTotal2026) * 100).toFixed(1) : "0.0"}%
                    </TableCell>
                  </TableRow>
                );
              })}
              {!visiveis.length && (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                    Sem dados para os filtros selecionados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Crescimento por marca */}
        <Panel title="Crescimento 26 vs 25 — top marcas (fat.)">
          {crescPorMarca.length ? (
            <ResponsiveContainer width="100%" height={Math.max(220, crescPorMarca.length * 30)}>
              <BarChart layout="vertical" data={crescPorMarca} margin={{ top: 4, right: 40, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="marca" width={130} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `${Number(v).toFixed(1)}%`} />
                <Bar dataKey="cresc" radius={[0, 4, 4, 0]}>
                  {crescPorMarca.map((d) => (
                    <Cell key={d.marca} fill={d.cresc >= 0 ? VERDE : VERMELHO} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Sem base de comparação.</p>
          )}
        </Panel>

        {/* Pizza de regiões */}
        <Panel title={`Regiões — ${theme.label} (unid. 2026)`}>
          {pizzaRegioes.length ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={pizzaRegioes} dataKey="value" nameKey="regiao" cx="50%" cy="50%" outerRadius={100} label={(d) => d.regiao}>
                  {pizzaRegioes.map((d, i) => (
                    <Cell key={d.regiao} fill={theme.palette[i % theme.palette.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmtInt(Number(v))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Sem dados de regiões.</p>
          )}
        </Panel>
      </div>

      {/* KPIs da própria marca */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard label={`Fat ${theme.label} (2026)`} value={formatBRL(own?.f[2026] || 0)} accent={theme.dark} />
        <KpiCard label={`Unid ${theme.label} (2026)`} value={fmtInt(own?.u[2026] || 0)} accent={theme.dark} />
        <KpiCard label="UFs com crescimento" value={fmtInt(ufsComCresc)} sub={`de ${ufAgg.length} estados`} />
        <KpiCard label="Maior crescimento (UF)" value={maiorCrescUF ? maiorCrescUF.uf : "—"} sub={maiorCrescUF ? <Pct v={maiorCrescUF.c} /> : undefined} />
        <KpiCard label="Maior volume (UF)" value={maiorVolumeUF ? maiorVolumeUF.label : "—"} sub={maiorVolumeUF ? `${fmtInt(maiorVolumeUF.u[2026] || 0)} un.` : undefined} />
      </div>

      {/* Faturamento por UF + seletor de estados */}
      <PainelUF
        ufAgg={ufAgg}
        theme={theme}
        ufOptions={ufOptions}
        selUFs={selUFs}
        onToggleUF={onToggleUF}
        onSelectAllUF={onSelectAllUF}
        onClearUF={onClearUF}
      />

      {/* Faturamento mensal */}
      <GraficoMensal rows={ownMonthly} theme={theme} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Visão Bendita — marca própria, 4 apresentações
// ──────────────────────────────────────────────────────────────────────────

function BenditaView({
  theme,
  rows,
  months,
  regiao,
  selUFs,
  onToggleUF,
  onSelectAllUF,
  onClearUF,
}: {
  theme: BrandTheme;
  rows: BenRow[];
  months: Set<number>;
  regiao: string;
  selUFs: Set<string>;
  onToggleUF: (uf: string) => void;
  onSelectAllUF: () => void;
  onClearUF: () => void;
}) {
  const inReg = useCallback((r: string) => regiao === "Todas" || r === regiao, [regiao]);

  // Apenas as 4 apresentações definidas.
  const base = useMemo(() => rows.filter((r) => BENDITA_APRES.includes(normWs(r.p))), [rows]);

  // Fatia mês + região (KPIs, produtos).
  const sliced = useMemo(() => base.filter((r) => months.has(r.mi) && inReg(r.r)), [base, months, inReg]);
  // Fatia só região (gráfico mensal, todos os meses).
  const slicedRegiao = useMemo(() => base.filter((r) => inReg(r.r)), [base, inReg]);

  const fat = (ano: number) => sliced.reduce((a, r) => (r.a === ano ? a + r.f : a), 0);
  const fat2026 = fat(2026);
  const cresc25v24 = cresc(fat(2025), fat(2024));
  const cresc26v25 = cresc(fat(2026), fat(2025));

  // Melhor mês de 2026 (ignora filtro de mês, considera só região).
  const melhorMes = useMemo(() => {
    const porMes = new Map<number, number>();
    slicedRegiao.filter((r) => r.a === 2026 && r.mi >= 0).forEach((r) => porMes.set(r.mi, (porMes.get(r.mi) || 0) + r.f));
    let best: { mi: number; v: number } | null = null;
    for (const [mi, v] of porMes) if (best === null || v > best.v) best = { mi, v };
    return best;
  }, [slicedRegiao]);

  const crescData = [
    { nome: "25 vs 24", cresc: cresc25v24 },
    { nome: "26 vs 25", cresc: cresc26v25 },
  ].filter((d): d is { nome: string; cresc: number } => d.cresc !== null);

  const produtos = useMemo(
    () => aggBy(sliced, (r) => normWs(r.p), (r) => prettyApres(r.p)).sort((a, b) => (b.f[2026] || 0) - (a.f[2026] || 0)),
    [sliced],
  );

  // UF (mês + região + estados selecionados).
  const ufSliced = useMemo(
    () => sliced.filter((r) => selUFs.size === 0 || selUFs.has(r.uf)),
    [sliced, selUFs],
  );
  const ufAgg = useMemo(
    () => aggBy(ufSliced, (r) => r.uf, (r) => r.uf).sort((a, b) => (b.f[2026] || 0) - (a.f[2026] || 0)),
    [ufSliced],
  );
  const ufOptions = useMemo(() => [...new Set(base.map((r) => r.uf))].sort(), [base]);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Fat. 2026 (meses selecionados)" value={formatBRL(fat2026)} accent={theme.dark} />
        <KpiCard label="Crescimento 25 vs 24" value={<Pct v={cresc25v24} />} />
        <KpiCard label="Crescimento 26 vs 25" value={<Pct v={cresc26v25} />} />
        <KpiCard label="Melhor mês 2026" value={melhorMes ? MESES[melhorMes.mi] : "—"} sub={melhorMes ? formatBRL(melhorMes.v) : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GraficoMensal rows={slicedRegiao} theme={theme} />

        <Panel title="Crescimento de faturamento">
          {crescData.length ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={crescData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v: number) => `${Number(v).toFixed(1)}%`} />
                <Bar dataKey="cresc" radius={[4, 4, 0, 0]}>
                  {crescData.map((d) => (
                    <Cell key={d.nome} fill={d.cresc >= 0 ? VERDE : VERMELHO} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Sem base de comparação.</p>
          )}
        </Panel>
      </div>

      {/* Tabela por apresentação */}
      <Panel title="Faturamento por apresentação">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Apresentação</TableHead>
                <TableHead className="text-right">Fat 2024</TableHead>
                <TableHead className="text-right">Fat 2025</TableHead>
                <TableHead className="text-right">%25v24</TableHead>
                <TableHead className="text-right">Fat 2026</TableHead>
                <TableHead className="text-right">%26v25</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {produtos.map((p) => (
                <TableRow key={p.key}>
                  <TableCell className="font-medium">{p.label}</TableCell>
                  <TableCell className="text-right">{formatBRL(p.f[2024] || 0)}</TableCell>
                  <TableCell className="text-right">{formatBRL(p.f[2025] || 0)}</TableCell>
                  <TableCell className="text-right"><Pct v={cresc(p.f[2025] || 0, p.f[2024] || 0)} /></TableCell>
                  <TableCell className="text-right">{formatBRL(p.f[2026] || 0)}</TableCell>
                  <TableCell className="text-right"><Pct v={cresc(p.f[2026] || 0, p.f[2025] || 0)} /></TableCell>
                </TableRow>
              ))}
              {!produtos.length && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Sem dados por apresentação.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Panel>

      {/* Faturamento por UF + seletor de estados */}
      <PainelUF
        ufAgg={ufAgg}
        theme={theme}
        ufOptions={ufOptions}
        selUFs={selUFs}
        onToggleUF={onToggleUF}
        onSelectAllUF={onSelectAllUF}
        onClearUF={onClearUF}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Página principal
// ──────────────────────────────────────────────────────────────────────────

export default function DadosIQVIA() {
  const [marca, setMarca] = useState<BrandKey>("alivik");
  const [data, setData] = useState<IqviaData | null>(null);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);
  const [regiao, setRegiao] = useState<string>("Todas");
  const [selUFs, setSelUFs] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const theme = BRANDS[marca];

  // Carrega a base IQVIA estática (public/iqvia_data.json) ao montar.
  useEffect(() => {
    setCarregando(true);
    fetch("/iqvia_data.json")
      .then((res) => {
        if (!res.ok) throw new Error("Arquivo não encontrado");
        return res.json();
      })
      .then((json: IqviaData) => {
        setData(json);
        // Default: todos os meses de 2026 que possuem dados.
        const mis = new Set<number>();
        json.alivik.market.forEach((r) => r.a === 2026 && mis.add(r.mi));
        json.laby.market.forEach((r) => r.a === 2026 && mis.add(r.mi));
        json.bendita.rows.forEach((r) => r.a === 2026 && mis.add(r.mi));
        const def = [...mis].sort((a, b) => a - b);
        setSelectedMonths(def.length ? def : [0, 1, 2, 3, 4]);
        setCarregando(false);
      })
      .catch(() => {
        setErro("Não foi possível carregar a base IQVIA.");
        setCarregando(false);
      });
  }, []);

  // Estados selecionados são por painel — limpa ao trocar de marca.
  useEffect(() => {
    setSelUFs([]);
  }, [marca]);

  const monthsSet = useMemo(() => new Set(selectedMonths), [selectedMonths]);
  const monthsStrSet = useMemo(() => new Set(selectedMonths.map(String)), [selectedMonths]);
  const selUFsSet = useMemo(() => new Set(selUFs), [selUFs]);

  const monthsComDados2026 = useMemo(() => {
    if (!data) return [] as number[];
    const mis = new Set<number>();
    data.alivik.market.forEach((r) => r.a === 2026 && mis.add(r.mi));
    data.laby.market.forEach((r) => r.a === 2026 && mis.add(r.mi));
    data.bendita.rows.forEach((r) => r.a === 2026 && mis.add(r.mi));
    return [...mis].sort((a, b) => a - b);
  }, [data]);

  const toggleMonth = (v: string) => {
    const mi = Number(v);
    setSelectedMonths((prev) => (prev.includes(mi) ? prev.filter((x) => x !== mi) : [...prev, mi]));
  };
  const toggleUF = (uf: string) =>
    setSelUFs((prev) => (prev.includes(uf) ? prev.filter((x) => x !== uf) : [...prev, uf]));

  const monthTriggerLabel =
    selectedMonths.length === 0
      ? "Nenhum mês"
      : selectedMonths.length === 12
        ? "Todos os meses"
        : selectedMonths.length <= 3
          ? [...selectedMonths].sort((a, b) => a - b).map((i) => MESES_ABREV[i]).join(", ")
          : `${selectedMonths.length} meses`;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header com seletor de marca */}
      <div className="rounded-xl p-5 text-white sm:p-6" style={{ backgroundColor: theme.dark }}>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Dados IQVIA</h1>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {BRAND_ORDER.map((k) => {
            const b = BRANDS[k];
            const ativo = k === marca;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setMarca(k)}
                className="rounded-md px-4 py-2 text-sm font-medium transition-colors"
                style={ativo ? { backgroundColor: "#ffffff", color: b.dark } : { backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff" }}
              >
                {b.label}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {theme.tags.map((t) => (
            <span key={t} className="rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: theme.tagBg, color: theme.tagFg }}>
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Período (meses)</label>
            <div className="flex flex-wrap items-center gap-2">
              <MultiCheck
                triggerLabel={monthTriggerLabel}
                items={MESES.map((m, i) => ({ value: String(i), label: m }))}
                selected={monthsStrSet}
                onToggle={toggleMonth}
                onSelectAll={() => setSelectedMonths(Array.from({ length: 12 }, (_, i) => i))}
                onClear={() => setSelectedMonths([])}
              />
              {monthsComDados2026.length > 0 && (
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSelectedMonths(monthsComDados2026)}>
                  2026 com dados
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Região</label>
            <Select value={regiao} onValueChange={setRegiao}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REGIOES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="ml-auto self-center text-xs text-muted-foreground">
            Comparativos 2024 e 2025 consideram apenas os meses selecionados.
          </p>
        </CardContent>
      </Card>

      {/* Conteúdo */}
      {carregando || !data ? (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">Carregando base IQVIA...</p>
          </CardContent>
        </Card>
      ) : erro ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-red-500">{erro}</CardContent>
        </Card>
      ) : marca === "bendita" ? (
        <BenditaView
          theme={theme}
          rows={data.bendita.rows}
          months={monthsSet}
          regiao={regiao}
          selUFs={selUFsSet}
          onToggleUF={toggleUF}
          onSelectAllUF={() => setSelUFs([...new Set(data.bendita.rows.map((r) => r.uf))])}
          onClearUF={() => setSelUFs([])}
        />
      ) : (
        <MercadoView
          theme={theme}
          market={data[marca].market}
          ownUF={data[marca].ownUF}
          ownName={data[marca].own}
          months={monthsSet}
          regiao={regiao}
          selUFs={selUFsSet}
          onToggleUF={toggleUF}
          onSelectAllUF={() => setSelUFs([...new Set(data[marca].ownUF.map((r) => r.uf))])}
          onClearUF={() => setSelUFs([])}
        />
      )}

      {data?.geradoEm && (
        <p className="text-center text-xs text-muted-foreground">Base IQVIA · Gerado em: {data.geradoEm}</p>
      )}
    </div>
  );
}
