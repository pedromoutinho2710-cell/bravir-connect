import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatCNPJ } from "@/lib/format";
import { MARCAS } from "@/lib/constants";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

type ClienteAgregado = {
  cliente_id: string;
  razao_social: string;
  cnpj: string | null;
  codigo_cliente: string | null;
  aceita_saldo: boolean;
  ltv: number;
  num_pedidos: number;
  ticket_medio: number;
  marcas_compradas: string[];
  rank: number;
};

type OrdemCampo = "ltv" | "ticket_medio" | "razao_social";

export default function MeusClientes() {
  const { user } = useAuth();
  const [clientes, setClientes] = useState<ClienteAgregado[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<OrdemCampo>("ltv");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select(`
          cliente_id,
          itens_pedido(total_item, produtos(marca)),
          clientes(razao_social, cnpj, codigo_cliente, aceita_saldo)
        `)
        .eq("vendedor_id", user.id)
        .not("status", "in", '("rascunho","cancelado")');

      if (error) {
        toast.error("Erro ao carregar clientes");
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = new Map<string, {
        razao_social: string;
        cnpj: string | null;
        codigo_cliente: string | null;
        aceita_saldo: boolean;
        ltv: number;
        num_pedidos: number;
        marcas: Set<string>;
      }>();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).forEach((p: any) => {
        if (!p.cliente_id) return;
        const cl = p.clientes;
        if (!map.has(p.cliente_id)) {
          map.set(p.cliente_id, {
            razao_social: cl?.razao_social ?? "—",
            cnpj: cl?.cnpj ?? null,
            codigo_cliente: cl?.codigo_cliente ?? null,
            aceita_saldo: cl?.aceita_saldo ?? false,
            ltv: 0,
            num_pedidos: 0,
            marcas: new Set(),
          });
        }
        const entry = map.get(p.cliente_id)!;
        entry.num_pedidos += 1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p.itens_pedido ?? []).forEach((item: any) => {
          entry.ltv += Number(item.total_item);
          if (item.produtos?.marca) entry.marcas.add(item.produtos.marca);
        });
      });

      const agregados: ClienteAgregado[] = Array.from(map.entries())
        .map(([cliente_id, v]) => ({
          cliente_id,
          razao_social: v.razao_social,
          cnpj: v.cnpj,
          codigo_cliente: v.codigo_cliente,
          aceita_saldo: v.aceita_saldo,
          ltv: v.ltv,
          num_pedidos: v.num_pedidos,
          ticket_medio: v.num_pedidos > 0 ? v.ltv / v.num_pedidos : 0,
          marcas_compradas: Array.from(v.marcas),
          rank: 0,
        }))
        .sort((a, b) => b.ltv - a.ltv)
        .map((c, idx) => ({ ...c, rank: idx + 1 }));

      setClientes(agregados);
    })().finally(() => setLoading(false));
  }, [user]);

  const clientesFiltrados = useMemo(() => {
    const filtrados = busca.trim()
      ? clientes.filter((c) => {
          const buscaDigits = busca.replace(/\D/g, "");
          const cnpjDigits = (c.cnpj ?? "").replace(/\D/g, "");
          const matchNome = c.razao_social.toLowerCase().includes(busca.toLowerCase());
          const matchCnpj = buscaDigits.length > 0 && cnpjDigits.includes(buscaDigits);
          return matchNome || matchCnpj;
        })
      : clientes;

    return [...filtrados].sort((a, b) => {
      if (ordem === "ltv") return b.ltv - a.ltv;
      if (ordem === "ticket_medio") return b.ticket_medio - a.ticket_medio;
      return a.razao_social.localeCompare(b.razao_social, "pt-BR");
    });
  }, [clientes, busca, ordem]);

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
        <h1 className="text-2xl font-bold">Meus Clientes</h1>
        <p className="text-sm text-muted-foreground">Portfólio de clientes com LTV e cobertura de marcas</p>
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
        <Select value={ordem} onValueChange={(v) => setOrdem(v as OrdemCampo)}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Ordenar por" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ltv">LTV (maior primeiro)</SelectItem>
            <SelectItem value="ticket_medio">Ticket médio (maior primeiro)</SelectItem>
            <SelectItem value="razao_social">Nome (A–Z)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {clientesFiltrados.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {busca ? "Nenhum cliente encontrado para esta busca" : "Nenhum cliente encontrado"}
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Código</TableHead>
                <TableHead className="text-right">LTV</TableHead>
                <TableHead className="text-right">Ticket médio</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead>Marcas</TableHead>
                <TableHead>Aceita saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientesFiltrados.map((c) => (
                <TableRow key={c.cliente_id}>
                  <TableCell className="font-mono text-muted-foreground text-sm">{c.rank}</TableCell>
                  <TableCell className="font-medium">{c.razao_social}</TableCell>
                  <TableCell className="text-sm text-muted-foreground font-mono">
                    {c.cnpj ? formatCNPJ(c.cnpj) : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.codigo_cliente ?? "—"}</TableCell>
                  <TableCell className="text-right font-semibold">{formatBRL(c.ltv)}</TableCell>
                  <TableCell className="text-right text-sm">{formatBRL(c.ticket_medio)}</TableCell>
                  <TableCell className="text-right text-sm">{c.num_pedidos}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {MARCAS.map((marca) => {
                        const tem = c.marcas_compradas.includes(marca);
                        return (
                          <Badge
                            key={marca}
                            variant="outline"
                            className={`text-xs ${tem ? "border-green-400 bg-green-50 text-green-700" : "border-red-300 bg-red-50 text-red-600"}`}
                          >
                            {marca}
                          </Badge>
                        );
                      })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium ${c.aceita_saldo ? "text-green-700" : "text-muted-foreground"}`}>
                      {c.aceita_saldo ? "Sim" : "Não"}
                    </span>
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
