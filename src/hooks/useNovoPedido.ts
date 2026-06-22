import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export interface ItemPedido {
  produto_id: string;
  sku: string;
  nome_produto: string;
  quantidade: number;
  preco_unitario: number;
  preco_unitario_original?: number;
  desconto_percentual?: number;
  desconto_percentual_original?: number;
  subtotal: number;
}

export interface DadosPedido {
  cliente_id: string;
  observacoes?: string;
  condicao_pagamento?: string;
  desconto_vista?: number;
  itens: ItemPedido[];
}

export function useNovoPedido() {
  const [salvando, setSalvando] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  async function salvarPedido(
    dados: DadosPedido,
    pedidoId?: string
  ): Promise<string | null> {
    if (!dados.cliente_id) {
      toast({
        title: "Cliente obrigatório",
        description: "Selecione um cliente antes de salvar.",
        variant: "destructive",
      });
      return null;
    }

    if (!dados.itens || dados.itens.length === 0) {
      toast({
        title: "Itens obrigatórios",
        description: "Adicione ao menos um produto ao pedido.",
        variant: "destructive",
      });
      return null;
    }

    setSalvando(true);
    try {
      const valorTotal = dados.itens.reduce((acc, item) => acc + item.subtotal, 0);

      let idPedido = pedidoId ?? null;

      if (idPedido) {
        // Atualizar pedido existente
        const { error: erroPedido } = await supabase
          .from("pedidos")
          .update({
            cliente_id: dados.cliente_id,
            observacoes: dados.observacoes ?? null,
            condicao_pagamento: dados.condicao_pagamento ?? null,
            desconto_vista: dados.desconto_vista ?? null,
            valor_total: valorTotal,
            atualizado_em: new Date().toISOString(),
          })
          .eq("id", idPedido);

        if (erroPedido) throw erroPedido;
      } else {
        // Criar novo pedido
        const { data: pedidoCriado, error: erroPedido } = await supabase
          .from("pedidos")
          .insert({
            cliente_id: dados.cliente_id,
            observacoes: dados.observacoes ?? null,
            condicao_pagamento: dados.condicao_pagamento ?? null,
            desconto_vista: dados.desconto_vista ?? null,
            valor_total: valorTotal,
            status: "rascunho",
          })
          .select("id")
          .single();

        if (erroPedido) throw erroPedido;
        idPedido = pedidoCriado.id;
      }

      // Substituir itens atomicamente via RPC (DELETE + INSERT em transação Postgres)
      const itensPayload = dados.itens.map((item) => ({
        produto_id: item.produto_id,
        sku: item.sku,
        nome_produto: item.nome_produto,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
        preco_unitario_original: item.preco_unitario_original ?? null,
        desconto_percentual: item.desconto_percentual ?? null,
        desconto_percentual_original: item.desconto_percentual_original ?? null,
        subtotal: item.subtotal,
      }));

      const { error: erroItens } = await supabase.rpc("upsert_itens_pedido", {
        p_pedido_id: idPedido,
        p_itens: itensPayload,
      });

      if (erroItens) throw erroItens;

      await queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      await queryClient.invalidateQueries({ queryKey: ["pedido", idPedido] });

      toast({
        title: pedidoId ? "Pedido atualizado" : "Pedido criado",
        description: pedidoId
          ? "As alterações foram salvas com sucesso."
          : "Pedido criado com sucesso.",
      });

      return idPedido;
    } catch (erro: unknown) {
      const mensagem =
        erro instanceof Error ? erro.message : "Erro desconhecido ao salvar pedido.";
      toast({
        title: "Erro ao salvar pedido",
        description: mensagem,
        variant: "destructive",
      });
      return null;
    } finally {
      setSalvando(false);
    }
  }

  return { salvarPedido, salvando };
}
