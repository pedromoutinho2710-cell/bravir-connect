import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";

interface PrecoProdutoRow {
  sku: string;
  preco_bruto: number | null;
  desconto_cluster: number | null;
  produtos?: { nome: string } | null;
}

interface TabelaPrecosProps {
  clienteId: string;
  isLoading?: boolean;
  precos?: PrecoProdutoRow[] | null;
}

export function TabelaPrecos({ isLoading, precos }: TabelaPrecosProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!precos || precos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Nenhum preço cadastrado para este cliente.
      </p>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>Produto</TableHead>
            <TableHead className="text-right">Preço Bruto</TableHead>
            <TableHead className="text-right">Desc. Cluster</TableHead>
            <TableHead className="text-right">Preço c/ Cluster</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {precos.map((p) => {
            const precoBruto = p.preco_bruto ?? 0;
            const descontoCluster = p.desconto_cluster ?? 0;
            const precoAposCluster = precoBruto * (1 - descontoCluster / 100);

            return (
              <TableRow key={p.sku}>
                <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                <TableCell>{p.produtos?.nome ?? "—"}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(precoBruto)}
                </TableCell>
                <TableCell className="text-right text-orange-600 font-medium">
                  {descontoCluster > 0 ? `${descontoCluster}%` : "—"}
                </TableCell>
                <TableCell className="text-right font-semibold text-green-700">
                  {formatCurrency(precoAposCluster)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
