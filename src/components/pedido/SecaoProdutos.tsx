import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { formatarMoeda } from "@/lib/format";
import { calcularPrecoItem } from "@/lib/preco";

export interface ItemPedido {
  id: string;
  produto_id: string;
  nome_produto: string;
  quantidade: number;
  preco_unitario: number;
  desconto_percentual: number;
  preco_final: number;
  total: number;
}

interface Produto {
  id: string;
  nome: string;
  preco_base: number;
}

interface SecaoProdutosProps {
  itens: ItemPedido[];
  /**
   * Callback chamado quando os itens mudam (preços recalculados ou edição do usuário).
   * IMPORTANTE: estabilize esta função com useCallback no componente pai para evitar
   * re-renders desnecessários.
   */
  onChange: (itens: ItemPedido[]) => void;
  produtos: Produto[];
  descontoGlobal?: number;
  readonly?: boolean;
}

/**
 * Retorna uma assinatura estável (string) para comparar arrays de itens
 * sem depender de referências de objeto.
 */
function assinarItens(itens: ItemPedido[]): string {
  return itens
    .map(
      (i) =>
        `${i.produto_id}:${i.quantidade}:${i.preco_unitario}:${i.desconto_percentual}:${i.preco_final}:${i.total}`
    )
    .join("|");
}

