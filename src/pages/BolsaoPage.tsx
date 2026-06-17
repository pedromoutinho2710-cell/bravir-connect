import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL, formatCNPJ } from "@/lib/format";
import { Loader2, Search, Wallet, Users, TrendingUp } from "lucide-react";
import { toast } from "sonner";

type ClienteBolsao = {
  cliente_id: string;
  nome: string;
  cnpj: string | null;
  gerado: number;
  usado: number;
  saldo: number;
};

export default function BolsaoPage() {
  const { role, user } = useAuth();
  const { active, userId: impersonatedId } = useImpersonation();
  const effectiveUserId = active ? impersonatedId : user?.id;
  const navigate = useNavigate();

  const [clientes, setClientes] = useState<ClienteBolsao[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");

  const isVendedor = role === "vendedor";

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);

      // Clientes visíveis: vendedor vê só a própria carteira; gestora/admin veem todos
      let clientesQuery = supabase
        .from("clientes")
        .select("id, razao_social, nome_parceiro, cnpj, vendedor_id");
      if (isVendedor) clientesQuery = clientesQuery.eq("vendedor_id", effectiveUserId ?? "");

      const [clientesRes, bolsaoRes] = await Promise.all([
        clientesQuery,
        supabase.from("bolsao").select("cliente_id, valor, tipo"),
      ]);

      if (clientesRes.error || bolsaoRes.error) {
        toast.error("Erro ao carregar bolsão");
        setLoading(false);
        return;
      }

      const nomeMap = new Map<string, { nome: string; cnpj: string | null }>();
      (clientesRes.data ?? []).forEach((c) => {
        nomeMap.set(c.id, {
          nome: c.nome_parceiro || c.razao_social || "—",
          cnpj: c.cnpj ?? null,
        });
      });

      const agg = new Map<string, { gerado: number; usado: number }>();
      (bolsaoRes.data ?? []).forEach((b) => {
        if (!b.cliente_id) return;
        // Vendedor só enxerga os clientes da própria carteira
        if (!nomeMap.has(b.cliente_id)) return;
        const entry = agg.get(b.cliente_id) ?? { gerado: 0, usado: 0 };
        if (b.tipo === "gerado") entry.gerado += Number(b.valor);
        else if (b.tipo === "usado") entry.usado += Number(b.valor);
        agg.set(b.cliente_id, entry);
      });

      const lista: ClienteBolsao[] = Array.from(agg.entries()).map(([cliente_id, v]) => {
        const info = nomeMap.get(cliente_id)!;
        return {
          cliente_id,
          nome: info.nome,
          cnpj: info.cnpj,
          gerado: v.gerado,
          usado: v.usado,
          saldo: v.gerado - v.usado,
        };
      });

      lista.sort((a, b) => b.saldo - a.saldo);
      setClientes(lista);
      setLoading(false);
    })();
  }, [user, isVendedor, effectiveUserId, active, impersonatedId]);

  const clientesFiltrados = useMemo(() => {
    if (!busca.trim()) return clientes;
    const termo = busca.toLowerCase();
    const buscaDigits = busca.replace(/\D/g, "");
    return clientes.filter((c) => {
      const cnpjDigits = (c.cnpj ?? "").replace(/\D/g, "");
      return (
        c.nome.toLowerCase().includes(termo) ||
        (buscaDigits.length > 0 && cnpjDigits.includes(buscaDigits))
      );
    });
  }, [clientes, busca]);

  const resumo = useMemo(() => {
    const totalBolsao = clientes.reduce((s, c) => s + c.saldo, 0);
    const comSaldo = clientes.filter((c) => c.saldo > 0).length;
    const media = comSaldo > 0 ? totalBolsao / comSaldo : 0;
    return { totalBolsao, comSaldo, media };
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
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wallet className="h-6 w-6" /> Bolsão
        </h1>
        <p className="text-sm text-muted-foreground">
          Saldo de bonificação acumulado por cliente (1% do faturamento)
        </p>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total em bolsão</CardTitle>
            <Wallet className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{formatBRL(resumo.totalBolsao)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Clientes com saldo</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resumo.comSaldo}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Média por cliente</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(resumo.media)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Busca */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nome ou CNPJ..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {/* Tabela de clientes */}
      {clientesFiltrados.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {busca ? "Nenhum cliente encontrado para esta busca" : "Nenhum cliente com bolsão ainda"}
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead className="text-right">Saldo atual</TableHead>
                <TableHead className="text-right">Total gerado</TableHead>
                <TableHead className="text-right">Total usado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientesFiltrados.map((c) => (
                <TableRow key={c.cliente_id} className="hover:bg-muted/50">
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="text-sm text-muted-foreground font-mono">
                    {c.cnpj ? formatCNPJ(c.cnpj) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-bold text-green-700">{formatBRL(c.saldo)}</TableCell>
                  <TableCell className="text-right text-sm">{formatBRL(c.gerado)}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{formatBRL(c.usado)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/clientes/${c.cliente_id}`, { state: { tab: "bolsao" } })}
                    >
                      Ver detalhes
                    </Button>
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
