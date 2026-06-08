import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";

type SankhyaRow = {
  data_faturamento: string | null;
  valor_liquido: number | null;
  tipo_operacao: string | null;
  numero_nota: string | null;
  nome_vendedor: string | null;
  nome_parceiro: string | null;
  uf: string | null;
};

const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const VERDE = "#0F6E56";
const CINZA = "#9CA3AF";

// Busca todos os registros B2B (paginado) entre 2025-01-01 e o fim do ano selecionado.
// B2B = exclui devoluções (em qualquer grafia) e bonificações.
async function fetchFaturamentosB2B(anoSelecionado: number): Promise<SankhyaRow[]> {
  const all: SankhyaRow[] = [];
  const pageSize = 1000;
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("faturamentos_sankhya")
      .select(
        "data_faturamento, valor_liquido, tipo_operacao, numero_nota, nome_vendedor, nome_parceiro, uf"
      )
      .gte("data_faturamento", "2025-01-01")
      .lte("data_faturamento", `${anoSelecionado}-12-31`)
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

export default function VisaoMacro() {
  const [anoSelecionado, setAnoSelecionado] = useState(2026);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["visao-macro-sankhya", anoSelecionado],
    queryFn: () => fetchFaturamentosB2B(anoSelecionado),
  });

  // KPIs do ano selecionado
  const kpis = useMemo(() => {
    const doAno = (rows ?? []).filter((r) => getAno(r) === anoSelecionado);
    const total = doAno.reduce((acc, r) => acc + (r.valor_liquido ?? 0), 0);
    const notas = new Set(
      doAno.map((r) => r.numero_nota).filter((n): n is string => !!n)
    );
    const numNotas = notas.size;
    const ticketMedio = numNotas > 0 ? total / numNotas : 0;
    return { total, ticketMedio, numNotas };
  }, [rows, anoSelecionado]);

  // Tabela mensal comparativa 2025 x 2026
  const mensal = useMemo(() => {
    const v2025 = new Array(12).fill(0);
    const v2026 = new Array(12).fill(0);
    for (const r of rows ?? []) {
      const ano = getAno(r);
      const mes = getMesIndex(r);
      if (mes === null) continue;
      const val = r.valor_liquido ?? 0;
      if (ano === 2025) v2025[mes] += val;
      else if (ano === 2026) v2026[mes] += val;
    }
    const linhas = MESES.map((mes, i) => ({
      mes,
      v2025: v2025[i],
      v2026: v2026[i],
      variacao: v2025[i] > 0 ? ((v2026[i] - v2025[i]) / v2025[i]) * 100 : null,
    }));
    const total2025 = v2025.reduce((a, b) => a + b, 0);
    const total2026 = v2026.reduce((a, b) => a + b, 0);
    const variacaoTotal =
      total2025 > 0 ? ((total2026 - total2025) / total2025) * 100 : null;
    return { linhas, total2025, total2026, variacaoTotal };
  }, [rows]);

  // Barras: apenas meses com pelo menos um valor > 0
  const barras = useMemo(() => {
    const lista = mensal.linhas.filter((l) => l.v2025 > 0 || l.v2026 > 0);
    const max = Math.max(1, ...lista.map((l) => Math.max(l.v2025, l.v2026)));
    return { lista, max };
  }, [mensal]);

  // Top 10 vendedores do ano selecionado
  const topVendedores = useMemo(() => {
    const map = new Map<string, { total: number; notas: Set<string> }>();
    for (const r of rows ?? []) {
      if (getAno(r) !== anoSelecionado) continue;
      const nome = r.nome_vendedor?.trim() || "—";
      const entry = map.get(nome) ?? { total: 0, notas: new Set<string>() };
      entry.total += r.valor_liquido ?? 0;
      if (r.numero_nota) entry.notas.add(r.numero_nota);
      map.set(nome, entry);
    }
    return Array.from(map.entries())
      .map(([nome, e]) => ({ nome, total: e.total, numNotas: e.notas.size }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [rows, anoSelecionado]);

  // Top 10 clientes do ano selecionado
  const topClientes = useMemo(() => {
    const map = new Map<string, { total: number; uf: string }>();
    for (const r of rows ?? []) {
      if (getAno(r) !== anoSelecionado) continue;
      const nome = r.nome_parceiro?.trim() || "—";
      const entry = map.get(nome) ?? { total: 0, uf: r.uf?.trim() || "—" };
      entry.total += r.valor_liquido ?? 0;
      if (!entry.uf || entry.uf === "—") entry.uf = r.uf?.trim() || "—";
      map.set(nome, entry);
    }
    return Array.from(map.entries())
      .map(([nome, e]) => ({ nome, total: e.total, uf: e.uf }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [rows, anoSelecionado]);

  const renderVariacao = (v: number | null) => {
    if (v === null) return <span className="text-muted-foreground">—</span>;
    const sinal = v >= 0 ? "+" : "";
    return (
      <span className={v >= 0 ? "text-green-600" : "text-red-600"}>
        {sinal}
        {v.toFixed(1)}%
      </span>
    );
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visão Macro</h1>
          <p className="text-sm text-muted-foreground">
            Faturamento B2B — dados Sankhya
          </p>
        </div>
        <div className="flex gap-2">
          {[2025, 2026].map((ano) => (
            <Button
              key={ano}
              variant={anoSelecionado === ano ? "default" : "outline"}
              onClick={() => setAnoSelecionado(ano)}
            >
              {ano}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Card 1 — KPIs */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Indicadores B2B — {anoSelecionado}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">
                    Total B2B faturado
                  </p>
                  <p className="mt-1 text-2xl font-bold" style={{ color: VERDE }}>
                    {formatBRL(kpis.total)}
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">
                    Ticket médio por nota
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {formatBRL(kpis.ticketMedio)}
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">
                    Total de notas emitidas
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {kpis.numNotas.toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2 — Tabela mensal comparativa */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Comparativo mensal B2B — 2025 x 2026
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
                      <th className="py-2 text-right font-medium">Variação %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mensal.linhas.map((l) => (
                      <tr key={l.mes} className="border-b last:border-0">
                        <td className="py-2 pr-4">{l.mes}</td>
                        <td className="py-2 pr-4 text-right">
                          {formatBRL(l.v2025)}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {formatBRL(l.v2026)}
                        </td>
                        <td className="py-2 text-right">
                          {renderVariacao(l.variacao)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-semibold">
                      <td className="py-2 pr-4">Total</td>
                      <td className="py-2 pr-4 text-right">
                        {formatBRL(mensal.total2025)}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {formatBRL(mensal.total2026)}
                      </td>
                      <td className="py-2 text-right">
                        {renderVariacao(mensal.variacaoTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Card 3 — Gráfico de barras mensal */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Faturamento mensal B2B — 2025 x 2026
              </CardTitle>
            </CardHeader>
            <CardContent>
              {barras.lista.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Sem dados para exibir.
                </p>
              ) : (
                <>
                  <div className="flex items-end justify-between gap-2 h-56">
                    {barras.lista.map((l) => (
                      <div
                        key={l.mes}
                        className="flex h-full flex-1 flex-col items-center justify-end"
                      >
                        <div className="flex h-full w-full items-end justify-center gap-1">
                          <div
                            className="w-1/2 rounded-t transition-all"
                            style={{
                              height: `${(l.v2025 / barras.max) * 100}%`,
                              backgroundColor: CINZA,
                              minHeight: l.v2025 > 0 ? "4px" : "0px",
                            }}
                            title={`2025: ${formatBRL(l.v2025)}`}
                          />
                          <div
                            className="w-1/2 rounded-t transition-all"
                            style={{
                              height: `${(l.v2026 / barras.max) * 100}%`,
                              backgroundColor: VERDE,
                              minHeight: l.v2026 > 0 ? "4px" : "0px",
                            }}
                            title={`2026: ${formatBRL(l.v2026)}`}
                          />
                        </div>
                        <span className="mt-1 text-xs text-muted-foreground">
                          {l.mes}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-center gap-6 text-xs">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded"
                        style={{ backgroundColor: CINZA }}
                      />
                      2025
                    </span>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded"
                        style={{ backgroundColor: VERDE }}
                      />
                      2026
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Card 4 — Top 10 vendedores */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Top 10 vendedores — {anoSelecionado}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Vendedor</th>
                        <th className="py-2 pr-4 text-right font-medium">
                          Total faturado
                        </th>
                        <th className="py-2 text-right font-medium">Nº notas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topVendedores.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="py-6 text-center text-muted-foreground"
                          >
                            Sem dados.
                          </td>
                        </tr>
                      ) : (
                        topVendedores.map((v) => (
                          <tr key={v.nome} className="border-b last:border-0">
                            <td className="py-2 pr-4">{v.nome}</td>
                            <td className="py-2 pr-4 text-right">
                              {formatBRL(v.total)}
                            </td>
                            <td className="py-2 text-right">
                              {v.numNotas.toLocaleString("pt-BR")}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Card 5 — Top 10 clientes */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Top 10 clientes — {anoSelecionado}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Cliente</th>
                        <th className="py-2 pr-4 font-medium">UF</th>
                        <th className="py-2 text-right font-medium">
                          Total faturado
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {topClientes.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="py-6 text-center text-muted-foreground"
                          >
                            Sem dados.
                          </td>
                        </tr>
                      ) : (
                        topClientes.map((c) => (
                          <tr key={c.nome} className="border-b last:border-0">
                            <td className="py-2 pr-4">{c.nome}</td>
                            <td className="py-2 pr-4">{c.uf}</td>
                            <td className="py-2 text-right">
                              {formatBRL(c.total)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
