import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Loader2, CheckCircle2, XCircle, RotateCcw, Bot, AlertTriangle, Clock, Globe, Copy } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type AgenteStatus =
  | "analisando"
  | "analisado"
  | "aprovado"
  | "implementando"
  | "implementado"
  | "pr_criado"
  | "revertido"
  | "erro"
  | "reprovado"
  | null;

type Solicitacao = {
  id: string;
  titulo: string;
  descricao: string;
  tipo: string | null;
  tela: string | null;
  criado_por: string | null;
  created_at: string;
  agente_status: AgenteStatus;
  agente_resumo: string | null;
  agente_mudancas: {
    resumo?: string;
    plano?: string[];
    arquivos?: { path: string; acao: string }[];
  } | null;
  agente_iniciado_em: string | null;
  agente_concluido_em: string | null;
  agente_tentativas: number | null;
  agente_erro: string | null;
  origem: "monitor" | "pesquisa" | "crm" | null;
};

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon?: React.ReactNode }
> = {
  analisando: { label: "Analisando...", variant: "secondary", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  analisado: { label: "Plano pronto", variant: "outline" },
  aprovado: { label: "Aguardando execução", variant: "secondary", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  implementando: { label: "Implementando...", variant: "secondary", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  implementado: { label: "Implementado", variant: "default" },
  pr_criado: { label: "Aguardando implementação", variant: "outline" },
  revertido: { label: "Revertido", variant: "outline" },
  erro: { label: "Erro", variant: "destructive" },
  reprovado: { label: "Reprovado", variant: "outline" },
};

function StatusBadge({ status }: { status: AgenteStatus }) {
  const cfg = status ? STATUS_CONFIG[status] : { label: "Aguardando análise", variant: "secondary" as const };
  return (
    <Badge variant={cfg.variant} className="gap-1 text-xs">
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

function tempo(iso: string | null) {
  if (!iso) return null;
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
}

export default function MeuAgente() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [detalhe, setDetalhe] = useState<Solicitacao | null>(null);

  if (user?.email !== "pedro.menezes@bravir.com.br") {
    return (
      <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
        Acesso restrito.
      </div>
    );
  }

  const { data: solicitacoes = [], isLoading } = useQuery({
    queryKey: ["meu-agente-solicitacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_gestor")
        .select("*")
        .eq("status", "aberto")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Solicitacao[];
    },
    refetchInterval: 5000,
  });

  const atualizar = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("solicitacoes_gestor").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meu-agente-solicitacoes"] }),
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  function aprovar(id: string) {
    atualizar.mutate({ id, patch: { agente_status: "aprovado" } });
    toast.success("Solicitação aprovada — agente vai implementar em breve.");
  }

  function reprovar(id: string) {
    atualizar.mutate({ id, patch: { agente_status: "reprovado" } });
  }

  function tentarNovamente(id: string) {
    atualizar.mutate({ id, patch: { agente_status: null, agente_tentativas: 0, agente_erro: null } });
    toast.info("Solicitação reiniciada para nova análise.");
  }

  function aprovarSelecionados() {
    selecionados.forEach((id) =>
      atualizar.mutate({ id, patch: { agente_status: "aprovado" } })
    );
    toast.success(`${selecionados.length} solicitações aprovadas.`);
    setSelecionados([]);
  }

  function toggleSelecionado(id: string) {
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function copiarParaClaude() {
    const pendentes = solicitacoes.filter(
      (s) => s.agente_status === "analisado" || !s.agente_status
    );
    if (pendentes.length === 0) {
      toast.info("Nenhuma solicitação pendente para copiar.");
      return;
    }
    const origem = (s: Solicitacao) =>
      s.origem === "monitor" ? "[Monitor]" : s.origem === "pesquisa" ? "[Pesquisa Web]" : "[CRM]";
    const texto = [
      `Tenho ${pendentes.length} solicitação(ões) para analisar. Me diz o que faz sentido implementar:\n`,
      ...pendentes.map((s, i) =>
        `${i + 1}. ${origem(s)} ${s.titulo}\n${s.agente_resumo ?? s.descricao}`
      ),
    ].join("\n\n");
    navigator.clipboard.writeText(texto);
    toast.success("Copiado! Cole no Claude Code para análise.");
  }

  const daEquipe = solicitacoes.filter((s) => !!s.criado_por);
  const analisados = solicitacoes.filter((s) => !s.criado_por && s.agente_status === "analisado");
  const emExecucao = solicitacoes.filter(
    (s) => !s.criado_por && (s.agente_status === "analisando" || s.agente_status === "aprovado" || s.agente_status === "implementando")
  );
  const concluidos = solicitacoes.filter(
    (s) => !s.criado_por && (s.agente_status === "implementado" || s.agente_status === "reprovado" || s.agente_status === "erro")
  );
  const aguardando = solicitacoes.filter((s) => !s.criado_por && (!s.agente_status || s.agente_status === null));

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold">Agente IA</h1>
          {emExecucao.length > 0 && (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {emExecucao.length} em execução
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={copiarParaClaude}>
            <Copy className="h-3 w-3 mr-1" />
            Copiar para Claude
          </Button>
          {selecionados.length > 0 && (
            <Button size="sm" onClick={aprovarSelecionados}>
              Aprovar {selecionados.length} selecionados
            </Button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      )}

      {/* Pedidos da equipe — sempre visíveis */}
      {daEquipe.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Pedidos da equipe
            </h2>
            <Badge variant="outline">{daEquipe.length}</Badge>
          </div>
          {daEquipe.map((sol) => (
            <SolicitacaoCard
              key={sol.id}
              sol={sol}
              onDetalhe={() => setDetalhe(sol)}
            />
          ))}
        </section>
      )}

      {/* Plano pronto — aguardando aprovação */}
      {analisados.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Aguardando aprovação
            </h2>
            <Badge variant="outline">{analisados.length}</Badge>
          </div>
          {analisados.map((sol) => (
            <SolicitacaoCard
              key={sol.id}
              sol={sol}
              selecionado={selecionados.includes(sol.id)}
              onToggle={() => toggleSelecionado(sol.id)}
              onAprovar={() => aprovar(sol.id)}
              onReprovar={() => reprovar(sol.id)}
              onDetalhe={() => setDetalhe(sol)}
            />
          ))}
        </section>
      )}

      {/* Em execução */}
      {emExecucao.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Em execução
          </h2>
          {emExecucao.map((sol) => (
            <SolicitacaoCard
              key={sol.id}
              sol={sol}
              onDetalhe={() => setDetalhe(sol)}
            />
          ))}
        </section>
      )}

      {/* Aguardando análise (agente não pegou ainda) */}
      {aguardando.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Aguardando análise
          </h2>
          {aguardando.map((sol) => (
            <SolicitacaoCard key={sol.id} sol={sol} onDetalhe={() => setDetalhe(sol)} />
          ))}
        </section>
      )}

      {/* Concluídos / com erro */}
      {concluidos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Concluídos
          </h2>
          {concluidos.map((sol) => (
            <SolicitacaoCard
              key={sol.id}
              sol={sol}
              onTentarNovamente={sol.agente_status === "erro" ? () => tentarNovamente(sol.id) : undefined}
              onDetalhe={() => setDetalhe(sol)}
            />
          ))}
        </section>
      )}

      {solicitacoes.length === 0 && !isLoading && (
        <div className="text-center text-muted-foreground py-16 text-sm">
          Nenhuma solicitação em aberto.
        </div>
      )}

      <Sheet open={!!detalhe} onOpenChange={(open) => !open && setDetalhe(null)}>
        <SheetContent className="w-full max-w-lg overflow-y-auto">
          {detalhe && <DetalhePainel sol={detalhe} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SolicitacaoCard({
  sol,
  selecionado,
  onToggle,
  onAprovar,
  onReprovar,
  onTentarNovamente,
  onDetalhe,
}: {
  sol: Solicitacao;
  selecionado?: boolean;
  onToggle?: () => void;
  onAprovar?: () => void;
  onReprovar?: () => void;
  onTentarNovamente?: () => void;
  onDetalhe: () => void;
}) {
  const podeSelecionar = sol.agente_status === "analisado";

  return (
    <Card
      className="cursor-pointer hover:bg-muted/30 transition-colors"
      onClick={onDetalhe}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {podeSelecionar && onToggle && (
            <Checkbox
              checked={selecionado}
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              className="mt-0.5"
            />
          )}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={sol.agente_status} />
                {sol.origem === "monitor" && (
                  <Badge variant="outline" className="text-xs gap-1 text-amber-600 border-amber-300">
                    <Bot className="h-3 w-3" />
                    Monitor detectou
                  </Badge>
                )}
                {sol.origem === "pesquisa" && (
                  <Badge variant="outline" className="text-xs gap-1 text-blue-600 border-blue-300">
                    <Globe className="h-3 w-3" />
                    Pesquisa Web
                  </Badge>
                )}
                {(sol.agente_tentativas ?? 0) > 0 && (
                  <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
                    Tentativa {sol.agente_tentativas}
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {tempo(sol.created_at)}
              </span>
            </div>

            <p className="font-medium text-sm leading-tight">{sol.titulo}</p>

            {sol.agente_mudancas?.resumo && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {sol.agente_mudancas.resumo}
              </p>
            )}

            {sol.agente_status === "erro" && sol.agente_erro && (
              <p className="text-xs text-destructive line-clamp-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {sol.agente_erro}
              </p>
            )}

            {(onAprovar || onReprovar || onTentarNovamente) && (
              <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                {onAprovar && (
                  <Button size="sm" variant="default" onClick={onAprovar} className="h-7 text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Aprovar
                  </Button>
                )}
                {onReprovar && (
                  <Button size="sm" variant="outline" onClick={onReprovar} className="h-7 text-xs">
                    <XCircle className="h-3 w-3 mr-1" />
                    Reprovar
                  </Button>
                )}
                {onTentarNovamente && (
                  <Button size="sm" variant="outline" onClick={onTentarNovamente} className="h-7 text-xs">
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Tentar novamente
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DetalhePainel({ sol }: { sol: Solicitacao }) {
  return (
    <>
      <SheetHeader className="pb-4">
        <div className="flex items-center gap-2">
          <StatusBadge status={sol.agente_status} />
        </div>
        <SheetTitle className="text-left leading-tight">{sol.titulo}</SheetTitle>
      </SheetHeader>

      <div className="space-y-5 text-sm">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Descrição original</p>
          <p className="text-muted-foreground leading-relaxed">{sol.descricao}</p>
        </div>

        {sol.tela && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tela / arquivo</p>
            <p className="font-mono text-xs bg-muted px-2 py-1 rounded">{sol.tela}</p>
          </div>
        )}

        {sol.agente_mudancas?.plano && sol.agente_mudancas.plano.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Plano do agente</p>
              <ol className="space-y-1.5 list-decimal list-inside">
                {sol.agente_mudancas.plano.map((passo, i) => (
                  <li key={i} className="text-muted-foreground leading-relaxed">
                    {passo}
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}

        {sol.agente_mudancas?.arquivos && sol.agente_mudancas.arquivos.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Arquivos previstos</p>
              <ul className="space-y-1">
                {sol.agente_mudancas.arquivos.map((arq, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded truncate flex-1">
                      {arq.path}
                    </span>
                    <Badge variant="outline" className="text-xs shrink-0">{arq.acao}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {sol.agente_erro && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs font-medium text-destructive uppercase tracking-wide">Erro</p>
              <pre className="text-xs bg-destructive/10 text-destructive p-3 rounded whitespace-pre-wrap break-words">
                {sol.agente_erro}
              </pre>
            </div>
          </>
        )}

        <Separator />
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Linha do tempo</p>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 shrink-0" />
              <span>Criado {tempo(sol.created_at)}</span>
            </div>
            {sol.agente_iniciado_em && (
              <div className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 shrink-0" />
                <span>Iniciado {tempo(sol.agente_iniciado_em)}</span>
              </div>
            )}
            {sol.agente_concluido_em && (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
                <span>Concluído {tempo(sol.agente_concluido_em)}</span>
              </div>
            )}
            {(sol.agente_tentativas ?? 0) > 0 && (
              <div className="flex items-center gap-1.5">
                <RotateCcw className="h-3 w-3 shrink-0" />
                <span>{sol.agente_tentativas} tentativa(s)</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
