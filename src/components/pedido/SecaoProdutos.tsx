import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, Plus } from "lucide-react";
import { formatCurrency } from "@/lib/format";

export interface ItemPedido {
  id: string;
  sku: string;
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  desconto: number;
}

interface SecaoProdutosProps {
  itens: ItemPedido[];
  onChange: (itens: ItemPedido[]) => void;
  readonly?: boolean;
}

export default function SecaoProdutos({
  itens,
  onChange,
  readonly = false,
}: SecaoProdutosProps) {
  // Mantém sempre a referência mais recente de onChange sem adicioná-la
  // como dependência do effect de comparação, evitando loop de renders.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const [itensLocais, setItensLocais] = useState<ItemPedido[]>(itens);

  // Sincroniza itens externos → estado local (quando o pai substitui tudo)
  const assinaturaExterna = JSON.stringify(itens);
  const assinaturaInterna = JSON.stringify(itensLocais);

  useEffect(() => {
    const externos = JSON.parse(assinaturaExterna) as ItemPedido[];
    const internos = JSON.parse(assinaturaInterna) as ItemPedido[];

    const igual =
      externos.length === internos.length &&
      externos.every((ext, i) => {
        const int = internos[i];
        return (
          ext.id === int.id &&
          ext.sku === int.sku &&
          ext.quantidade === int.quantidade &&
          ext.preco_unitario === int.preco_unitario &&
          ext.desconto === int.desconto
        );
      });

    if (!igual) {
      setItensLocais(externos);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinaturaExterna]);

  // Propaga mudanças locais → pai usando a ref, sem depender da identidade de onChange
  useEffect(() => {
    onChangeRef.current(itensLocais);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinaturaInterna]);

  function atualizar(index: number, campo: keyof ItemPedido, valor: string | number) {
    setItensLocais((prev) => {
      const copia = prev.map((it, i) =>
        i === index ? { ...it, [campo]: valor } : it
      );
      return copia;
    });
  }

  function remover(index: number) {
    setItensLocais((prev) => prev.filter((_, i) => i !== index));
  }

  function adicionarLinha() {
    const novo: ItemPedido = {
      id: crypto.randomUUID(),
      sku: "",
      descricao: "",
      quantidade: 1,
      preco_unitario: 0,
      desconto: 0,
    };
    setItensLocais((prev) => [...prev, novo]);
  }

  const total = itensLocais.reduce(
    (acc, it) =>
      acc + it.quantidade * it.preco_unitario * (1 - it.desconto / 100),
    0
  );

  return (
    <div className="space-y-4">
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">SKU</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-24 text-right">Qtd.</TableHead>
              <TableHead className="w-32 text-right">Preço unit.</TableHead>
              <TableHead className="w-24 text-right">Desc. %</TableHead>
              <TableHead className="w-32 text-right">Total</TableHead>
              {!readonly && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {itensLocais.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={readonly ? 6 : 7}
                  className="text-center text-muted-foreground py-6"
                >
                  Nenhum produto adicionado.
                </TableCell>
              </TableRow>
            )}
            {itensLocais.map((item, index) => (
              <TableRow key={item.id}>
                <TableCell>
                  {readonly ? (
                    item.sku
                  ) : (
                    <Input
                      value={item.sku}
                      onChange={(e) => atualizar(index, "sku", e.target.value)}
                      className="h-8 text-sm"
                    />
                  )}
                </TableCell>
                <TableCell>
                  {readonly ? (
                    item.descricao
                  ) : (
                    <Input
                      value={item.descricao}
                      onChange={(e) =>
                        atualizar(index, "descricao", e.target.value)
                      }
                      className="h-8 text-sm"
                    />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {readonly ? (
                    item.quantidade
                  ) : (
                    <Input
                      type="number"
                      min={1}
                      value={item.quantidade}
                      onChange={(e) =>
                        atualizar(index, "quantidade", Number(e.target.value))
                      }
                      className="h-8 text-sm text-right w-20 ml-auto"
                    />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {readonly ? (
                    formatCurrency(item.preco_unitario)
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.preco_unitario}
                      onChange={(e) =>
                        atualizar(
                          index,
                          "preco_unitario",
                          Number(e.target.value)
                        )
                      }
                      className="h-8 text-sm text-right w-28 ml-auto"
                    />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {readonly ? (
                    `${item.desconto}%`
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={item.desconto}
                      onChange={(e) =>
                        atualizar(index, "desconto", Number(e.target.value))
                      }
                      className="h-8 text-sm text-right w-20 ml-auto"
                    />
                  )}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(
                    item.quantidade *
                      item.preco_unitario *
                      (1 - item.desconto / 100)
                  )}
                </TableCell>
                {!readonly && (
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => remover(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {!readonly && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={adicionarLinha}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Adicionar produto
        </Button>
      )}

      <div className="flex justify-end">
        <p className="text-sm font-semibold">
          Total:{" "}
          <span className="text-base">{formatCurrency(total)}</span>
        </p>
      </div>
    </div>
  );
}
