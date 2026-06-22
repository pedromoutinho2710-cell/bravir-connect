import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TabelaPrecos } from "@/components/cliente/TabelaPrecos";
import {
  ExportarTabelaPrecosDialog,
  PrecoProduto,
} from "@/components/cliente/ExportarTabelaPrecosDialog";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface AbaPrecoProps {
  clienteId: string;
  nomeCliente?: string;
}

export function AbaPrecos({ clienteId, nomeCliente = "cliente" }: AbaPrecoProps) {
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  const { data: precos, isLoading } = useQuery({
    queryKey: ["precos-cliente", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("precos_cliente_produto")
        .select(
          `
          sku,
          preco_bruto,
          desconto_cluster,
          produtos ( nome )
        `
        )
        .eq("cliente_id", clienteId)
        .order("sku");

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!clienteId,
  });

  const produtosParaExportar: PrecoProduto[] = (precos ?? []).map((p: any) => ({
    sku: p.sku,
    nome: p.produtos?.nome ?? p.sku,
    preco_bruto: p.preco_bruto ?? 0,
    desconto_cluster: p.desconto_cluster ?? 0,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Tabela de Preços</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExportDialogOpen(true)}
          disabled={!precos || precos.length === 0}
        >
          <Download className="mr-2 h-4 w-4" />
          Exportar Tabela
        </Button>
      </div>

      <TabelaPrecos clienteId={clienteId} isLoading={isLoading} precos={precos} />

      <ExportarTabelaPrecosDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        nomeCliente={nomeCliente}
        produtos={produtosParaExportar}
      />
    </div>
  );
}
