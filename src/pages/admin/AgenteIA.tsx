import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  Bot,
  Loader2,
  ExternalLink,
  Sparkles,
  Check,
  X,
  GitMerge,
  GitPullRequest,
  ShieldAlert,
  Play,
  LayoutDashboard,
  BarChart3,
  FileCode2,
  History,
  ClipboardCheck,
  Clipboard,
  FlaskConical,
  CheckCircle2,
  XCircle,
  Wrench,
  Download,
} from "lucide-react";

// URL de produção testada pelo botão "Testar melhorias".
const PROD_URL = "https://bravir-connect.vercel.app";

// A tabela ganhou colunas agente_* via migration; o cliente tipado ainda não as
// conhece, então usamos um tipo local e fazemos cast do resultado da query.
type AgenteMudancas = {
  resumo?: string;
  plano?: string[];
  arquivos?: Array<{ path?: string; acao?: string }>;
} | null;

type Solicitacao = {
  id: string;
  titulo: string | null;
  descricao: string;
  tipo: string | null;
  status: string;
  prioridade: string | null;
  tela: string | null;
  created_at: string | null;
  criado_por_nome: string | null;
  agente_status: string | null;
  agente_resumo: string | null;
  agente_pr_url: string | null;
  agente_mudancas: AgenteMudancas;
};

// Problema retornado pelo agente-monitor.
type ProblemaMonitor = {
  titulo: string;
  descricao: string;
  categoria: string;
  arquivo: string;
  prioridade: string;
};

type Modo = "analisar" | "implementar" | "aprovar";

type TesteResultado = { passou: boolean; detalhe: string };

// Resumo genérico de um processamento em lote ("Executar todas" / "Aprovar todas").
type ResumoLote = {
  titulo: string;
  stats: Array<{ label: string; valor: number; tone?: "ok" | "erro" }>;
  falhas: Array<{ titulo: string; motivo: string }>;
};

type AgenteMeta = { label: string; className: string };

