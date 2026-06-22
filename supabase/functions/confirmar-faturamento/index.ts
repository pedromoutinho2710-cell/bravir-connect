import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verificarAutenticacao } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verificar autenticação
    const usuario = await verificarAutenticacao(req, supabase)
    if (!usuario) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const {
      pedido_id,
      numero_nota,
      data_emissao,
      valor_total,
      pdf_url,
      itens,
      criar_pedido_filho,
      itens_filho,
    } = body

    // Validações básicas
    if (!pedido_id || !numero_nota || !data_emissao || valor_total === undefined || !itens?.length) {
      return new Response(
        JSON.stringify({ error: 'Parâmetros obrigatórios ausentes' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Chamar RPC atômica — tudo dentro de uma única transação Postgres
    const { data, error } = await supabase.rpc('confirmar_faturamento_atomico', {
      p_pedido_id: pedido_id,
      p_numero_nota: numero_nota,
      p_data_emissao: data_emissao,
      p_valor_total: valor_total,
      p_pdf_url: pdf_url ?? null,
      p_itens: itens,
      p_criar_pedido_filho: criar_pedido_filho ?? false,
      p_itens_filho: itens_filho ?? [],
      p_usuario_id: usuario.id,
    })

    if (error) {
      console.error('[confirmar-faturamento] Erro RPC:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify(data),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[confirmar-faturamento] Erro inesperado:', err)
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
