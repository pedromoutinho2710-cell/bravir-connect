import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
} from "lucide-react";

// A tabela ganhou colunas agente_* via migration; o cliente tipado ainda não as
// conhece, então usamos um tipo local e fazemos cast do resultado da query.
type Solicitacao = {
  id: string;
  titulo: string | null;
  descricao: string;
  tipo: string | null;
  status: string;
  created_at: string | null;
  criado_por_nome: string | null;
  agente_status: string | null;
  agente_resumo: string | null;
  agente_pr_url: string | null;
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

export default function AgenteIA() {
  const queryClient = useQueryClient();
  const [selecionada, setSelecionada] = useState<Solicitacao | null>(null);
  // status transitório por linha enquanto a edge function processa.
  const [emProcesso, setEmProcesso] = useState<Record<string, Modo>>({});
  const [executandoTodas, setExecutandoTodas] = useState(false);
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null);
  // Resultado do agente-monitor.
  const [monitorAberto, setMonitorAberto] = useState(false);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [problemasMonitor, setProblemasMonitor] = useState<ProblemaMonitor[] | null>(null);

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

  const comPr = solicitacoes.filter((s) => s.agente_pr_url);

  const marcar = (id: string, modo: Modo | null) =>
    setEmProcesso((prev) => {
      const proximo = { ...prev };
      if (modo) proximo[id] = modo;
      else delete proximo[id];
      return proximo;
    });

  const atualizarLocal = (id: string, patch: Partial<Solicitacao>) =>
    setSelecionada((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));

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
      await queryClient.invalidateQueries({ queryKey: ["agente-solicitacoes"] });
    } catch (e) {
      toast.error("Falha no agente: " + (e instanceof Error ? e.message : String(e)));
      throw e;
    } finally {
      marcar(s.id, null);
    }
  };

  // Processa todas as solicitações abertas em sequência (gera um PR para cada).
  const executarTodas = async () => {
    const lista = [...solicitacoes];
    if (!lista.length) return;
    setExecutandoTodas(true);
    setProgresso({ feito: 0, total: lista.length });
    for (let i = 0; i < lista.length; i++) {
      try {
        await invocar(lista[i], "implementar");
      } catch {
        // a falha já foi notificada por toast; segue para a próxima.
      }
      setProgresso({ feito: i + 1, total: lista.length });
    }
    setExecutandoTodas(false);
    setProgresso(null);
    toast.success("Processamento de todas as solicitações concluído");
  };

  // Chama o agente-monitor e exibe os problemas encontrados.
  const analisarPlataforma = async () => {
    setMonitorLoading(true);
    setMonitorAberto(true);
    setProblemasMonitor(null);
    try {
      const { data, error } = await supabase.functions.invoke("agente-monitor", { body: {} });
      if (error || data?.error) {
        throw new Error(data?.error ?? error?.message ?? "Erro desconhecido");
      }
      setProblemasMonitor((data?.problemas ?? []) as ProblemaMonitor[]);
      toast.success(
        `${data?.criados ?? 0} nova(s) solicitação(ões) criada(s) de ${data?.encontrados ?? 0} problema(s) encontrado(s)`,
      );
      await queryClient.invalidateQueries({ queryKey: ["agente-solicitacoes"] });
    } catch (e) {
      toast.error("Falha no monitor: " + (e instanceof Error ? e.message : String(e)));
      setMonitorAberto(false);
    } finally {
      setMonitorLoading(false);
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
      await queryClient.invalidateQueries({ queryKey: ["agente-solicitacoes"] });
    } catch (e) {
      toast.error("Erro ao reprovar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      marcar(s.id, null);
    }
  };

  const ocupado = executandoTodas || monitorLoading;

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
                  <div className="flex flex-shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
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

      <Dialog open={monitorAberto} onOpenChange={(aberto) => !aberto && setMonitorAberto(false)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" /> Análise da plataforma
            </DialogTitle>
            <DialogDescription>
              Problemas encontrados pelo Agente Monitor. Os novos viram solicitações automáticas.
            </DialogDescription>
          </DialogHeader>

          {monitorLoading ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Analisando arquivos críticos com a IA…
            </div>
          ) : !problemasMonitor || problemasMonitor.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              Nenhum problema encontrado nesta análise.
            </p>
          ) : (
            <div className="space-y-3">
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
                  </div>
                  {p.arquivo && (
                    <p className="mb-1 font-mono text-xs text-muted-foreground">{p.arquivo}</p>
                  )}
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{p.descricao}</p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
