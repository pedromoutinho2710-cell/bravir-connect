import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search } from "lucide-react";

type FiltroAtivo = "ativos" | "inativos" | "todos";

export default function MeusClientes() {
  const { user } = useAuth();
  const [busca, setBusca] = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState<FiltroAtivo>("ativos");

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["meus-clientes", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, razao_social, nome_fantasia, cnpj, cidade, estado, status, ativo")
        .eq("vendedor_id", user!.id)
        .order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const clientesFiltrados = clientes.filter((c) => {
    const matchBusca =
      !busca ||
      c.razao_social?.toLowerCase().includes(busca.toLowerCase()) ||
      c.nome_fantasia?.toLowerCase().includes(busca.toLowerCase()) ||
      c.cnpj?.includes(busca);

    const ativo = c.ativo !== false; // default true se null
    const matchAtivo =
      filtroAtivo === "todos" ||
      (filtroAtivo === "ativos" && ativo) ||
      (filtroAtivo === "inativos" && !ativo);

    return matchBusca && matchAtivo;
  });

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Meus Clientes</h1>
          <Button asChild>
            <Link to="/vendedor/cadastrar-cliente">
              <Plus className="w-4 h-4 mr-2" />
              Novo Cliente
            </Link>
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, fantasia ou CNPJ..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>

          <Tabs
            value={filtroAtivo}
            onValueChange={(v) => setFiltroAtivo(v as FiltroAtivo)}
          >
            <TabsList>
              <TabsTrigger value="ativos">Ativos</TabsTrigger>
              <TabsTrigger value="inativos">Inativos</TabsTrigger>
              <TabsTrigger value="todos">Todos</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Carregando clientes...</p>
        ) : clientesFiltrados.length === 0 ? (
          <p className="text-muted-foreground">Nenhum cliente encontrado.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Razão Social</TableHead>
                  <TableHead>Nome Fantasia</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Cidade/UF</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientesFiltrados.map((cliente) => {
                  const ativo = cliente.ativo !== false;
                  return (
                    <TableRow key={cliente.id}>
                      <TableCell>
                        <Link
                          to={`/clientes/${cliente.id}`}
                          className="font-medium hover:underline text-primary"
                        >
                          {cliente.razao_social}
                        </Link>
                      </TableCell>
                      <TableCell>{cliente.nome_fantasia || "—"}</TableCell>
                      <TableCell>{cliente.cnpj || "—"}</TableCell>
                      <TableCell>
                        {cliente.cidade && cliente.estado
                          ? `${cliente.cidade}/${cliente.estado}`
                          : cliente.cidade || cliente.estado || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {cliente.status?.replace(/_/g, " ") ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {ativo ? (
                          <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                            Ativo
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Inativo</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
