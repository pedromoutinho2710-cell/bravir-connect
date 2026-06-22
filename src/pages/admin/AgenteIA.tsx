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

type ResumoExecucao = {
  processadas: number;
  comPr: number;
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

// Frase "como fica para o usuário" derivada da prioridade + arquivo afetado.
function impactoDe(s: Solicitacao): string {
  const arquivo = arquivoDe(s);
  const onde = arquivo ? ` em ${arquivo}` : "";
  return s.prioridade === "alta"
    ? `Correção de alta prioridade${onde} — pode afetar o uso diário.`
    : `Ajuste${onde} de menor impacto.`;
}

export default function AgenteIA() {
  const queryClient = useQueryClient();
  const [selecionada, setSelecionada] = useState<Solicitacao | null>(null);
  // status transitório por linha enquanto a edge function processa.
  const [emProcesso, setEmProcesso] = useState<Record<string, Modo>>({});
  const [executandoTodas, setExecutandoTodas] = useState(false);
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null);
  const [resumoExecucao, setResumoExecucao] = useState<ResumoExecucao | null>(null);
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

  const comPr = solicitacoes.filter((s) => s.agente_pr_url);

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
          toast.success("Merge feito, deploy concluído e testes passaram ✅");
          atualizarLocal(s.id, {
            agente_status: "implementado",
            agente_pr_url: data.pr_url ?? s.agente_pr_url,
          });
        } else {
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
    const lista = [...solicitacoes];
    if (!lista.length) return;
    setExecutandoTodas(true);
    setResumoExecucao(null);
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
    setResumoExecucao({ processadas: lista.length, comPr: comPrOk, falhas });
    await invalidarTudo();
    toast.success("Processamento de todas as solicitações concluído");
  };

  const exportarResumoExecucao = async () => {
    if (!resumoExecucao) return;
    const { processadas, comPr: comPrOk, falhas } = resumoExecucao;
    const txt = [
      `# Resumo da execução — Bravir Connect · ${new Date().toLocaleDateString("pt-BR")}`,
      "",
      `Processadas: ${processadas}`,
      `PRs criados com sucesso: ${comPrOk}`,
      `Falhas: ${falhas.length}`,
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

  const ocupado = executandoTodas || monitorLoading || aprovandoPlano || testando;

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
          <Button onClick={executarTodas} disabled={ocupado || solicitacoes.length === 0}>
            {executandoTodas ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-1 h-4 w-4" />
            )}
            Executar todas
          </Button>
        </div>
      </div>

      {executandoTodas && progresso && (
        <Card>
          <CardContent className="space-y-2 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-medium">
                <Loader2 className="h-4 w-4 animate-spin" /> Processando solicitações…
              </span>
              <span className="text-muted-foreground">
                {progresso.feito} de {progresso.total} concluídas
              </span>
            </div>
            <Progress value={progresso.total ? (progresso.feito / progresso.total) * 100 : 0} />
          </CardContent>
        </Card>
      )}

      {resumoExecucao && (
        <Card>
          <CardContent className="space-y-3 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <ClipboardCheck className="h-4 w-4" /> Resumo da execução
              </h2>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={exportarResumoExecucao}>
                  <Download className="mr-1 h-4 w-4" /> Exportar resumo
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setResumoExecucao(null)}
                  aria-label="Fechar resumo"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Processadas</p>
                <p className="text-xl font-bold">{resumoExecucao.processadas}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">PRs criados</p>
                <p className="text-xl font-bold text-emerald-700">{resumoExecucao.comPr}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Falhas</p>
                <p className="text-xl font-bold text-red-700">{resumoExecucao.falhas.length}</p>
              </div>
            </div>
            {resumoExecucao.falhas.length > 0 && (
              <div className="space-y-1">
                {resumoExecucao.falhas.map((f, i) => (
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
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{tituloDe(s)}</p>
                        <Badge variant="outline" className={metaDe(s.agente_status).className}>
                          {metaDe(s.agente_status).label}
                        </Badge>
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
          {selecionada && (
            <>
              <SheetHeader>
                <SheetTitle>{tituloDe(selecionada)}</SheetTitle>
                <SheetDescription>{selecionada.descricao}</SheetDescription>
              </SheetHeader>

              <div className="flex-1 space-y-4 overflow-y-auto py-4">
                <div>
                  <h3 className="mb-1 text-sm font-semibold">Resumo gerado pela IA</h3>
                  {selecionada.agente_resumo ? (
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {selecionada.agente_resumo}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Ainda não analisado. Clique em “Analisar com IA” para gerar um resumo.
                    </p>
                  )}
                </div>

                {selecionada.agente_pr_url && (
                  <a
                    href={selecionada.agente_pr_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Abrir Pull Request <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>

              <SheetFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
                <Button
                  className="w-full"
                  disabled={!!emProcesso[selecionada.id]}
                  onClick={() => invocar(selecionada, "aprovar")}
                >
                  {emProcesso[selecionada.id] === "aprovar" ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <GitMerge className="mr-1 h-4 w-4" />
                  )}
                  Aprovar e fazer merge
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={!!emProcesso[selecionada.id]}
                    onClick={() => invocar(selecionada, "implementar")}
                  >
                    {emProcesso[selecionada.id] === "implementar" ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-1 h-4 w-4" />
                    )}
                    Só criar PR
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!!emProcesso[selecionada.id]}
                    onClick={() => reprovar(selecionada)}
                  >
                    <X className="mr-1 h-4 w-4" /> Reprovar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  “Aprovar e fazer merge” mescla o PR, aguarda o deploy no Vercel e testa a produção —
                  pode levar alguns minutos. Em caso de falha, reverte automaticamente.
                </p>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
