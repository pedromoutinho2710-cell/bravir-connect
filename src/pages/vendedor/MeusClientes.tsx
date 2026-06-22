import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Search, Eye, PowerOff, Power } from "lucide-react";

export default function MeusClientes() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [busca, setBusca] = useState("");
  const [clienteParaToggle, setClienteParaToggle] = useState<{
    id: string;
    nome: string;
    ativo: boolean;
  } | null>(null);

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["meus-clientes", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nome, cnpj, cidade, uf, ativo, negativado")
        .eq("vendedor_id", profile.id)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile?.id,
  });

  const toggleAtivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("clientes")
        .update({ ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meus-clientes"] });
      toast({
        title: clienteParaToggle?.ativo
          ? "Cliente inativado com sucesso"
          : "Cliente ativado com sucesso",
      });
      setClienteParaToggle(null);
    },
    onError: () => {
      toast({
        title: "Erro ao atualizar status do cliente",
        variant: "destructive",
      });
      setClienteParaToggle(null);
    },
  });

  const clientesFiltrados = clientes.filter((c) =>
    c.nome?.toLowerCase().includes(busca.toLowerCase()) ||
    c.cnpj?.includes(busca) ||
    c.cidade?.toLowerCase().includes(busca.toLowerCase())
  );

  function confirmarToggle() {
    if (!clienteParaToggle) return;
    toggleAtivo.mutate({
      id: clienteParaToggle.id,
      ativo: !clienteParaToggle.ativo,
    });
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Meus Clientes</h1>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, CNPJ ou cidade..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-8"
        />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : clientesFiltrados.length === 0 ? (
        <p className="text-muted-foreground">Nenhum cliente encontrado.</p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Cidade / UF</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientesFiltrados.map((cliente) => (
                <TableRow key={cliente.id}>
                  <TableCell className="font-medium">{cliente.nome}</TableCell>
                  <TableCell>{cliente.cnpj ?? "-"}</TableCell>
                  <TableCell>
                    {[cliente.cidade, cliente.uf].filter(Boolean).join(" / ") || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={cliente.ativo ? "default" : "secondary"}>
                      {cliente.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                    {cliente.negativado && (
                      <Badge variant="destructive" className="ml-1">
                        Negativado
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/clientes/${cliente.id}`)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setClienteParaToggle({
                          id: cliente.id,
                          nome: cliente.nome,
                          ativo: cliente.ativo ?? true,
                        })
                      }
                      title={cliente.ativo ? "Inativar cliente" : "Ativar cliente"}
                    >
                      {cliente.ativo ? (
                        <PowerOff className="h-4 w-4 text-destructive" />
                      ) : (
                        <Power className="h-4 w-4 text-green-600" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog
        open={!!clienteParaToggle}
        onOpenChange={(open) => { if (!open) setClienteParaToggle(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {clienteParaToggle?.ativo ? "Inativar cliente" : "Ativar cliente"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja{" "}
              {clienteParaToggle?.ativo ? "inativar" : "ativar"} o cliente{" "}
              <strong>{clienteParaToggle?.nome}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarToggle}
              className={clienteParaToggle?.ativo ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              {clienteParaToggle?.ativo ? "Inativar" : "Ativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
