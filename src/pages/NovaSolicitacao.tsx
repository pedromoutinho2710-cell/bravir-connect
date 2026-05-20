import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

type Tipo = "nova" | "altera" | "bug";
type Prioridade = "urgente" | "alta" | "normal" | "baixa";

const TELAS = [
  "Novo pedido",
  "Meus pedidos",
  "Faturamento",
  "Clientes",
  "Logística",
  "Dashboard",
  "Outra",
];

const TIPO_LABEL: Record<Tipo, string> = {
  nova: "Sugestão de adição na plataforma",
  altera: "Alteração",
  bug: "Bug",
};

const TIPO_BUTTON_CLASS: Record<Tipo, string> = {
  nova: "border-blue-400 bg-blue-50 text-blue-700",
  altera: "border-green-400 bg-green-50 text-green-700",
  bug: "border-red-400 bg-red-50 text-red-700",
};

const RASCUNHO_KEY = "solicitacao_rascunho";

export default function NovaSolicitacao() {
  const { user, fullName } = useAuth();
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [tela, setTela] = useState<string | null>(null);
  const [outraTela, setOutraTela] = useState("");
  const [descricao, setDescricao] = useState("");
  const [motivo, setMotivo] = useState("");
  const [prioridade, setPrioridade] = useState<Prioridade>("normal");
  const [saving, setSaving] = useState(false);

  // Restore draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RASCUNHO_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.tipo) setTipo(draft.tipo);
      if (draft.tela) setTela(draft.tela);
      if (draft.descricao) setDescricao(draft.descricao);
      if (draft.motivo) setMotivo(draft.motivo);
      if (draft.prioridade) setPrioridade(draft.prioridade);
    } catch {
      // ignore malformed draft
    }
  }, []);

  // Autosave draft on every field change
  useEffect(() => {
    localStorage.setItem(RASCUNHO_KEY, JSON.stringify({ tipo, tela, descricao, motivo, prioridade }));
  }, [tipo, tela, descricao, motivo, prioridade]);

  const telaFinal = tela === "Outra" ? (outraTela.trim() || null) : tela;

  async function handleSave() {
    if (!tipo) {
      toast.error("Selecione o tipo da solicitação");
      return;
    }
    if (!descricao.trim()) {
      toast.error("Descreva o que você quer");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tipo,
        tela: telaFinal,
        descricao: descricao.trim(),
        motivo: motivo.trim() || null,
        prioridade,
        status: "aberto",
        criado_por: user?.id ?? null,
        criado_por_nome: fullName ?? user?.email ?? null,
      };
      const { error } = await (supabase as any).from("solicitacoes_gestor").insert(payload);
      if (error) {
        console.error("Erro Supabase ao salvar solicitação:", {
          message: (error as any)?.message,
          details: (error as any)?.details,
          hint: (error as any)?.hint,
          code: (error as any)?.code,
          payload,
          raw: error,
        });
        throw error;
      }

      localStorage.removeItem(RASCUNHO_KEY);
      toast.success("Solicitação salva com sucesso!");
      setTipo(null);
      setTela(null);
      setOutraTela("");
      setDescricao("");
      setMotivo("");
      setPrioridade("normal");
    } catch (err) {
      console.error("Erro ao salvar solicitação:", err);
      const anyErr = err as { message?: string; details?: string; hint?: string; code?: string };
      const msg =
        anyErr?.message ||
        anyErr?.details ||
        anyErr?.hint ||
        (err instanceof Error ? err.message : "Erro ao salvar solicitação");
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Nova solicitação de melhoria</h1>

      {/* Tipo */}
      <div className="space-y-2">
        <Label>Tipo</Label>
        <div className="flex gap-3 flex-wrap">
          {(["nova", "altera", "bug"] as Tipo[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                tipo === t
                  ? TIPO_BUTTON_CLASS[t]
                  : "border-border bg-background text-muted-foreground hover:border-muted-foreground"
              }`}
            >
              {TIPO_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Tela */}
      <div className="space-y-2">
        <Label>Tela afetada</Label>
        <div className="flex flex-wrap gap-2">
          {TELAS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTela(tela === t ? null : t)}
              className={`px-3 py-1.5 rounded-md border text-sm transition-all ${
                tela === t
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {tela === "Outra" && (
          <Input
            placeholder="Qual tela?"
            value={outraTela}
            onChange={(e) => setOutraTela(e.target.value)}
            className="mt-2 max-w-xs"
          />
        )}
      </div>

      {/* Descrição */}
      <div className="space-y-2">
        <Label>
          O que você quer? <span className="text-red-500">*</span>
        </Label>
        <Textarea
          placeholder="Descreva em detalhes o que precisa..."
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          rows={4}
        />
      </div>

      {/* Motivo */}
      <div className="space-y-2">
        <Label>Por que é importante? <span className="text-muted-foreground text-xs">(opcional)</span></Label>
        <Textarea
          placeholder="Explique o impacto ou a necessidade..."
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
        />
      </div>

      {/* Prioridade */}
      <div className="space-y-2">
        <Label>Prioridade</Label>
        <Select value={prioridade} onValueChange={(v) => setPrioridade(v as Prioridade)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="urgente">Urgente</SelectItem>
            <SelectItem value="baixa">Baixa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Save */}
      <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Salvar solicitação
      </Button>
    </div>
  );
}
