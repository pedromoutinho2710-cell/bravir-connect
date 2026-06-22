import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Power, PowerOff } from "lucide-react";
import AbaPrecos from "@/components/cliente/AbaPrecos";
import AbaBolsao from "@/components/cliente/AbaBolsao";
import AbaHistoricoFaturamento from "@/components/cliente/AbaHistoricoFaturamento";

export default function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showToggleDialog, setShowToggleDialog] = useState(false);

  const isVendedor = profile?.role === "vendedor";
  const isAdmin = profile?.role === "admin";
  const isGestora = profile?.role === "gestora";
  const podeToggle = isVendedor || isAdmin || isGestora;

  const { data: cliente, isLoading } = useQuery({
    queryKey: ["cliente", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const toggleAtivo = useMutation({
    mutationFn: async (novoAtivo: boolean) => {
      const { error } = await supabase
        .from("clientes")
        .update({ ativo: novoAtivo })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: (_, novoAtivo) => {
      queryClient.invalidateQueries({ queryKey: ["cliente", id] });
      queryClient.invalidateQueries({ queryKey: ["meus-clientes"] });
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      toast({
        title: novoAtivo ? "Cliente ativado com sucesso" : "Cliente inativado com sucesso",
      });
      setShowToggleDialog(false);
    },
    onError: () => {
      toast({
        title: "Erro ao atualizar status do cliente",
        variant: "destructive",
      });
      setShowToggleDialog(false);
    },
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Carregando cliente...</p>
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Cliente não encontrado.</p>
      </div>
    );
  }

  const ativo = cliente.ativo ?? true;

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold truncate">{cliente.nome}</h1>
            <Badge variant={ativo ? "default" : "secondary"}>
              {ativo ? "Ativo" : "Inativo"}
            </Badge>
            {cliente.negativado && (
              <Badge variant="destructive">Negativado</Badge>
            )}
          </div>
          {cliente.cnpj && (
            <p className="text-sm text-muted-foreground mt-0.5">
              CNPJ: {cliente.cnpj}
            </p>
          )}
          {(cliente.cidade || cliente.uf) && (
            <p className="text-sm text-muted-foreground">
              {[cliente.cidade, cliente.uf].filter(Boolean).join(" / ")}
            </p>
          )}
        </div>

        {podeToggle && (
          <Button
            variant={ativo ? "destructive" : "default"}
            size="sm"
            onClick={() => setShowToggleDialog(true)}
          >
            {ativo ? (
              <>
                <PowerOff className="h-4 w-4 mr-1" />
                Inativar
              </>
            ) : (
              <>
                <Power className="h-4 w-4 mr-1" />
                Ativar
              </>
            )}
          </Button>
        )}
      </div>

      {/* Abas */}
      <Tabs defaultValue="precos">
        <TabsList>
          <TabsTrigger value="precos">Preços</TabsTrigger>
          <TabsTrigger value="bolsao">Bolsão</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="precos">
          <AbaPrecos clienteId={cliente.id} />
        </TabsContent>
        <TabsContent value="bolsao">
          <AbaBolsao clienteId={cliente.id} />
        </TabsContent>
        <TabsContent value="historico">
          <AbaHistoricoFaturamento clienteId={cliente.id} />
        </TabsContent>
      </Tabs>

      {/* Dialog de confirmação */}
      <AlertDialog open={showToggleDialog} onOpenChange={setShowToggleDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {ativo ? "Inativar cliente" : "Ativar cliente"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja {ativo ? "inativar" : "ativar"} o cliente{" "}
              <strong>{cliente.nome}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toggleAtivo.mutate(!ativo)}
              className={ativo ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              {ativo ? "Inativar" : "Ativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
