import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireAdmin } from '../_shared/auth.ts'

const CORS_ORIGIN = Deno.env.get('CORS_ORIGIN') ?? 'https://bravir.com.br'

const corsHeaders = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    await requireAdmin(req)

    const body = await req.json()
    const { action, userId, email, password, role, nome } = body

    if (action === 'create') {
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nome, role },
      })
      if (error) throw error

      const { error: profileError } = await adminClient
        .from('perfis')
        .upsert({ id: data.user.id, email, nome, role })
      if (profileError) throw profileError

      return new Response(JSON.stringify({ user: data.user }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    if (action === 'update') {
      const updates: Record<string, unknown> = {}
      if (email) updates.email = email
      if (password) updates.password = password
      if (nome || role) updates.user_metadata = { nome, role }

      const { data, error } = await adminClient.auth.admin.updateUserById(userId, updates)
      if (error) throw error

      const profileUpdates: Record<string, unknown> = { id: userId }
      if (email) profileUpdates.email = email
      if (nome) profileUpdates.nome = nome
      if (role) profileUpdates.role = role

      const { error: profileError } = await adminClient
        .from('perfis')
        .upsert(profileUpdates)
      if (profileError) throw profileError

      return new Response(JSON.stringify({ user: data.user }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    if (action === 'delete') {
      const { error } = await adminClient.auth.admin.deleteUser(userId)
      if (error) throw error

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    if (action === 'list') {
      const { data, error } = await adminClient.auth.admin.listUsers()
      if (error) throw error

      return new Response(JSON.stringify({ users: data.users }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    return new Response(JSON.stringify({ error: 'Ação inválida' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 401,
    })
  }
})
