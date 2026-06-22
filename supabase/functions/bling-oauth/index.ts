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

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { action, code, redirect_uri } = await req.json();

    const clientId = Deno.env.get("BLING_CLIENT_ID") ?? "";
    const clientSecret = Deno.env.get("BLING_CLIENT_SECRET") ?? "";

    if (action === "exchange") {
      // Troca o code pelo access_token + refresh_token
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri,
      });

      const credentials = btoa(`${clientId}:${clientSecret}`);

      const response = await fetch("https://www.bling.com.br/Api/v3/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${credentials}`,
        },
        body: params.toString(),
      });

      const data = await response.json();

      if (!response.ok) {
        return new Response(JSON.stringify({ error: data }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Salva tokens no banco
      const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
      await supabaseClient.from("bling_tokens").upsert({
        id: 1,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "refresh") {
      // Busca o refresh_token atual
      const { data: tokenRow, error: fetchError } = await supabaseClient
        .from("bling_tokens")
        .select("refresh_token")
        .eq("id", 1)
        .single();

      if (fetchError || !tokenRow) {
        return new Response(JSON.stringify({ error: "Token não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const params = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokenRow.refresh_token,
      });

      const credentials = btoa(`${clientId}:${clientSecret}`);

      const response = await fetch("https://www.bling.com.br/Api/v3/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${credentials}`,
        },
        body: params.toString(),
      });

      const data = await response.json();

      if (!response.ok) {
        return new Response(JSON.stringify({ error: data }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Atualiza tokens no banco
      const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
      await supabaseClient.from("bling_tokens").upsert({
        id: 1,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      });

      // Retorna apenas confirmação de sucesso — o access_token NÃO deve ser exposto ao cliente
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Action inválida" }), {
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