const AGENTE_META: Record<string, AgenteMeta> = {
  pendente: { label: "Pendente", className: "bg-gray-100 text-gray-700 border-gray-300" },
  analisando: { label: "Analisando", className: "bg-blue-100 text-blue-800 border-blue-300" },
  analisado: { label: "Analisado", className: "bg-amber-100 text-amber-800 border-amber-300" },
  implementando: { label: "Implementando", className: "bg-blue-100 text-blue-800 border-blue-300" },
  pr_criado: { label: "PR Criado", className: "bg-green-100 text-green-800 border-green-300" },
  mergeando: { label: "Mesclando", className: "bg-blue-100 text-blue-800 border-blue-300" },
  mergeado: { label: "Mesclado", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  implementado: { label: "Implementado", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  revertido: { label: "Revertido", className: "bg-orange-100 text-orange-800 border-orange-300" },
  reprovado: { label: "Reprovado", className: "bg-gray-100 text-gray-500 border-gray-300" },
  aprovado: { label: "Aprovado", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  em_andamento: { label: "Em andamento", className: "bg-blue-100 text-blue-800 border-blue-300" },
  concluido: { label: "Concluído", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  erro: { label: "Erro", className: "bg-red-100 text-red-800 border-red-300" },
};

const CATEGORIA_META: Record<string, string> = {
  bug: "bg-red-100 text-red-800 border-red-300",
  risco: "bg-amber-100 text-amber-800 border-amber-300",
  performance: "bg-blue-100 text-blue-800 border-blue-300",
  seguranca: "bg-purple-100 text-purple-800 border-purple-300",
};

function metaDe(status: string | null): AgenteMeta {
  return AGENTE_META[status ?? "pendente"] ?? AGENTE_META.pendente;
}

function tituloDe(s: Solicitacao): string {
  return s.titulo?.trim() || s.descricao.slice(0, 80);
}

function prNumberFromUrl(url: string | null | undefined): number | null {
  if (!url) return null;
  const m = url.match(/\/pull\/(\d+)/);
  return m ? Number(m[1]) : null;
}

// Extrai o arquivo afetado: primeiro do padrão "arquivo:" no resumo gerado pela
// IA, depois da coluna `tela` (preenchida pelo monitor) e, por fim, do primeiro
// arquivo do plano de mudanças persistido.
function arquivoDe(s: Solicitacao): string | null {
  const m = s.agente_resumo?.match(/arquivos?:\s*([^\s,;\n]+)/i);
  if (m?.[1]) return m[1].trim();
  if (s.tela) return s.tela;
  const arq = s.agente_mudancas?.arquivos?.[0]?.path;
  return arq ?? null;
}

// Categoria/tipo: prioriza o "[categoria]" que o monitor grava no início da
// descrição, com fallback no campo `tipo`.
function categoriaDe(s: Solicitacao): string {
  const m = s.descricao?.match(/^\s*\[([^\]]+)\]/);
  if (m?.[1]) return m[1].trim().toLowerCase();
  return (s.tipo || "bug").toLowerCase();
}

function resumoCurto(texto: string | null, max = 220): string {
  if (!texto) return "(sem resumo)";
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max).trimEnd() + "…" : t;
}

// Data + horário no formato DD/MM/YYYY HH:mm.
function formatDataHora(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Frase "como fica para o usuário" derivada da prioridade + arquivo afetado.
function impactoDe(s: Solicitacao): string {
  const arquivo = arquivoDe(s);
  const onde = arquivo ? ` em ${arquivo}` : "";
  return s.prioridade === "alta"
    ? `Correção de alta prioridade${onde} — pode afetar o uso diário.`
    : `Ajuste${onde} de menor impacto.`;
}

// Conclusão: a solicitação some da fila e vai para "Concluídas" quando o status
// vira "concluido" (definido após o teste de produção passar) ou quando o agente
// já marcou o agente_status como "implementado".
function ehConcluida(s: Solicitacao): boolean {
  return s.status === "concluido" || s.agente_status === "implementado";
}

// Data de conclusão registrada no navegador (a tabela não tem coluna própria).
function chaveConclusao(id: string): string {
  return `agente_concluido_${id}`;
}
function marcarConcluidaLocal(id: string): void {
  try {
    localStorage.setItem(chaveConclusao(id), new Date().toISOString());
  } catch {
    // localStorage indisponível — ignora.
  }
}
function dataConclusao(id: string): string | null {
  try {
    return localStorage.getItem(chaveConclusao(id));
  } catch {
    return null;
  }
}

export default function AgenteIA() {
  const queryClient = useQueryClient();
  const [selecionada, setSelecionada] = useState<Solicitacao | null>(null);
  // status transitório por linha enquanto a edge function processa.
  const [emProcesso, setEmProcesso] = useState<Record<string, Modo>>({});
  const [executandoTodas, setExecutandoTodas] = useState(false);
  const [aprovandoTodas, setAprovandoTodas] = useState(false);
  const [analisandoTodas, setAnalisandoTodas] = useState(false);
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null);
  const [resumoLote, setResumoLote] = useState<ResumoLote | null>(null);
  // Resultado do agente-monitor (plano de ação inline, antes de criar as solicitações).
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [problemasMonitor, setProblemasMonitor] = useState<ProblemaMonitor[] | null>(null);
  const [aprovandoPlano, setAprovandoPlano] = useState(false);
  // Teste das melhorias em produção.
  const [testando, setTestando] = useState(false);
  const [resultadosTeste, setResultadosTeste] = useState<Record<string, TesteResultado>>({});

  const { data: solicitacoes = [], isLoading } = useQuery({
    queryKey: ["agente-solicitacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_gestor")
        .select("*")
        .eq("status", "aberto")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Solicitacao[];
    },
  });

  // Todas as solicitações (qualquer status) — alimenta o dashboard, a exportação
  // de revisão e o teste de melhorias.
  const { data: dashboard = [], isLoading: dashLoading } = useQuery({
    queryKey: ["agente-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_gestor")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Solicitacao[];
    },
  });

  // Fila = solicitações abertas ainda não concluídas. As concluídas somem da lista
  // principal e aparecem na aba "Concluídas".
  const fila = solicitacoes.filter((s) => !ehConcluida(s));
  const comPr = fila.filter((s) => s.agente_pr_url);
  const concluidas = dashboard.filter(ehConcluida);

  // Número sequencial por solicitação: a fila vem ordenada por created_at desc,
  // então a mais recente é #1. Usado na lista, na seção de PRs e no painel lateral.
  const numeroPorId = new Map(fila.map((s, i) => [s.id, i + 1]));
  const numeroDe = (s: Solicitacao): number | null => numeroPorId.get(s.id) ?? null;

  // --- Métricas e agregações do dashboard -----------------------------------
  const prsCriados = dashboard.filter((s) => s.agente_pr_url);
  const totalPrs = prsCriados.length;
  const implementados = dashboard.filter((s) => s.agente_status === "implementado").length;
  const bugsDetectados = dashboard.filter((s) => s.criado_por_nome === "Agente Monitor").length;
  const taxaSucesso = totalPrs ? Math.round((implementados / totalPrs) * 100) : 0;

  const metricas = [
    { label: "PRs criados", valor: totalPrs, Icon: GitPullRequest },
    { label: "Implementados", valor: implementados, Icon: GitMerge },
    { label: "Bugs detectados", valor: bugsDetectados, Icon: ShieldAlert },
    { label: "Taxa de sucesso", valor: `${taxaSucesso}%`, Icon: Sparkles },
  ];

  const prsPorTipo = (() => {
    const m = new Map<string, number>();
    for (const s of prsCriados) {
      const c = categoriaDe(s);
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return [...m.entries()].map(([tipo, n]) => ({ tipo, n })).sort((a, b) => b.n - a.n);
  })();
  const maxBar = Math.max(1, ...prsPorTipo.map((x) => x.n));

  const arquivosMaisAlterados = (() => {
    const m = new Map<string, number>();
    for (const s of dashboard) {
      if (!s.agente_status && !s.agente_pr_url) continue;
      const a = arquivoDe(s);
      if (!a) continue;
      m.set(a, (m.get(a) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([arquivo, n]) => ({ arquivo, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 5);
  })();

  const historico = dashboard.filter((s) => s.agente_status).slice(0, 20);

  const melhoriasTestaveis = dashboard.filter(
    (s) => s.agente_status === "implementado" || s.agente_status === "pr_criado",
  );

  // Fluxo visual: descobre em qual etapa a fila está para destacar no topo.
  const naoAnalisadas = fila.filter((s) => !s.agente_resumo).length;
  const analisadasSemPr = fila.filter((s) => s.agente_resumo && !s.agente_pr_url).length;
  const etapaAtual =
    naoAnalisadas > 0
      ? 1
      : analisadasSemPr > 0 && comPr.length === 0
        ? 2
        : analisadasSemPr > 0
          ? 3
          : comPr.length > 0
            ? 4
            : 0;

  const marcar = (id: string, modo: Modo | null) =>
    setEmProcesso((prev) => {
      const proximo = { ...prev };
      if (modo) proximo[id] = modo;
      else delete proximo[id];
      return proximo;
    });

  const atualizarLocal = (id: string, patch: Partial<Solicitacao>) =>
    setSelecionada((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));

  const invalidarTudo = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["agente-solicitacoes"] }),
      queryClient.invalidateQueries({ queryKey: ["agente-dashboard"] }),
    ]);

  const invocar = async (s: Solicitacao, modo: Modo) => {
    marcar(s.id, modo);
    try {
      const body: Record<string, unknown> = {
        solicitacao_id: s.id,
        titulo: tituloDe(s),
        descricao: s.descricao,
        modo,
      };
      if (modo === "aprovar") {
        const n = prNumberFromUrl(s.agente_pr_url);
        if (n) body.pr_number = n;
      }

      const { data, error } = await supabase.functions.invoke("agente-implementador", { body });
      if (error) throw new Error(error.message);

      if (modo === "analisar") {
        if (data?.error) throw new Error(data.error);
        toast.success("Análise concluída pela IA");
        atualizarLocal(s.id, { agente_status: "analisado", agente_resumo: data.resumo ?? null });
      } else if (modo === "implementar") {
        if (data?.error) throw new Error(data.error);
        toast.success("Pull Request criado");
        atualizarLocal(s.id, {
          agente_status: "pr_criado",
          agente_pr_url: data.pr_url ?? null,
          agente_resumo: data.resumo ?? s.agente_resumo,
        });
      } else {
        // aprovar: merge + deploy + testes (a função pode retornar ok:false controlado).
        if (data?.ok) {
          // Teste de produção passou → conclui: sai da fila e vai para "Concluídas".
          toast.success("Merge feito, deploy concluído e testes passaram ✅");
          marcarConcluidaLocal(s.id);
          await supabase
            .from("solicitacoes_gestor")
            .update({ status: "concluido" })
            .eq("id", s.id);
          atualizarLocal(s.id, {
            agente_status: "implementado",
            status: "concluido",
            agente_pr_url: data.pr_url ?? s.agente_pr_url,
          });
        } else {
          // Teste falhou → mantém na fila como "pr_criado" para corrigir.
          // (agente_status não existe nos tipos gerados; cast necessário.)
          await supabase
            .from("solicitacoes_gestor")
            .update({ agente_status: "pr_criado" } as never)
            .eq("id", s.id);
          atualizarLocal(s.id, { agente_status: "pr_criado" });
          const extra = data?.reverted ? " — alterações revertidas (PR de revert aberto)" : "";
          throw new Error((data?.error ?? "Falha ao aprovar.") + extra);
        }
      }
      await invalidarTudo();
    } catch (e) {
      toast.error("Falha no agente: " + (e instanceof Error ? e.message : String(e)));
      throw e;
    } finally {
      marcar(s.id, null);
    }
  };

  // Processa todas as solicitações abertas em sequência (gera um PR para cada) e
  // monta um resumo da execução ao final.
  const executarTodas = async () => {
    const lista = [...fila];
    if (!lista.length) return;
    setExecutandoTodas(true);
    setResumoLote(null);
    setProgresso({ feito: 0, total: lista.length });
    const falhas: Array<{ titulo: string; motivo: string }> = [];
    let comPrOk = 0;
    for (let i = 0; i < lista.length; i++) {
      try {
        await invocar(lista[i], "implementar");
        comPrOk++;
      } catch (e) {
        falhas.push({
          titulo: tituloDe(lista[i]),
          motivo: e instanceof Error ? e.message : String(e),
        });
      }
      setProgresso({ feito: i + 1, total: lista.length });
    }
    setExecutandoTodas(false);
    setProgresso(null);
    setResumoLote({
      titulo: "Resumo da execução",
      stats: [
        { label: "Processadas", valor: lista.length },
        { label: "PRs criados", valor: comPrOk, tone: "ok" },
        { label: "Falhas", valor: falhas.length, tone: "erro" },
      ],
      falhas,
    });
    await invalidarTudo();
    toast.success("Processamento de todas as solicitações concluído");
  };

  // Analisa em sequência todas as solicitações da fila que ainda não têm resumo.
  const analisarTodas = async () => {
    const lista = fila.filter((s) => !s.agente_resumo);
    if (!lista.length) {
      toast.info("Nenhuma solicitação pendente de análise.");
      return;
    }
    setAnalisandoTodas(true);
    setResumoLote(null);
    setProgresso({ feito: 0, total: lista.length });
    for (let i = 0; i < lista.length; i++) {
      try {
        await invocar(lista[i], "analisar");
      } catch {
        // falha já notificada por toast; segue para a próxima.
      }
      setProgresso({ feito: i + 1, total: lista.length });
    }
    setAnalisandoTodas(false);
    setProgresso(null);
    await invalidarTudo();
    toast.success("Análise concluída — exporte para revisão");
  };

  // Aprova (merge + deploy + testes) em sequência todas as solicitações com PR.
  const aprovarTodas = async () => {
    const lista = comPr;
    if (!lista.length) {
      toast.info("Nenhuma solicitação com PR para aprovar.");
      return;
    }
    setAprovandoTodas(true);
    setResumoLote(null);
    setProgresso({ feito: 0, total: lista.length });
    const falhas: Array<{ titulo: string; motivo: string }> = [];
    let aprovadasOk = 0;
    for (let i = 0; i < lista.length; i++) {
      try {
        await invocar(lista[i], "aprovar");
        aprovadasOk++;
      } catch (e) {
        falhas.push({
          titulo: tituloDe(lista[i]),
          motivo: e instanceof Error ? e.message : String(e),
        });
      }
      setProgresso({ feito: i + 1, total: lista.length });
    }
    setAprovandoTodas(false);
    setProgresso(null);
    setResumoLote({
      titulo: "Resumo da aprovação",
      stats: [
        { label: "Aprovadas", valor: aprovadasOk, tone: "ok" },
        { label: "Falhas", valor: falhas.length, tone: "erro" },
      ],
      falhas,
    });
    await invalidarTudo();
    toast.success("Aprovação de todas as solicitações concluída");
  };

  const exportarResumo = async () => {
    if (!resumoLote) return;
    const { titulo, stats, falhas } = resumoLote;
    const txt = [
      `# ${titulo} — Bravir Connect · ${new Date().toLocaleDateString("pt-BR")}`,
      "",
      ...stats.map((s) => `${s.label}: ${s.valor}`),
      ...(falhas.length ? ["", "## Falhas", ...falhas.map((f) => `- ${f.titulo}: ${f.motivo}`)] : []),
    ].join("\n");
    await navigator.clipboard.writeText(txt);
    toast.success("Resumo copiado.");
  };

  // Chama o agente-monitor em modo dry_run: apenas detecta os problemas e monta o
  // plano de ação inline. As solicitações só são criadas ao aprovar.
  const analisarPlataforma = async () => {
    setMonitorLoading(true);
    setProblemasMonitor(null);
    try {
      const { data, error } = await supabase.functions.invoke("agente-monitor", {
        body: { dry_run: true },
      });
      if (error || data?.error) {
        throw new Error(data?.error ?? error?.message ?? "Erro desconhecido");
      }
      const problemas = (data?.problemas ?? []) as ProblemaMonitor[];
      setProblemasMonitor(problemas);
      if (!problemas.length) {
        toast.info("Nenhum problema encontrado nesta análise.");
      } else {
        toast.success(`${problemas.length} problema(s) encontrado(s). Revise o plano de ação.`);
      }
    } catch (e) {
      toast.error("Falha no monitor: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setMonitorLoading(false);
    }
  };

  // Aprova o plano: envia os problemas detectados para o monitor criar as
  // solicitações (sem nova análise pela IA).
  const aprovarPlano = async () => {
    if (!problemasMonitor?.length) return;
    setAprovandoPlano(true);
    try {
      const { data, error } = await supabase.functions.invoke("agente-monitor", {
        body: { criar: problemasMonitor },
      });
      if (error || data?.error) {
        throw new Error(data?.error ?? error?.message ?? "Erro desconhecido");
      }
      toast.success(`${data?.criados ?? 0} solicitação(ões) criada(s).`);
      setProblemasMonitor(null);
      await invalidarTudo();
    } catch (e) {
      toast.error("Falha ao criar solicitações: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setAprovandoPlano(false);
    }
  };

  const copiarPlano = async () => {
    if (!problemasMonitor?.length) return;
    const txt = [
      `# Plano de ação — Bravir Connect · ${new Date().toLocaleDateString("pt-BR")}`,
      "",
      ...problemasMonitor.map((p, i) =>
        [
          `## ${i + 1}. [${p.categoria}] ${p.titulo}`,
          `Arquivo: ${p.arquivo || "—"}`,
          `Prioridade: ${p.prioridade}`,
          `Impacto: ${p.descricao}`,
          "---",
        ].join("\n"),
      ),
    ].join("\n");
    await navigator.clipboard.writeText(txt);
    toast.success("Copiado! Cole no Claude para revisar.");
  };

  // Exporta todos os PRs criados em formato de revisão para colar no Claude.
  const exportarRevisao = async () => {
    const lista = dashboard.filter((s) => s.agente_pr_url);
    if (!lista.length) {
      toast.info("Nenhum PR criado para exportar.");
      return;
    }
    const data = new Date().toLocaleDateString("pt-BR");
    const blocos = lista.map((s) => {
      const numero = prNumberFromUrl(s.agente_pr_url);
      return [
        `## PR #${numero ?? "?"} · ${categoriaDe(s)}`,
        `Título: ${tituloDe(s)}`,
        `Arquivo: ${arquivoDe(s) ?? "—"}`,
        `O que muda: ${resumoCurto(s.agente_resumo)}`,
        `Como fica para o usuário: ${impactoDe(s)}`,
        "Aprovar? SIM / NÃO",
        "---",
      ].join("\n");
    });
    const txt = [`# Revisão de PRs — Bravir Connect · ${data}`, "", ...blocos].join("\n");
    await navigator.clipboard.writeText(txt);
    toast.success("Copiado! Cole no Claude para revisar.");
  };

  const testarUm = async (s: Solicitacao): Promise<TesteResultado> => {
    try {
      const res = await fetch(`${PROD_URL}/?_=${encodeURIComponent(s.id)}`, {
        method: "GET",
        cache: "no-store",
      });
      return res.ok
        ? { passou: true, detalhe: `HTTP ${res.status}` }
        : { passou: false, detalhe: `HTTP ${res.status}` };
    } catch (e) {
      return { passou: false, detalhe: e instanceof Error ? e.message : "falha de rede" };
    }
  };

  // Testa cada melhoria implementada/com PR contra a produção.
  const testarMelhorias = async () => {
    if (!melhoriasTestaveis.length) {
      toast.info("Nenhuma melhoria implementada ou com PR para testar.");
      return;
    }
    setTestando(true);
    setResultadosTeste({});
    const acc: Record<string, TesteResultado> = {};
    for (const s of melhoriasTestaveis) {
      acc[s.id] = await testarUm(s);
      setResultadosTeste({ ...acc });
    }
    setTestando(false);
    const falhas = Object.values(acc).filter((r) => !r.passou).length;
    if (falhas) toast.warning(`${falhas} teste(s) detectaram problema.`);
    else toast.success("Todas as melhorias passaram ✅");
  };

  // "Corrigir automaticamente": reanalisa a solicitação com o agente-implementador.
  const corrigir = async (s: Solicitacao) => {
    try {
      await invocar(s, "analisar");
      setResultadosTeste((prev) => ({
        ...prev,
        [s.id]: { passou: true, detalhe: "Reanálise solicitada à IA" },
      }));
    } catch {
      // erro já notificado por toast em invocar.
    }
  };

  const reprovar = async (s: Solicitacao) => {
    marcar(s.id, "implementar");
    try {
      const { error } = await supabase
        .from("solicitacoes_gestor")
        .update({ status: "reprovado" })
        .eq("id", s.id);
      if (error) throw error;
      toast.success("Solicitação reprovada");
      setSelecionada(null);
      await invalidarTudo();
    } catch (e) {
      toast.error("Erro ao reprovar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      marcar(s.id, null);
    }
  };

  const aprovarParaAgente = async (s: Solicitacao) => {
    marcar(s.id, "aprovar");
    try {
      const { error } = await supabase
        .from("solicitacoes_gestor")
        .update({ agente_status: "aprovado" })
        .eq("id", s.id);
      if (error) throw error;
      toast.success("Aprovado — o agente implementa na proxima execucao");
      setSelecionada(null);
      await invalidarTudo();
    } catch (e) {
      toast.error("Erro ao aprovar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      marcar(s.id, null);
    }
  };

  const ocupado =
    executandoTodas ||
    aprovandoTodas ||
    analisandoTodas ||
    monitorLoading ||
    aprovandoPlano ||
    testando;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Bot className="h-6 w-6" /> Agente IA
          </h1>
          <p className="text-sm text-muted-foreground">
            Solicitações abertas. A IA analisa, gera um resumo e, após sua aprovação, abre um Pull
            Request — ou faz merge, aguarda o deploy e testa a produção.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={analisarTodas} disabled={ocupado || fila.length === 0}>
            {analisandoTodas ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-4 w-4" />
            )}
            Analisar todas
          </Button>
          <Button variant="outline" onClick={exportarRevisao} disabled={ocupado}>
            <Download className="mr-1 h-4 w-4" />
            Exportar para revisão
          </Button>
          <Button variant="outline" onClick={testarMelhorias} disabled={ocupado}>
            {testando ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="mr-1 h-4 w-4" />
            )}
            Testar melhorias
          </Button>
          <Button variant="outline" onClick={analisarPlataforma} disabled={ocupado}>
            {monitorLoading ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <ShieldAlert className="mr-1 h-4 w-4" />
            )}
            Analisar plataforma agora
          </Button>
          <Button onClick={executarTodas} disabled={ocupado || fila.length === 0}>
            {executandoTodas ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-1 h-4 w-4" />
            )}
            Executar todas
          </Button>
          <Button onClick={aprovarTodas} disabled={ocupado || comPr.length === 0}>
            {aprovandoTodas ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <GitMerge className="mr-1 h-4 w-4" />
            )}
            Aprovar todas
          </Button>
        </div>
      </div>

      {(executandoTodas || aprovandoTodas) && progresso && (
        <Card>
          <CardContent className="space-y-2 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-medium">
                <Loader2 className="h-4 w-4 animate-spin" />
                {aprovandoTodas ? "Aprovando solicitações…" : "Processando solicitações…"}
              </span>
              <span className="text-muted-foreground">
                {progresso.feito} de {progresso.total} {aprovandoTodas ? "aprovadas" : "concluídas"}
              </span>
            </div>
            <Progress value={progresso.total ? (progresso.feito / progresso.total) * 100 : 0} />
          </CardContent>
        </Card>
      )}

      {resumoLote && (
        <Card>
          <CardContent className="space-y-3 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <ClipboardCheck className="h-4 w-4" /> {resumoLote.titulo}
              </h2>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={exportarResumo}>
                  <Download className="mr-1 h-4 w-4" /> Exportar resumo
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setResumoLote(null)}
                  aria-label="Fechar resumo"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {resumoLote.stats.map((s) => (
                <div key={s.label} className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p
                    className={
                      "text-xl font-bold" +
                      (s.tone === "ok"
                        ? " text-emerald-700"
                        : s.tone === "erro"
                          ? " text-red-700"
                          : "")
                    }
                  >
                    {s.valor}
                  </p>
                </div>
              ))}
            </div>
            {resumoLote.falhas.length > 0 && (
              <div className="space-y-1">
                {resumoLote.falhas.map((f, i) => (
                  <p key={i} className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{f.titulo}:</span> {f.motivo}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(monitorLoading || problemasMonitor) && (
        <Card>
          <CardContent className="space-y-3 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ShieldAlert className="h-4 w-4" /> Plano de ação da análise
            </h2>
            {monitorLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Analisando arquivos críticos com a IA…
              </div>
            ) : !problemasMonitor?.length ? (
              <p className="text-sm text-muted-foreground">Nenhum problema encontrado nesta análise.</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {problemasMonitor.length} problema(s) encontrado(s). Revise e aprove para criar as
                  solicitações.
                </p>
                <div className="space-y-2">
                  {problemasMonitor.map((p, i) => (
                    <div key={i} className="rounded-md border p-3">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={CATEGORIA_META[p.categoria] ?? CATEGORIA_META.bug}
                        >
                          {p.categoria}
                        </Badge>
                        <span className="font-medium">{p.titulo}</span>
                        {p.prioridade === "alta" && (
                          <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">
                            alta
                          </Badge>
                        )}
                      </div>
                      {p.arquivo && (
                        <p className="mb-1 font-mono text-xs text-muted-foreground">{p.arquivo}</p>
                      )}
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{p.descricao}</p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={aprovarPlano} disabled={aprovandoPlano}>
                    {aprovandoPlano ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <ClipboardCheck className="mr-1 h-4 w-4" />
                    )}
                    Aprovar plano de ação
                  </Button>
                  <Button variant="outline" onClick={copiarPlano} disabled={aprovandoPlano}>
                    <Clipboard className="mr-1 h-4 w-4" /> Copiar para revisar com Claude
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setProblemasMonitor(null)}
                    disabled={aprovandoPlano}
                  >
                    Descartar
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {(testando || Object.keys(resultadosTeste).length > 0) && (
        <Card>
          <CardContent className="space-y-3 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <FlaskConical className="h-4 w-4" /> Teste das melhorias
            </h2>
            <div className="divide-y rounded-md border">
              {melhoriasTestaveis.map((s) => {
                const r = resultadosTeste[s.id];
                const proc = emProcesso[s.id] === "analisar";
                return (
                  <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{tituloDe(s)}</p>
                      {r && <p className="text-xs text-muted-foreground">{r.detalhe}</p>}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {!r ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> testando…
                        </span>
                      ) : r.passou ? (
                        <Badge
                          variant="outline"
                          className="border-green-300 bg-green-100 text-green-800"
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Passou
                        </Badge>
                      ) : (
                        <>
                          <Badge variant="outline" className="border-red-300 bg-red-100 text-red-800">
                            <XCircle className="mr-1 h-3.5 w-3.5" /> Bug detectado
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={proc}
                            onClick={() => corrigir(s)}
                          >
                            {proc ? (
                              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                            ) : (
                              <Wrench className="mr-1 h-4 w-4" />
                            )}
                            Corrigir automaticamente
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="solicitacoes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="solicitacoes" className="gap-1">
            <GitPullRequest className="h-4 w-4" /> Solicitações
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="gap-1">
            <LayoutDashboard className="h-4 w-4" /> Dashboard do agente
          </TabsTrigger>
        </TabsList>

        <TabsContent value="solicitacoes" className="space-y-6">
          {comPr.length > 0 && (
            <div className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <GitPullRequest className="h-4 w-4" /> PRs criados ({comPr.length})
              </h2>
              <Card>
                <CardContent className="divide-y p-0">
                  {comPr.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="shrink-0 text-sm font-semibold text-muted-foreground">
                          #{numeroDe(s) ?? "?"}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{tituloDe(s)}</p>
                          <Badge variant="outline" className={metaDe(s.agente_status).className}>
                            {metaDe(s.agente_status).label}
                          </Badge>
                        </div>
                      </div>
                      <a
                        href={s.agente_pr_url ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex flex-shrink-0 items-center gap-1 text-sm text-primary hover:underline"
                      >
                        Ver PR <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando solicitações…
            </div>
          ) : solicitacoes.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Nenhuma solicitação pendente.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {solicitacoes.map((s) => {
                const proc = emProcesso[s.id];
                const statusVisual =
                  proc === "analisar"
                    ? "analisando"
                    : proc === "implementar"
                      ? "implementando"
                      : proc === "aprovar"
                        ? "mergeando"
                        : s.agente_status;
                const meta = metaDe(statusVisual);
                return (
                  <Card
                    key={s.id}
                    className="cursor-pointer transition-colors hover:bg-muted/40"
                    onClick={() => setSelecionada(s)}
                  >
                    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 gap-3">
                        <span className="mt-0.5 inline-flex h-6 shrink-0 items-center rounded-md bg-primary/10 px-2 text-sm font-semibold text-primary">
                          #{numeroDe(s) ?? "?"}
                        </span>
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">{tituloDe(s)}</span>
                            <Badge variant="outline" className={meta.className}>
                              {meta.label}
                            </Badge>
                          </div>
                          <p className="line-clamp-2 text-sm text-muted-foreground">{s.descricao}</p>
                          {s.criado_por_nome && (
                            <p className="text-xs text-muted-foreground">Por {s.criado_por_nome}</p>
                          )}
                        </div>
                      </div>
                      <div
                        className="flex flex-shrink-0 items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {s.agente_pr_url && (
                          <a
                            href={s.agente_pr_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            Ver PR <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {!["aprovado", "em_andamento", "concluido", "implementado"].includes(
                          s.agente_status ?? "",
                        ) && (
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            disabled={!!proc || ocupado}
                            onClick={() => aprovarParaAgente(s)}
                          >
                            {proc === "aprovar" ? (
                              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="mr-1 h-4 w-4" />
                            )}
                            Aprovar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!proc || ocupado}
                          onClick={() => invocar(s, "analisar")}
                        >
                          {proc === "analisar" ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="mr-1 h-4 w-4" />
                          )}
                          Analisar com IA
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="dashboard" className="space-y-6">
          {dashLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando dashboard…
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {metricas.map(({ label, valor, Icon }) => (
                  <Card key={label}>
                    <CardContent className="flex items-center justify-between py-4">
                      <div>
                        <p className="text-sm text-muted-foreground">{label}</p>
                        <p className="text-2xl font-bold">{valor}</p>
                      </div>
                      <Icon className="h-8 w-8 text-muted-foreground/40" />
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardContent className="space-y-3 py-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <BarChart3 className="h-4 w-4" /> PRs por categoria
                  </h3>
                  {prsPorTipo.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum PR criado ainda.</p>
                  ) : (
                    <div className="space-y-2">
                      {prsPorTipo.map(({ tipo, n }) => (
                        <div key={tipo} className="flex items-center gap-3">
                          <span className="w-28 shrink-0 truncate text-sm capitalize">{tipo}</span>
                          <div className="h-5 flex-1 overflow-hidden rounded bg-muted">
                            <div
                              className="h-full rounded bg-primary"
                              style={{ width: `${(n / maxBar) * 100}%` }}
                            />
                          </div>
                          <span className="w-8 shrink-0 text-right text-sm tabular-nums">{n}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="py-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <FileCode2 className="h-4 w-4" /> Arquivos mais alterados
                  </h3>
                  {arquivosMaisAlterados.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Arquivo</TableHead>
                          <TableHead className="text-right">Alterações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {arquivosMaisAlterados.map(({ arquivo, n }) => (
                          <TableRow key={arquivo}>
                            <TableCell className="font-mono text-xs">{arquivo}</TableCell>
                            <TableCell className="text-right tabular-nums">{n}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="py-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <History className="h-4 w-4" /> Histórico de atividade
                  </h3>
                  {historico.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma atividade do agente ainda.</p>
                  ) : (
                    <div className="divide-y">
                      {historico.map((s) => (
                        <div key={s.id} className="flex items-center justify-between gap-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{tituloDe(s)}</p>
                            <p className="text-xs text-muted-foreground">
                              {s.created_at ? formatDate(s.created_at) : "—"}
                            </p>
                          </div>
                          <Badge variant="outline" className={metaDe(s.agente_status).className}>
                            {metaDe(s.agente_status).label}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Sheet open={!!selecionada} onOpenChange={(aberto) => !aberto && setSelecionada(null)}>
        <SheetContent className="flex w-full flex-col sm:max-w-lg">
          {selecionada &&
            (() => {
              const sel = selecionada;
              const procSel = emProcesso[sel.id];
              const statusSel =
                procSel === "analisar"
                  ? "analisando"
                  : procSel === "implementar"
                    ? "implementando"
                    : procSel === "aprovar"
                      ? "mergeando"
                      : sel.agente_status;
              const catSel = categoriaDe(sel);
              const temPr = !!sel.agente_pr_url;
              const mudancas = sel.agente_mudancas;
              const prNum = prNumberFromUrl(sel.agente_pr_url);
              const ocupadoSel = !!procSel;
              const podeEnviarAgente =
                !["aprovado", "em_andamento", "concluido", "implementado"].includes(
                  sel.agente_status ?? "",
                );
              return (
                <>
                  <SheetHeader>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 shrink-0 items-center rounded-md bg-primary/10 px-2 text-sm font-semibold text-primary">
                        #{numeroDe(sel) ?? "?"}
                      </span>
                      <SheetTitle className="text-left">{tituloDe(sel)}</SheetTitle>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Badge variant="outline" className={metaDe(statusSel).className}>
                        {metaDe(statusSel).label}
                      </Badge>
                      <Badge variant="outline" className={CATEGORIA_META[catSel] ?? CATEGORIA_META.bug}>
                        {catSel}
                      </Badge>
                    </div>
                    <SheetDescription className="sr-only">
                      Detalhes completos da solicitação.
                    </SheetDescription>
                  </SheetHeader>

                  <div className="flex-1 space-y-5 overflow-y-auto py-4 text-sm">
                    <section className="space-y-1">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Origem
                      </h3>
                      <div className="space-y-1">
                        <div className="flex gap-2">
                          <span className="w-28 shrink-0 text-muted-foreground">Criado por</span>
                          <span>{sel.criado_por_nome || "—"}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="w-28 shrink-0 text-muted-foreground">Data e hora</span>
                          <span>{formatDataHora(sel.created_at)}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="w-28 shrink-0 text-muted-foreground">Tela/arquivo</span>
                          <span className="break-all font-mono text-xs">{arquivoDe(sel) || "—"}</span>
                        </div>
                      </div>
                    </section>

                    <section className="space-y-1">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Descrição original
                      </h3>
                      <p className="whitespace-pre-wrap text-muted-foreground">{sel.descricao}</p>
                    </section>

                    <section className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Análise da IA
                      </h3>
                      {sel.agente_resumo ? (
                        <p className="whitespace-pre-wrap text-muted-foreground">{sel.agente_resumo}</p>
                      ) : (
                        <p className="text-muted-foreground">
                          Ainda não analisado. Clique em “Analisar com IA” para gerar um resumo.
                        </p>
                      )}
                      {!!mudancas?.arquivos?.length && (
                        <div className="space-y-1">
                          <p className="font-medium">Arquivos que serão alterados</p>
                          <ul className="space-y-1">
                            {mudancas.arquivos.map((a, i) => (
                              <li key={i} className="flex items-center gap-2">
                                {a.acao && (
                                  <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                                    {a.acao}
                                  </Badge>
                                )}
                                <span className="break-all font-mono text-xs text-muted-foreground">
                                  {a.path}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {!!mudancas?.plano?.length && (
                        <div className="space-y-1">
                          <p className="font-medium">Plano de ação</p>
                          <ol className="list-decimal space-y-0.5 pl-5 text-muted-foreground">
                            {mudancas.plano.map((p, i) => (
                              <li key={i}>{p}</li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </section>

                    {temPr && (
                      <section className="space-y-1">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Pull Request
                        </h3>
                        <a
                          href={sel.agente_pr_url ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          Abrir PR{prNum ? ` #${prNum}` : ""} <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Status:</span>
                          <Badge variant="outline" className={metaDe(statusSel).className}>
                            {metaDe(statusSel).label}
                          </Badge>
                        </div>
                      </section>
                    )}
                  </div>

                  <SheetFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
                    {podeEnviarAgente ? (
                      <Button
                        className="w-full bg-emerald-600 hover:bg-emerald-700"
                        disabled={ocupadoSel}
                        onClick={() => aprovarParaAgente(sel)}
                      >
                        {procSel === "aprovar" ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="mr-1 h-4 w-4" />
                        )}
                        Aprovar para o Agente implementar
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                        <Badge
                          variant="outline"
                          className={metaDe(sel.agente_status).className}
                        >
                          {metaDe(sel.agente_status).label}
                        </Badge>
                        {sel.agente_resumo && (
                          <span className="text-xs text-muted-foreground line-clamp-2">
                            {sel.agente_resumo}
                          </span>
                        )}
                      </div>
                    )}
                    {temPr ? (
                      <Button
                        className="w-full"
                        disabled={ocupadoSel}
                        onClick={() => invocar(sel, "aprovar")}
                      >
                        {procSel === "aprovar" ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <GitMerge className="mr-1 h-4 w-4" />
                        )}
                        Aprovar e fazer merge
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        disabled={ocupadoSel}
                        onClick={() => invocar(sel, "implementar")}
                      >
                        {procSel === "implementar" ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="mr-1 h-4 w-4" />
                        )}
                        Só criar PR
                      </Button>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        disabled={ocupadoSel}
                        onClick={() => invocar(sel, "analisar")}
                      >
                        {procSel === "analisar" ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="mr-1 h-4 w-4" />
                        )}
                        Analisar com IA
                      </Button>
                      <Button variant="outline" disabled={ocupadoSel} onClick={() => reprovar(sel)}>
                        <X className="mr-1 h-4 w-4" /> Reprovar
                      </Button>
                    </div>
                    {temPr && (
                      <p className="text-xs text-muted-foreground">
                        “Aprovar e fazer merge” mescla o PR, aguarda o deploy no Vercel e testa a
                        produção — pode levar alguns minutos. Em caso de falha, reverte
                        automaticamente.
                      </p>
                    )}
                  </SheetFooter>
                </>
              );
            })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
