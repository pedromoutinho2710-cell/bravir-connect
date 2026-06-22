import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ContatoCliente {
  telefone_contato: string | null;
  email_contato: string | null;
}

export function useContatoCliente(clienteId: string | null | undefined) {
  return useQuery<ContatoCliente | null>({
    queryKey: ['contato-cliente', clienteId],
    queryFn: async () => {
      if (!clienteId) return null;

      const { data, error } = await supabase
        .from('pedidos')
        .select('telefone_contato, email_contato')
        .eq('cliente_id', clienteId)
        .not('telefone_contato', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Erro ao buscar contato do cliente:', error);
        return null;
      }

      return data as ContatoCliente | null;
    },
    enabled: !!clienteId,
    staleTime: 1000 * 60 * 5, // 5 minutos
  });
}
