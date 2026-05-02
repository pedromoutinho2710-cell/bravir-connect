import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { Loader2, Plus, Pencil } from "lucide-react";

type Campanha = {
  id: string;
  nome: string;
  descricao: string | null;
  tipo: string | null;
  valor: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  ativa: boolean;
  created_at: string;
};

const TIPO_LABEL: Record<string, string> = {
  desconto: "Desconto",
  bonificacao: "Bonificação",
  outro: "Outro",
};

const TIPO_COLOR: Record<string, string> = {
  desconto: "bg-blue-100 text-blue-800 border-blue-300",
  bonificacao: "bg-green-100 text-green-800 border-green-300",
  outro: "bg-gray-100 text-gray-800 border-gray-300",
};

const EMPTY = { nome: "", descricao: "", tipo: "desconto", valor: "", data_inicio: "", data_fim: "", ativa: true };

export default function TradeCampanhas() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<{ open: boolean; editing: Campanha | null }>({ open: false, editing: null });
  const [form, setForm] = useState(EMPTY);
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("campanhas")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar campanhas");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    else setCampanhas((data ?? []) as any[]);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const abrirNova = () => {
    setForm(EMPTY);
    setDialog({ open: true, editing: null });
  };

  const abrirEditar = (c: Campanha) => {
    setForm({
      nome: c.nome,
      descricao: c.descricao ?? "",
      tipo: c.tipo ?? "desconto",
      valor: c.valor != null ? String(c.valor) : "",
      data_inicio: c.data_inicio ?? "",
      data_fim: c.data_fim ?? "",
      ativa: c.ativa,
    });
    setDialog({ open: true, editing: c });
  };

  const salvar = async () => {
    if (!form.nome.trim()) { toast.error("Nome é obrigatório"); return; }
    setSalvando(true);
    const payload = {
      nome: form.nome.trim(),
      descricao: form.descricao.trim() || null,
      tipo: form.tipo,
      valor: form.valor ? Number(form.valor) : null,
      data_inicio: form.data_inicio || null,
      data_fim: form.data_fim || null,
      ativa: form.ativa,
    };

    const { error } = dialog.editing
      ? await supabase.from("campanhas").update(payload).eq("id", dialog.editing.id)
      : await supabase.from("campanhas").insert(payload);

    setSalvando(false);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success(dialog.editing ? "Campanha atualizada" : "Campanha criada");
    setDialog({ open: false, editing: null });
    carregar();
  };

  const toggleAtiva = async (c: Campanha) => {
    const { error } = await supabase.from("campanhas").update({ ativa: !c.ativa }).eq("id", c.id);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success(c.ativa ? "Campanha desativada" : "Campanha ativada");
    carregar();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campanhas</h1>
          <p className="text-sm text-muted-foreground">Gerencie campanhas de desconto e bonificação</p>
        </div>
        <Button onClick={abrirNova}>
          <Plus className="h-4 w-4 mr-2" />
          Nova campanha
        </Button>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : campanhas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhuma campanha cadastrada
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Ativa</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campanhas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-medium">{c.nome}</div>
                    {c.descricao && (
                      <div className="text-xs text-muted-foreground">{c.descricao}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.tipo && (
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${TIPO_COLOR[c.tipo] ?? "bg-gray-100 text-gray-800 border-gray-300"}`}>
                        {TIPO_LABEL[c.tipo] ?? c.tipo}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.valor != null ? `${c.valor}%` : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.data_inicio && c.data_fim
                      ? `${formatDate(c.data_inicio)} – ${formatDate(c.data_fim)}`
                      : c.data_fim
                      ? `até ${formatDate(c.data_fim)}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Switch checked={c.ativa} onCheckedChange={() => toggleAtiva(c)} />
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => abrirEditar(c)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialog.open} onOpenChange={(o) => !o && setDialog({ open: false, editing: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog.editing ? "Editar campanha" : "Nova campanha"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Black Friday 2025" />
            </div>

            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea rows={2} value={form.descricao}
                onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                placeholder="Detalhes da campanha…" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desconto">Desconto</SelectItem>
                    <SelectItem value="bonificacao">Bonificação</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Valor (%)</Label>
                <Input type="number" min={0} step={0.5}
                  value={form.valor}
                  onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
                  placeholder="0" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Data início</Label>
                <Input type="date" value={form.data_inicio}
                  onChange={(e) => setForm((f) => ({ ...f, data_inicio: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Data fim</Label>
                <Input type="date" value={form.data_fim}
                  onChange={(e) => setForm((f) => ({ ...f, data_fim: e.target.value }))} />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={form.ativa}
                onCheckedChange={(c) => setForm((f) => ({ ...f, ativa: c }))} />
              <Label className="font-normal">Campanha ativa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false, editing: null })}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando || !form.nome.trim()}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {dialog.editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
