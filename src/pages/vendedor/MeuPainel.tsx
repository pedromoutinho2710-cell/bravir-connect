import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import * as XLSX from "xlsx";

export default function MeuPainel() {
  const { profile } = useAuth();

  // ── Dados do painel via RPC ──────────────────────────────────────────────
  const { data: painel, isLoading } = useQuery({
    queryKey: ["painel-vendedor", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;
      const { data, error } = await supabase.rpc("get_painel_vendedor", {
        p_vendedor_id: profile.id,
      });
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.id,
  });

  // ── Download da tabela de preços (somente vigência ativa) ────────────────
  const baixarTabela = useCallback(async () => {
    try {
      // 1. Busca a vigência ativa
      const { data: vigencias, error: vigError } = await supabase
        .from("vigencias")
        .select("id")
        .eq("is_ativa", true)
        .limit(1)
        .single();

      if (vigError || !vigencias) {
        toast({
          title: "Nenhuma vigência ativa encontrada",
          description: "Não há tabela de preços ativa no momento.",
          variant: "destructive",
        });
        return;
      }

      // 2. Busca preços apenas da vigência ativa
      const { data: precos, error: precosError } = await supabase
        .from("precos")
        .select("produto_id, tabela, preco_bruto")
        .eq("vigencia_id", vigencias.id)
        .limit(5000);

      if (precosError) throw precosError;

      if (!precos || precos.length === 0) {
        toast({
          title: "Tabela vazia",
          description: "Nenhum preço encontrado para a vigência ativa.",
          variant: "destructive",
        });
        return;
      }

      // 3. Gera planilha Excel
      const linhas = precos.map((p) => ({
        "Produto ID": p.produto_id,
        Tabela: p.tabela,
        "Preço Bruto": p.preco_bruto,
      }));

      const ws = XLSX.utils.json_to_sheet(linhas);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Tabela de Preços");
      XLSX.writeFile(wb, "tabela_precos.xlsx");

      toast({ title: "Tabela baixada com sucesso!" });
    } catch (err: any) {
      console.error("Erro ao baixar tabela:", err);
      toast({
        title: "Erro ao baixar tabela",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive",
      });
    }
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Meu Painel</h1>
        <Button variant="outline" onClick={baixarTabela}>
          Baixar Tabela de Preços
        </Button>
      </div>

      {painel && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Faturamento do Mês
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {formatCurrency(painel.faturamento_mes ?? 0)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pedidos Abertos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {painel.pedidos_abertos ?? 0}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Clientes Ativos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {painel.clientes_ativos ?? 0}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
