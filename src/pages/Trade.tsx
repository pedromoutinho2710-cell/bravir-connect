import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatCNPJ, formatDate } from "@/lib/format";
import { Loader2, Users } from "lucide-react";

type ClientePendente = {
  id: string;
  razao_social: string;
  cnpj: string;
  cidade: string | null;
  uf: string | null;
  vendedor_id: string | null;
  cluster: string | null;
  created_at: string;
};

export default function Trade() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<ClientePendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clientes")
      .select("id, razao_social, cnpj, cidade, uf, vendedor_id, cluster, created_at")
      .eq("status", "aguardando_trade")
      .order("created_at", { ascending: true });
    if (error) toast.error("Erro ao carregar clientes");
    else setClientes((data ?? []) as ClientePendente[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    carregar();

    supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "vendedor")
      .then(async ({ data: roles }) => {
        const ids = (roles ?? []).map((r) => r.user_id);
        if (ids.length === 0) return;
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email, name")
          .in("id", ids);
        if (!profs) return;
        const map: Record<string, string> = {};
        profs.forEach((p) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pa = p as any;
          map[p.id] = pa.full_name || pa.name || p.email || "—";
        });
        setProfiles(map);
      });
  }, [carregar]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Trade</h1>
        <p className="text-sm text-muted-foreground">
          Clientes aguardando configuração de perfil pelo faturamento
        </p>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : clientes.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhum cliente aguardando configuração</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Cidade / UF</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Data envio</TableHead>
                <TableHead className="w-24">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.razao_social}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {formatCNPJ(c.cnpj)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {[c.cidade, c.uf].filter(Boolean).join(" / ") || "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.vendedor_id ? (profiles[c.vendedor_id] ?? "—") : "—"}
                  </TableCell>
                  <TableCell>
                    {c.cluster ? (
                      <Badge variant="outline" className="text-xs">{c.cluster}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-300">
                        Sem perfil
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(c.created_at)}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/clientes/${c.id}`)}
                    >
                      Ver
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
