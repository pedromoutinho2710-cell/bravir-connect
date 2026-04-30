import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { Loader2, Plus, Pencil, Copy, Star, Upload, Power } from "lucide-react";
import { FormularioFormDialog } from "@/components/admin/formularios/FormularioFormDialog";
import { ImportarPlanilhaDialog } from "@/components/admin/formularios/ImportarPlanilhaDialog";

type Formulario = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  padrao: boolean;
  created_at: string;
  produto_ids: string[];
  qtd_produtos: number;
};

export default function Formularios() {
  const [formularios, setFormularios] = useState<Formulario[]>([]);
  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState<string | null>(null);

  const [formDialog, setFormDialog] = useState<{ open: boolean; formulario: Formulario | null }>({ open: false, formulario: null });
  const [importDialog, setImportDialog] = useState<{ open: boolean; id: string; nome: string } | null>(null);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("formularios")
      .select("id, nome, descricao, ativo, padrao, created_at, formulario_produtos(produto_id)")
      .order("padrao", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) { toast.error("Erro ao carregar formulários"); }
    else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setFormularios((data ?? []).map((f: any) => ({
        id: f.id,
        nome: f.nome,
        descricao: f.descricao,
        ativo: f.ativo,
        padrao: f.padrao,
        created_at: f.created_at,
        produto_ids: (f.formulario_produtos ?? []).map((fp: { produto_id: string }) => fp.produto_id),
        qtd_produtos: (f.formulario_produtos ?? []).length,
      })));
    }
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const atualizar = async (id: string, updates: Record<string, unknown>) => {
    setAtualizando(id);
    const { error } = await supabase.from("formularios").update(updates).eq("id", id);
    setAtualizando(null);
    if (error) { toast.error("Erro: " + error.message); return false; }
    await carregar();
    return true;
  };

  const definirPadrao = async (f: Formulario) => {
    if (f.padrao) return;
    const ok = await atualizar(f.id, { padrao: true, ativo: true });
    if (ok) toast.success(`"${f.nome}" definido como padrão`);
  };

  const toggleAtivo = async (f: Formulario) => {
    if (f.padrao && f.ativo) { toast.error("O formulário padrão não pode ser desativado"); return; }
    const ok = await atualizar(f.id, { ativo: !f.ativo });
    if (ok) toast.success(f.ativo ? "Formulário desativado" : "Formulário ativado");
  };

  const duplicar = async (f: Formulario) => {
    setAtualizando(f.id);
    try {
      const { data: novo, error } = await supabase
        .from("formularios")
        .insert({ nome: `${f.nome} (cópia)`, descricao: f.descricao, ativo: false, padrao: false, created_by: (await supabase.auth.getUser()).data.user!.id })
        .select("id").single();
      if (error) throw error;

      if (f.produto_ids.length > 0) {
        const { error: e2 } = await supabase.from("formulario_produtos").insert(
          f.produto_ids.map((pid, idx) => ({ formulario_id: novo.id, produto_id: pid, ordem: idx }))
        );
        if (e2) throw e2;
      }

      toast.success(`"${f.nome}" duplicado`);
      await carregar();
    } catch (err: unknown) {
      toast.error("Erro ao duplicar: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setAtualizando(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Formulários de Pedido</h1>
          <p className="text-sm text-muted-foreground">Gerencie os catálogos de produtos disponíveis para os vendedores</p>
        </div>
        <Button onClick={() => setFormDialog({ open: true, formulario: null })}>
          <Plus className="h-4 w-4 mr-2" />
          Novo formulário
        </Button>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="text-center">Produtos</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="min-w-[260px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {formularios.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                    Nenhum formulário criado
                  </TableCell>
                </TableRow>
              )}
              {formularios.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{f.nome}</span>
                      {f.padrao && <Badge className="bg-primary text-primary-foreground text-xs">Padrão</Badge>}
                    </div>
                    {f.descricao && <div className="text-xs text-muted-foreground mt-0.5 max-w-[280px] truncate">{f.descricao}</div>}
                  </TableCell>
                  <TableCell className="text-center text-sm">{f.qtd_produtos}</TableCell>
                  <TableCell className="text-sm">{formatDate(f.created_at)}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${f.ativo ? "bg-green-100 text-green-800 border-green-300" : "bg-gray-100 text-gray-600 border-gray-300"}`}>
                      {f.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" disabled={atualizando === f.id}
                        onClick={() => setFormDialog({ open: true, formulario: f })}
                        title="Editar">
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" disabled={atualizando === f.id}
                        onClick={() => duplicar(f)} title="Duplicar">
                        {atualizando === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
                      </Button>
                      <Button size="sm" variant="outline" disabled={atualizando === f.id || f.padrao}
                        onClick={() => definirPadrao(f)} title="Definir como padrão">
                        <Star className={`h-3 w-3 ${f.padrao ? "fill-yellow-400 text-yellow-500" : ""}`} />
                      </Button>
                      <Button size="sm" variant="outline"
                        onClick={() => setImportDialog({ open: true, id: f.id, nome: f.nome })}
                        title="Importar planilha">
                        <Upload className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant={f.ativo ? "outline" : "default"} disabled={atualizando === f.id || f.padrao}
                        onClick={() => toggleAtivo(f)} title={f.ativo ? "Desativar" : "Ativar"}>
                        <Power className="h-3 w-3" />
                        {f.ativo ? "Desativar" : "Ativar"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <FormularioFormDialog
        formulario={formDialog.formulario}
        open={formDialog.open}
        onOpenChange={(v) => setFormDialog((s) => ({ ...s, open: v }))}
        onSaved={carregar}
      />

      {importDialog && (
        <ImportarPlanilhaDialog
          formularioId={importDialog.id}
          formularioNome={importDialog.nome}
          open={importDialog.open}
          onOpenChange={(v) => setImportDialog((s) => s ? { ...s, open: v } : null)}
          onImported={carregar}
        />
      )}
    </div>
  );
}
