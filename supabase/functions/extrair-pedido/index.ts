import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Chave do Anthropic guardada como secret no servidor — nunca chega ao browser.
// Configure com: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPT_EXTRACAO =
  "Analise este pedido e extraia os itens. Para cada item retorne " +
  "um JSON array com objetos {nome_produto, codigo, quantidade, " +
  "preco_unitario}. Se não encontrar algum campo deixe null. " +
  "Retorne APENAS o JSON array, sem texto adicional.";

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
    return json({ error: "Extração indisponível no momento." }, 500);
  }

  try {
    const { base64, mediaType } = await req.json();

    if (typeof base64 !== "string" || !base64 || typeof mediaType !== "string") {
      return json({ error: "Arquivo inválido." }, 400);
    }

    // Imagem -> bloco image; PDF -> bloco document. Ambos via base64.
    const fileBlock = mediaType === "application/pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
        }
      : {
          type: "image",
          source: { type: "base64", media_type: mediaType, data: base64 },
        };

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [fileBlock, { type: "text", text: PROMPT_EXTRACAO }],
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Anthropic error:", res.status, err);
      return json({ error: "Falha ao analisar o arquivo." }, 502);
    }

    const data = await res.json();
    const text: string = Array.isArray(data?.content)
      ? data.content
          .filter((b: { type?: string }) => b?.type === "text")
          .map((b: { text?: string }) => b.text ?? "")
          .join("")
      : "";

    // Extrai o array JSON da resposta (o modelo pode envolver em texto/markdown).
    let itens: unknown = [];
    try {
      const inicio = text.indexOf("[");
      const fim = text.lastIndexOf("]");
      itens = inicio >= 0 && fim > inicio ? JSON.parse(text.slice(inicio, fim + 1)) : [];
    } catch (e) {
      console.error("Falha ao parsear JSON da extração:", e, text);
      itens = [];
    }

    return json({ itens });
  } catch (e) {
    console.error("extrair-pedido erro:", e);
    return json({ error: "Erro interno ao extrair pedido." }, 500);
  }
});
