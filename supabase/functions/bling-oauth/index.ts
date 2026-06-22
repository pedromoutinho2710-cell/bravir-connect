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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { action, code, state } = await req.json();

    const BLING_CLIENT_ID = Deno.env.get("BLING_CLIENT_ID") ?? "";
    const BLING_CLIENT_SECRET = Deno.env.get("BLING_CLIENT_SECRET") ?? "";
    const BLING_REDIRECT_URI = Deno.env.get("BLING_REDIRECT_URI") ?? "";

    if (action === "authorize") {
      const params = new URLSearchParams({
        response_type: "code",
        client_id: BLING_CLIENT_ID,
        redirect_uri: BLING_REDIRECT_URI,
        state: state ?? "",
      });
      const url = `https://www.bling.com.br/Api/v3/oauth/authorize?${params.toString()}`;
      return new Response(JSON.stringify({ url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "callback") {
      const credentials = btoa(`${BLING_CLIENT_ID}:${BLING_CLIENT_SECRET}`);
      const tokenRes = await fetch("https://www.bling.com.br/Api/v3/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${credentials}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: BLING_REDIRECT_URI,
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        throw new Error(`Bling token error: ${err}`);
      }

      const data = await tokenRes.json();

      const expiresAt = new Date(
        Date.now() + (data.expires_in ?? 21600) * 1000
      ).toISOString();

      const { error: upsertError } = await supabase
        .from("bling_tokens")
        .upsert(
          {
            id: 1,
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: expiresAt,
          },
          { onConflict: "id" }
        );

      if (upsertError) throw upsertError;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "refresh") {
      const { data: tokenRow, error: fetchError } = await supabase
        .from("bling_tokens")
        .select("refresh_token")
        .eq("id", 1)
        .single();

      if (fetchError || !tokenRow) throw new Error("Token de refresh não encontrado");

      const credentials = btoa(`${BLING_CLIENT_ID}:${BLING_CLIENT_SECRET}`);
      const tokenRes = await fetch("https://www.bling.com.br/Api/v3/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${credentials}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokenRow.refresh_token,
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        throw new Error(`Bling refresh error: ${err}`);
      }

      const data = await tokenRes.json();

      const expiresAt = new Date(
        Date.now() + (data.expires_in ?? 21600) * 1000
      ).toISOString();

      const { error: upsertError } = await supabase
        .from("bling_tokens")
        .upsert(
          {
            id: 1,
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: expiresAt,
          },
          { onConflict: "id" }
        );

      if (upsertError) throw upsertError;

      // Retorna apenas confirmação de sucesso — o access_token NÃO é enviado ao cliente.
      // O token já foi salvo no banco e será utilizado exclusivamente server-side.
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("bling-oauth error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
