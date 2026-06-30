import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown } from "lucide-react";
import { formatBRL } from "@/lib/format";

// Desempenho de um vendedor dentro de uma campanha (já com nível derivado).
export type RankingCampanhaVendedor = {
  vendedor_id: string;
  nome: string;
  fatCampanha: number;
  nivel: string | null;
  metaVendedor: number | null;
  categoriaInicial: string | null;
  nivelExibido: string | null;
};

// View-model de uma campanha ativa, já com entrada/meta/ranking calculados no
// Dashboard. Renderiza-se um card destes por campanha ativa (podem ser várias).
export type CampanhaDashboardView = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  campanha: any;
  entrada: number;
  metaTotalCampanha: number;
  ranking: RankingCampanhaVendedor[];
};

// Cores por marca — espelha MeuPainel.tsx / Dashboard.tsx (reuso de valores existentes).
const MARCA_CORES: Record<string, string> = {
  "Bendita Cânfora": "#7f77dd",
  "Laby": "#378add",
  "Bravir": "#888780",
  "Alivik": "#1d9e75",
};

function nivelBadgeClass(nivel: string) {
  const n = nivel.toLowerCase();
  if (n.includes("diamante")) return "bg-purple-100 text-purple-800 hover:bg-purple-100";
  if (n.includes("ouro")) return "bg-yellow-100 text-yellow-800 hover:bg-yellow-100";
  if (n.includes("prata")) return "bg-gray-100 text-gray-700 hover:bg-gray-100";
  if (n.includes("bronze")) return "bg-orange-100 text-orange-800 hover:bg-orange-100";
  return "bg-gray-100 text-gray-700 hover:bg-gray-100";
}

