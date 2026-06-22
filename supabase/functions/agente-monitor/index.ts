import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.27.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

/**
 * Verifica se a requisição vem de um chamador automatizado (cron/server-side).
 * Aceita APENAS o header customizado X-Cron-Secret comparado à variável de
 * ambiente CRON_SECRET. A anon key e a service role key NÃO são aceitas aqui
 * para evitar que clientes públicos acionem a função sem autenticação real.
 */
function ehChamadorAutomatizado(req: Request): boolean {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    // Se o secret não estiver configurado, bloqueia chamadas automatizadas
    // para evitar acesso não autenticado por omissão.
    return false;
  }
  const headerSecret = req.headers.get("x-cron-secret");
  return (
    typeof headerSecret === "string" &&
    headerSecret.length > 0 &&
    headerSecret === cronSecret
  );
}

async function verificarAdmin(
  req: Request,
  supabase: ReturnType<typeof createClient>
): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return false;
  const { data: perfil } = await supabase
    .from("usuarios")
    .select("role")
    .eq("id", user.id)
    .single();
  return perfil?.role === "admin";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Autorização: aceita chamador automatizado via X-Cron-Secret
    // OU usuário admin autenticado via JWT.
    const automatizado = ehChamadorAutomatizado(req);
    if (!automatizado) {
      const admin = await verificarAdmin(req, supabase);
      if (!admin) {
        return new Response(
          JSON.stringify({ error: "Não autorizado" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    const anthropic = new Anthropic({ apiKey: anthropicKey });

    // Buscar solicitações pendentes para monitorar
    const { data: solicitacoes, error: errSolicitacoes } = await supabase
      .from("solicitacoes")
      .select(
        `id, titulo, descricao, status, criado_em, criado_por_nome,
         tipo, prioridade, gestor_notas, agente_ia_resposta`
      )
      .in("status", ["aberta", "em_analise"])
      .order("criado_em", { ascending: false })
      .limit(50);

    if (errSolicitacoes) {
      console.error("Erro ao buscar solicitações:", errSolicitacoes);
      return new Response(
        JSON.stringify({ error: "Erro ao buscar solicitações" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!solicitacoes || solicitacoes.length === 0) {
      return new Response(
        JSON.stringify({ message: "Nenhuma solicitação pendente", processadas: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resumoSolicitacoes = solicitacoes
      .map(
        (s) =>
          `ID: ${s.id} | Título: ${s.titulo} | Status: ${s.status} | ` +
          `Tipo: ${s.tipo} | Prioridade: ${s.prioridade} | ` +
          `Criado por: ${s.criado_por_nome} | ` +
          `Descrição: ${(s.descricao || "").substring(0, 200)}`
      )
      .join("\n");

    const promptMonitor = `Você é o Agente Monitor do Bravir Connect, um sistema interno de gestão comercial.

Analise as seguintes solicitações abertas e forneça:
1. Um resumo executivo do estado atual das solicitações
2. Identificação de padrões ou problemas recorrentes
3. Priorização recomendada
4. Alertas sobre solicitações críticas ou urgentes
5. Sugestões de ação imediata

Solicitações abertas:
${resumoSolicitacoes}

Responda em português do Brasil, de forma concisa e acionável.`;

    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: promptMonitor }],
    });

    const analise =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Registrar a análise do monitor
    const { error: errInsert } = await supabase
      .from("agente_ia_logs")
      .insert({
        tipo: "monitor",
        input: { solicitacoes_count: solicitacoes.length, modo: automatizado ? "cron" : "manual_admin" },
        output: analise,
        tokens_usados: message.usage.input_tokens + message.usage.output_tokens,
      });

    if (errInsert) {
      console.error("Erro ao registrar log do monitor:", errInsert);
    }

    return new Response(
      JSON.stringify({
        analise,
        solicitacoes_analisadas: solicitacoes.length,
        tokens_usados: message.usage.input_tokens + message.usage.output_tokens,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Erro no agente-monitor:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
