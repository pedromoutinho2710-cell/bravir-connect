import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import AbaPrecos from "@/components/cliente/AbaPrecos";
import AbaHistoricoFaturamento from "@/components/cliente/AbaHistoricoFaturamento";
import AbaBolsao from "@/components/cliente/AbaBolsao";
import StatusClienteBadge from "@/components/cliente/StatusClienteBadge";
import { ArrowLeft, UserX, UserCheck } from "lucide-react";

export default function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [togglingAtivo, setTogglingAtivo] = useState(false);

  const { data: cliente, isLoading } = useQuery({
    queryKey: ["cliente", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const canToggleAtivo =
    perfil?.role === "vendedor" ||
    perfil?.role === "admin" ||
    perfil?.role === "gestora";

  async function handleToggleAtivo() {
    if (!cliente) return;
    const novoAtivo = !(cliente.ativo !== false);
    setTogglingAtivo(true);
    try {
      const { error } = await supabase
        .from("clientes")
        .update({ ativo: novoAtivo })
        .eq("id", cliente.id);
      if (error) throw error;
      toast({
        title: novoAtivo ? "Cliente reativado!" : "Cliente inativado!",
        description: novoAtivo
          ? "O cliente foi marcado como ativo."
          : "O cliente foi marcado como inativo.",
      });
      await queryClient.invalidateQueries({ queryKey: ["cliente", id] });
      await queryClient.invalidateQueries({ queryKey: ["meus-clientes"] });
      await queryClient.invalidateQueries({ queryKey: ["clientes"] });
    } catch (err: any) {
      toast({
        title: "Erro ao alterar status",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setTogglingAtivo(false);
    }
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Carregando cliente...</p>
        </div>
      </AppLayout>
    );
  }

  if (!cliente) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-muted-foreground">Cliente não encontrado.</p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </div>
      </AppLayout>
    );
  }

  const ativo = cliente.ativo !== false;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold truncate">
                {cliente.razao_social}
              </h1>
              <StatusClienteBadge status={cliente.status} />
              {!ativo && (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <UserX className="w-3 h-3" />
                  Inativo
                </Badge>
              )}
            </div>
            {cliente.nome_fantasia && (
              <p className="text-muted-foreground text-sm mt-0.5">
                {cliente.nome_fantasia}
              </p>
            )}
          </div>
        </div>

        {/* Card de Informações Gerais */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informações Gerais</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">CNPJ:</span>{" "}
              <span className="font-medium">{cliente.cnpj || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">E-mail:</span>{" "}
              <span className="font-medium">{cliente.email || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Telefone:</span>{" "}
              <span className="font-medium">{cliente.telefone || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Cidade/UF:</span>{" "}
              <span className="font-medium">
                {cliente.cidade && cliente.estado
                  ? `${cliente.cidade}/${cliente.estado}`
                  : cliente.cidade || cliente.estado || "—"}
              </span>
            </div>
            {cliente.endereco && (
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">Endereço:</span>{" "}
                <span className="font-medium">{cliente.endereco}</span>
              </div>
            )}

            {/* Toggle Ativo/Inativo */}
            {canToggleAtivo && (
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between rounded-lg border p-4 mt-2">
                  <div className="flex items-center gap-2">
                    {ativo ? (
                      <UserCheck className="w-4 h-4 text-green-600" />
                    ) : (
                      <UserX className="w-4 h-4 text-destructive" />
                    )}
                    <div>
                      <Label htmlFor="toggle-ativo" className="font-medium cursor-pointer">
                        {ativo ? "Cliente Ativo" : "Cliente Inativo"}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {ativo
                          ? "Desative para impedir novos pedidos deste cliente."
                          : "Reative para permitir novos pedidos deste cliente."}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="toggle-ativo"
                    checked={ativo}
                    onCheckedChange={handleToggleAtivo}
                    disabled={togglingAtivo}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Abas */}
        <Tabs defaultValue="precos">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="precos">Preços</TabsTrigger>
            <TabsTrigger value="historico">Histórico de Faturamento</TabsTrigger>
            <TabsTrigger value="bolsao">Bolsão</TabsTrigger>
          </TabsList>

          <TabsContent value="precos" className="mt-4">
            <AbaPrecos clienteId={cliente.id} />
          </TabsContent>

          <TabsContent value="historico" className="mt-4">
            <AbaHistoricoFaturamento clienteId={cliente.id} />
          </TabsContent>

          <TabsContent value="bolsao" className="mt-4">
            <AbaBolsao clienteId={cliente.id} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