export default function CampanhaDashboardCard({ view }: { view: CampanhaDashboardView }) {
  const { campanha, entrada, metaTotalCampanha, ranking } = view;
  const [vendedorExpandido, setVendedorExpandido] = useState<string | null>(null);

  // Níveis ordenados por `ordem` (asc) — exibidos na tabela de níveis.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const niveisOrdenados: any[] = [...((campanha.campanha_niveis ?? []) as any[])].sort(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0),
  );

  const campanhaPct = metaTotalCampanha > 0 ? Math.min((entrada / metaTotalCampanha) * 100, 100) : 0;
  const campanhaDiasRestantes = campanha?.data_fim
    ? Math.max(0, Math.ceil((new Date(campanha.data_fim).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;
  const campanhaTotalDias = campanha?.data_inicio && campanha?.data_fim
    ? Math.max(0, Math.ceil((new Date(campanha.data_fim).getTime() - new Date(campanha.data_inicio).getTime()) / 86400000))
    : 0;
  const campanhaDiasPassados = campanha?.data_inicio
    ? Math.min(campanhaTotalDias, Math.max(0, Math.ceil((Date.now() - new Date(campanha.data_inicio).getTime()) / 86400000)))
    : 0;

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {/* Área superior */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Esquerda: info da campanha */}
          <div className="flex-1 space-y-2">
            <h3 className="text-xl font-bold">{campanha.nome}</h3>
            {campanha.descricao && (
              <p className="text-sm text-muted-foreground">{campanha.descricao}</p>
            )}
            {Array.isArray(campanha.marcas) && campanha.marcas.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {(campanha.marcas as string[]).map((m) => (
                  <Badge
                    key={m}
                    style={{ backgroundColor: MARCA_CORES[m] ?? "#888780", color: "#fff", border: "none" }}
                  >
                    {m}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Direita: tabela de níveis */}
          {niveisOrdenados.length > 0 && (
            <div className="flex-1 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nível</TableHead>
                    <TableHead>De</TableHead>
                    <TableHead>Até</TableHead>
                    <TableHead>Prêmio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {niveisOrdenados.map((nivel: any) => (
                    <TableRow key={nivel.id}>
                      <TableCell className="font-medium">{nivel.nome}</TableCell>
                      <TableCell>{formatBRL(nivel.valor_minimo)}</TableCell>
                      <TableCell>{nivel.valor_maximo == null ? "Sem limite" : formatBRL(nivel.valor_maximo)}</TableCell>
                      <TableCell className="text-sm">{nivel.descricao_premio}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Separador */}
        <div className="border-t" />

        {/* Área inferior: progresso */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Meta: {formatBRL(metaTotalCampanha)} → Entrada: {formatBRL(entrada)} · {campanhaPct.toFixed(1)}% da meta
            </span>
            <span className="text-muted-foreground">{campanhaDiasRestantes} dias restantes</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full transition-all"
              style={{ width: `${campanhaPct}%`, backgroundColor: "#1A6B3A" }}
            />
          </div>
        </div>

        {/* Desempenho por vendedor */}
        {ranking.length > 0 && (
          <>
            <div className="border-t" />
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                Desempenho por vendedor
              </p>
              <div>
                {ranking.map((r, idx) => {
                  const diasRestantes = campanhaTotalDias - campanhaDiasPassados;
                  const metaVendedor = r.metaVendedor;
                  const fatCampanha = r.fatCampanha;
                  const pctAtingimento = metaVendedor && metaVendedor > 0
                    ? Math.min((fatCampanha / metaVendedor) * 100, 100)
                    : 0;
                  const pctEsperado = campanhaTotalDias > 0
                    ? (campanhaDiasPassados / campanhaTotalDias) * 100
                    : 0;
                  const ritmoNecessario = metaVendedor && campanhaTotalDias > 0
                    ? metaVendedor / campanhaTotalDias
                    : null;
                  const ritmoAtual = campanhaDiasPassados > 0
                    ? fatCampanha / campanhaDiasPassados
                    : 0;
                  const status = !metaVendedor ? "sem_meta"
                    : ritmoNecessario !== null && ritmoAtual >= ritmoNecessario ? "verde"
                    : ritmoNecessario !== null && ritmoAtual >= ritmoNecessario * 0.9 ? "amarelo"
                    : "vermelho";
                  const statusLabel = status === "verde" ? "Em linha"
                    : status === "amarelo" ? "Próximo"
                    : status === "vermelho" ? "Abaixo"
                    : "Sem meta";
                  const statusBadgeClass = status === "verde" ? "bg-green-100 text-green-800"
                    : status === "amarelo" ? "bg-yellow-100 text-yellow-800"
                    : status === "vermelho" ? "bg-red-100 text-red-800"
                    : "bg-gray-100 text-gray-600";
                  const avatarClass = status === "verde" ? "bg-green-50 text-green-800"
                    : status === "amarelo" ? "bg-yellow-50 text-yellow-800"
                    : status === "vermelho" ? "bg-red-50 text-red-800"
                    : "bg-muted text-muted-foreground";
                  const barColor = status === "verde" ? "#22c55e"
                    : status === "amarelo" ? "#eab308"
                    : status === "vermelho" ? "#ef4444"
                    : "#d1d5db";
                  const metaAtingida = metaVendedor != null && fatCampanha >= metaVendedor;
                  const necessarioPorDia = metaVendedor != null && !metaAtingida && diasRestantes > 0
                    ? (metaVendedor - fatCampanha) / diasRestantes
                    : null;
                  const diffPct = pctAtingimento - pctEsperado;
                  const iniciais = r.nome.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
                  const expandido = vendedorExpandido === r.vendedor_id;

                  return (
                    <div
                      key={r.vendedor_id}
                      className={idx < ranking.length - 1 ? "border-b" : ""}
                    >
                      {/* Linha resumida — clicável */}
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 py-3 text-left"
                        onClick={() => setVendedorExpandido(expandido ? null : r.vendedor_id)}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${avatarClass}`}>
                          {iniciais}
                        </div>
                        <span className="flex-1 font-medium text-sm">{r.nome}</span>
                        {/* Mini barra de progresso */}
                        <div className="shrink-0 rounded-full bg-muted overflow-hidden" style={{ width: 80, height: 4 }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pctAtingimento}%`, backgroundColor: barColor }}
                          />
                        </div>
                        {/* Percentual */}
                        <span className="text-xs tabular-nums text-right shrink-0" style={{ width: 36 }}>
                          {pctAtingimento.toFixed(0)}%
                        </span>
                        {/* Badge status */}
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium shrink-0 ${statusBadgeClass}`}>
                          {statusLabel}
                        </span>
                        {/* Badge nível */}
                        {r.nivelExibido && (
                          <Badge className={`${nivelBadgeClass(r.nivelExibido)} text-xs shrink-0`}>{r.nivelExibido}</Badge>
                        )}
                        <ChevronDown
                          className="h-4 w-4 text-muted-foreground shrink-0 transition-transform"
                          style={{ transform: expandido ? "rotate(180deg)" : "rotate(0deg)" }}
                        />
                      </button>

                      {/* Detalhe expandido */}
                      {expandido && (
                        <div className="pb-4 space-y-3">
                          {/* 4 metric cards */}
                          <div className="grid grid-cols-4 gap-2">
                            <div className="bg-muted rounded-md p-3">
                              <div className="text-xs text-muted-foreground mb-1">Meta</div>
                              <div className="text-sm font-medium">
                                {metaVendedor ? formatBRL(metaVendedor) : "Sem meta"}
                              </div>
                            </div>
                            <div className="bg-muted rounded-md p-3">
                              <div className="text-xs text-muted-foreground mb-1">Realizado</div>
                              <div className={`text-sm font-medium ${status === "verde" ? "text-green-600" : status === "vermelho" ? "text-red-600" : ""}`}>
                                {formatBRL(fatCampanha)}
                              </div>
                            </div>
                            <div className="bg-muted rounded-md p-3">
                              <div className="text-xs text-muted-foreground mb-1">Meta/dia necessária</div>
                              <div className="text-sm font-medium">
                                {metaVendedor && campanhaTotalDias > 0
                                  ? `${formatBRL(metaVendedor / campanhaTotalDias)}/dia`
                                  : "—"}
                              </div>
                            </div>
                            <div className="bg-muted rounded-md p-3">
                              <div className="text-xs text-muted-foreground mb-1">Nec. p/ fechar</div>
                              <div className={`text-sm font-medium ${metaAtingida ? "text-green-600" : ""}`}>
                                {metaAtingida
                                  ? "Meta atingida!"
                                  : necessarioPorDia != null
                                  ? `${formatBRL(necessarioPorDia)}/dia`
                                  : "—"}
                              </div>
                            </div>
                          </div>

                          {/* Barra de progresso full width */}
                          {metaVendedor != null && (
                            <div>
                              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${pctAtingimento}%`, backgroundColor: barColor }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                                <span>{pctAtingimento.toFixed(1)}%</span>
                                <span>
                                  Deveria estar em {Math.round(campanhaDiasPassados / Math.max(campanhaTotalDias, 1) * 100)}%
                                  {" · "}{diffPct >= 0 ? "+" : ""}{diffPct.toFixed(1)}% {diffPct >= 0 ? "acima" : "abaixo"}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
