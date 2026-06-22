import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Campanha = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  data_inicio: string | null;
  data_fim: string | null;
  criado_em: string;
};

type FormData = {
  nome: string;
  descricao: string;
  ativo: boolean;
  data_inicio: string;
  data_fim: string;
};

const emptyForm: FormData = {
  nome: "",
  descricao: "",
  ativo: false,
  data_inicio: "",
  data_fim: "",
};

export default function Campanhas() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);

  const { data: campanhas = [], isLoading } = useQuery({
    queryKey: ["campanhas-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campanhas")
        .select("*")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data as Campanha[];
    },
  });

  // Toggle ativo SEM desativar outras campanhas
  const toggleAtivoMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("campanhas")
        .update({ ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campanhas-admin"] });
      queryClient.invalidateQueries({ queryKey: ["campanhas"] });
      toast({ title: "Status da campanha atualizado." });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar status.", variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        nome: data.nome,
        descricao: data.descricao || null,
        ativo: data.ativo,
        data_inicio: data.data_inicio || null,
        data_fim: data.data_fim || null,
      };
      if (editingId) {
        const { error } = await supabase
          .from("campanhas")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("campanhas").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campanhas-admin"] });
      queryClient.invalidateQueries({ queryKey: ["campanhas"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast({ title: editingId ? "Campanha atualizada." : "Campanha criada." });
    },
    onError: () => {
      toast({ title: "Erro ao salvar campanha.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("campanhas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campanhas-admin"] });
      queryClient.invalidateQueries({ queryKey: ["campanhas"] });
      toast({ title: "Campanha removida." });
    },
    onError: () => {
      toast({ title: "Erro ao remover campanha.", variant: "destructive" });
    },
  });

  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(c: Campanha) {
    setEditingId(c.id);
    setForm({
      nome: c.nome,
      descricao: c.descricao ?? "",
      ativo: c.ativo,
      data_inicio: c.data_inicio ?? "",
      data_fim: c.data_fim ?? "",
    });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast({ title: "O nome da campanha é obrigatório.", variant: "destructive" });
      return;
    }
    saveMutation.mutate(form);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campanhas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Múltiplas campanhas podem ficar ativas simultaneamente.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Campanha
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Editar Campanha" : "Nova Campanha"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="nome">Nome *</Label>
                <Input
                  id="nome"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex.: Icekiss Verão"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  value={form.descricao}
                  onChange={(e) =>
                    setForm({ ...form, descricao: e.target.value })
                  }
                  placeholder="Descreva a campanha..."
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="data_inicio">Data início</Label>
                  <Input
                    id="data_inicio"
                    type="date"
                    value={form.data_inicio}
                    onChange={(e) =>
                      setForm({ ...form, data_inicio: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="data_fim">Data fim</Label>
                  <Input
                    id="data_fim"
                    type="date"
                    value={form.data_fim}
                    onChange={(e) =>
                      setForm({ ...form, data_fim: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="ativo"
                  checked={form.ativo}
                  onCheckedChange={(v) => setForm({ ...form, ativo: v })}
                />
                <Label htmlFor="ativo">Campanha ativa</Label>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando campanhas...</p>
      ) : campanhas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhuma campanha cadastrada.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {campanhas.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">{c.nome}</CardTitle>
                    <Badge variant={c.ativo ? "default" : "secondary"}>
                      {c.ativo ? "Ativa" : "Inativa"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={c.ativo}
                      onCheckedChange={(v) =>
                        toggleAtivoMutation.mutate({ id: c.id, ativo: v })
                      }
                      disabled={toggleAtivoMutation.isPending}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(c)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover campanha?</AlertDialogTitle>
                          <AlertDialogDescription>
                            A campanha <strong>{c.nome}</strong> será removida
                            permanentemente. Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(c.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {c.descricao && (
                  <p className="text-sm text-muted-foreground mb-2">
                    {c.descricao}
                  </p>
                )}
                {(c.data_inicio || c.data_fim) && (
                  <p className="text-xs text-muted-foreground">
                    {c.data_inicio && `Início: ${new Date(c.data_inicio).toLocaleDateString("pt-BR")}`}
                    {c.data_inicio && c.data_fim && " — "}
                    {c.data_fim && `Fim: ${new Date(c.data_fim).toLocaleDateString("pt-BR")}`}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
