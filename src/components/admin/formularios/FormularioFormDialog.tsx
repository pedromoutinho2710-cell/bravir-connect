import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type Produto = { id: string; codigo_jiva: string; nome: string; marca: string; ativo: boolean };

type Formulario = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  padrao: boolean;
  produto_ids: string[];
};

type Props = {
  formulario: Formulario | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
};

export function FormularioFormDialog({ formulario, open, onOpenChange, onSaved }: Props) {
  const { user } = useAuth();
  const isEdit = !!formulario;

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [padrao, setPadrao] = useState(false);
  const [produtoIds, setProdutoIds] = useState<Set<string>>(new Set());
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    supabase.from("produtos").select("id, codigo_jiva, nome, marca, ativo")
      .order("marca").order("nome").then(({ data }) => { if (data) setProdutos(data as Produto[]); });
  }, []);

  useEffect(() => {
    if (!open) return;
    if (formulario) {
      setNome(formulario.nome);
      setDescricao(formulario.descricao ?? "");
      setAtivo(formulario.ativo);
      setPadrao(formulario.padrao);
      setProdutoIds(new Set(formulario.produto_ids));
    } else {
      setNome("");
      setDescricao("");
      setAtivo(true);
      setPadrao(false);
      setProdutoIds(new Set(produtos.filter((p) => p.ativo).map((p) => p.id)));
    }
    setBusca("");
  }, [open, formulario, produtos]);

  const toggleProduto = (id: string) => {
    setProdutoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const selecionarTodos = () => setProdutoIds(new Set(produtosFiltrados.map((p) => p.id)));
  const limparSelecao = () => setProdutoIds(new Set());

  const produtosFiltrados = produtos.filter((p) => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return p.codigo_jiva.toLowerCase().includes(q) || p.nome.toLowerCase().includes(q) || p.marca.toLowerCase().includes(q);
  });

  const porMarca = produtosFiltrados.reduce<Record<string, Produto[]>>((acc, p) => {
    (acc[p.marca] ||= []).push(p);
    return acc;
  }, {});

  const salvar = async () => {
    if (!nome.trim()) { toast.error("Informe o nome do formulário"); return; }
    if (produtoIds.size === 0) { toast.error("Selecione ao menos um produto"); return; }
    setSalvando(true);
    try {
      let formId = formulario?.id;

      if (isEdit && formId) {
        const { error } = await supabase.from("formularios").update({ nome, descricao: descricao || null, ativo, padrao }).eq("id", formId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("formularios")
          .insert({ nome, descricao: descricao || null, ativo, padrao, created_by: user!.id })
          .select("id").single();
        if (error) throw error;
        formId = data.id;
      }

      // Substitui produtos
      await supabase.from("formulario_produtos").delete().eq("formulario_id", formId);
      const inserts = [...produtoIds].map((pid, idx) => ({ formulario_id: formId!, produto_id: pid, ordem: idx }));
      if (inserts.length > 0) {
        const { error } = await supabase.from("formulario_produtos").insert(inserts);
        if (error) throw error;
      }

      toast.success(isEdit ? "Formulário atualizado" : "Formulário criado");
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error("Erro ao salvar: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar formulário" : "Novo formulário"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>Nome *</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Catálogo Junho 2026" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Descrição</Label>
              <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Opcional…" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={ativo} onCheckedChange={setAtivo} id="ativo" />
              <Label htmlFor="ativo">Ativo</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={padrao} onCheckedChange={setPadrao} id="padrao" />
              <Label htmlFor="padrao">Formulário padrão</Label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Produtos ({produtoIds.size} selecionados)</Label>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={selecionarTodos}>Todos</Button>
                <Button type="button" variant="ghost" size="sm" onClick={limparSelecao}>Nenhum</Button>
              </div>
            </div>
            <Input
              placeholder="Buscar produto…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="mb-3"
            />
            <div className="max-h-64 overflow-y-auto rounded-md border p-3 space-y-4">
              {Object.entries(porMarca).map(([marca, lista]) => (
                <div key={marca}>
                  <div className="text-xs font-bold uppercase tracking-wider text-primary mb-2">{marca}</div>
                  <div className="space-y-1.5">
                    {lista.map((p) => (
                      <label key={p.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                        <Checkbox
                          checked={produtoIds.has(p.id)}
                          onCheckedChange={() => toggleProduto(p.id)}
                        />
                        <span className="font-mono text-xs text-muted-foreground">{p.codigo_jiva}</span>
                        <span className="text-sm flex-1">{p.nome}</span>
                        {!p.ativo && <span className="text-xs text-muted-foreground">(inativo)</span>}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {Object.keys(porMarca).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum produto encontrado</p>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isEdit ? "Salvar alterações" : "Criar formulário"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
