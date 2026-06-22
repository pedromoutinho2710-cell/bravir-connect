import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
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
import { toast } from "sonner";
import { MESES, MESES_ABREV, formatBRL } from "@/lib/format";
import { Upload, TrendingUp } from "lucide-react";

// ──────────────────────────────────────────────────────────────────────────
// Tipos e utilitários
// ──────────────────────────────────────────────────────────────────────────

const ANOS = [2024, 2025, 2026] as const;
const REGIOES = ["Todas", "Sudeste", "Nordeste", "Sul", "Centro-Oeste", "Norte"];

const VERDE = "#16a34a";
const VERMELHO = "#dc2626";

type Row = {
  marca: string;
  marcaNorm: string;
  categoria: string;
  tipo: string;
  apresentacao: string;
  ano: number;
  mesIdx: number; // 0-11 ou -1
  uf: string;
  regiao: string;
  unidade: number;
  fat: number; // Real CH
};

type Agg = {
  key: string;
  label: string;
  unid: Record<number, number>;
  fat: Record<number, number>;
};

// Remove acentos + uppercase + trim — comparações robustas a variações do Excel.
const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();

// Converte célula em número, tolerando strings pt-BR ("1.234,56") e "R$".
const toNum = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null) return 0;
  let s = String(v).trim();
  if (!s) return 0;
  s = s.replace(/[R$\s]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

// Índice do mês (0-11) a partir do nome em pt-BR; -1 se não reconhecido.
const MES_INDEX: Record<string, number> = {};
MESES.forEach((m, i) => {
  MES_INDEX[norm(m)] = i;
});
const mesIdxDe = (s: unknown): number => {
  const n = norm(s);
  if (n in MES_INDEX) return MES_INDEX[n];
  const i = MESES_ABREV.findIndex((a) => norm(a) === n.slice(0, 3));
  return i;
};

const fmtInt = (n: number) => Math.round(Number.isFinite(n) ? n : 0).toLocaleString("pt-BR");

// Crescimento percentual; null quando não há base de comparação.
const cresc = (cur: number, prev: number): number | null =>
  prev > 0 ? ((cur - prev) / prev) * 100 : null;

// ──────────────────────────────────────────────────────────────────────────
// Identidade visual por marca
// ──────────────────────────────────────────────────────────────────────────

type BrandKey = "alivik" | "laby" | "bendita";

interface BrandTheme {
  key: BrandKey;
  label: string;
  sheet: string;
  ownMarca: string;
  filter: (r: Row) => boolean;
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
    sheet: "BD ALIVIK",
    ownMarca: "ALIVIK (BVR)",
    filter: (r) =>
      norm(r.categoria) === "DOR E FEBRE" && ["INALADOR", "POMADA"].includes(norm(r.tipo)),
    tags: ["Dor e febre", "Pomada", "Inalador"],
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
    sheet: "BASE LABY",
    ownMarca: "LABY (BVR)",
    filter: (r) => ["CUIDADOS LABIAIS", "PROTECAO SOLAR"].includes(norm(r.categoria)),
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
    sheet: "BASE BENDITA CANFORA",
    ownMarca: "BENDITA CANFORA (BVR)",
    filter: (r) =>
      norm(r.marca) === "BENDITA CANFORA (BVR)" && norm(r.categoria) === "GRIPES E RESFRIADOS",
    tags: ["Bendita Cânfora", "Gripes e resfriados"],
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
// Parsing e agregação
// ──────────────────────────────────────────────────────────────────────────

// Acessa uma coluna tolerando variações de acento/caixa/espaços no cabeçalho.
function pick(row: Record<string, unknown>, ...candidates: string[]): unknown {
  for (const c of candidates) if (c in row) return row[c];
  const wanted = candidates.map((c) => norm(c).replace(/\s+/g, " "));
  for (const k of Object.keys(row)) {
    if (wanted.includes(norm(k).replace(/\s+/g, " "))) return row[k];
  }
  return undefined;
}

function parseRows(raw: Record<string, unknown>[]): Row[] {
  return raw.map((r) => {
    const marca = String(pick(r, "Marca") ?? "").trim();
    return {
      marca,
      marcaNorm: norm(marca),
      categoria: String(pick(r, "Categoria") ?? "").trim(),
      tipo: String(pick(r, "Tipo produto", "Tipo Produto") ?? "").trim(),
      apresentacao: String(pick(r, "Apresentacao", "Apresentação") ?? "").trim(),
      ano: Math.round(toNum(pick(r, "Ano"))),
      mesIdx: mesIdxDe(pick(r, "Mes Calendario", "Mês Calendário")),
      uf: String(pick(r, "UF") ?? "").trim().toUpperCase(),
      regiao: String(pick(r, "Regiao", "Região") ?? "").trim(),
      unidade: toNum(pick(r, "Unidade")),
      fat: toNum(pick(r, "Real CH")),
    };
  });
}

function aggBy(rows: Row[], keyFn: (r: Row) => string, labelFn: (r: Row) => string): Agg[] {
  const map = new Map<string, Agg>();
  for (const r of rows) {
    const k = keyFn(r);
    let e = map.get(k);
    if (!e) {
      e = { key: k, label: labelFn(r), unid: {}, fat: {} };
      map.set(k, e);
    }
    e.unid[r.ano] = (e.unid[r.ano] || 0) + r.unidade;
    e.fat[r.ano] = (e.fat[r.ano] || 0) + r.fat;
  }
  return [...map.values()];
}

const aggMarcas = (rows: Row[]) => aggBy(rows, (r) => r.marcaNorm, (r) => r.marca);
const aggUF = (rows: Row[]) => aggBy(rows, (r) => r.uf || "—", (r) => r.uf || "—");
const aggProduto = (rows: Row[]) =>
  aggBy(rows, (r) => norm(r.apresentacao) || "—", (r) => r.apresentacao || "—");

// Série mensal de faturamento por ano (3 linhas). null onde não há dado (spanGaps off).
function buildMonthly(rows: Row[], modo: "compact" | "full") {
  const comDados = [...new Set(rows.filter((r) => r.mesIdx >= 0).map((r) => r.mesIdx))].sort(
    (a, b) => a - b,
  );
  const meses = modo === "compact" ? comDados : Array.from({ length: 12 }, (_, i) => i);
  return meses.map((mi) => {
    const linha: Record<string, number | string | null> = { mes: MESES_ABREV[mi] ?? String(mi) };
    for (const ano of ANOS) {
      const doMes = rows.filter((r) => r.ano === ano && r.mesIdx === mi);
      linha[String(ano)] = doMes.length ? doMes.reduce((a, r) => a + r.fat, 0) : null;
    }
    return linha;
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Componentes de apresentação
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
        Jan–Mai (com dados)
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

// Gráfico de linha mensal — reutilizado por todas as marcas.
function GraficoMensal({ rows, theme }: { rows: Row[]; theme: BrandTheme }) {
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
          <Line
            type="monotone"
            dataKey="2024"
            name="2024"
            stroke={theme.light}
            strokeWidth={2}
            strokeDasharray="6 4"
            connectNulls={false}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="2025"
            name="2025"
            stroke={theme.medium}
            strokeWidth={2}
            connectNulls={false}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="2026"
            name="2026"
            stroke={theme.dark}
            strokeWidth={3}
            connectNulls={false}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Panel>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Visão de mercado (Alivik / Laby) — estrutura idêntica
// ──────────────────────────────────────────────────────────────────────────

function MercadoView({
  theme,
  rows,
  regiao,
  mes,
  anoRef,
}: {
  theme: BrandTheme;
  rows: Row[];
  regiao: string;
  mes: string;
  anoRef: number;
}) {
  const [verTodosUF, setVerTodosUF] = useState(false);
  const ownNorm = norm(theme.ownMarca);

  // Fatia principal (região + mês) — KPIs, tabelas e gráfico de barras.
  const sliced = useMemo(
    () =>
      rows.filter(
        (r) =>
          (regiao === "Todas" || norm(r.regiao) === norm(regiao)) &&
          (mes === "all" || r.mesIdx === MES_INDEX[norm(mes)]),
      ),
    [rows, regiao, mes],
  );
  // Apenas região (ignora mês) — gráfico de linha mensal.
  const slicedRegiao = useMemo(
    () => rows.filter((r) => regiao === "Todas" || norm(r.regiao) === norm(regiao)),
    [rows, regiao],
  );
  // Apenas mês (ignora região) — pizza de regiões.
  const slicedMes = useMemo(
    () => rows.filter((r) => mes === "all" || r.mesIdx === MES_INDEX[norm(mes)]),
    [rows, mes],
  );

  const marcas = useMemo(() => aggMarcas(sliced), [sliced]);
  const own = marcas.find((m) => m.key === ownNorm);
  const ownRows = useMemo(() => sliced.filter((r) => r.marcaNorm === ownNorm), [sliced, ownNorm]);
  const ownRowsRegiao = useMemo(
    () => slicedRegiao.filter((r) => r.marcaNorm === ownNorm),
    [slicedRegiao, ownNorm],
  );

  const totFat = (ano: number) => marcas.reduce((a, m) => a + (m.fat[ano] || 0), 0);
  const totUnid = (ano: number) => marcas.reduce((a, m) => a + (m.unid[ano] || 0), 0);

  const fatMercadoRef = totFat(anoRef);
  const unidMercadoRef = totUnid(anoRef);
  const shareUnid = own && unidMercadoRef ? ((own.unid[anoRef] || 0) / unidMercadoRef) * 100 : 0;
  const shareFat = own && fatMercadoRef ? ((own.fat[anoRef] || 0) / fatMercadoRef) * 100 : 0;
  const crescOwn = own ? cresc(own.fat[2026] || 0, own.fat[2025] || 0) : null;
  const crescMercado = cresc(totFat(2026), totFat(2025));

  // Tabela de mercado — ordenada por Fat do ano de referência.
  const marcasOrdenadas = useMemo(
    () => [...marcas].sort((a, b) => (b.fat[anoRef] || 0) - (a.fat[anoRef] || 0)),
    [marcas, anoRef],
  );
  const fatTotal2026 = totFat(2026);

  // Gráfico de crescimento 26vs25 (faturamento) por marca.
  const crescPorMarca = useMemo(
    () =>
      marcas
        .map((m) => ({ marca: m.label, cresc: cresc(m.fat[2026] || 0, m.fat[2025] || 0) }))
        .filter((d): d is { marca: string; cresc: number } => d.cresc !== null)
        .sort((a, b) => b.cresc - a.cresc),
    [marcas],
  );

  // Pizza de regiões — unidades 2026 da marca própria (independe do filtro de Ano).
  const pizzaRegioes = useMemo(() => {
    const byReg = new Map<string, number>();
    slicedMes
      .filter((r) => r.marcaNorm === ownNorm && r.ano === 2026)
      .forEach((r) => byReg.set(r.regiao || "—", (byReg.get(r.regiao || "—") || 0) + r.unidade));
    return [...byReg.entries()]
      .map(([regiaoNome, value]) => ({ regiao: regiaoNome, value }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [slicedMes, ownNorm]);

  // KPIs e tabela da própria marca por UF.
  const ufAgg = useMemo(
    () => aggUF(ownRows).sort((a, b) => (b.fat[2026] || 0) - (a.fat[2026] || 0)),
    [ownRows],
  );
  const ufsComCresc = ufAgg.filter((u) => {
    const c = cresc(u.fat[2026] || 0, u.fat[2025] || 0);
    return c !== null && c > 0;
  }).length;
  const maiorCrescUF = useMemo(() => {
    let best: { uf: string; c: number } | null = null;
    for (const u of ufAgg) {
      const c = cresc(u.fat[2026] || 0, u.fat[2025] || 0);
      if (c !== null && (best === null || c > best.c)) best = { uf: u.label, c };
    }
    return best;
  }, [ufAgg]);
  const maiorVolumeUF = useMemo(
    () => [...ufAgg].sort((a, b) => (b.unid[2026] || 0) - (a.unid[2026] || 0))[0] || null,
    [ufAgg],
  );

  const ufVisiveis = verTodosUF ? ufAgg : ufAgg.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* KPIs de mercado */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard label={`Fat. mercado total (${anoRef})`} value={formatBRL(fatMercadoRef)} />
        <KpiCard label={`Unid. mercado total (${anoRef})`} value={fmtInt(unidMercadoRef)} />
        <KpiCard
          label={`Share ${theme.label} unid.`}
          value={`${shareUnid.toFixed(1)}%`}
          accent={theme.dark}
        />
        <KpiCard
          label={`Share ${theme.label} fat.`}
          value={`${shareFat.toFixed(1)}%`}
          accent={theme.dark}
        />
        <KpiCard
          label="Crescimento 26 vs 25 (fat.)"
          value={<Pct v={crescOwn} />}
          sub={
            <span>
              Mercado: <Pct v={crescMercado} />
            </span>
          }
        />
      </div>

      {/* Tabela de mercado completo */}
      <Panel title="Mercado completo — todas as marcas">
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
              {marcasOrdenadas.map((m) => {
                const isOwn = m.key === ownNorm;
                return (
                  <TableRow
                    key={m.key}
                    style={isOwn ? { backgroundColor: theme.rowHighlight } : undefined}
                  >
                    <TableCell className={isOwn ? "font-semibold" : "font-medium"}>{m.label}</TableCell>
                    <TableCell className="text-right">{fmtInt(m.unid[2024] || 0)}</TableCell>
                    <TableCell className="text-right">{fmtInt(m.unid[2025] || 0)}</TableCell>
                    <TableCell className="text-right">
                      <Pct v={cresc(m.unid[2025] || 0, m.unid[2024] || 0)} />
                    </TableCell>
                    <TableCell className="text-right">{fmtInt(m.unid[2026] || 0)}</TableCell>
                    <TableCell className="text-right">
                      <Pct v={cresc(m.unid[2026] || 0, m.unid[2025] || 0)} />
                    </TableCell>
                    <TableCell className="text-right">{formatBRL(m.fat[2025] || 0)}</TableCell>
                    <TableCell className="text-right">
                      <Pct v={cresc(m.fat[2026] || 0, m.fat[2025] || 0)} />
                    </TableCell>
                    <TableCell className="text-right">{formatBRL(m.fat[2026] || 0)}</TableCell>
                    <TableCell className="text-right">
                      {fatTotal2026 ? (((m.fat[2026] || 0) / fatTotal2026) * 100).toFixed(1) : "0.0"}%
                    </TableCell>
                  </TableRow>
                );
              })}
              {!marcasOrdenadas.length && (
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
        <Panel title="Crescimento 26 vs 25 por marca (fat.)">
          {crescPorMarca.length ? (
            <ResponsiveContainer width="100%" height={Math.max(220, crescPorMarca.length * 30)}>
              <BarChart
                layout="vertical"
                data={crescPorMarca}
                margin={{ top: 4, right: 40, bottom: 4, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="marca" width={120} tick={{ fontSize: 11 }} />
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
                <Pie
                  data={pizzaRegioes}
                  dataKey="value"
                  nameKey="regiao"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={(d) => d.regiao}
                >
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
        <KpiCard label={`Fat ${theme.label} (2026)`} value={formatBRL(own?.fat[2026] || 0)} accent={theme.dark} />
        <KpiCard label={`Unid ${theme.label} (2026)`} value={fmtInt(own?.unid[2026] || 0)} accent={theme.dark} />
        <KpiCard label="UFs com crescimento" value={fmtInt(ufsComCresc)} sub={`de ${ufAgg.length} estados`} />
        <KpiCard
          label="Maior crescimento (UF)"
          value={maiorCrescUF ? maiorCrescUF.uf : "—"}
          sub={maiorCrescUF ? <Pct v={maiorCrescUF.c} /> : undefined}
        />
        <KpiCard
          label="Maior volume (UF)"
          value={maiorVolumeUF ? maiorVolumeUF.label : "—"}
          sub={maiorVolumeUF ? `${fmtInt(maiorVolumeUF.unid[2026] || 0)} un.` : undefined}
        />
      </div>

      {/* Tabela por UF */}
      <Panel
        title={`${theme.label} por UF`}
        action={
          ufAgg.length > 5 ? (
            <Button variant="ghost" size="sm" onClick={() => setVerTodosUF((v) => !v)}>
              {verTodosUF ? "Ver top 5" : `Ver todos os ${ufAgg.length} estados`}
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
                  <TableCell className="text-right">{formatBRL(u.fat[2024] || 0)}</TableCell>
                  <TableCell className="text-right">{formatBRL(u.fat[2025] || 0)}</TableCell>
                  <TableCell className="text-right">
                    <Pct v={cresc(u.fat[2025] || 0, u.fat[2024] || 0)} />
                  </TableCell>
                  <TableCell className="text-right">{formatBRL(u.fat[2026] || 0)}</TableCell>
                  <TableCell className="text-right">
                    <Pct v={cresc(u.fat[2026] || 0, u.fat[2025] || 0)} />
                  </TableCell>
                  <TableCell className="text-right">{fmtInt(u.unid[2025] || 0)}</TableCell>
                  <TableCell className="text-right">{fmtInt(u.unid[2026] || 0)}</TableCell>
                  <TableCell className="text-right">
                    <Pct v={cresc(u.unid[2026] || 0, u.unid[2025] || 0)} />
                  </TableCell>
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

      {/* Faturamento mensal */}
      <GraficoMensal rows={ownRowsRegiao} theme={theme} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Visão Bendita — apenas dados próprios
// ──────────────────────────────────────────────────────────────────────────

function BenditaView({
  theme,
  rows,
  regiao,
  mes,
}: {
  theme: BrandTheme;
  rows: Row[];
  regiao: string;
  mes: string;
}) {
  const [verTodosUF, setVerTodosUF] = useState(false);

  const sliced = useMemo(
    () =>
      rows.filter(
        (r) =>
          (regiao === "Todas" || norm(r.regiao) === norm(regiao)) &&
          (mes === "all" || r.mesIdx === MES_INDEX[norm(mes)]),
      ),
    [rows, regiao, mes],
  );
  const slicedRegiao = useMemo(
    () => rows.filter((r) => regiao === "Todas" || norm(r.regiao) === norm(regiao)),
    [rows, regiao],
  );

  const fat = (ano: number) => sliced.reduce((a, r) => (r.ano === ano ? a + r.fat : a), 0);
  const fat2026 = fat(2026);
  const cresc25v24 = cresc(fat(2025), fat(2024));
  const cresc26v25 = cresc(fat(2026), fat(2025));

  // Melhor mês de 2026 (ignora filtro de mês, considera só região).
  const melhorMes = useMemo(() => {
    const porMes = new Map<number, number>();
    slicedRegiao
      .filter((r) => r.ano === 2026 && r.mesIdx >= 0)
      .forEach((r) => porMes.set(r.mesIdx, (porMes.get(r.mesIdx) || 0) + r.fat));
    let best: { mi: number; v: number } | null = null;
    for (const [mi, v] of porMes) if (best === null || v > best.v) best = { mi, v };
    return best;
  }, [slicedRegiao]);

  const crescData = [
    { nome: "25 vs 24", cresc: cresc25v24 },
    { nome: "26 vs 25", cresc: cresc26v25 },
  ].filter((d): d is { nome: string; cresc: number } => d.cresc !== null);

  const produtos = useMemo(
    () => aggProduto(sliced).sort((a, b) => (b.fat[2026] || 0) - (a.fat[2026] || 0)),
    [sliced],
  );
  const ufAgg = useMemo(
    () => aggUF(sliced).sort((a, b) => (b.fat[2026] || 0) - (a.fat[2026] || 0)),
    [sliced],
  );
  const ufVisiveis = verTodosUF ? ufAgg : ufAgg.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label={mes === "all" ? "Fat. Jan–Mai 2026" : `Fat. ${mes} 2026`}
          value={formatBRL(fat2026)}
          accent={theme.dark}
        />
        <KpiCard label="Crescimento 25 vs 24" value={<Pct v={cresc25v24} />} />
        <KpiCard label="Crescimento 26 vs 25" value={<Pct v={cresc26v25} />} />
        <KpiCard
          label="Melhor mês 2026"
          value={melhorMes ? MESES[melhorMes.mi] : "—"}
          sub={melhorMes ? formatBRL(melhorMes.v) : undefined}
        />
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

      {/* Tabela por produto */}
      <Panel title="Faturamento por produto">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
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
                  <TableCell className="text-right">{formatBRL(p.fat[2024] || 0)}</TableCell>
                  <TableCell className="text-right">{formatBRL(p.fat[2025] || 0)}</TableCell>
                  <TableCell className="text-right">
                    <Pct v={cresc(p.fat[2025] || 0, p.fat[2024] || 0)} />
                  </TableCell>
                  <TableCell className="text-right">{formatBRL(p.fat[2026] || 0)}</TableCell>
                  <TableCell className="text-right">
                    <Pct v={cresc(p.fat[2026] || 0, p.fat[2025] || 0)} />
                  </TableCell>
                </TableRow>
              ))}
              {!produtos.length && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Sem dados por produto.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Panel>

      {/* Tabela por UF */}
      <Panel
        title="Faturamento por UF"
        action={
          ufAgg.length > 5 ? (
            <Button variant="ghost" size="sm" onClick={() => setVerTodosUF((v) => !v)}>
              {verTodosUF ? "Ver top 5" : `Ver todos os ${ufAgg.length} estados`}
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {ufVisiveis.map((u) => (
                <TableRow key={u.key}>
                  <TableCell className="font-medium">{u.label}</TableCell>
                  <TableCell className="text-right">{formatBRL(u.fat[2024] || 0)}</TableCell>
                  <TableCell className="text-right">{formatBRL(u.fat[2025] || 0)}</TableCell>
                  <TableCell className="text-right">
                    <Pct v={cresc(u.fat[2025] || 0, u.fat[2024] || 0)} />
                  </TableCell>
                  <TableCell className="text-right">{formatBRL(u.fat[2026] || 0)}</TableCell>
                  <TableCell className="text-right">
                    <Pct v={cresc(u.fat[2026] || 0, u.fat[2025] || 0)} />
                  </TableCell>
                </TableRow>
              ))}
              {!ufVisiveis.length && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
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
// Página principal
// ──────────────────────────────────────────────────────────────────────────

export default function DadosIQVIA() {
  const [marca, setMarca] = useState<BrandKey>("alivik");
  const [dadosAlivik, setDadosAlivik] = useState<Row[]>([]);
  const [dadosLaby, setDadosLaby] = useState<Row[]>([]);
  const [dadosBendita, setDadosBendita] = useState<Row[]>([]);
  const [mesSelecionado, setMesSelecionado] = useState<string>("all");
  const [anoBase, setAnoBase] = useState<number | "all">("all");
  const [regiao, setRegiao] = useState<string>("Todas");
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const theme = BRANDS[marca];
  const anoRef = anoBase === "all" ? 2026 : anoBase;

  const dados: Record<BrandKey, Row[]> = {
    alivik: dadosAlivik,
    laby: dadosLaby,
    bendita: dadosBendita,
  };
  const arquivoCarregado =
    dadosAlivik.length > 0 || dadosLaby.length > 0 || dadosBendita.length > 0;

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "binary" });

        // Lê cada aba isoladamente — uma aba faltando não derruba as demais.
        const lerAba = (theme: BrandTheme): Row[] => {
          try {
            const sheet = wb.Sheets[theme.sheet];
            if (!sheet) {
              toast.warning(`Aba "${theme.sheet}" não encontrada.`);
              return [];
            }
            const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
            return parseRows(raw).filter(theme.filter);
          } catch (err) {
            toast.error(`Erro ao ler aba "${theme.sheet}".`);
            return [];
          }
        };

        const a = lerAba(BRANDS.alivik);
        const l = lerAba(BRANDS.laby);
        const b = lerAba(BRANDS.bendita);

        setDadosAlivik(a);
        setDadosLaby(l);
        setDadosBendita(b);
        setArquivoNome(file.name);

        const total = a.length + l.length + b.length;
        if (total > 0) toast.success(`Base IQVIA carregada — ${fmtInt(total)} registros.`);
        else toast.error("Nenhum registro válido encontrado no arquivo.");
      } catch (err) {
        toast.error("Não foi possível ler o arquivo Excel.");
      }
    };
    reader.onerror = () => toast.error("Falha ao ler o arquivo.");
    reader.readAsBinaryString(file);
    // Permite reimportar o mesmo arquivo na sequência.
    e.target.value = "";
  };

  const dadosMarca = dados[marca];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleUpload}
      />

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
                style={
                  ativo
                    ? { backgroundColor: "#ffffff", color: b.dark }
                    : { backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff" }
                }
              >
                {b.label}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {theme.tags.map((t) => (
            <span
              key={t}
              className="rounded-full px-3 py-1 text-xs font-medium"
              style={{ backgroundColor: theme.tagBg, color: theme.tagFg }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Mês</label>
            <Select value={mesSelecionado} onValueChange={setMesSelecionado}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos com dados</SelectItem>
                {MESES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Ano</label>
            <Select
              value={String(anoBase)}
              onValueChange={(v) => setAnoBase(v === "all" ? "all" : Number(v))}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {ANOS.map((a) => (
                  <SelectItem key={a} value={String(a)}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          <div className="ml-auto flex flex-col items-end gap-1">
            <Button onClick={() => inputRef.current?.click()} style={{ backgroundColor: theme.dark }}>
              <Upload className="mr-1 h-4 w-4" />
              Atualizar base IQVIA
            </Button>
            {arquivoNome && (
              <span className="text-xs text-muted-foreground">{arquivoNome}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Conteúdo */}
      {!arquivoCarregado ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full"
              style={{ backgroundColor: theme.tagBg }}
            >
              <Upload className="h-7 w-7" style={{ color: theme.tagFg }} />
            </div>
            <p className="max-w-md text-sm text-muted-foreground">
              Nenhuma base IQVIA carregada. Clique em "Atualizar base IQVIA" para importar o arquivo
              Excel.
            </p>
            <Button onClick={() => inputRef.current?.click()} style={{ backgroundColor: theme.dark }}>
              <Upload className="mr-1 h-4 w-4" />
              Atualizar base IQVIA
            </Button>
          </CardContent>
        </Card>
      ) : dadosMarca.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Sem dados de <strong>{theme.label}</strong> nesta base. Verifique se a aba "{theme.sheet}"
            existe no arquivo importado.
          </CardContent>
        </Card>
      ) : marca === "bendita" ? (
        <BenditaView theme={theme} rows={dadosMarca} regiao={regiao} mes={mesSelecionado} />
      ) : (
        <MercadoView
          theme={theme}
          rows={dadosMarca}
          regiao={regiao}
          mes={mesSelecionado}
          anoRef={anoRef}
        />
      )}
    </div>
  );
}
