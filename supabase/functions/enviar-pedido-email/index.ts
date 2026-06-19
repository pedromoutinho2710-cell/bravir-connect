import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, corsHeaders } from "../_shared/auth.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const cors = corsHeaders();

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  // Apenas quem cria pedidos pode disparar o email/notificações.
  const auth = await authenticate(req, ["vendedor", "gestora", "admin"]);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.message }), {
      status: auth.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const { pedido_id, docx_base64, filename } = await req.json();

    if (!pedido_id || !docx_base64 || !filename) {
      return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Acompanha falhas parciais para devolver um status não-2xx ao final,
    // garantindo que o caller (useNovoPedido) não reporte sucesso completo.
    let emailFalhou = false;
    let notificacoesFalharam = false;

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
      emailFalhou = true;
      console.error("Resend error: status", emailRes.status);
    }

    // Cria as notificações (responsabilidade única desta função):
    //  - uma para o vendedor que enviou o pedido
    //  - uma para cada usuário de faturamento
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: pedido } = await supabase
      .from("pedidos")
      .select("vendedor_id, numero_pedido")
      .eq("id", pedido_id)
      .single();

    if (pedido) {
      const numero = pedido.numero_pedido;

      let vendedorNome = "vendedor";
      if (pedido.vendedor_id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name, name")
          .eq("id", pedido.vendedor_id)
          .maybeSingle();
        vendedorNome = prof?.full_name ?? prof?.name ?? "vendedor";
      }

      const notifs: Record<string, unknown>[] = [];

      if (pedido.vendedor_id) {
        notifs.push({
          destinatario_id: pedido.vendedor_id,
          destinatario_role: "vendedor",
          tipo: "pedido_recebido",
          pedido_id,
          mensagem: `Pedido #${numero} enviado para faturamento`,
          lida: false,
        });
      }

      const { data: fatRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "faturamento");

      for (const r of fatRoles ?? []) {
        notifs.push({
          destinatario_id: r.user_id,
          destinatario_role: "faturamento",
          tipo: "novo_pedido",
          pedido_id,
          mensagem: `Novo pedido #${numero} de ${vendedorNome}`,
          lida: false,
        });
      }

      if (notifs.length > 0) {
        const { error: notifError } = await supabase.from("notificacoes").insert(notifs);
        if (notifError) {
          notificacoesFalharam = true;
          console.error("notificacoes insert error:", notifError.message);
        }
      }
    }

    // Se o email OU as notificações falharam, devolve um status não-2xx para que
    // o caller exiba o aviso e não reporte que o handoff foi 100% concluído.
    if (emailFalhou || notificacoesFalharam) {
      return new Response(
        JSON.stringify({
          error: "Falha ao enviar email e/ou criar notificações.",
          email_falhou: emailFalhou,
          notificacoes_falharam: notificacoesFalharam,
        }),
        {
          status: 502,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("enviar-pedido-email erro:", err instanceof Error ? err.message : "erro desconhecido");
    return new Response(JSON.stringify({ error: "Erro interno ao enviar pedido." }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
