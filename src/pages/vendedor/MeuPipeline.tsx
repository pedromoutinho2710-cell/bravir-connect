import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LayoutTemplate, Plus, MoreVertical, AlertTriangle, Pencil, Phone, Loader2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

// ───────────────────────────────────────────────────────────────────────
// Tipos
// ───────────────────────────────────────────────────────────────────────

type FieldKey =
  | "dias_sem_comprar"
  | "ltv"
  | "valor_ultimo_pedido"
  | "proximo_passo"
  | "data_proximo_contato"
  | "marcas_interesse";

type ColunaConfig = {
  id: string;
  nome: string;
  cor: string;
};

type Card = {
  cliente_id: string;
  nome: string;
  ltv: number;
  valor_ultimo_pedido: number | null;
  data_ultimo_pedido: string | null;
  dias_sem_comprar: number | null;
  etapa_pipeline: string | null;
  proximo_passo: string | null;
  data_proximo_contato: string | null;
  motivo_perda: string | null;
  obs_comercial: string | null;
  pipeline_updated_at: string | null;
  marcas_interesse: string[] | null;
  produtos_interesse: string | null;
};

// ───────────────────────────────────────────────────────────────────────
// Constantes
// ───────────────────────────────────────────────────────────────────────

const PEDRO_EMAIL = "pedro.menezes@bravir.com.br";
const FIELDS_KEY = "pipeline_fields_pedro";
const CONFIG_KEY = "pipeline_config_pedro";

const TODOS_CAMPOS: { key: FieldKey; label: string }[] = [
  { key: "dias_sem_comprar", label: "Dias sem comprar" },
  { key: "ltv", label: "LTV" },
  { key: "valor_ultimo_pedido", label: "Último pedido" },
  { key: "proximo_passo", label: "Próximo passo" },
  { key: "data_proximo_contato", label: "Próximo contato" },
  { key: "marcas_interesse", label: "Marcas interesse" },
];

const COLUNAS_PADRAO: ColunaConfig[] = [
  { id: "prospeccao", nome: "Prospecção", cor: "slate" },
  { id: "qualificacao", nome: "Qualificação", cor: "blue" },
  { id: "negociacao", nome: "Negociação", cor: "amber" },
  { id: "follow_up", nome: "Follow up", cor: "violet" },
  { id: "transferido", nome: "Transferido", cor: "cyan" },
  { id: "ganho", nome: "Ganho", cor: "green" },
  { id: "perdido", nome: "Perdido", cor: "red" },
];

const PALETA: Record<string, { bar: string; header: string; chip: string }> = {
  slate: { bar: "bg-slate-500", header: "bg-slate-100 text-slate-800", chip: "bg-slate-200 text-slate-800" },
  blue: { bar: "bg-blue-500", header: "bg-blue-100 text-blue-800", chip: "bg-blue-200 text-blue-800" },
  amber: { bar: "bg-amber-500", header: "bg-amber-100 text-amber-800", chip: "bg-amber-200 text-amber-800" },
  violet: { bar: "bg-violet-500", header: "bg-violet-100 text-violet-800", chip: "bg-violet-200 text-violet-800" },
  cyan: { bar: "bg-cyan-500", header: "bg-cyan-100 text-cyan-800", chip: "bg-cyan-200 text-cyan-800" },
  green: { bar: "bg-green-500", header: "bg-green-100 text-green-800", chip: "bg-green-200 text-green-800" },
  red: { bar: "bg-red-500", header: "bg-red-100 text-red-800", chip: "bg-red-200 text-red-800" },
};

const MARCAS_PIPELINE = ["Bendita Cânfora", "Bravir", "Laby", "Alivik", "Tattoo do Bem"] as const;

const TIPOS_CONTATO = ["Ligação", "WhatsApp", "E-mail", "Visita", "Outro"] as const;

const MOTIVOS_PERDA = [
  "Preço alto",
  "Concorrência",
  "Sem interesse",
  "Sem resposta",
  "Cliente inativo",
  "Outro",
] as const;

const FIELDS_DEFAULT: Record<FieldKey, boolean> = {
  dias_sem_comprar: true,
  ltv: true,
  valor_ultimo_pedido: false,
  proximo_passo: true,
  data_proximo_contato: true,
  marcas_interesse: false,
};

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

const fmtBRL = (v: number | null | undefined) =>
  v == null
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });

const hojeISO = () => new Date().toISOString().slice(0, 10);

