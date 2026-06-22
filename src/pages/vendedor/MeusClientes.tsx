import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileDown, Search, SlidersHorizontal, X } from "lucide-react";
import { formatCNPJ } from "@/lib/format";
import * as XLSX from "xlsx";

type Cliente = {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  estado: string | null;
  cidade: string | null;
  cluster: string | null;
  tabela_preco: string | null;
  status: string | null;
  telefone: string | null;
  email: string | null;
  vendedor_id: string | null;
};

const STATUS_OPTIONS = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
  { value: "prospect", label: "Prospect" },
  { value: "bloqueado", label: "Bloqueado" },
  { value: "negativado", label: "Negativado" },
];

function getStatusVariant(
  status: string | null
): "default" | "secondary" | "destructive" | "outline" {
  switch (status?.toLowerCase()) {
    case "ativo":
      return "default";
    case "inativo":
      return "secondary";
    case "bloqueado":
    case "negativado":
      return "destructive";
    case "prospect":
      return "outline";
    default:
      return "secondary";
  }
}

export default function MeusClientes() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { impersonatedUser } = useImpersonation();

  const efectiveUserId = impersonatedUser?.id ?? user?.id;

  const [busca, setBusca] = useState("");
  const [filtroCluster, setFiltroCluster] = useState("todos");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroTabela, setFiltroTabela] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const { data: clientes = [], isLoading } = useQuery<Cliente[]>({
    queryKey: ["meus-clientes", efectiveUserId],
    queryFn: async () => {
      if (!efectiveUserId) return [];
      const { data, error } = await supabase
        .from("clientes")
        .select(
          "id, razao_social, nome_fantasia, cnpj, estado, cidade, cluster, tabela_preco, status, telefone, email, vendedor_id"
        )
        .eq("vendedor_id", efectiveUserId)
        .order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!efectiveUserId,
  });

  const clusters = useMemo(() => {
    const set = new Set<string>();
    clientes.forEach((c) => {
      if (c.cluster) set.add(c.cluster);
    });
    return Array.from(set).sort();
  }, [clientes]);

  const estados = useMemo(() => {
    const set = new Set<string>();
    clientes.forEach((c) => {
      if (c.estado) set.add(c.estado);
    });
    return Array.from(set).sort();
  }, [clientes]);

  const tabelas = useMemo(() => {
    const set = new Set<string>();
    clientes.forEach((c) => {
      if (c.tabela_preco) set.add(c.tabela_preco);
    });
    return Array.from(set).sort();
  }, [clientes]);

  const clientesFiltrados = useMemo(() => {
    return clientes.filter((c) => {
      const termoBusca = busca.toLowerCase();
      const matchBusca =
        !busca ||
        c.razao_social?.toLowerCase().includes(termoBusca) ||
        c.nome_fantasia?.toLowerCase().includes(termoBusca) ||
        c.cnpj?.replace(/\D/g, "").includes(busca.replace(/\D/g, "")) ||
        c.cidade?.toLowerCase().includes(termoBusca);

      const matchCluster =
        filtroCluster === "todos" || c.cluster === filtroCluster;
      const matchEstado =
        filtroEstado === "todos" || c.estado === filtroEstado;
      const matchTabela =
        filtroTabela === "todos" || c.tabela_preco === filtroTabela;
      const matchStatus =
        filtroStatus === "todos" ||
        c.status?.toLowerCase() === filtroStatus.toLowerCase();

      return matchBusca && matchCluster && matchEstado && matchTabela && matchStatus;
    });
  }, [clientes, busca, filtroCluster, filtroEstado, filtroTabela, filtroStatus]);

  const temFiltroAtivo =
    busca !== "" ||
    filtroCluster !== "todos" ||
    filtroEstado !== "todos" ||
    filtroTabela !== "todos" ||
    filtroStatus !== "todos";

  function limparFiltros() {
    setBusca("");
    setFiltroCluster("todos");
    setFiltroEstado("todos");
    setFiltroTabela("todos");
    setFiltroStatus("todos");
  }

  function exportarExcel() {
    const linhas = clientesFiltrados.map((c) => ({
      "Razão Social": c.razao_social ?? "",
      "Nome Fantasia": c.nome_fantasia ?? "",
      CNPJ: c.cnpj ?? "",
      Cidade: c.cidade ?? "",
      Estado: c.estado ?? "",
      Cluster: c.cluster ?? "",
      "Tabela de Preço": c.tabela_preco ?? "",
      Status: c.status ?? "",
      Telefone: c.telefone ?? "",
      E_mail: c.email ?? "",
    }));

    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Meus Clientes");
    XLSX.writeFile(wb, "meus_clientes.xlsx");
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meus Clientes</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Carregando..."
              : `${clientesFiltrados.length} cliente${
                  clientesFiltrados.length !== 1 ? "s" : ""
                }${
                  temFiltroAtivo
                    ? ` (de ${clientes.length} no total)`
                    : ""
                }`}
          </p>
        </div>
        <Button
          onClick={exportarExcel}
          disabled={isLoading || clientesFiltrados.length === 0}
          variant="outline"
          className="gap-2 self-start sm:self-auto"
        >
          <FileDown className="h-4 w-4" />
          Exportar Excel
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por razão social, fantasia, CNPJ ou cidade..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8"
            />
          </div>

          {/* Selects de filtro */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {/* Cluster */}
            <Select value={filtroCluster} onValueChange={setFiltroCluster}>
              <SelectTrigger>
                <SelectValue placeholder="Cluster" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os clusters</SelectItem>
                {clusters.map((cl) => (
                  <SelectItem key={cl} value={cl}>
                    {cl}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Estado */}
            <Select value={filtroEstado} onValueChange={setFiltroEstado}>
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os estados</SelectItem>
                {estados.map((uf) => (
                  <SelectItem key={uf} value={uf}>
                    {uf}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Tabela */}
            <Select value={filtroTabela} onValueChange={setFiltroTabela}>
              <SelectTrigger>
                <SelectValue placeholder="Tabela" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as tabelas</SelectItem>
                {tabelas.map((tb) => (
                  <SelectItem key={tb} value={tb}>
                    {tb}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status */}
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Limpar filtros */}
          {temFiltroAtivo && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={limparFiltros}
                className="gap-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
                Limpar filtros
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : clientesFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Search className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">
                {temFiltroAtivo
                  ? "Nenhum cliente encontrado com os filtros aplicados."
                  : "Você ainda não possui clientes cadastrados."}
              </p>
              {temFiltroAtivo && (
                <Button
                  variant="link"
                  size="sm"
                  onClick={limparFiltros}
                  className="mt-2"
                >
                  Limpar filtros
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Razão Social / Fantasia</TableHead>
                    <TableHead className="hidden md:table-cell">CNPJ</TableHead>
                    <TableHead className="hidden sm:table-cell">Cidade / UF</TableHead>
                    <TableHead className="hidden lg:table-cell">Cluster</TableHead>
                    <TableHead className="hidden lg:table-cell">Tabela</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientesFiltrados.map((cliente) => (
                    <TableRow
                      key={cliente.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/cliente/${cliente.id}`)}
                    >
                      <TableCell>
                        <div className="font-medium leading-tight">
                          {cliente.razao_social}
                        </div>
                        {cliente.nome_fantasia && (
                          <div className="text-xs text-muted-foreground">
                            {cliente.nome_fantasia}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {cliente.cnpj ? formatCNPJ(cliente.cnpj) : "-"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">
                        {cliente.cidade && cliente.estado
                          ? `${cliente.cidade} / ${cliente.estado}`
                          : cliente.cidade || cliente.estado || "-"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">
                        {cliente.cluster || "-"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">
                        {cliente.tabela_preco || "-"}
                      </TableCell>
                      <TableCell>
                        {cliente.status ? (
                          <Badge
                            variant={getStatusVariant(cliente.status)}
                            className="capitalize text-xs"
                          >
                            {cliente.status}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
