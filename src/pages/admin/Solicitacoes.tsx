import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { Loader2, Eye, Sheet } from "lucide-react";

const VERDE = "#0F6E56";

interface ChatMensagem {
  role: "user" | "assistant" | string;
  content: string;
}

interface Solicitacao {
  id: string;
  tipo: string;
  tela: string | null;
  titulo: string | null;
  descricao: string;
  motivo: string | null;
  prioridade: string;
  status: string;
  criado_por: string | null;
  criado_por_nome: string | null;
  created_at: string | null;
  // Campos opcionais — presentes apenas se existirem na tabela viva.
  mockup_prompt?: string | null;
  chat_historico?: ChatMensagem[] | null;
  link_teste?: string | null;
  motivo_devolucao?: string | null;
}

/* ───────────────────────── Metadados de exibição ───────────────────────── */

const TIPO_META: Record<string, { label: string; cls: string }> = {
  bug: { label: "Bug", cls: "bg-red-100 text-red-800 border-red-300" },
  nova: { label: "Nova feature", cls: "bg-blue-100 text-blue-800 border-blue-300" },
  altera: { label: "Melhoria", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
};

function tipoMeta(t: string) {
  return TIPO_META[t] ?? { label: t, cls: "bg-gray-100 text-gray-700 border-gray-300" };
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  aberto: { label: "Aberto", cls: "bg-blue-100 text-blue-800 border-blue-300" },
  em_analise: { label: "Em análise", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  "em-andamento": { label: "Em andamento", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  aprovado: { label: "Aprovado", cls: "bg-green-100 text-green-800 border-green-300" },
  reprovado: { label: "Reprovado", cls: "bg-red-100 text-red-800 border-red-300" },
  devolvido: { label: "Devolvido pelo colaborador", cls: "bg-purple-100 text-purple-800 border-purple-300" },
  concluido: { label: "Concluído", cls: "bg-green-100 text-green-800 border-green-300" },
  recusado: { label: "Recusado", cls: "bg-red-100 text-red-800 border-red-300" },
};

function statusMeta(s: string) {
  return STATUS_META[s] ?? { label: s, cls: "bg-gray-100 text-gray-700 border-gray-300" };
}

const PRIO_META: Record<string, { label: string; cls: string }> = {
  urgente: { label: "Urgente", cls: "bg-red-100 text-red-800 border-red-300" },
  alta: { label: "Alta", cls: "bg-orange-100 text-orange-800 border-orange-300" },
  normal: { label: "Normal", cls: "bg-gray-100 text-gray-700 border-gray-300" },
  baixa: { label: "Baixa", cls: "bg-green-100 text-green-800 border-green-300" },
};

function prioMeta(p: string) {
  return PRIO_META[p] ?? { label: p, cls: "bg-gray-100 text-gray-700 border-gray-300" };
}

const TIPO_FILTERS = [
  { value: "todos", label: "Todos" },
  { value: "bug", label: "Bug" },
  { value: "nova", label: "Nova feature" },
  { value: "altera", label: "Melhoria" },
];

function relativo(iso: string | null) {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return "";
  }
}

function dataCompleta(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ───────────────────────────── Página ───────────────────────────── */

export default function Solicitacoes() {
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [filterTipo, setFilterTipo] = useState<string>("todos");
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [filterColaborador, setFilterColaborador] = useState<string>("");
  const [filterDataDe, setFilterDataDe] = useState<string>("");
  const [filterDataAte, setFilterDataAte] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // KPIs — count do Supabase por status.
  const { data: kpis } = useQuery({
    queryKey: ["solicitacoes_gestor_kpis"],
    queryFn: async () => {
      const contar = async (status: string) => {
        const { count, error } = await supabase
          .from("solicitacoes_gestor")
          .select("*", { count: "exact", head: true })
          .eq("status", status);
        if (error) throw error;
        return count ?? 0;
      };
      const [aberto, emAnalise, aprovado, devolvido, reprovado] = await Promise.all([
        contar("aberto"),
        contar("em_analise"),
        contar("aprovado"),
        contar("devolvido"),
        contar("reprovado"),
      ]);
      return { aberto, emAnalise, aprovado, devolvido, reprovado };
    },
  });

  const { data: solicitacoes = [], isLoading } = useQuery({
    queryKey: ["solicitacoes_gestor"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_gestor")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Solicitacao[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({
      id,
      status,
      motivo_devolucao,
    }: {
      id: string;
      status: string;
      motivo_devolucao?: string | null;
    }) => {
      const patch: Record<string, unknown> = { status };
      if (motivo_devolucao !== undefined) patch.motivo_devolucao = motivo_devolucao;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- colunas novas ainda não estão no types.ts gerado
      const { error } = await (supabase as any)
        .from("solicitacoes_gestor")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["solicitacoes_gestor"] }),
        qc.invalidateQueries({ queryKey: ["solicitacoes_gestor_kpis"] }),
      ]);
      toast.success("Status atualizado");
    },
    onError: (e: unknown) => {
      console.error("Erro UPDATE status:", e);
      toast.error("Erro ao atualizar status: " + (e instanceof Error ? e.message : "desconhecido"));
    },
  });

  const filtered = solicitacoes.filter((s) => {
    if (filterTipo !== "todos" && s.tipo !== filterTipo) return false;
    if (filterStatus !== "todos" && s.status !== filterStatus) return false;
    if (
      filterColaborador.trim() &&
      !(s.criado_por_nome ?? "").toLowerCase().includes(filterColaborador.trim().toLowerCase())
    )
      return false;
    if (filterDataDe || filterDataAte) {
      const dia = s.created_at ? s.created_at.slice(0, 10) : "";
      if (!dia) return false;
      if (filterDataDe && dia < filterDataDe) return false;
      if (filterDataAte && dia > filterDataAte) return false;
    }
    return true;
  });

  const selected = solicitacoes.find((s) => s.id === selectedId) ?? null;

  async function exportarExcel() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Solicitações");

    const colunas = [
      { header: "Data", key: "data" },
      { header: "Criado por", key: "criado_por" },
      { header: "Tipo", key: "tipo" },
      { header: "Status", key: "status" },
      { header: "Prioridade", key: "prioridade" },
      { header: "Tela", key: "tela" },
      { header: "Título", key: "titulo" },
      { header: "Descrição", key: "descricao" },
      { header: "Motivo", key: "motivo" },
      { header: "Conversa", key: "conversa" },
    ];
    ws.columns = colunas.map((c) => ({ header: c.header, key: c.key }));

    const formatarConversa = (chat?: ChatMensagem[] | null) => {
      if (!Array.isArray(chat) || chat.length === 0) return "";
      return chat
        .map((m) => {
          const autor = m.role === "user" ? "Colaborador" : "Assistente";
          return `[${autor}]: ${m.content}`;
        })
        .join("\n");
    };

    filtered.forEach((s) => {
      ws.addRow({
        data: dataCompleta(s.created_at),
        criado_por: s.criado_por_nome ?? "",
        tipo: tipoMeta(s.tipo).label,
        status: statusMeta(s.status).label,
        prioridade: prioMeta(s.prioridade).label,
        tela: s.tela ?? "",
        titulo: s.titulo ?? "",
        descricao: s.descricao ?? "",
        motivo: s.motivo ?? "",
        conversa: formatarConversa(s.chat_historico),
      });
    });

    // Cabeçalho verde com texto branco em bold
    const header = ws.getRow(1);
    header.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0F6E56" },
      };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    });

    // Linhas alternadas branco / verde clarinho
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      if (rowNumber % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFE1F5EE" },
          };
        });
      }
    });

    // Largura automática (min 15, max 60)
    ws.columns.forEach((col) => {
      let max = 0;
      col.eachCell?.({ includeEmpty: true }, (cell) => {
        const valor = cell.value ? String(cell.value) : "";
        const maisLonga = valor
          .split("\n")
          .reduce((m, linha) => Math.max(m, linha.length), 0);
        if (maisLonga > max) max = maisLonga;
      });
      col.width = Math.min(60, Math.max(15, max + 2));
    });

    // Congelar linha de cabeçalho
    ws.views = [{ state: "frozen", ySplit: 1 }];

    const hoje = new Date().toISOString().slice(0, 10);
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `solicitacoes-${hoje}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const kpiCards = [
    { label: "Em aberto", value: kpis?.aberto ?? 0, color: "text-blue-700" },
    { label: "Em análise", value: kpis?.emAnalise ?? 0, color: "text-amber-700" },
    { label: "Aprovados", value: kpis?.aprovado ?? 0, color: "text-green-700" },
    { label: "Devolvidos", value: kpis?.devolvido ?? 0, color: "text-purple-700" },
    { label: "Reprovados", value: kpis?.reprovado ?? 0, color: "text-red-700" },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold">Solicitações</h1>
        <p className="text-sm text-muted-foreground">Feedbacks da equipe</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpiCards.map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className={`text-3xl font-bold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Coluna esquerda — lista */}
        <div className="flex-1 w-full space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-2">
              {TIPO_FILTERS.map((t) => (
                <Button
                  key={t.value}
                  type="button"
                  size="sm"
                  variant={filterTipo === t.value ? "default" : "outline"}
                  onClick={() => setFilterTipo(t.value)}
                >
                  {t.label}
                </Button>
              ))}
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40 ml-auto">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="aberto">Aberto</SelectItem>
                <SelectItem value="em_analise">Em análise</SelectItem>
                <SelectItem value="aprovado">Aprovado</SelectItem>
                <SelectItem value="reprovado">Reprovado</SelectItem>
                <SelectItem value="devolvido">Devolvido pelo colaborador</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={filtered.length === 0}
              onClick={exportarExcel}
            >
              <Sheet className="mr-2 h-4 w-4" />
              Exportar Excel
            </Button>

            {/* Segunda linha — colaborador e datas */}
            <div className="flex flex-wrap items-center gap-3 w-full">
              <Input
                value={filterColaborador}
                onChange={(e) => setFilterColaborador(e.target.value)}
                placeholder="Buscar colaborador..."
                className="w-48"
              />
              <Input
                type="date"
                value={filterDataDe}
                onChange={(e) => setFilterDataDe(e.target.value)}
                className="w-36"
                title="De"
              />
              <Input
                type="date"
                value={filterDataAte}
                onChange={(e) => setFilterDataAte(e.target.value)}
                className="w-36"
                title="Até"
              />
            </div>
          </div>

          {/* Lista */}
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              Nenhuma solicitação encontrada.
            </p>
          ) : (
            <div className="space-y-3">
              {filtered.map((s) => {
                const tm = tipoMeta(s.tipo);
                const sm = statusMeta(s.status);
                const pm = prioMeta(s.prioridade);
                const resumo = s.titulo || `${s.descricao.slice(0, 80)}${s.descricao.length > 80 ? "…" : ""}`;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className="w-full text-left focus:outline-none"
                  >
                    <Card
                      className={`transition-colors hover:bg-muted/50 ${
                        selectedId === s.id ? "ring-2 ring-primary" : ""
                      }`}
                    >
                      <CardContent className="pt-4 pb-4 px-5 space-y-2">
                        <div className="flex flex-wrap gap-2 items-center">
                          <Badge className={`border text-xs font-semibold ${tm.cls}`}>{tm.label}</Badge>
                          <Badge className={`border text-xs font-semibold ${sm.cls}`}>{sm.label}</Badge>
                          <Badge className={`border text-xs font-semibold ${pm.cls}`}>{pm.label}</Badge>
                        </div>
                        <p className="text-sm font-medium">{resumo}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {s.tela && <span>{s.tela}</span>}
                          {s.criado_por_nome && (
                            <span>
                              Por <span className="font-medium text-foreground">{s.criado_por_nome}</span>
                            </span>
                          )}
                          <span className="ml-auto">{relativo(s.created_at)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Coluna direita — detalhe (desktop, sticky) */}
        {!isMobile && (
          <div className="w-[380px] shrink-0 sticky top-6">
            {selected ? (
              <DetalhePainel
                key={selected.id}
                solicitacao={selected}
                onStatus={(status, extra) =>
                  updateStatus.mutate({ id: selected.id, status, ...extra })
                }
              />
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  Selecione uma solicitação para ver os detalhes.
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Detalhe (mobile, dialog) */}
      {isMobile && (
        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto p-0 bg-transparent border-0 shadow-none">
            {selected && (
              <DetalhePainel
                key={selected.id}
                solicitacao={selected}
                onStatus={(status, extra) =>
                  updateStatus.mutate({ id: selected.id, status, ...extra })
                }
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ─────────────────────── Painel de detalhe (3 cards) ─────────────────────── */

function DetalhePainel({
  solicitacao: s,
  onStatus,
}: {
  solicitacao: Solicitacao;
  onStatus: (
    status: string,
    extra?: { motivo_devolucao?: string | null },
  ) => void;
}) {
  const tm = tipoMeta(s.tipo);
  const sm = statusMeta(s.status);
  const pm = prioMeta(s.prioridade);

  const chat = Array.isArray(s.chat_historico) ? s.chat_historico : [];

  // Sub-formulário inline para reprovar (motivo). Aprovação é direta.
  const [acao, setAcao] = useState<"none" | "reprovar">("none");
  const [motivoReprovacao, setMotivoReprovacao] = useState("");

  return (
    <div className="space-y-4">
      {/* Card 1 — Detalhe */}
      <Card>
        <CardContent className="pt-5 pb-5 px-5 space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Badge className={`border text-xs font-semibold ${tm.cls}`}>{tm.label}</Badge>
            <Badge className={`border text-xs font-semibold ${sm.cls}`}>{sm.label}</Badge>
            <Badge className={`border text-xs font-semibold ${pm.cls}`}>{pm.label}</Badge>
          </div>

          {s.titulo && <h2 className="text-lg font-semibold leading-tight">{s.titulo}</h2>}

          <dl className="space-y-2 text-sm">
            {s.tela && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Tela</dt>
                <dd>{s.tela}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Descrição</dt>
              <dd className="whitespace-pre-wrap">{s.descricao}</dd>
            </div>
            {s.motivo && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Motivo</dt>
                <dd className="whitespace-pre-wrap">{s.motivo}</dd>
              </div>
            )}
            {s.status === "reprovado" && s.motivo_devolucao && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Motivo da reprovação</dt>
                <dd className="whitespace-pre-wrap text-red-700">{s.motivo_devolucao}</dd>
              </div>
            )}
            {s.status === "devolvido" && (
              <div className="rounded-md border border-purple-200 bg-purple-50 p-2">
                <dt className="text-xs uppercase tracking-wide text-purple-700">Motivo da devolução</dt>
                <dd className="whitespace-pre-wrap text-purple-900">
                  {s.motivo_devolucao || "O colaborador devolveu a solicitação com ajustes."}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Criado por</dt>
              <dd>{s.criado_por_nome ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Data</dt>
              <dd>{dataCompleta(s.created_at)}</dd>
            </div>
          </dl>

          <Separator />

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-amber-300 text-amber-800 hover:bg-amber-50"
                disabled={s.status === "em_analise"}
                onClick={() => {
                  setAcao("none");
                  onStatus("em_analise");
                }}
              >
                Em análise
              </Button>
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => {
                  setAcao("none");
                  onStatus("aprovado");
                }}
              >
                Aprovar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => setAcao((a) => (a === "reprovar" ? "none" : "reprovar"))}
              >
                Reprovar
              </Button>
            </div>

            {/* Inline — reprovar com motivo */}
            {acao === "reprovar" && (
              <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
                <label className="text-xs font-medium text-red-800">Motivo da reprovação</label>
                <Textarea
                  value={motivoReprovacao}
                  onChange={(e) => setMotivoReprovacao(e.target.value)}
                  placeholder="Explique por que esta solicitação foi reprovada..."
                  rows={3}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50"
                  disabled={!motivoReprovacao.trim()}
                  onClick={() => {
                    onStatus("reprovado", { motivo_devolucao: motivoReprovacao.trim() });
                    setAcao("none");
                  }}
                >
                  Confirmar reprovação
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Card 2 — Como ficaria no CRM (mockup IA) */}
      {s.mockup_prompt && <MockupCard prompt={s.mockup_prompt} />}

      {/* Card 3 — Histórico do chat */}
      {chat.length > 0 && (
        <Card>
          <CardContent className="pt-5 pb-5 px-5 space-y-3">
            <h3 className="text-sm font-semibold">Conversa original</h3>
            <div className="space-y-2">
              {chat.map((m, i) => {
                const isUser = m.role === "user";
                return (
                  <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div
                      className="max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
                      style={
                        isUser
                          ? { backgroundColor: VERDE, color: "#fff" }
                          : { backgroundColor: "#f3f4f6", color: "#111827" }
                      }
                    >
                      {m.content}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ───────────────────── Card de mockup gerado por IA ───────────────────── */

function MockupCard({ prompt }: { prompt: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const gerar = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("agente-chat", {
        body: {
          messages: [
            {
              role: "user",
              content: `Gere APENAS HTML puro (sem DOCTYPE, sem html/head/body) representando um mockup simples e realista desta melhoria no CRM: ${prompt}. Use somente inline styles. Cores: verde #0F6E56 para elementos principais, cinza #f9fafb para backgrounds, bordas #e5e7eb. Fonte sans-serif. Máximo 280px de altura. Retorne SOMENTE o HTML, sem explicação.`,
            },
          ],
          system_override: `Você é um especialista em UI. Gere apenas HTML puro de mockup, sem texto explicativo.`,
        },
      });
      if (error || !data?.text) {
        throw error ?? new Error("Resposta vazia");
      }
      setHtml(String(data.text).trim());
    } catch (e: unknown) {
      console.error("Erro ao gerar mockup:", e);
      toast.error("Erro ao gerar mockup: " + (e instanceof Error ? e.message : "desconhecido"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white"
        style={{ backgroundColor: VERDE }}
      >
        <Eye className="h-4 w-4" />
        Como ficaria no CRM
      </div>
      <CardContent className="pt-4 pb-5 px-5 space-y-3">
        <Button size="sm" variant="outline" onClick={gerar} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Gerando…
            </>
          ) : html ? (
            "Gerar novamente"
          ) : (
            "Gerar mockup"
          )}
        </Button>

        {html && (
          <div
            className="overflow-hidden rounded-md border"
            style={{ borderColor: "#e5e7eb" }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </CardContent>
    </Card>
  );
}
