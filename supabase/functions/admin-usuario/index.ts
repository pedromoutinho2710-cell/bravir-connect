import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json();
    const { acao } = body;

    if (acao === "criar") {
      const { email, senha, full_name, role } = body;
      if (!email || !senha || !full_name || !role) {
        return new Response(JSON.stringify({ error: "Campos obrigatórios: email, senha, full_name, role" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userId = data.user.id;

      await Promise.all([
        supabaseAdmin.from("user_roles").upsert({ user_id: userId, role }, { onConflict: "user_id" }),
        supabaseAdmin.from("profiles").upsert({ id: userId, email, full_name, ativo: true }, { onConflict: "id" }),
      ]);

      return new Response(JSON.stringify({ ok: true, user_id: userId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (acao === "atualizar_role") {
      const { user_id, role } = body;
      await supabaseAdmin.from("user_roles").upsert({ user_id, role }, { onConflict: "user_id" });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (acao === "toggle_ativo") {
      const { user_id, ativo } = body;

      await supabaseAdmin.from("profiles").update({ ativo }).eq("id", user_id);

      if (!ativo) {
        await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "87600h" });
      } else {
        await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "none" });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação desconhecida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
