import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function ok(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function err(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verificar autenticação
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return err('Token de autorização ausente.', 401)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )

    // Obter usuário autenticado
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
    if (userError || !user) {
      return err('Não autenticado.', 401)
    }

    // Verificar se o usuário é admin
    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from('usuarios')
      .select('papel')
      .eq('id', user.id)
      .single()

    if (perfilError || !perfil) {
      return err('Perfil de usuário não encontrado.', 403)
    }

    if (perfil.papel !== 'admin') {
      return err('Acesso negado. Apenas administradores podem executar esta ação.', 403)
    }

    // Parsear body
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return err('Body inválido ou ausente.', 400)
    }

    const { acao } = body

    if (!acao) {
      return err('Campo "acao" é obrigatório.', 400)
    }

    // -----------------------------------------------------------------------
    // CRIAR USUÁRIO
    // -----------------------------------------------------------------------
    if (acao === 'criar') {
      const { email, senha, nome, papel, gestor_id } = body as {
        email?: string
        senha?: string
        nome?: string
        papel?: string
        gestor_id?: string
      }

      if (!email || !senha || !nome || !papel) {
        return err('Campos obrigatórios ausentes: email, senha, nome, papel.', 400)
      }

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { nome, papel },
      })

      if (createError) {
        console.error('[admin-usuario] Erro ao criar usuário Auth:', createError)
        return err(createError.message, 500)
      }

      const { error: insertError } = await supabaseAdmin.from('usuarios').insert({
        id: newUser.user.id,
        nome,
        email,
        papel,
        gestor_id: gestor_id ?? null,
      })

      if (insertError) {
        console.error('[admin-usuario] Erro ao inserir perfil:', insertError)
        // Remover o usuário criado no Auth para manter consistência
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
        return err(insertError.message, 500)
      }

      return ok({ id: newUser.user.id })
    }

    // -----------------------------------------------------------------------
    // ATUALIZAR USUÁRIO
    // -----------------------------------------------------------------------
    if (acao === 'atualizar') {
      const { id, nome, papel, gestor_id, ativo, senha } = body as {
        id?: string
        nome?: string
        papel?: string
        gestor_id?: string | null
        ativo?: boolean
        senha?: string
      }

      if (!id) {
        return err('Campo "id" é obrigatório para atualizar.', 400)
      }

      // Atualizar tabela usuarios
      const updates: Record<string, unknown> = {}
      if (nome !== undefined) updates.nome = nome
      if (papel !== undefined) updates.papel = papel
      if (gestor_id !== undefined) updates.gestor_id = gestor_id
      if (ativo !== undefined) updates.ativo = ativo

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabaseAdmin
          .from('usuarios')
          .update(updates)
          .eq('id', id)

        if (updateError) {
          console.error('[admin-usuario] Erro ao atualizar perfil:', updateError)
          return err(updateError.message, 500)
        }
      }

      // Atualizar senha se fornecida
      if (senha) {
        const { error: senhaError } = await supabaseAdmin.auth.admin.updateUserById(id, {
          password: senha,
        })
        if (senhaError) {
          console.error('[admin-usuario] Erro ao atualizar senha:', senhaError)
          return err(senhaError.message, 500)
        }
      }

      // Atualizar papel nos metadados do Auth se fornecido
      if (papel !== undefined || nome !== undefined) {
        const meta: Record<string, unknown> = {}
        if (nome !== undefined) meta.nome = nome
        if (papel !== undefined) meta.papel = papel

        const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(id, {
          user_metadata: meta,
        })
        if (metaError) {
          console.error('[admin-usuario] Erro ao atualizar metadados Auth:', metaError)
          return err(metaError.message, 500)
        }
      }

      return ok({ success: true })
    }

    // -----------------------------------------------------------------------
    // EXCLUIR USUÁRIO
    // -----------------------------------------------------------------------
    if (acao === 'excluir') {
      const { id } = body as { id?: string }

      if (!id) {
        return err('Campo "id" é obrigatório para excluir.', 400)
      }

      // Soft-delete: marcar como inativo
      const { error: deleteError } = await supabaseAdmin
        .from('usuarios')
        .update({ ativo: false })
        .eq('id', id)

      if (deleteError) {
        console.error('[admin-usuario] Erro ao desativar usuário:', deleteError)
        return err(deleteError.message, 500)
      }

      // Desabilitar no Auth
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.updateUserById(id, {
        ban_duration: '87600h', // 10 anos
      })

      if (authDeleteError) {
        console.error('[admin-usuario] Erro ao banir usuário no Auth:', authDeleteError)
        return err(authDeleteError.message, 500)
      }

      return ok({ success: true })
    }

    // -----------------------------------------------------------------------
    // AÇÃO DESCONHECIDA
    // -----------------------------------------------------------------------
    return err(`Ação desconhecida: "${acao}".`, 400)
  } catch (e) {
    console.error('[admin-usuario] Erro inesperado:', e)
    return err('Erro interno do servidor.', 500)
  }
})
