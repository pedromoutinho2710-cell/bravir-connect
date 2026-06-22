import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { Bot, Loader2, ExternalLink, Sparkles, Check, X } from "lucide-react";

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

type AgenteMeta = { label: string; className: string };

const AGENTE_META: Record<string, AgenteMeta> = {
  pendente: { label: "Pendente", className: "bg-gray-100 text-gray-700 border-gray-300" },
  analisando: { label: "Analisando", className: "bg-blue-100 text-blue-800 border-blue-300" },
  analisado: { label: "Analisado", className: "bg-amber-100 text-amber-800 border-amber-300" },
  implementando: { label: "Implementando", className: "bg-blue-100 text-blue-800 border-blue-300" },
  pr_criado: { label: "PR Criado", className: "bg-green-100 text-green-800 border-green-300" },
  reprovado: { label: "Reprovado", className: "bg-gray-100 text-gray-500 border-gray-300" },
  erro: { label: "Erro", className: "bg-red-100 text-red-800 border-red-300" },
};

function metaDe(status: string | null): AgenteMeta {
  return AGENTE_META[status ?? "pendente"] ?? AGENTE_META.pendente;
}

function tituloDe(s: Solicitacao): string {
  return s.titulo?.trim() || s.descricao.slice(0, 80);
}

export default function AgenteIA() {
  const queryClient = useQueryClient();
  const [selecionada, setSelecionada] = useState<Solicitacao | null>(null);
  // status transitório por linha enquanto a edge function processa.
  const [emProcesso, setEmProcesso] = useState<Record<string, "analisar" | "implementar">>({});

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

  const marcar = (id: string, modo: "analisar" | "implementar" | null) =>
    setEmProcesso((prev) => {
      const proximo = { ...prev };
      if (modo) proximo[id] = modo;
      else delete proximo[id];
      return proximo;
    });

  const invocar = async (s: Solicitacao, modo: "analisar" | "implementar") => {
    marcar(s.id, modo);
    try {
      const { data, error } = await supabase.functions.invoke("agente-implementador", {
        body: {
          solicitacao_id: s.id,
          titulo: tituloDe(s),
          descricao: s.descricao,
          modo,
        },
      });
      if (error || data?.error) {
        throw new Error(data?.error ?? error?.message ?? "Erro desconhecido");
      }

      if (modo === "analisar") {
        toast.success("Análise concluída pela IA");
        if (selecionada?.id === s.id) {
          setSelecionada({ ...selecionada, agente_status: "analisado", agente_resumo: data.resumo ?? null });
        }
      } else {
        toast.success("Pull Request criado");
        if (selecionada?.id === s.id) {
          setSelecionada({
            ...selecionada,
            agente_status: "pr_criado",
            agente_pr_url: data.pr_url ?? null,
            agente_resumo: data.resumo ?? selecionada.agente_resumo,
          });
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["agente-solicitacoes"] });
    } catch (e) {
      toast.error("Falha no agente: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      marcar(s.id, null);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Bot className="h-6 w-6" /> Agente IA
          </h1>
          <p className="text-sm text-muted-foreground">
            Solicitações abertas. A IA analisa, gera um resumo e, após sua aprovação, abre um Pull
            Request no GitHub com a correção.
          </p>
        </div>
      </div>

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
            const statusVisual = proc === "analisar" ? "analisando" : proc === "implementar" ? "implementando" : s.agente_status;
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
                      disabled={!!proc}
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

              <SheetFooter className="flex-row gap-2 sm:justify-start">
                <Button
                  className="flex-1"
                  disabled={!!emProcesso[selecionada.id]}
                  onClick={() => invocar(selecionada, "implementar")}
                >
                  {emProcesso[selecionada.id] === "implementar" ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-1 h-4 w-4" />
                  )}
                  Aprovar e implementar
                </Button>
                <Button
                  variant="outline"
                  disabled={!!emProcesso[selecionada.id]}
                  onClick={() => reprovar(selecionada)}
                >
                  <X className="mr-1 h-4 w-4" /> Reprovar
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