export function SecaoProdutos({
  itens,
  onChange,
  produtos,
  descontoGlobal = 0,
  readonly = false,
}: SecaoProdutosProps) {
  // ---------------------------------------------------------------------------
  // Estabiliza a referência de onChange para que o efeito de sincronização
  // não seja re-disparado toda vez que o pai recria a função (evita loop).
  // ---------------------------------------------------------------------------
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // ---------------------------------------------------------------------------
  // Recalcula preços/totais de todos os itens com base nas props atuais.
  // Não chama onChange aqui — isso é feito no efeito abaixo de forma segura.
  // ---------------------------------------------------------------------------
  const itensRecalculados = useMemo<ItemPedido[]>(() => {
    return itens.map((item) => {
      const { precoFinal, total } = calcularPrecoItem({
        precoUnitario: item.preco_unitario,
        quantidade: item.quantidade,
        descontoPercentual: Math.max(item.desconto_percentual, descontoGlobal),
      });
      return {
        ...item,
        preco_final: precoFinal,
        total,
      };
    });
    // descontoGlobal é primitivo — seguro como dep.
    // itens é comparado por referência; para arrays recriados a cada render
    // pelo pai, a assinatura abaixo protege contra loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, descontoGlobal]);

  // ---------------------------------------------------------------------------
  // Sincroniza os itens recalculados de volta ao pai APENAS quando o conteúdo
  // efetivamente muda. Usa assinatura string para comparação estável e
  // onChangeRef para não re-disparar quando onChange muda de referência.
  // ---------------------------------------------------------------------------
  const assinaturaAtualRef = useRef<string>("");
  useEffect(() => {
    const novaAssinatura = assinarItens(itensRecalculados);
    const assinaturaEntrada = assinarItens(itens);

    // Só notifica se os itens recalculados diferem dos itens recebidos E
    // se esta assinatura ainda não foi propagada (evita loop).
    if (
      novaAssinatura !== assinaturaEntrada &&
      novaAssinatura !== assinaturaAtualRef.current
    ) {
      assinaturaAtualRef.current = novaAssinatura;
      onChangeRef.current(itensRecalculados);
    }
  }, [itensRecalculados, itens]);

  // ---------------------------------------------------------------------------
  // Handlers de edição local — sempre usam useCallback para estabilidade.
  // ---------------------------------------------------------------------------
  const handleAdicionarItem = useCallback(() => {
    if (produtos.length === 0) return;
    const produto = produtos[0];
    const novoItem: ItemPedido = {
      id: crypto.randomUUID(),
      produto_id: produto.id,
      nome_produto: produto.nome,
      quantidade: 1,
      preco_unitario: produto.preco_base,
      desconto_percentual: descontoGlobal,
      preco_final: produto.preco_base,
      total: produto.preco_base,
    };
    onChangeRef.current([...itens, novoItem]);
  }, [itens, produtos, descontoGlobal]);

  const handleRemoverItem = useCallback(
    (id: string) => {
      onChangeRef.current(itens.filter((i) => i.id !== id));
    },
    [itens]
  );

  const handleAlterarCampo = useCallback(
    (
      id: string,
      campo: keyof ItemPedido,
      valor: string | number
    ) => {
      const novosItens = itens.map((item) => {
        if (item.id !== id) return item;
        const atualizado = { ...item, [campo]: valor };
        const { precoFinal, total } = calcularPrecoItem({
          precoUnitario: atualizado.preco_unitario,
          quantidade: atualizado.quantidade,
          descontoPercentual: Math.max(
            atualizado.desconto_percentual,
            descontoGlobal
          ),
        });
        return { ...atualizado, preco_final: precoFinal, total };
      });
      onChangeRef.current(novosItens);
    },
    [itens, descontoGlobal]
  );

  const handleAlterarProduto = useCallback(
    (id: string, produtoId: string) => {
      const produto = produtos.find((p) => p.id === produtoId);
      if (!produto) return;
      const novosItens = itens.map((item) => {
        if (item.id !== id) return item;
        const { precoFinal, total } = calcularPrecoItem({
          precoUnitario: produto.preco_base,
          quantidade: item.quantidade,
          descontoPercentual: Math.max(item.desconto_percentual, descontoGlobal),
        });
        return {
          ...item,
          produto_id: produto.id,
          nome_produto: produto.nome,
          preco_unitario: produto.preco_base,
          preco_final: precoFinal,
          total,
        };
      });
      onChangeRef.current(novosItens);
    },
    [itens, produtos, descontoGlobal]
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Produtos
        </h3>
        {!readonly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAdicionarItem}
            disabled={produtos.length === 0}
          >
            <Plus className="h-4 w-4 mr-1" />
            Adicionar produto
          </Button>
        )}
      </div>

      {itensRecalculados.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nenhum produto adicionado.
        </p>
      ) : (
        <div className="space-y-2">
          {itensRecalculados.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-12 gap-2 items-center border rounded-md p-2 bg-background"
            >
              {/* Produto */}
              <div className="col-span-4">
                {readonly ? (
                  <span className="text-sm">{item.nome_produto}</span>
                ) : (
                  <Select
                    value={item.produto_id}
                    onValueChange={(v) => handleAlterarProduto(item.id, v)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Produto" />
                    </SelectTrigger>
                    <SelectContent>
                      {produtos.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Quantidade */}
              <div className="col-span-2">
                {readonly ? (
                  <span className="text-sm">{item.quantidade}</span>
                ) : (
                  <Input
                    type="number"
                    min={1}
                    className="h-8 text-sm"
                    value={item.quantidade}
                    onChange={(e) =>
                      handleAlterarCampo(
                        item.id,
                        "quantidade",
                        Number(e.target.value)
                      )
                    }
                  />
                )}
              </div>

              {/* Preço unitário */}
              <div className="col-span-2">
                <span className="text-sm">
                  {formatarMoeda(item.preco_unitario)}
                </span>
              </div>

              {/* Desconto */}
              <div className="col-span-2">
                {readonly ? (
                  <span className="text-sm">{item.desconto_percentual}%</span>
                ) : (
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    className="h-8 text-sm"
                    value={item.desconto_percentual}
                    onChange={(e) =>
                      handleAlterarCampo(
                        item.id,
                        "desconto_percentual",
                        Number(e.target.value)
                      )
                    }
                  />
                )}
              </div>

              {/* Total */}
              <div className="col-span-1 text-right">
                <span className="text-sm font-medium">
                  {formatarMoeda(item.total)}
                </span>
              </div>

              {/* Remover */}
              <div className="col-span-1 flex justify-end">
                {!readonly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleRemoverItem(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