const diasEntre = (isoA: string, isoB: string) => {
  const a = new Date(isoA + (isoA.length === 10 ? "T00:00:00" : ""));
  const b = new Date(isoB + (isoB.length === 10 ? "T00:00:00" : ""));
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
};

const loadJSON = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const saveJSON = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
};

// ───────────────────────────────────────────────────────────────────────
// Página
// ───────────────────────────────────────────────────────────────────────

export default function MeuPipeline() {
  const { user } = useAuth();
  const qc = useQueryClient();

  if (user?.email !== PEDRO_EMAIL) return null;

  const [fields, setFields] = useState<Record<FieldKey, boolean>>(() =>
    loadJSON<Record<FieldKey, boolean>>(FIELDS_KEY, FIELDS_DEFAULT)
  );
  const [showFields, setShowFields] = useState(false);
  const [colunas, setColunas] = useState<ColunaConfig[]>(() =>
    loadJSON<ColunaConfig[]>(CONFIG_KEY, COLUNAS_PADRAO)
  );

  useEffect(() => { saveJSON(FIELDS_KEY, fields); }, [fields]);
  useEffect(() => { saveJSON(CONFIG_KEY, colunas); }, [colunas]);

  // Query principal
  const cardsQ = useQuery({
    queryKey: ["meu-pipeline", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Card[]> => {
      const [ltvRes, cliRes] = await Promise.all([
        (supabase as any)
          .from("vendedor_ltv_clientes")
          .select("cliente_id, nome, dias_sem_comprar, ltv, valor_ultimo_pedido, data_ultimo_pedido")
          .eq("vendedor_id", user!.id),
        (supabase as any)
          .from("clientes")
          .select(
            "id, razao_social, nome_parceiro, etapa_pipeline, proximo_passo, data_proximo_contato, motivo_perda, obs_comercial, pipeline_updated_at, marcas_interesse, produtos_interesse"
          )
          .eq("vendedor_id", user!.id)
          .eq("status", "ativo"),
      ]);

      if (ltvRes.error) throw ltvRes.error;
      if (cliRes.error) throw cliRes.error;

      const cliMap = new Map<string, any>();
      (cliRes.data ?? []).forEach((c: any) => cliMap.set(c.id, c));
      const ltvMap = new Map<string, any>();
      (ltvRes.data ?? []).forEach((c: any) => ltvMap.set(c.cliente_id, c));

      const ids = new Set<string>([...cliMap.keys(), ...ltvMap.keys()]);
      const out: Card[] = [];
      ids.forEach((id) => {
        const ltv = ltvMap.get(id);
        const cli = cliMap.get(id);
        if (!cli) return;
        out.push({
          cliente_id: id,
          nome: ltv?.nome ?? cli.nome_parceiro ?? cli.razao_social ?? "—",
          ltv: Number(ltv?.ltv ?? 0),
          valor_ultimo_pedido: ltv?.valor_ultimo_pedido != null ? Number(ltv.valor_ultimo_pedido) : null,
          data_ultimo_pedido: ltv?.data_ultimo_pedido ?? null,
          dias_sem_comprar: ltv?.dias_sem_comprar ?? null,
          etapa_pipeline: cli.etapa_pipeline ?? null,
          proximo_passo: cli.proximo_passo ?? null,
          data_proximo_contato: cli.data_proximo_contato ?? null,
          motivo_perda: cli.motivo_perda ?? null,
          obs_comercial: cli.obs_comercial ?? null,
          pipeline_updated_at: cli.pipeline_updated_at ?? null,
          marcas_interesse: cli.marcas_interesse ?? null,
          produtos_interesse: cli.produtos_interesse ?? null,
        });
      });
      return out;
    },
  });

  // Mutations
  const moverM = useMutation({
    mutationFn: async (p: { cliente_id: string; etapa: string; motivo_perda?: string | null }) => {
      const patch: any = { etapa_pipeline: p.etapa, pipeline_updated_at: new Date().toISOString() };
      if (p.motivo_perda !== undefined) patch.motivo_perda = p.motivo_perda;
      const { error } = await (supabase as any).from("clientes").update(patch).eq("id", p.cliente_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meu-pipeline"] }),
    onError: (e: any) => toast.error(e?.message ?? "Erro ao mover card"),
  });

  const salvarEdicaoM = useMutation({
    mutationFn: async (p: { cliente_id: string; patch: Partial<Card> }) => {
      const payload: any = {
        proximo_passo: p.patch.proximo_passo ?? null,
        data_proximo_contato: p.patch.data_proximo_contato ?? null,
        obs_comercial: p.patch.obs_comercial ?? null,
        marcas_interesse: p.patch.marcas_interesse ?? null,
        produtos_interesse: p.patch.produtos_interesse ?? null,
        pipeline_updated_at: new Date().toISOString(),
      };
      const { error } = await (supabase as any).from("clientes").update(payload).eq("id", p.cliente_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meu-pipeline"] });
      toast.success("Card atualizado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  const registrarContatoM = useMutation({
    mutationFn: async (p: { cliente_id: string; tipo: string; nota: string }) => {
      const { error } = await (supabase as any).from("pipeline_contatos").insert({
        cliente_id: p.cliente_id,
        vendedor_id: user!.id,
        tipo: p.tipo,
        nota: p.nota || null,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Contato registrado"),
    onError: (e: any) => toast.error(e?.message ?? "Erro ao registrar contato"),
  });

  const adicionarClienteM = useMutation({
    mutationFn: async (p: { cliente_id: string; etapa: string }) => {
      const { error } = await (supabase as any)
        .from("clientes")
        .update({ etapa_pipeline: p.etapa, pipeline_updated_at: new Date().toISOString() })
        .eq("id", p.cliente_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meu-pipeline"] }),
    onError: (e: any) => toast.error(e?.message ?? "Erro ao adicionar"),
  });

  // Estado de modais
  const [editCard, setEditCard] = useState<Card | null>(null);
  const [contatoCard, setContatoCard] = useState<Card | null>(null);
  const [perdaCtx, setPerdaCtx] = useState<{ cliente_id: string } | null>(null);
  const [editColuna, setEditColuna] = useState<ColunaConfig | null>(null);
  const [excluirColuna, setExcluirColuna] = useState<ColunaConfig | null>(null);
  const [addCol, setAddCol] = useState<ColunaConfig | null>(null);

  // Agrupar cards por coluna
  const cardsPorColuna = useMemo(() => {
    const m = new Map<string, Card[]>();
    colunas.forEach((c) => m.set(c.id, []));
    (cardsQ.data ?? []).forEach((card) => {
      if (!card.etapa_pipeline) return;
      const arr = m.get(card.etapa_pipeline);
      if (arr) arr.push(card);
    });
    return m;
  }, [cardsQ.data, colunas]);

  const cardsNoPipeline = (cardsQ.data ?? []).filter((c) => !!c.etapa_pipeline);
  const cardsForaPipeline = (cardsQ.data ?? []).filter((c) => !c.etapa_pipeline);

  const idsAbertos = new Set(["ganho", "perdido"]);
  const ltvAberto = cardsNoPipeline
    .filter((c) => !idsAbertos.has(c.etapa_pipeline ?? ""))
    .reduce((s, c) => s + (c.ltv || 0), 0);

  const hoje = hojeISO();
  const paradosCount = cardsNoPipeline.filter(
    (c) => c.pipeline_updated_at && diasEntre(hoje, c.pipeline_updated_at.slice(0, 10)) > 7
  ).length;
  const vencidosCount = cardsNoPipeline.filter(
    (c) => c.data_proximo_contato && c.data_proximo_contato < hoje
  ).length;

  // Drag & drop
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const onDragStart = (e: React.DragEvent, id: string) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const onDropColuna = (e: React.DragEvent, etapa: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || draggingId;
    setDraggingId(null);
    if (!id) return;
    const card = (cardsQ.data ?? []).find((c) => c.cliente_id === id);
    if (!card || card.etapa_pipeline === etapa) return;
    if (etapa === "perdido") {
      setPerdaCtx({ cliente_id: id });
      return;
    }
    moverM.mutate({ cliente_id: id, etapa });
    if (etapa === "ganho") toast.success("Cliente marcado como Ganho ✓");
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <LayoutTemplate className="h-6 w-6" />
          Meu pipeline
        </h1>
        <Button variant="outline" size="sm" onClick={() => setShowFields((s) => !s)}>
          Campos visíveis
        </Button>
      </div>

      {showFields && (
        <div className="flex flex-wrap gap-2 rounded-md border bg-muted/30 p-3">
          {TODOS_CAMPOS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFields((prev) => ({ ...prev, [f.key]: !prev[f.key] }))}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                fields[f.key]
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metrica label="Clientes no pipeline" valor={cardsNoPipeline.length.toString()} />
        <Metrica label="LTV em aberto" valor={fmtBRL(ltvAberto)} />
        <Metrica label="Parados +7d" valor={paradosCount.toString()} alerta={paradosCount > 0} />
        <Metrica label="Contato vencido" valor={vencidosCount.toString()} alerta={vencidosCount > 0} />
      </div>

      {/* Board */}
      {cardsQ.isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {colunas.map((col) => {
            const cards = cardsPorColuna.get(col.id) ?? [];
            const ltvCol = cards.reduce((s, c) => s + (c.ltv || 0), 0);
            const pal = PALETA[col.cor] ?? PALETA.slate;
            return (
              <div
                key={col.id}
                className="flex w-72 shrink-0 flex-col rounded-md border bg-muted/20"
                onDragOver={onDragOver}
                onDrop={(e) => onDropColuna(e, col.id)}
              >
                <div className={`flex items-center justify-between rounded-t-md px-3 py-2 ${pal.header}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`h-2 w-2 rounded-full ${pal.bar}`} />
                    <span className="truncate text-sm font-semibold">{col.nome}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${pal.chip}`}>
                      {cards.length}
                    </span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditColuna(col)}>Editar coluna</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => setExcluirColuna(col)}
                      >
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="px-3 py-1 text-[11px] text-muted-foreground">
                  LTV: <span className="font-semibold">{fmtBRL(ltvCol)}</span>
                </div>

                <div className="flex-1 space-y-2 px-2 pb-2">
                  {cards.map((card) => (
                    <CardKanban
                      key={card.cliente_id}
                      card={card}
                      fields={fields}
                      onDragStart={(e) => onDragStart(e, card.cliente_id)}
                      onEdit={() => setEditCard(card)}
                      onContato={() => setContatoCard(card)}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  className="mx-2 mb-2 rounded-md border border-dashed py-1.5 text-xs text-muted-foreground hover:bg-muted/40"
                  onClick={() => setAddCol(col)}
                >
                  <Plus className="mr-1 inline h-3 w-3" />
                  Adicionar
                </button>
              </div>
            );
          })}

          <div className="w-72 shrink-0">
            <button
              type="button"
              onClick={() => {
                const id = `etapa_${Date.now()}`;
                const nova: ColunaConfig = { id, nome: "Nova etapa", cor: "slate" };
                setColunas((prev) => [...prev, nova]);
                setEditColuna(nova);
              }}
              className="flex h-full min-h-[120px] w-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground hover:bg-muted/30"
            >
              <Plus className="mr-1 h-4 w-4" />
              Nova etapa
            </button>
          </div>
        </div>
      )}

      {/* Modais */}
      {editCard && (
        <EditarCardDialog
          card={editCard}
          onClose={() => setEditCard(null)}
          onSalvar={(patch) => {
            salvarEdicaoM.mutate(
              { cliente_id: editCard.cliente_id, patch },
              { onSuccess: () => setEditCard(null) }
            );
          }}
          salvando={salvarEdicaoM.isPending}
        />
      )}

      {contatoCard && (
        <RegistrarContatoDialog
          card={contatoCard}
          onClose={() => setContatoCard(null)}
          onSalvar={(tipo, nota) => {
            registrarContatoM.mutate(
              { cliente_id: contatoCard.cliente_id, tipo, nota },
              { onSuccess: () => setContatoCard(null) }
            );
          }}
          salvando={registrarContatoM.isPending}
        />
      )}

      {perdaCtx && (
        <MotivoPerdaDialog
          onCancel={() => setPerdaCtx(null)}
          onConfirm={(motivo) => {
            moverM.mutate({ cliente_id: perdaCtx.cliente_id, etapa: "perdido", motivo_perda: motivo });
            setPerdaCtx(null);
          }}
        />
      )}

      {editColuna && (
        <EditarColunaDialog
          coluna={editColuna}
          onClose={() => setEditColuna(null)}
          onSalvar={(patch) => {
            setColunas((prev) => prev.map((c) => (c.id === editColuna.id ? { ...c, ...patch } : c)));
            setEditColuna(null);
          }}
        />
      )}

      <AlertDialog open={!!excluirColuna} onOpenChange={(o) => !o && setExcluirColuna(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir coluna?</AlertDialogTitle>
            <AlertDialogDescription>
              {excluirColuna && (cardsPorColuna.get(excluirColuna.id)?.length ?? 0) > 0
                ? "Esta coluna possui cards. Mova-os antes de excluir."
                : `A coluna "${excluirColuna?.nome}" será removida da sua configuração.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!excluirColuna || (cardsPorColuna.get(excluirColuna.id)?.length ?? 0) > 0}
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (excluirColuna) {
                  setColunas((prev) => prev.filter((c) => c.id !== excluirColuna.id));
                  setExcluirColuna(null);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {addCol && (
        <AdicionarClienteDialog
          coluna={addCol}
          candidatos={cardsForaPipeline}
          onClose={() => setAddCol(null)}
          onConfirm={(cliente_id) => {
            adicionarClienteM.mutate(
              { cliente_id, etapa: addCol.id },
              { onSuccess: () => setAddCol(null) }
            );
          }}
          salvando={adicionarClienteM.isPending}
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

function CardKanban({
  card,
  fields,
  onDragStart,
  onEdit,
  onContato,
}: {
  card: Card;
  fields: Record<FieldKey, boolean>;
  onDragStart: (e: React.DragEvent) => void;
  onEdit: () => void;
  onContato: () => void;
}) {
  const hoje = hojeISO();
  const parado =
    card.pipeline_updated_at && diasEntre(hoje, card.pipeline_updated_at.slice(0, 10)) > 7;
  const diasParado = card.pipeline_updated_at
    ? diasEntre(hoje, card.pipeline_updated_at.slice(0, 10))
    : 0;
  const contatoVencido = card.data_proximo_contato && card.data_proximo_contato < hoje;
  const dias = card.dias_sem_comprar;
  const diasCls =
    dias == null
      ? "bg-gray-100 text-gray-700 border-gray-300"
      : dias < 30
      ? "bg-green-100 text-green-800 border-green-300"
      : dias < 90
      ? "bg-yellow-100 text-yellow-800 border-yellow-300"
      : "bg-red-100 text-red-800 border-red-300";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={`rounded-md border bg-card p-2 text-sm shadow-sm transition-colors hover:bg-muted/30 ${
        parado ? "border-l-4 border-l-orange-400" : ""
      }`}
    >
      <div className="flex items-start gap-1">
        <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground" />
        <div className="min-w-0 flex-1 font-medium">{card.nome}</div>
        {parado && (
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-orange-500" />
            </TooltipTrigger>
            <TooltipContent>Parado há {diasParado} dias</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {fields.dias_sem_comprar && (
          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${diasCls}`}>
            {dias == null ? "Sem compra" : `${dias}d`}
          </span>
        )}
        {fields.ltv && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
            LTV {fmtBRL(card.ltv)}
          </span>
        )}
        {fields.valor_ultimo_pedido && card.valor_ultimo_pedido != null && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
            Últ {fmtBRL(card.valor_ultimo_pedido)}
          </span>
        )}
      </div>

      {fields.proximo_passo && card.proximo_passo && (
        <div className="mt-2 border-l-2 border-primary/50 pl-2 text-xs text-muted-foreground">
          {card.proximo_passo}
        </div>
      )}

      {fields.data_proximo_contato && card.data_proximo_contato && (
        <div
          className={`mt-1 flex items-center gap-1 text-[11px] ${
            contatoVencido ? "font-medium text-red-600" : "text-muted-foreground"
          }`}
        >
          {contatoVencido && <AlertTriangle className="h-3 w-3" />}
          Contato: {new Date(card.data_proximo_contato + "T00:00:00").toLocaleDateString("pt-BR")}
        </div>
      )}

      {fields.marcas_interesse && card.marcas_interesse?.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {card.marcas_interesse.map((m) => (
            <Badge key={m} variant="outline" className="text-[10px]">
              {m}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-2 flex gap-1">
        <Button variant="ghost" size="sm" className="h-6 flex-1 text-[11px]" onClick={onEdit}>
          <Pencil className="mr-1 h-3 w-3" />
          Editar
        </Button>
        <Button variant="ghost" size="sm" className="h-6 flex-1 text-[11px]" onClick={onContato}>
          <Phone className="mr-1 h-3 w-3" />
          Contato
        </Button>
      </div>
    </div>
  );
}

function EditarCardDialog({
  card,
  onClose,
  onSalvar,
  salvando,
}: {
  card: Card;
  onClose: () => void;
  onSalvar: (patch: Partial<Card>) => void;
  salvando: boolean;
}) {
  const [proximoPasso, setProximoPasso] = useState(card.proximo_passo ?? "");
  const [dataContato, setDataContato] = useState(card.data_proximo_contato ?? "");
  const [obs, setObs] = useState(card.obs_comercial ?? "");
  const [marcas, setMarcas] = useState<string[]>(card.marcas_interesse ?? []);
  const [produtos, setProdutos] = useState(card.produtos_interesse ?? "");

  const toggleMarca = (m: string) =>
    setMarcas((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{card.nome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/30 p-3 text-center">
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">LTV</div>
              <div className="text-sm font-semibold">{fmtBRL(card.ltv)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Dias s/ comprar</div>
              <div className="text-sm font-semibold">
                {card.dias_sem_comprar == null ? "—" : `${card.dias_sem_comprar}d`}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Último pedido</div>
              <div className="text-sm font-semibold">{fmtBRL(card.valor_ultimo_pedido)}</div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Próximo passo</Label>
            <Input value={proximoPasso} onChange={(e) => setProximoPasso(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Data do próximo contato</Label>
            <Input type="date" value={dataContato} onChange={(e) => setDataContato(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Observação comercial</Label>
            <Textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Marcas de interesse</Label>
            <div className="flex flex-wrap gap-2">
              {MARCAS_PIPELINE.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMarca(m)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    marcas.includes(m)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Produtos de interesse</Label>
            <Textarea rows={2} value={produtos} onChange={(e) => setProdutos(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={salvando}
            onClick={() =>
              onSalvar({
                proximo_passo: proximoPasso || null,
                data_proximo_contato: dataContato || null,
                obs_comercial: obs || null,
                marcas_interesse: marcas.length ? marcas : null,
                produtos_interesse: produtos || null,
              })
            }
          >
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegistrarContatoDialog({
  card,
  onClose,
  onSalvar,
  salvando,
}: {
  card: Card;
  onClose: () => void;
  onSalvar: (tipo: string, nota: string) => void;
  salvando: boolean;
}) {
  const [tipo, setTipo] = useState<string>(TIPOS_CONTATO[0]);
  const [nota, setNota] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar contato — {card.nome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_CONTATO.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nota (opcional)</Label>
            <Textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={salvando} onClick={() => onSalvar(tipo, nota)}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MotivoPerdaDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState<string>(MOTIVOS_PERDA[0]);
  const [extra, setExtra] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Motivo da perda</DialogTitle>
          <DialogDescription>
            Selecione o motivo para mover este card para "Perdido".
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={motivo} onValueChange={setMotivo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MOTIVOS_PERDA.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            rows={3}
            placeholder="Detalhes (opcional)"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button
            className="bg-red-600 hover:bg-red-700"
            onClick={() => onConfirm(extra ? `${motivo} — ${extra}` : motivo)}
          >
            Confirmar perda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditarColunaDialog({
  coluna,
  onClose,
  onSalvar,
}: {
  coluna: ColunaConfig;
  onClose: () => void;
  onSalvar: (patch: Partial<ColunaConfig>) => void;
}) {
  const [nome, setNome] = useState(coluna.nome);
  const [cor, setCor] = useState(coluna.cor);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar etapa</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cor</Label>
            <div className="flex gap-2">
              {Object.keys(PALETA).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCor(c)}
                  aria-label={c}
                  className={`h-6 w-6 rounded-full ${PALETA[c].bar} ${
                    cor === c ? "ring-2 ring-offset-2 ring-foreground" : ""
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSalvar({ nome: nome.trim() || coluna.nome, cor })}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdicionarClienteDialog({
  coluna,
  candidatos,
  onClose,
  onConfirm,
  salvando,
}: {
  coluna: ColunaConfig;
  candidatos: Card[];
  onClose: () => void;
  onConfirm: (cliente_id: string) => void;
  salvando: boolean;
}) {
  const [busca, setBusca] = useState("");
  const filtrados = useMemo(
    () =>
      busca.trim()
        ? candidatos.filter((c) => c.nome.toLowerCase().includes(busca.toLowerCase()))
        : candidatos,
    [candidatos, busca]
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar a "{coluna.nome}"</DialogTitle>
          <DialogDescription>
            Clientes da sua carteira que ainda não estão no pipeline.
          </DialogDescription>
        </DialogHeader>
        <Input
          placeholder="Buscar cliente..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {filtrados.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum cliente disponível
            </p>
          ) : (
            filtrados.map((c) => (
              <button
                key={c.cliente_id}
                type="button"
                disabled={salvando}
                onClick={() => onConfirm(c.cliente_id)}
                className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/40"
              >
                <span className="truncate">{c.nome}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                  {fmtBRL(c.ltv)}
                </span>
              </button>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
