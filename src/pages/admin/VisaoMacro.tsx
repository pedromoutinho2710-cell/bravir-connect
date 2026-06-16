import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Link2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";

type SankhyaRow = {
  data_faturamento: string | null;
  valor_liquido: number | null;
  tipo_operacao: string | null;
  numero_nota: string | null;
  grupo: string | null;
};

type MetasRow = {
  mes: number;
  ano: number;
  meta_b2b: number;
  meta_marca_propria: number;
  meta_online: number;
};

type BlingVenda = {
  data?: string;
  total?: number;
};

const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

// Cores dos canais
const COR_B2B = "#3B82F6";
const COR_MP = "#0F6E56";
const COR_ONLINE = "#EC4899";

// URL de autorização OAuth do Bling (client_id público; secret fica só no backend)
const BLING_AUTH_URL = `https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=52c28f14c3e549679570757457681add807daee1&redirect_uri=https://bravir-connect.vercel.app/admin/bling-callback&state=bravir`;

// Busca todos os registros B2B (paginado) de 2025-01-01 até 2026-12-31, para
// suportar o comparativo histórico. B2B = exclui devoluções e bonificações.
async function fetchFaturamentosB2B(): Promise<SankhyaRow[]> {
  const all: SankhyaRow[] = [];
  const pageSize = 1000;
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("faturamentos_sankhya")
      .select("data_faturamento, valor_liquido, tipo_operacao, numero_nota, grupo")
      .gte("data_faturamento", "2025-01-01")
      .lte("data_faturamento", "2026-12-31")
      .not("tipo_operacao", "ilike", "%devolucao%")
      .not("tipo_operacao", "ilike", "%devolução%")
      .not("tipo_operacao", "ilike", "%Devolução%")
      .not("tipo_operacao", "ilike", "%BONIFICACAO%")
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const rows = (data ?? []) as SankhyaRow[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

function getAno(row: SankhyaRow): number | null {
  if (!row.data_faturamento) return null;
  const y = Number(row.data_faturamento.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

function getMesIndex(row: SankhyaRow): number | null {
  if (!row.data_faturamento) return null;
  const m = Number(row.data_faturamento.slice(5, 7));
  return m >= 1 && m <= 12 ? m - 1 : null;
}

// Soma B2B por mês (12 posições) para um ano específico.
function b2bPorMes(rows: SankhyaRow[], ano: number): number[] {
  const arr = new Array(12).fill(0);
  for (const r of rows) {
    if (getAno(r) !== ano) continue;
    const mes = getMesIndex(r);
    if (mes === null) continue;
    arr[mes] += r.valor_liquido ?? 0;
  }
  return arr;
}

// Soma Marca Própria por mês (12 posições) para um ano específico.
// Marca própria de terceiros = produtos cujo grupo carrega o sufixo "(T)".
function mpPorMes(rows: SankhyaRow[], ano: number): number[] {
  const arr = new Array(12).fill(0);
  for (const r of rows) {
    if (!(r.grupo ?? "").toUpperCase().includes("(T)")) continue;
    if (getAno(r) !== ano) continue;
    const mes = getMesIndex(r);
    if (mes === null) continue;
    arr[mes] += r.valor_liquido ?? 0;
  }
  return arr;
}

// Soma vendas online (Bling) por mês (12 posições).
function onlinePorMesFn(vendas: BlingVenda[]): number[] {
  const arr = new Array(12).fill(0);
  for (const v of vendas) {
    if (!v.data) continue;
    const m = Number(v.data.slice(5, 7));
    if (m >= 1 && m <= 12) arr[m - 1] += Number(v.total ?? 0);
  }
  return arr;
}

// Percentual de atingimento (0 se meta nula, para evitar Infinity).
function pctAtingimento(realizado: number, meta: number): number {
  return meta > 0 ? (realizado / meta) * 100 : 0;
}

function corBarraProgresso(pct: number): string {
  if (pct >= 80) return "#16A34A"; // verde
  if (pct >= 50) return "#D97706"; // âmbar
  return "#DC2626"; // vermelho
}

function statusCanal(pct: number): { label: string; className: string } {
  if (pct >= 100) return { label: "Atingido", className: "bg-green-100 text-green-800 hover:bg-green-100" };
  if (pct < 50) return { label: "Atenção", className: "bg-red-100 text-red-800 hover:bg-red-100" };
  return { label: "Em andamento", className: "bg-amber-100 text-amber-800 hover:bg-amber-100" };
}

export default function VisaoMacro() {
  const queryClient = useQueryClient();
  const hoje = useMemo(() => new Date(), []);
  const [mes, setMes] = useState(hoje.getMonth());
  const [ano, setAno] = useState(hoje.getFullYear() >= 2026 ? 2026 : 2025);
  const [editOpen, setEditOpen] = useState(false);
  const [formMeta, setFormMeta] = useState({ b2b: "", mp: "", online: "" });
  const [salvando, setSalvando] = useState(false);

  // B2B (Sankhya)
  const { data: rows, isLoading: loadingB2B } = useQuery({
    queryKey: ["visao-macro-sankhya"],
    queryFn: fetchFaturamentosB2B,
  });

  // Status da conexão Bling (admin consegue ler bling_tokens)
  const { data: blingConectado } = useQuery({
    queryKey: ["bling-conectado"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (supabase as any)
        .from("bling_tokens")
        .select("id", { count: "exact", head: true });
      return (count ?? 0) > 0;
    },
  });

  // Metas do mês/ano selecionado
  const { data: metas } = useQuery({
    queryKey: ["metas-visao-macro", mes, ano],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("metas_visao_macro")
        .select("mes, ano, meta_b2b, meta_marca_propria, meta_online")
        .eq("mes", mes + 1)
        .eq("ano", ano)
        .maybeSingle();
      return (data as MetasRow | null) ?? null;
    },
  });

  // Vendas online (Bling) do ano selecionado — só quando conectado
  const { data: vendasOnline, isLoading: loadingOnline } = useQuery({
    queryKey: ["bling-vendas", ano],
    enabled: !!blingConectado,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("bling-oauth", {
        body: { dataInicial: `01/01/${ano}`, dataFinal: `31/12/${ano}` },
        headers: { "x-action": "vendas" },
      });
      if (error) {
        console.error("Erro Bling vendas:", error);
        throw error;
      }
      const vendas = (data?.data ?? []) as BlingVenda[];
      console.log("Bling vendas recebidas:", vendas.length, vendas[0]);
      return vendas;
    },
  });

  const metaB2B = metas?.meta_b2b ?? 0;
  const metaMP = metas?.meta_marca_propria ?? 0;
  const metaOnline = metas?.meta_online ?? 0;

  const b2b2025 = useMemo(() => b2bPorMes(rows ?? [], 2025), [rows]);
  const b2b2026 = useMemo(() => b2bPorMes(rows ?? [], 2026), [rows]);
  const b2bAno = ano === 2026 ? b2b2026 : b2b2025;
  const mp2025 = useMemo(() => mpPorMes(rows ?? [], 2025), [rows]);
  const mp2026 = useMemo(() => mpPorMes(rows ?? [], 2026), [rows]);
  const mpAno = ano === 2026 ? mp2026 : mp2025;
  const onlinePorMes = useMemo(() => onlinePorMesFn(vendasOnline ?? []), [vendasOnline]);

  // Realizado do mês selecionado por canal
  const realB2B = b2bAno[mes] ?? 0;
  const realMP = mpAno[mes] ?? 0;
  const realOnline = blingConectado ? (onlinePorMes[mes] ?? 0) : 0;

  const canais = useMemo(
    () => [
      {
        key: "b2b",
        nome: "B2B",
        cor: COR_B2B,
        realizado: realB2B,
        meta: metaB2B,
        pendente: false,
      },
      {
        key: "mp",
        nome: "Marca Própria",
        cor: COR_MP,
        realizado: realMP,
        meta: metaMP,
        pendente: false,
      },
      {
        key: "online",
        nome: "Online",
        cor: COR_ONLINE,
        realizado: realOnline,
        meta: metaOnline,
        pendente: !blingConectado,
      },
    ],
    [realB2B, realMP, realOnline, metaB2B, metaMP, metaOnline, blingConectado]
  );

  // KPIs globais (mês selecionado)
  const kpis = useMemo(() => {
    const totalReal = canais.reduce((s, c) => s + c.realizado, 0);
    const totalMeta = canais.reduce((s, c) => s + c.meta, 0);
    const atingimentoGeral = pctAtingimento(totalReal, totalMeta);
    const acima80 = canais.filter((c) => pctAtingimento(c.realizado, c.meta) >= 80).length;
    const melhor = canais.reduce(
      (best, c) => {
        const p = pctAtingimento(c.realizado, c.meta);
        return p > best.pct ? { nome: c.nome, pct: p } : best;
      },
      { nome: "—", pct: -1 }
    );
    return { totalReal, totalMeta, atingimentoGeral, acima80, melhor };
  }, [canais]);

  // Gráfico de barras: 6 meses terminando no mês selecionado
  const barras = useMemo(() => {
    const inicio = Math.max(0, mes - 5);
    const idxs: number[] = [];
    for (let i = inicio; i <= mes; i++) idxs.push(i);
    const lista = idxs.map((i) => ({
      mes: MESES[i],
      b2b: b2bAno[i] ?? 0,
      mp: mpAno[i] ?? 0,
      online: blingConectado ? (onlinePorMes[i] ?? 0) : 0,
    }));
    const max = Math.max(
      1,
      ...lista.flatMap((l) => [l.b2b, l.mp, l.online])
    );
    return { lista, max };
  }, [mes, b2bAno, mpAno, onlinePorMes, blingConectado]);

  // Tabela comparativa (todos os meses)
  const tabela = useMemo(() => {
    const linhas = MESES.map((nome, i) => {
      const b25 = b2b2025[i] ?? 0;
      const b26 = b2b2026[i] ?? 0;
      const mp26 = mp2026[i] ?? 0;
      const on26 = ano === 2026 && blingConectado ? (onlinePorMes[i] ?? 0) : 0;
      const total26 = b26 + mp26 + on26;
      const varB2B = b25 > 0 ? ((b26 - b25) / b25) * 100 : null;
      return { nome, b25, b26, mp26, on26, total26, varB2B };
    });
    const tot = linhas.reduce(
      (acc, l) => ({
        b25: acc.b25 + l.b25,
        b26: acc.b26 + l.b26,
        mp26: acc.mp26 + l.mp26,
        on26: acc.on26 + l.on26,
        total26: acc.total26 + l.total26,
      }),
      { b25: 0, b26: 0, mp26: 0, on26: 0, total26: 0 }
    );
    const varTotal = tot.b25 > 0 ? ((tot.b26 - tot.b25) / tot.b25) * 100 : null;
    return { linhas, tot, varTotal };
  }, [b2b2025, b2b2026, mp2026, onlinePorMes, ano, blingConectado]);

  const renderVar = (v: number | null) => {
    if (v === null) return <span className="text-muted-foreground">—</span>;
    return (
      <span className={v >= 0 ? "text-green-600" : "text-red-600"}>
        {v >= 0 ? "+" : ""}
        {v.toFixed(1)}%
      </span>
    );
  };

  function abrirEditarMetas() {
    setFormMeta({
      b2b: metaB2B ? String(metaB2B) : "",
      mp: metaMP ? String(metaMP) : "",
      online: metaOnline ? String(metaOnline) : "",
    });
    setEditOpen(true);
  }

  // Mantém o formulário sincronizado caso as metas mudem com o modal aberto
  useEffect(() => {
    if (editOpen) {
      setFormMeta({
        b2b: metaB2B ? String(metaB2B) : "",
        mp: metaMP ? String(metaMP) : "",
        online: metaOnline ? String(metaOnline) : "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes, ano]);

  async function salvarMetas() {
    setSalvando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("metas_visao_macro")
        .upsert(
          {
            mes: mes + 1,
            ano,
            meta_b2b: Number(formMeta.b2b) || 0,
            meta_marca_propria: Number(formMeta.mp) || 0,
            meta_online: Number(formMeta.online) || 0,
          },
          { onConflict: "mes,ano" }
        );
      if (error) {
        toast.error("Erro ao salvar metas: " + error.message);
        return;
      }
      toast.success("Metas atualizadas!");
      queryClient.invalidateQueries({ queryKey: ["metas-visao-macro"] });
      setEditOpen(false);
    } finally {
      setSalvando(false);
    }
  }

  console.log("blingConectado:", blingConectado, "vendasOnline:", vendasOnline?.length, "onlinePorMes:", onlinePorMes);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visão Macro</h1>
          <p className="text-sm text-muted-foreground">
            Desempenho por canal — B2B, Marca Própria e Online
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES.map((m, i) => (
                <SelectItem key={i} value={String(i)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {[2025, 2026].map((a) => (
            <Button
              key={a}
              variant={ano === a ? "default" : "outline"}
              onClick={() => setAno(a)}
            >
              {a}
            </Button>
          ))}
          <Button variant="outline" onClick={abrirEditarMetas}>
            <Pencil className="mr-2 h-4 w-4" />
            Editar Metas
          </Button>
          {blingConectado ? (
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Bling conectado
            </Badge>
          ) : (
            <Button onClick={() => { window.location.href = BLING_AUTH_URL; }}>
              <Link2 className="mr-2 h-4 w-4" />
              Conectar Bling
            </Button>
          )}
        </div>
      </div>

      {loadingB2B ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* KPIs globais */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total realizado</p>
                <p className="mt-1 text-2xl font-bold">{formatBRL(kpis.totalReal)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {MESES[mes]}/{ano}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Atingimento geral</p>
                <p className="mt-1 text-2xl font-bold">
                  {kpis.atingimentoGeral.toFixed(1)}%
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Meta {formatBRL(kpis.totalMeta)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Canais acima de 80%</p>
                <p className="mt-1 text-2xl font-bold">{kpis.acima80} / 3</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Melhor canal</p>
                <p className="mt-1 text-2xl font-bold">{kpis.melhor.nome}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {kpis.melhor.pct >= 0 ? `${kpis.melhor.pct.toFixed(1)}%` : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Cards dos 3 canais */}
          <div className="grid gap-4 md:grid-cols-3">
            {canais.map((c) => {
              const pct = pctAtingimento(c.realizado, c.meta);
              const diff = c.realizado - c.meta;
              const status = statusCanal(pct);
              const semDados = c.pendente && c.realizado === 0;
              return (
                <Card key={c.key}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: c.cor }}
                        />
                        {c.nome}
                      </CardTitle>
                      <Badge className={status.className}>{status.label}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-2xl font-bold">{formatBRL(c.realizado)}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-muted-foreground">
                          {pct.toFixed(1)}% da meta
                        </p>
                        {semDados && (
                          <span className="text-xs text-muted-foreground">
                            · Dados pendentes
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Barra de progresso */}
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, pct)}%`,
                          backgroundColor: corBarraProgresso(pct),
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        Meta: {formatBRL(c.meta)}
                      </span>
                      <span className={diff < 0 ? "text-red-600" : "text-green-600"}>
                        {diff >= 0 ? "+" : ""}
                        {formatBRL(diff)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Gráfico de barras mensal */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Faturamento por canal — últimos meses
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingOnline && (
                <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Carregando vendas online…
                </div>
              )}
              <div className="flex items-end justify-between gap-3 h-56">
                {barras.lista.map((l) => (
                  <div
                    key={l.mes}
                    className="flex h-full flex-1 flex-col items-center justify-end"
                  >
                    <div className="flex h-full w-full items-end justify-center gap-1">
                      <div
                        className="w-1/3 rounded-t transition-all"
                        style={{
                          height: `${(l.b2b / barras.max) * 100}%`,
                          backgroundColor: COR_B2B,
                          minHeight: l.b2b > 0 ? "4px" : "0px",
                        }}
                        title={`B2B: ${formatBRL(l.b2b)}`}
                      />
                      <div
                        className="w-1/3 rounded-t transition-all"
                        style={{
                          height: `${(l.mp / barras.max) * 100}%`,
                          backgroundColor: COR_MP,
                          minHeight: l.mp > 0 ? "4px" : "0px",
                        }}
                        title={`Marca Própria: ${formatBRL(l.mp)}`}
                      />
                      <div
                        className="w-1/3 rounded-t transition-all"
                        style={{
                          height: `${(l.online / barras.max) * 100}%`,
                          backgroundColor: COR_ONLINE,
                          minHeight: l.online > 0 ? "4px" : "0px",
                        }}
                        title={`Online: ${formatBRL(l.online)}`}
                      />
                    </div>
                    <span className="mt-1 text-xs text-muted-foreground">{l.mes}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-6 text-xs">
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: COR_B2B }} />
                  B2B
                </span>
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: COR_MP }} />
                  Marca Própria
                </span>
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: COR_ONLINE }} />
                  Online
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Tabela comparativa */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Comparativo mensal por canal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Mês</th>
                      <th className="py-2 pr-4 text-right font-medium">B2B 2025</th>
                      <th className="py-2 pr-4 text-right font-medium">B2B 2026</th>
                      <th className="py-2 pr-4 text-right font-medium">MP 2026</th>
                      <th className="py-2 pr-4 text-right font-medium">Online 2026</th>
                      <th className="py-2 pr-4 text-right font-medium">Total 2026</th>
                      <th className="py-2 text-right font-medium">Var% B2B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabela.linhas.map((l) => (
                      <tr key={l.nome} className="border-b last:border-0">
                        <td className="py-2 pr-4">{l.nome}</td>
                        <td className="py-2 pr-4 text-right">{formatBRL(l.b25)}</td>
                        <td className="py-2 pr-4 text-right">{formatBRL(l.b26)}</td>
                        <td className="py-2 pr-4 text-right">{formatBRL(l.mp26)}</td>
                        <td className="py-2 pr-4 text-right">{formatBRL(l.on26)}</td>
                        <td className="py-2 pr-4 text-right">{formatBRL(l.total26)}</td>
                        <td className="py-2 text-right">{renderVar(l.varB2B)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-semibold">
                      <td className="py-2 pr-4">Total</td>
                      <td className="py-2 pr-4 text-right">{formatBRL(tabela.tot.b25)}</td>
                      <td className="py-2 pr-4 text-right">{formatBRL(tabela.tot.b26)}</td>
                      <td className="py-2 pr-4 text-right">{formatBRL(tabela.tot.mp26)}</td>
                      <td className="py-2 pr-4 text-right">{formatBRL(tabela.tot.on26)}</td>
                      <td className="py-2 pr-4 text-right">{formatBRL(tabela.tot.total26)}</td>
                      <td className="py-2 text-right">{renderVar(tabela.varTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Modal Editar Metas */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Editar metas — {MESES[mes]}/{ano}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Meta B2B (R$)</Label>
              <Input
                type="number"
                value={formMeta.b2b}
                onChange={(e) => setFormMeta((f) => ({ ...f, b2b: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <Label>Meta Marca Própria (R$)</Label>
              <Input
                type="number"
                value={formMeta.mp}
                onChange={(e) => setFormMeta((f) => ({ ...f, mp: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <Label>Meta Online (R$)</Label>
              <Input
                type="number"
                value={formMeta.online}
                onChange={(e) => setFormMeta((f) => ({ ...f, online: e.target.value }))}
                placeholder="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarMetas} disabled={salvando}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
