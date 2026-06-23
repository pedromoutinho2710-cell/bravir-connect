import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ItemPedido {
  produto_id: string;
  sku: string;
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  desconto_percentual: number;
  preco_final: number;
}

export interface NovoPedidoForm {
  cliente_id: string;
  cliente_nome: string;
  tipo_entrega: string; // 'normal' | 'agendada'
  observacoes: string;
  telefone_contato: string;
  email_contato: string;
  itens: ItemPedido[];
}

export interface NovoPedidoErrors {
  cliente_id?: string;
  tipo_entrega?: string;
  telefone_contato?: string;
  email_contato?: string;
  itens?: string;
}

const INITIAL_FORM: NovoPedidoForm = {
  cliente_id: '',
  cliente_nome: '',
  tipo_entrega: 'normal',
  observacoes: '',
  telefone_contato: '',
  email_contato: '',
  itens: [],
};

export function useNovoPedido() {
  const { toast } = useToast();
  const [form, setForm] = useState<NovoPedidoForm>(INITIAL_FORM);
  const [errors, setErrors] = useState<NovoPedidoErrors>({});
  const [loading, setLoading] = useState(false);

  const entregaAgendada = form.tipo_entrega === 'agendada';

  const setField = useCallback(
    <K extends keyof NovoPedidoForm>(field: K, value: NovoPedidoForm[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      // Limpa erro do campo ao editar
      setErrors((prev) => {
        if (prev[field as keyof NovoPedidoErrors]) {
          const next = { ...prev };
          delete next[field as keyof NovoPedidoErrors];
          return next;
        }
        return prev;
      });
    },
    [],
  );

  const validate = useCallback((): boolean => {
    const next: NovoPedidoErrors = {};

    if (!form.cliente_id) {
      next.cliente_id = 'Selecione um cliente.';
    }

    if (!form.tipo_entrega) {
      next.tipo_entrega = 'Selecione o tipo de entrega.';
    }

    if (entregaAgendada) {
      if (!form.telefone_contato.trim()) {
        next.telefone_contato =
          'Telefone é obrigatório para entrega agendada.';
      }
      if (!form.email_contato.trim()) {
        next.email_contato = 'E-mail é obrigatório para entrega agendada.';
      }
    }

    if (form.itens.length === 0) {
      next.itens = 'Adicione ao menos um produto.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form, entregaAgendada]);

  const resetForm = useCallback(() => {
    setForm(INITIAL_FORM);
    setErrors({});
  }, []);

  const salvarPedido = useCallback(async (): Promise<boolean> => {
    if (!validate()) return false;

    setLoading(true);
    try {
      const payload = {
        cliente_id: form.cliente_id,
        tipo_entrega: form.tipo_entrega,
        observacoes: form.observacoes || null,
        telefone_contato: entregaAgendada ? form.telefone_contato.trim() : null,
        email_contato: entregaAgendada ? form.email_contato.trim() : null,
        status: 'rascunho',
      };

      const { data: pedido, error: pedidoError } = await supabase
        .from('pedidos')
        .insert(payload)
        .select('id')
        .single();

      if (pedidoError) throw pedidoError;

      if (form.itens.length > 0) {
        const itens = form.itens.map((item) => ({
          pedido_id: pedido.id,
          produto_id: item.produto_id,
          quantidade: item.quantidade,
          preco_unitario: item.preco_unitario,
          desconto_percentual: item.desconto_percentual,
          preco_final: item.preco_final,
        }));

        const { error: itensError } = await supabase
          .from('itens_pedido')
          .insert(itens);

        if (itensError) throw itensError;
      }

      toast({
        title: 'Pedido salvo com sucesso!',
        description: `Pedido criado.`,
      });

      resetForm();
      return true;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Erro desconhecido.';
      toast({
        title: 'Erro ao salvar pedido',
        description: message,
        variant: 'destructive',
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [form, entregaAgendada, validate, resetForm, toast]);

  return {
    form,
    errors,
    loading,
    entregaAgendada,
    setField,
    validate,
    resetForm,
    salvarPedido,
  };
}
