import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Chave do Anthropic guardada como secret no servidor — nunca chega ao browser.
// Configure com: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é o assistente interno do Bravir CRM, plataforma B2B da Bravir Industrial (marcas: Bravir, Alivik, Bendita Cânfora, Laby, Tattoo do Bem). Ajude colaboradores com dúvidas sobre o sistema, colete bugs e sugestões.

CLASSIFICAÇÃO:
- duvida: responda diretamente, não salva no banco
- bug: colete tela afetada + o que aconteceu + o que era esperado
- sugestao: colete contexto e benefício
- melhoria: colete o que existe hoje e como poderia melhorar

Quando tiver informação suficiente para bug/sugestao/melhoria, inclua ao final da resposta um JSON assim (sem markdown):
REGISTRO:{"tipo":"bug"|"nova"|"altera","titulo":"título curto em até 8 palavras","tela":"nome da tela","descricao":"descrição completa","motivo":"por que é importante","prioridade":"alta"|"normal","mockup_prompt":"descreva em 1 frase o que deveria aparecer no mockup visual desta melhoria"}

Módulos do CRM: Novo Pedido, Meus Pedidos, Faturamento, Logística, Clientes, Meu Pipeline, Relatórios, Gestão do Time, Solicitações.
Seja direto, amigável, em português brasileiro.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY não configurada");
    return json({ error: "Assistente indisponível no momento." }, 500);
  }

  try {
    const { messages } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "Mensagens inválidas." }, 400);
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content ?? ""),
        })),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Anthropic error:", res.status, err);
      return json({ error: "Falha ao consultar o assistente." }, 502);
    }

    const data = await res.json();
    const text: string =
      Array.isArray(data?.content)
        ? data.content.filter((b: { type?: string }) => b?.type === "text").map((b: { text?: string }) => b.text ?? "").join("")
        : "";

    return json({ text });
  } catch (e) {
    console.error("agente-chat erro:", e);
    return json({ error: "Erro interno do assistente." }, 500);
  }
});
