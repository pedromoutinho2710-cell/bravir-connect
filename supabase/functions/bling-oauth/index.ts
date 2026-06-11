import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLIENT_ID = Deno.env.get("BLING_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("BLING_CLIENT_SECRET")!;
const REDIRECT_URI = "https://bravir-connect.vercel.app/admin/bling-callback";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  const action = new URL(req.url).searchParams.get("action") ?? req.headers.get("x-action");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const body = req.method === "POST" ? await req.json() : {};
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-action",
  };

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const basicAuth = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);

  if (action === "token") {
    const res = await fetch("https://www.bling.com.br/Api/v3/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: body.code,
        redirect_uri: REDIRECT_URI,
      }),
    });
    const data = await res.json();
    if (!data.access_token) return new Response(JSON.stringify({ error: data }), { status: 400, headers: cors });
    await supabase.from("bling_tokens").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("bling_tokens").insert({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    });
    return new Response(JSON.stringify({ success: true }), { headers: cors });
  }

  if (action === "refresh") {
    const { data: tokenRow } = await supabase.from("bling_tokens").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!tokenRow) return new Response(JSON.stringify({ error: "no token" }), { status: 401, headers: cors });
    const res = await fetch("https://www.bling.com.br/Api/v3/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokenRow.refresh_token,
      }),
    });
    const data = await res.json();
    if (!data.access_token) return new Response(JSON.stringify({ error: data }), { status: 400, headers: cors });
    await supabase.from("bling_tokens").update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", tokenRow.id);
    return new Response(JSON.stringify({ access_token: data.access_token }), { headers: cors });
  }

  if (action === "vendas") {
    let { data: tokenRow } = await supabase.from("bling_tokens").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!tokenRow) return new Response(JSON.stringify({ error: "não conectado" }), { status: 401, headers: cors });
    if (new Date(tokenRow.expires_at) < new Date()) {
      const refreshRes = await fetch(`${SUPABASE_URL}/functions/v1/bling-oauth?action=refresh`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}` },
      });
      const refreshData = await refreshRes.json();
      tokenRow = { ...tokenRow, access_token: refreshData.access_token };
    }
    const { dataInicial, dataFinal } = body;
    let pagina = 1;
    const todos: any[] = [];
    while (true) {
      // Bling API v3 espera datas no formato DD/MM/YYYY
      const fmtBling = (iso: string) => {
        const [y, m, d] = iso.split("-");
        return `${d}/${m}/${y}`;
      };
      const res = await fetch(`https://www.bling.com.br/Api/v3/pedidos/vendas?pagina=${pagina}&limite=100&dataInicial=${fmtBling(dataInicial)}&dataFinal=${fmtBling(dataFinal)}`, {
        headers: { "Authorization": `Bearer ${tokenRow.access_token}` },
      });
      const data = await res.json();
      const itens = data?.data ?? [];
      todos.push(...itens);
      if (itens.length < 100) break;
      pagina++;
    }
    return new Response(JSON.stringify({ data: todos }), { headers: cors });
  }

  return new Response(JSON.stringify({ error: "action inválida" }), { status: 400, headers: cors });
});
