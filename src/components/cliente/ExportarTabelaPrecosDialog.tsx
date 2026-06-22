import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";
import { formatCurrency } from "@/lib/format";

export interface PrecoProduto {
  sku: string;
  nome: string;
  preco_bruto: number;
  desconto_cluster: number; // percentual, ex: 15 = 15%
}

interface ExportarTabelaPrecosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nomeCliente: string;
  produtos: PrecoProduto[];
}

export function ExportarTabelaPrecosDialog({
  open,
  onOpenChange,
  nomeCliente,
  produtos,
}: ExportarTabelaPrecosDialogProps) {
  const [descontoVista, setDescontoVista] = useState<string>("0");
  const [exportando, setExportando] = useState(false);

  const descontoVistaNum = Math.max(
    0,
    Math.min(100, parseFloat(descontoVista.replace(",", ".")) || 0)
  );

  function calcularPrecoFinal(
    precoBruto: number,
    descontoCluster: number,
    descontoVistaPerc: number
  ) {
    const aposCluster = precoBruto * (1 - descontoCluster / 100);
    const aposVista = aposCluster * (1 - descontoVistaPerc / 100);
    return aposVista;
  }

  function handleExportar() {
    setExportando(true);
    try {
      const linhas = produtos.map((p) => {
        const precoAposCluster = p.preco_bruto * (1 - p.desconto_cluster / 100);
        const precoFinal = calcularPrecoFinal(
          p.preco_bruto,
          p.desconto_cluster,
          descontoVistaNum
        );
        return {
          SKU: p.sku,
          Produto: p.nome,
          "Preço Bruto (R$)": p.preco_bruto,
          "Desconto Cluster (%)": p.desconto_cluster,
          "Preço após Cluster (R$)": parseFloat(precoAposCluster.toFixed(2)),
          "Desconto à Vista (%)": descontoVistaNum,
          "Preço Final à Vista (R$)": parseFloat(precoFinal.toFixed(2)),
        };
      });

      const ws = XLSX.utils.json_to_sheet(linhas);

      // Larguras das colunas
      ws["!cols"] = [
        { wch: 14 },
        { wch: 40 },
        { wch: 20 },
        { wch: 22 },
        { wch: 26 },
        { wch: 22 },
        { wch: 26 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Tabela de Preços");

      const nomeArquivo = `tabela_precos_${nomeCliente
        .toLowerCase()
        .replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;

      XLSX.writeFile(wb, nomeArquivo);
      onOpenChange(false);
    } catch (err) {
      console.error("Erro ao exportar tabela de preços:", err);
    } finally {
      setExportando(false);
    }
  }

  const temProdutos = produtos.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar Tabela de Preços</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            A tabela exportada conterá o <strong>preço bruto</strong>, o{" "}
            <strong>desconto de cluster</strong> (conforme perfil do cliente) e
            uma coluna de <strong>desconto à vista</strong> ajustável abaixo.
          </p>

          <div className="space-y-1">
            <Label htmlFor="desconto-vista">Desconto à Vista (%)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="desconto-vista"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={descontoVista}
                onChange={(e) => setDescontoVista(e.target.value)}
                className="w-32"
                placeholder="0"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Informe 0 para não aplicar desconto à vista.
            </p>
          </div>

          {temProdutos && (
            <div className="rounded-md border p-3 bg-muted/40 text-sm space-y-1">
              <p className="font-medium">Prévia (primeiro produto):</p>
              <p>
                Preço Bruto:{" "}
                <strong>{formatCurrency(produtos[0].preco_bruto)}</strong>
              </p>
              <p>
                Após Cluster ({produtos[0].desconto_cluster}%):{" "}
                <strong>
                  {formatCurrency(
                    produtos[0].preco_bruto *
                      (1 - produtos[0].desconto_cluster / 100)
                  )}
                </strong>
              </p>
              <p>
                Após À Vista ({descontoVistaNum}%):{" "}
                <strong>
                  {formatCurrency(
                    calcularPrecoFinal(
                      produtos[0].preco_bruto,
                      produtos[0].desconto_cluster,
                      descontoVistaNum
                    )
                  )}
                </strong>
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {produtos.length} produto(s) serão exportados.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleExportar}
            disabled={exportando || !temProdutos}
          >
            <Download className="mr-2 h-4 w-4" />
            {exportando ? "Exportando..." : "Exportar Excel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
