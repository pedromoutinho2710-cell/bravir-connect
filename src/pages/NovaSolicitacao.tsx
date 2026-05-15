import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { AlertTriangle, Loader2 } from "lucide-react";

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

const TIPO_CLASS: Record<Tipo, string> = {
  nova: "bg-blue-100 text-blue-800 border-blue-300",
  altera: "bg-green-100 text-green-800 border-green-300",
  bug: "bg-red-100 text-red-800 border-red-300",
};

const TIPO_LABEL: Record<Tipo, string> = {
  nova: "Nova feature",
  altera: "Alteração",
  bug: "Bug",
};

const PRIORIDADE_CLASS: Record<Prioridade, string> = {
  urgente: "bg-red-100 text-red-800 border-red-300",
  alta: "bg-orange-100 text-orange-800 border-orange-300",
  normal: "bg-gray-100 text-gray-700 border-gray-300",
  baixa: "bg-green-100 text-green-800 border-green-300",
};

const TIPO_BUTTON_CLASS: Record<Tipo, string> = {
  nova: "border-blue-400 bg-blue-50 text-blue-700",
  altera: "border-green-400 bg-green-50 text-green-700",
  bug: "border-red-400 bg-red-50 text-red-700",
};

export default function NovaSolicitacao() {
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [tela, setTela] = useState<string | null>(null);
  const [outraTela, setOutraTela] = useState("");
  const [descricao, setDescricao] = useState("");
  const [motivo, setMotivo] = useState("");
  const [prioridade, setPrioridade] = useState<Prioridade>("normal");
  const [saving, setSaving] = useState(false);

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
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("solicitacoes_gestor").insert({
        tipo,
        tela: telaFinal,
        descricao: descricao.trim(),
        motivo: motivo.trim() || null,
        prioridade,
        status: "aberto",
        criado_por: user?.id ?? null,
      });
      if (error) throw error;

      toast.success("Solicitação salva com sucesso!");
      setTipo(null);
      setTela(null);
      setOutraTela("");
      setDescricao("");
      setMotivo("");
      setPrioridade("normal");
    } catch {
      toast.error("Erro ao salvar solicitação");
    } finally {
      setSaving(false);
    }
  }

  const hasPreview = tipo || descricao.trim();

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Nova solicitação</h1>

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

      {/* Preview */}
      {hasPreview && (
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Badges */}
            <div className="flex flex-wrap gap-2 items-center">
              {tipo && (
                <Badge className={`border text-xs font-semibold ${TIPO_CLASS[tipo]}`}>
                  {TIPO_LABEL[tipo]}
                </Badge>
              )}
              <Badge className={`border text-xs font-semibold ${PRIORIDADE_CLASS[prioridade]}`}>
                {prioridade.charAt(0).toUpperCase() + prioridade.slice(1)}
              </Badge>
              <Badge className="border text-xs font-semibold bg-yellow-100 text-yellow-800 border-yellow-300">
                Aberto
              </Badge>
              {telaFinal && (
                <span className="text-xs text-muted-foreground">• {telaFinal}</span>
              )}
            </div>

            {descricao.trim() && (
              <p className="text-sm font-medium">{descricao}</p>
            )}
            {motivo.trim() && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Motivo: </span>
                {motivo}
              </p>
            )}

            {/* Screen mockup */}
            {(tipo || telaFinal) && (
              <div className="mt-2 rounded-md border bg-muted/30 p-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                  Mockup — {telaFinal ?? "tela"}
                </p>

                {tipo === "bug" ? (
                  <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-3">
                    <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-red-700">
                      Comportamento incorreto identificado em{" "}
                      <span className="font-semibold">{telaFinal ?? "tela não especificada"}</span>
                    </p>
                  </div>
                ) : tela === "Faturamento" ? (
                  <div className="rounded-md border overflow-hidden text-xs">
                    <div className="grid grid-cols-3 bg-muted px-3 py-1.5 font-semibold text-muted-foreground">
                      <span>Cliente</span>
                      <span>Status</span>
                      <span className="text-blue-600">Ação ✦</span>
                    </div>
                    {["Distribuidora A", "Mercado B"].map((c) => (
                      <div key={c} className="grid grid-cols-3 px-3 py-2 border-t items-center">
                        <span className="text-foreground">{c}</span>
                        <span className="text-muted-foreground">Pendente</span>
                        <span className="rounded border border-blue-300 bg-blue-50 px-2 py-0.5 text-blue-700 font-medium w-fit">
                          novo
                        </span>
                      </div>
                    ))}
                  </div>
                ) : tela === "Novo pedido" ? (
                  <div className="space-y-2">
                    <div className="h-7 rounded bg-muted border" />
                    <div className="h-7 rounded bg-muted border" />
                    <div className="h-7 rounded border-2 border-dashed border-blue-400 bg-blue-50 flex items-center justify-center text-xs text-blue-600 font-medium">
                      + novo campo
                    </div>
                  </div>
                ) : tela === "Dashboard" ? (
                  <div className="grid grid-cols-2 gap-2">
                    {["Pedidos", "Clientes", "Faturado"].map((label) => (
                      <div key={label} className="rounded border bg-background p-2">
                        <p className="text-[10px] text-muted-foreground">{label}</p>
                        <div className="h-4 mt-1 rounded bg-muted w-2/3" />
                      </div>
                    ))}
                    <div className="rounded border-2 border-dashed border-blue-400 bg-blue-50 p-2 flex items-center justify-center text-blue-600 text-lg font-bold">
                      +
                    </div>
                  </div>
                ) : tela === "Meus pedidos" || tela === "Logística" ? (
                  <div className="space-y-1.5 text-xs">
                    {[
                      { label: "Pedido #1042", status: "Em andamento", cls: "bg-blue-100 text-blue-700" },
                      { label: "Pedido #1041", status: "Concluído", cls: "bg-green-100 text-green-700" },
                      { label: "Pedido #1040", status: "Aberto", cls: "bg-yellow-100 text-yellow-700" },
                    ].map(({ label, status, cls }) => (
                      <div key={label} className="flex items-center justify-between rounded border bg-background px-3 py-1.5">
                        <span className="text-foreground">{label}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{status}</span>
                      </div>
                    ))}
                  </div>
                ) : tela === "Clientes" ? (
                  <div className="space-y-2 text-xs">
                    <div className="h-7 rounded border bg-background flex items-center px-3 text-muted-foreground">
                      Buscar cliente...
                    </div>
                    {[
                      { nome: "Distribuidora Alpha", status: "Ativo" },
                      { nome: "Mercado Beta", status: "Inativo" },
                      { nome: "Loja Gamma", status: "Ativo" },
                    ].map(({ nome, status }) => (
                      <div key={nome} className="flex items-center justify-between rounded border bg-background px-3 py-1.5">
                        <span className="text-foreground">{nome}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status === "Ativo" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {status}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="h-5 rounded bg-muted w-3/4" />
                    <div className="h-5 rounded bg-muted w-1/2" />
                    <div className="h-8 rounded border-2 border-dashed border-blue-400 bg-blue-50 flex items-center justify-center text-xs text-blue-600 font-medium">
                      elemento novo / alterado
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Save */}
      <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Salvar solicitação
      </Button>
    </div>
  );
}
