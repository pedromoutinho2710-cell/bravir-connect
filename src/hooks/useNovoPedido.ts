import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export interface ItemPedido {
  id?: string;
  produto_id: string;
  sku: string;
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  desconto_percentual?: number;
  preco_final?: number;
}

export interface NovoPedidoState {
  cliente_id: string | null;
  observacoes: string;
  condicao_pagamento: string;
  desconto_vista?: number;
  itens: ItemPedido[];
}

const estadoInicial: NovoPedidoState = {
  cliente_id: null,
  observacoes: '',
  condicao_pagamento: '',
  desconto_vista: 0,
  itens: [],
};

export function useNovoPedido() {
  const { user } = useAuth();
  const [pedido, setPedido] = useState<NovoPedidoState>(estadoInicial);
  const [pedidoId, setPedidoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // Rastreia os ids dos itens que já foram persistidos no banco
  const itensPersistidosRef = useRef<Set<string>>(new Set());

  const atualizarPedido = useCallback((campos: Partial<NovoPedidoState>) => {
    setPedido((prev) => ({ ...prev, ...campos }));
  }, []);

  const adicionarItem = useCallback((item: ItemPedido) => {
    setPedido((prev) => ({ ...prev, itens: [...prev.itens, item] }));
  }, []);

  const removerItem = useCallback((index: number) => {
    setPedido((prev) => ({
      ...prev,
      itens: prev.itens.filter((_, i) => i !== index),
    }));
  }, []);

  const atualizarItem = useCallback((index: number, campos: Partial<ItemPedido>) => {
    setPedido((prev) => ({
      ...prev,
      itens: prev.itens.map((item, i) => (i === index ? { ...item, ...campos } : item)),
    }));
  }, []);

  const resetar = useCallback(() => {
    setPedido(estadoInicial);
    setPedidoId(null);
    itensPersistidosRef.current = new Set();
  }, []);

  const salvarPedido = useCallback(
    async (status: 'rascunho' | 'enviado' = 'rascunho'): Promise<string | null> => {
      if (!user) return null;
      if (!pedido.cliente_id) {
        toast({ title: 'Selecione um cliente antes de salvar.', variant: 'destructive' });
        return null;
      }

      setSalvando(true);
      try {
        // ── 1. Upsert do cabeçalho do pedido ────────────────────────────────
        const cabecalho = {
          cliente_id: pedido.cliente_id,
          observacoes: pedido.observacoes,
          condicao_pagamento: pedido.condicao_pagamento,
          desconto_vista: pedido.desconto_vista ?? 0,
          status,
          vendedor_id: user.id,
          ...(pedidoId ? { id: pedidoId } : {}),
        };

        const { data: pedidoSalvo, error: errPedido } = await supabase
          .from('pedidos')
          .upsert(cabecalho, { onConflict: 'id' })
          .select('id')
          .single();

        if (errPedido || !pedidoSalvo) {
          throw errPedido ?? new Error('Falha ao salvar pedido');
        }

        const id = pedidoSalvo.id as string;
        if (!pedidoId) setPedidoId(id);

        // ── 2. Diff de itens ────────────────────────────────────────────────
        const idsAtuais = new Set(
          pedido.itens.filter((it) => !!it.id).map((it) => it.id as string)
        );
        const idsAnteriores = itensPersistidosRef.current;

        // Itens que existiam no banco mas foram removidos da lista
        const idsRemovidos = [...idsAnteriores].filter((id) => !idsAtuais.has(id));

        // Itens novos (ainda sem id)
        const itensNovos = pedido.itens.filter((it) => !it.id);

        // Itens já existentes (têm id) — upsert para atualizar campos alterados
        const itensExistentes = pedido.itens.filter((it) => !!it.id);

        // ── 3. Deletar apenas itens removidos ───────────────────────────────
        if (idsRemovidos.length > 0) {
          const { error: errDelete } = await supabase
            .from('itens_pedido')
            .delete()
            .in('id', idsRemovidos);
          if (errDelete) throw errDelete;
          idsRemovidos.forEach((rid) => idsAnteriores.delete(rid));
        }

        // ── 4. Upsert dos itens existentes ──────────────────────────────────
        if (itensExistentes.length > 0) {
          const payload = itensExistentes.map((it) => ({
            id: it.id,
            pedido_id: id,
            produto_id: it.produto_id,
            sku: it.sku,
            descricao: it.descricao,
            quantidade: it.quantidade,
            preco_unitario: it.preco_unitario,
            desconto_percentual: it.desconto_percentual ?? 0,
            preco_final: it.preco_final ?? it.preco_unitario,
          }));

          const { error: errUpsert } = await supabase
            .from('itens_pedido')
            .upsert(payload, { onConflict: 'id' });
          if (errUpsert) throw errUpsert;
        }

        // ── 5. Inserir itens novos e capturar ids gerados ───────────────────
        if (itensNovos.length > 0) {
          const payload = itensNovos.map((it) => ({
            pedido_id: id,
            produto_id: it.produto_id,
            sku: it.sku,
            descricao: it.descricao,
            quantidade: it.quantidade,
            preco_unitario: it.preco_unitario,
            desconto_percentual: it.desconto_percentual ?? 0,
            preco_final: it.preco_final ?? it.preco_unitario,
          }));

          const { data: inseridos, error: errInsert } = await supabase
            .from('itens_pedido')
            .insert(payload)
            .select('id, sku');

          if (errInsert) throw errInsert;

          // Atribuir os ids gerados de volta aos itens em memória
          if (inseridos && inseridos.length > 0) {
            // Mapeia pelo índice da lista de novos (mesma ordem do insert)
            setPedido((prev) => {
              let novoIdx = 0;
              const itensAtualizados = prev.itens.map((it) => {
                if (!it.id) {
                  const gerado = inseridos[novoIdx++];
                  if (gerado) {
                    itensPersistidosRef.current.add(gerado.id as string);
                    return { ...it, id: gerado.id as string };
                  }
                }
                return it;
              });
              return { ...prev, itens: itensAtualizados };
            });
          }
        }

        // Sincroniza o ref com os ids atuais persistidos
        idsAtuais.forEach((aid) => itensPersistidosRef.current.add(aid));

        if (status === 'enviado') {
          toast({ title: 'Pedido enviado com sucesso!' });
        }

        return id;
      } catch (err: unknown) {
        console.error('[useNovoPedido] Erro ao salvar pedido:', err);
        toast({
          title: 'Erro ao salvar pedido',
          description: err instanceof Error ? err.message : 'Tente novamente.',
          variant: 'destructive',
        });
        return null;
      } finally {
        setSalvando(false);
      }
    },
    [pedido, pedidoId, user]
  );

  return {
    pedido,
    pedidoId,
    salvando,
    atualizarPedido,
    adicionarItem,
    removerItem,
    atualizarItem,
    salvarPedido,
    resetar,
  };
}
