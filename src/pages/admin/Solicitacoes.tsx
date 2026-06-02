import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, PlusSquare, Trash2 } from "lucide-react";

const PEDRO_EMAIL = "pedro.menezes@bravir.com.br";

interface Solicitacao {
  id: string;
  tipo: "nova" | "altera" | "bug";
  tela: string | null;
  descricao: string;
  motivo: string | null;
  prioridade: "urgente" | "alta" | "normal" | "baixa";
  status: "aberto" | "em-andamento" | "concluido";
  criado_por: string | null;
  criado_por_nome: string | null;
  created_at: string;
}

const TIPO_LABEL: Record<Solicitacao["tipo"], string> = {
  nova: "Sugestão de adição na plataforma",
  altera: "Alteração",
  bug: "Bug",
};

const TIPO_CLASS: Record<Solicitacao["tipo"], string> = {
  nova: "bg-blue-100 text-blue-800 border-blue-300",
  altera: "bg-green-100 text-green-800 border-green-300",
  bug: "bg-red-100 text-red-800 border-red-300",
};

const PRIORIDADE_LABEL: Record<Solicitacao["prioridade"], string> = {
  urgente: "Urgente",
  alta: "Alta",
  normal: "Normal",
  baixa: "Baixa",
};

const PRIORIDADE_CLASS: Record<Solicitacao["prioridade"], string> = {
  urgente: "bg-red-100 text-red-800 border-red-300",
  alta: "bg-orange-100 text-orange-800 border-orange-300",
  normal: "bg-gray-100 text-gray-700 border-gray-300",
  baixa: "bg-green-100 text-green-800 border-green-300",
};

const STATUS_LABEL: Record<Solicitacao["status"], string> = {
  aberto: "Aberto",
  "em-andamento": "Em andamento",
  concluido: "Concluído",
};

