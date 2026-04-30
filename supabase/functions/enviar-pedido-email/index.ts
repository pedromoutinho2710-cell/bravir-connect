import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { pedido_id, docx_base64, filename } = await req.json();

    if (!pedido_id || !docx_base64 || !filename) {
      return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send email via Resend
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "pedidos@bravir.com.br",
        to: ["leticia.martins@bravir.com.br"],
        cc: ["bruna.silva@bravir.com.br", "claudia.araujo@bravir.com.br"],
        subject: `Novo pedido recebido: ${filename}`,
        html: `<p>Um novo pedido foi enviado para faturamento.</p><p>Arquivo: <strong>${filename}</strong></p>`,
        attachments: [{ filename, content: docx_base64 }],
      }),
    });

    if (!emailRes.ok) {
      const err = await emailRes.text();
      console.error("Resend error:", err);
    }

    // Insert notification for the vendedor
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: pedido } = await supabase
      .from("pedidos")
      .select("vendedor_id, numero_pedido")
      .eq("id", pedido_id)
      .single();

    if (pedido) {
      await supabase.from("notificacoes").insert({
        user_id: pedido.vendedor_id,
        pedido_id,
        mensagem: `Pedido #${pedido.numero_pedido} enviado para faturamento`,
        lida: false,
        destinatario_role: "faturamento",
        tipo: "pedido_recebido",
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
