import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatCNPJ } from "@/lib/format";
import { Loader2, Search } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  pendente_cadastro: "Pendente cadastro",
  aguardando_trade: "Aguardando trade",
  ativo: "Ativo",
  inativo: "Inativo",
};

const STATUS_COLOR: Record<string, string> = {
  pendente_cadastro: "bg-yellow-100 text-yellow-800 border-yellow-300",
  aguardando_trade: "bg-blue-100 text-blue-800 border-blue-300",
  ativo: "bg-green-100 text-green-800 border-green-300",
  inativo: "bg-gray-100 text-gray-600 border-gray-300",
};

const PIPELINE_ORDER = ["pendente_cadastro", "aguardando_trade", "ativo", "inativo"];

type Cliente = {
  id: string;
  razao_social: string;
  cnpj: string;
  status: string | null;
  perfil_cliente: string | null;
  tabela_preco: string | null;
  vendedor_id: string | null;
  negativado: boolean | null;
  cidade: string | null;
  uf: string | null;
};

export default function ClientesAdmin() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  useEffect(() => {
    (async () => {
      const [clRes, prRes] = await Promise.all([
        supabase
          .from("clientes")
          .select("id, razao_social, cnpj, status, perfil_cliente, tabela_preco, vendedor_id, negativado, cidade, uf")
          .order("razao_social"),
        supabase.from("profiles").select("id, full_name, email"),
      ]);

      if (clRes.error) { toast.error("Erro ao carregar clientes"); return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setClientes((clRes.data ?? []) as any[]);

      if (prRes.data) {
        const map: Record<string, string> = {};
        prRes.data.forEach((p) => { map[p.id] = p.full_name || p.email; });
        setProfiles(map);
      }
    })().finally(() => setLoading(false));
  }, []);

  const filtrados = useMemo(() => {
    let lista = clientes;
    if (filtroStatus !== "todos") {
      lista = lista.filter((c) => c.status === filtroStatus);
    }
    if (busca.trim()) {
      const buscaL = busca.toLowerCase();
      const buscaD = busca.replace(/\D/g, "");
      lista = lista.filter((c) => {
        const matchNome = c.razao_social.toLowerCase().includes(buscaL);
        const matchCnpj = buscaD.length > 0 && c.cnpj.replace(/\D/g, "").includes(buscaD);
        return matchNome || matchCnpj;
      });
    }
    return lista;
  }, [clientes, filtroStatus, busca]);

  const contagens = useMemo(() => {
    const counts: Record<string, number> = {};
    PIPELINE_ORDER.forEach((s) => { counts[s] = 0; });
    clientes.forEach((c) => {
      const s = c.status ?? "ativo";
      counts[s] = (counts[s] ?? 0) + 1;
    });
    return counts;
  }, [clientes]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Clientes</h1>
        <p className="text-sm text-muted-foreground">Todos os clientes da carteira</p>
      </div>

      {/* Kanban pipeline */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PIPELINE_ORDER.map((status) => (
          <button
            key={status}
            onClick={() => setFiltroStatus(filtroStatus === status ? "todos" : status)}
            className={`rounded-lg border p-4 text-left transition-all hover:shadow-sm ${
              filtroStatus === status ? "ring-2 ring-primary" : ""
            } ${STATUS_COLOR[status] ?? "bg-gray-50 border-gray-200"}`}
          >
            <div className="text-xs font-medium uppercase tracking-wide opacity-70">
              {STATUS_LABEL[status] ?? status}
            </div>
            <div className="text-3xl font-bold mt-1">{contagens[status] ?? 0}</div>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nome ou CNPJ..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {PIPELINE_ORDER.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtrados.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum cliente encontrado
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Razão Social</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Cidade / UF</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Tabela</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Negativado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.razao_social}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {formatCNPJ(c.cnpj)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {[c.cidade, c.uf].filter(Boolean).join(" / ") || "—"}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[c.status ?? ""] ?? "bg-gray-100 text-gray-600 border-gray-300"}`}>
                      {STATUS_LABEL[c.status ?? ""] ?? (c.status ?? "—")}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.perfil_cliente ? (
                      <Badge variant="outline">{c.perfil_cliente}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{c.tabela_preco ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {c.vendedor_id ? (profiles[c.vendedor_id] ?? "—") : "—"}
                  </TableCell>
                  <TableCell>
                    {c.negativado ? (
                      <Badge variant="destructive" className="text-xs">Sim</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Não</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
