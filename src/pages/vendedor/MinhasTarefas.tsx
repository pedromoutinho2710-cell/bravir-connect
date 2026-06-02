import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckSquare,
  CheckCircle2,
  Circle,
  Calendar,
  AlertTriangle,
  Loader2,
  Plus,
  Search,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ───────────────────────────────────────────────────────────────────────
// Tipos
// ───────────────────────────────────────────────────────────────────────

type Tarefa = {
  id: string;
  titulo: string;
  tipo: string | null;
  descricao: string | null;
  data_vencimento: string | null;
  concluida: boolean;
  cliente_id: string | null;
  cliente_nome: string | null;
};

type ClienteOpcao = {
  id: string;
  nome: string;
};

type StatusFiltro = "todas" | "pendentes" | "concluidas";

// ───────────────────────────────────────────────────────────────────────
// Constantes
// ───────────────────────────────────────────────────────────────────────

const TIPOS_TAREFA = ["tarefa", "ligação", "email", "visita", "proposta"] as const;

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

const hojeISO = () => new Date().toISOString().slice(0, 10);

const fmtData = (iso: string | null) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—";

// ───────────────────────────────────────────────────────────────────────
// Página
// ───────────────────────────────────────────────────────────────────────

export default function MinhasTarefas() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("pendentes");
  const [tipoFiltro, setTipoFiltro] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [novaAberta, setNovaAberta] = useState(false);

  // Query principal — tarefas do vendedor com nome do cliente
  const tarefasQ = useQuery({
    queryKey: ["minhas-tarefas", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Tarefa[]> => {
      const { data, error } = await (supabase as any)
        .from("tarefas")
        .select(
          "id, titulo, tipo, descricao, data_vencimento, concluida, cliente_id, clientes(razao_social, nome_parceiro)"
        )
        .eq("vendedor_id", user!.id);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((t: any) => ({
        id: t.id,
        titulo: t.titulo,
        tipo: t.tipo ?? null,
        descricao: t.descricao ?? null,
        data_vencimento: t.data_vencimento ?? null,
        concluida: !!t.concluida,
        cliente_id: t.cliente_id ?? null,
        cliente_nome: t.clientes?.nome_parceiro ?? t.clientes?.razao_social ?? null,
      }));
    },
  });

  // Marcar como concluída / reabrir
  const toggleConcluidaM = useMutation({
    mutationFn: async (p: { id: string; concluida: boolean }) => {
      const { error } = await (supabase as any)
        .from("tarefas")
        .update({ concluida: p.concluida })
        .eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["minhas-tarefas"] }),
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar tarefa"),
  });

  // Criar nova tarefa
  const criarM = useMutation({
    mutationFn: async (p: {
      titulo: string;
      tipo: string;
      cliente_id: string | null;
      data_vencimento: string | null;
    }) => {
      const { error } = await (supabase as any).from("tarefas").insert({
        vendedor_id: user!.id,
        titulo: p.titulo,
        tipo: p.tipo,
        cliente_id: p.cliente_id,
        data_vencimento: p.data_vencimento,
        concluida: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["minhas-tarefas"] });
      toast.success("Tarefa criada");
      setNovaAberta(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao criar tarefa"),
  });

  const hoje = hojeISO();

  // Tipos disponíveis para o filtro (padrão + os que já existem nas tarefas)
  const tiposDisponiveis = useMemo(() => {
    const set = new Set<string>(TIPOS_TAREFA as readonly string[]);
    (tarefasQ.data ?? []).forEach((t) => t.tipo && set.add(t.tipo));
    return Array.from(set);
  }, [tarefasQ.data]);

  const tarefasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = (tarefasQ.data ?? []).filter((t) => {
      if (statusFiltro === "pendentes" && t.concluida) return false;
      if (statusFiltro === "concluidas" && !t.concluida) return false;
      if (tipoFiltro !== "todos" && t.tipo !== tipoFiltro) return false;
      if (termo) {
        const alvo = `${t.titulo} ${t.cliente_nome ?? ""}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });

    const vencida = (t: Tarefa) =>
      !t.concluida && !!t.data_vencimento && t.data_vencimento < hoje;

    // Ordenação: vencidas primeiro, depois por data_vencimento asc, concluídas no final
    return lista.sort((a, b) => {
      if (a.concluida !== b.concluida) return a.concluida ? 1 : -1;
      const av = vencida(a);
      const bv = vencida(b);
      if (av !== bv) return av ? -1 : 1;
      const ad = a.data_vencimento ?? "9999-12-31";
      const bd = b.data_vencimento ?? "9999-12-31";
      if (ad !== bd) return ad < bd ? -1 : 1;
      return a.titulo.localeCompare(b.titulo);
    });
  }, [tarefasQ.data, statusFiltro, tipoFiltro, busca, hoje]);

  const vencidasCount = useMemo(
    () =>
      (tarefasQ.data ?? []).filter(
        (t) => !t.concluida && t.data_vencimento && t.data_vencimento < hoje
      ).length,
    [tarefasQ.data, hoje]
  );
  const pendentesCount = (tarefasQ.data ?? []).filter((t) => !t.concluida).length;

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <CheckSquare className="h-6 w-6" />
          Minhas Tarefas
        </h1>
        <Button size="sm" onClick={() => setNovaAberta(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Nova tarefa
        </Button>
      </div>

      {/* Métricas rápidas */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Metrica label="Pendentes" valor={pendentesCount.toString()} />
        <Metrica label="Vencidas" valor={vencidasCount.toString()} alerta={vencidasCount > 0} />
        <Metrica label="Total" valor={(tarefasQ.data ?? []).length.toString()} />
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por título ou cliente..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={statusFiltro} onValueChange={(v) => setStatusFiltro(v as StatusFiltro)}>
          <SelectTrigger className="sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="pendentes">Pendentes</SelectItem>
            <SelectItem value="concluidas">Concluídas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
          <SelectTrigger className="sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {tiposDisponiveis.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      {tarefasQ.isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : tarefasFiltradas.length === 0 ? (
        <div className="rounded-md border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
          Nenhuma tarefa encontrada
        </div>
      ) : (
        <div className="space-y-2">
          {tarefasFiltradas.map((t) => {
            const vencida = !t.concluida && t.data_vencimento && t.data_vencimento < hoje;
            return (
              <div
                key={t.id}
                className={`flex items-start gap-3 rounded-md border bg-card px-3 py-2.5 transition-colors ${
                  t.concluida
                    ? "opacity-60"
                    : vencida
                    ? "border-l-4 border-l-red-500 bg-red-50/50"
                    : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleConcluidaM.mutate({ id: t.id, concluida: !t.concluida })}
                  disabled={toggleConcluidaM.isPending}
                  className="mt-0.5 shrink-0"
                  aria-label={t.concluida ? "Reabrir tarefa" : "Concluir tarefa"}
                >
                  {t.concluida ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground hover:text-primary" />
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <div
                    className={`text-sm font-medium ${
                      t.concluida ? "line-through text-muted-foreground" : ""
                    }`}
                  >
                    {t.titulo}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    {t.cliente_nome && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {t.cliente_nome}
                      </span>
                    )}
                    {t.data_vencimento && (
                      <span
                        className={`flex items-center gap-1 ${
                          vencida ? "font-semibold text-red-600" : ""
                        }`}
                      >
                        {vencida ? (
                          <AlertTriangle className="h-3 w-3" />
                        ) : (
                          <Calendar className="h-3 w-3" />
                        )}
                        {fmtData(t.data_vencimento)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  {t.tipo && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                      {t.tipo}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      t.concluida
                        ? "bg-green-100 text-green-800"
                        : vencida
                        ? "bg-red-100 text-red-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {t.concluida ? "Concluída" : vencida ? "Vencida" : "Pendente"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {novaAberta && (
        <NovaTarefaDialog
          vendedorId={user!.id}
          onClose={() => setNovaAberta(false)}
          onSalvar={(p) => criarM.mutate(p)}
          salvando={criarM.isPending}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Subcomponentes
// ───────────────────────────────────────────────────────────────────────

function Metrica({ label, valor, alerta }: { label: string; valor: string; alerta?: boolean }) {
  return (
    <div className={`rounded-md border bg-card px-3 py-2 ${alerta ? "border-red-300 bg-red-50" : ""}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{valor}</div>
    </div>
  );
}

function NovaTarefaDialog({
  vendedorId,
  onClose,
  onSalvar,
  salvando,
}: {
  vendedorId: string;
  onClose: () => void;
  onSalvar: (p: {
    titulo: string;
    tipo: string;
    cliente_id: string | null;
    data_vencimento: string | null;
  }) => void;
  salvando: boolean;
}) {
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<string>(TIPOS_TAREFA[0]);
  const [dataVenc, setDataVenc] = useState("");
  const [buscaCliente, setBuscaCliente] = useState("");
  const [cliente, setCliente] = useState<ClienteOpcao | null>(null);

  // Clientes da carteira do vendedor (busca com supabase)
  const clientesQ = useQuery({
    queryKey: ["tarefas-clientes-vendedor", vendedorId],
    queryFn: async (): Promise<ClienteOpcao[]> => {
      const { data, error } = await (supabase as any)
        .from("clientes")
        .select("id, razao_social, nome_parceiro")
        .eq("vendedor_id", vendedorId)
        .eq("status", "ativo")
        .order("razao_social", { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((c: any) => ({
        id: c.id,
        nome: c.nome_parceiro || c.razao_social || "—",
      }));
    },
  });

  const filtrados = useMemo(() => {
    const termo = buscaCliente.trim().toLowerCase();
    const lista = clientesQ.data ?? [];
    return (termo ? lista.filter((c) => c.nome.toLowerCase().includes(termo)) : lista).slice(0, 30);
  }, [clientesQ.data, buscaCliente]);

  const podeSalvar = titulo.trim().length > 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova tarefa</DialogTitle>
          <DialogDescription>Crie uma tarefa e associe a um cliente da sua carteira.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Título</Label>
            <Input
              autoFocus
              placeholder="Ex.: Ligar para retomar contato"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_TAREFA.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Vencimento</Label>
              <Input type="date" value={dataVenc} onChange={(e) => setDataVenc(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Cliente (opcional)</Label>
            {cliente ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span className="flex items-center gap-2 truncate">
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {cliente.nome}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setCliente(null)}
                >
                  Trocar
                </Button>
              </div>
            ) : (
              <>
                <Input
                  placeholder="Buscar cliente..."
                  value={buscaCliente}
                  onChange={(e) => setBuscaCliente(e.target.value)}
                />
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-1">
                  {clientesQ.isLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    </div>
                  ) : filtrados.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      Nenhum cliente encontrado
                    </p>
                  ) : (
                    filtrados.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCliente(c)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60"
                      >
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{c.nome}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!podeSalvar || salvando}
            onClick={() =>
              onSalvar({
                titulo: titulo.trim(),
                tipo,
                cliente_id: cliente?.id ?? null,
                data_vencimento: dataVenc || null,
              })
            }
          >
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar tarefa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