const STATUS_CLASS: Record<Solicitacao["status"], string> = {
  aberto: "bg-yellow-100 text-yellow-800 border-yellow-300",
  "em-andamento": "bg-blue-100 text-blue-800 border-blue-300",
  concluido: "bg-green-100 text-green-800 border-green-300",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Solicitacoes() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [filterTipo, setFilterTipo] = useState<string>("todos");
  const [filterPrioridade, setFilterPrioridade] = useState<string>("todas");
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const isAdmin = user?.email === PEDRO_EMAIL;

  const { data: solicitacoes = [], isLoading } = useQuery({
    queryKey: ["solicitacoes_gestor", isAdmin, user?.id],
    queryFn: async () => {
      let query = (supabase as any)
        .from("solicitacoes_gestor")
        .select("*")
        .order("created_at", { ascending: false });

      if (!isAdmin && user?.id) {
        query = query.eq("criado_por", user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as Solicitacao[];

      const missingIds = Array.from(
        new Set(
          rows
            .filter((r) => !r.criado_por_nome && r.criado_por)
            .map((r) => r.criado_por as string),
        ),
      );
      if (missingIds.length === 0) return rows;

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", missingIds);

      const nameById = new Map(
        (profiles ?? []).map((p) => [p.id, p.full_name || p.email || null]),
      );
      return rows.map((r) =>
        r.criado_por_nome || !r.criado_por
          ? r
          : { ...r, criado_por_nome: nameById.get(r.criado_por) ?? null },
      );
    },
    enabled: !!user,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      console.log("Chamando UPDATE no banco:", { id, status });
      const { error } = await (supabase as any)
        .from("solicitacoes_gestor")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      console.log("UPDATE bem sucedido, invalidando query");
      await qc.invalidateQueries({ queryKey: ["solicitacoes_gestor"] });
      toast.success("Status atualizado");
    },
    onError: (e: any) => {
      console.error("Erro UPDATE status:", e);
      toast.error("Erro ao atualizar status: " + (e?.message ?? "desconhecido"));
    },
  });

  const deleteSolicitacao = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("solicitacoes_gestor")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["solicitacoes_gestor"] });
      toast.success("Solicitação excluída");
      setDeleteId(null);
    },
    onError: () => toast.error("Erro ao excluir"),
  });

  const filtered = solicitacoes.filter((s) => {
    if (filterStatus !== "todos" && s.status !== filterStatus) return false;
    if (filterTipo !== "todos" && s.tipo !== filterTipo) return false;
    if (filterPrioridade !== "todas" && s.prioridade !== filterPrioridade) return false;
    return true;
  });

  const total = solicitacoes.length;
  const abertos = solicitacoes.filter((s) => s.status === "aberto").length;
  const emAndamento = solicitacoes.filter((s) => s.status === "em-andamento").length;
  const concluidos = solicitacoes.filter((s) => s.status === "concluido").length;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Solicitações de melhoria</h1>
        <Button asChild size="sm">
          <Link to="/solicitacao">
            <PlusSquare className="mr-2 h-4 w-4" />
            Nova solicitação
          </Link>
        </Button>
      </div>

      {/* Summary cards — also act as status tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total", value: total, color: "text-gray-700", status: "todos" },
          { label: "Em aberto", value: abertos, color: "text-yellow-700", status: "aberto" },
          { label: "Em andamento", value: emAndamento, color: "text-blue-700", status: "em-andamento" },
          { label: "Concluídos", value: concluidos, color: "text-green-700", status: "concluido" },
        ].map(({ label, value, color, status }) => (
          <button
            key={label}
            type="button"
            onClick={() => setFilterStatus(status)}
            className="text-left focus:outline-none"
            aria-pressed={filterStatus === status}
          >
            <Card
              className={`transition-colors hover:bg-muted/50 ${
                filterStatus === status ? "ring-2 ring-primary" : ""
              }`}
            >
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
                <p className={`text-3xl font-bold ${color}`}>{value}</p>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="nova">Sugestão de adição na plataforma</SelectItem>
            <SelectItem value="altera">Alteração</SelectItem>
            <SelectItem value="bug">Bug</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterPrioridade} onValueChange={setFilterPrioridade}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as prioridades</SelectItem>
            <SelectItem value="urgente">Urgente</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="baixa">Baixa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">Nenhuma solicitação encontrada.</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((s) => (
            <Card key={s.id}>
              <CardContent className="pt-4 pb-4 px-5 space-y-3">
                {/* Badges row */}
                <div className="flex flex-wrap gap-2 items-center">
                  <Badge className={`border text-xs font-semibold ${TIPO_CLASS[s.tipo]}`}>
                    {TIPO_LABEL[s.tipo]}
                  </Badge>
                  <Badge className={`border text-xs font-semibold ${PRIORIDADE_CLASS[s.prioridade]}`}>
                    {PRIORIDADE_LABEL[s.prioridade]}
                  </Badge>
                  <Badge className={`border text-xs font-semibold ${STATUS_CLASS[s.status]}`}>
                    {STATUS_LABEL[s.status]}
                  </Badge>
                  {s.tela && (
                    <span className="text-xs text-muted-foreground">• {s.tela}</span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatDate(s.created_at)}
                  </span>
                </div>

                {/* Content */}
                <div>
                  <p className="text-sm font-medium">{s.descricao}</p>
                  {s.motivo && (
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="font-medium text-foreground">Motivo: </span>
                      {s.motivo}
                    </p>
                  )}
                </div>

                {/* Author + actions */}
                <div className="flex items-center gap-3 pt-1">
                  {s.criado_por_nome && (
                    <span className="text-xs text-muted-foreground">
                      Por: <span className="font-medium text-foreground">{s.criado_por_nome}</span>
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-3">
                    <Select
                      value={s.status}
                      onValueChange={(novoStatus) => {
                        console.log("Atualizando status:", { id: s.id, status: novoStatus });
                        updateStatus.mutate({ id: s.id, status: novoStatus });
                      }}
                    >
                      <SelectTrigger className="w-44 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="aberto">Aberto</SelectItem>
                        <SelectItem value="em-andamento">Em andamento</SelectItem>
                        <SelectItem value="concluido">Concluído</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700 h-8 px-2"
                      onClick={() => setDeleteId(s.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir solicitação?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteId && deleteSolicitacao.mutate(deleteId)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
