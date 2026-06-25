import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, corsHeaders as buildCors } from "../_shared/auth.ts";

// Chave do Anthropic guardada como secret no servidor — nunca chega ao browser.
// Configure com: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

type ItemCatalogo = { id: string; codigo_jiva: string; nome: string };

function montarPrompt(catalogo: ItemCatalogo[]): string {
  const lista = catalogo
    .map((p) => `${p.codigo_jiva} - ${p.nome}`)
    .join("\n");

  return (
    "Analise este pedido/documento e extraia os itens solicitados.\n" +
    "Para cada item encontrado, tente identificar o produto correspondente " +
    "no catálogo abaixo usando o código ou nome mais similar.\n\n" +
    "CATÁLOGO DE PRODUTOS:\n" +
    lista +
    "\n\nRetorne APENAS um JSON array com objetos:\n" +
    "{\n" +
    '  nome_produto: string | null,  (nome como aparece no pedido)\n' +
    '  codigo: string | null,        (código como aparece no pedido)\n' +
    '  quantidade: number | null,\n' +
    '  preco_unitario: number | null,\n' +
    '  produto_id: string | null,    (id do produto do catálogo, se encontrou match)\n' +
    '  codigo_jiva: string | null    (codigo_jiva do catálogo, se encontrou match)\n' +
    "}\n" +
    "Retorne APENAS o JSON array, sem texto adicional."
  );
}

serve(async (req) => {
  const ch = buildCors(req);

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: ch });
  }

  const auth = await authenticate(req, ["vendedor", "gestora", "faturamento", "admin"]);
  if (!auth.ok) {
    return json({ error: auth.message }, auth.status);
  }

  if (!ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY não configurada");
    return json({ error: "Extração indisponível no momento." }, 500);
  }

  try {
    const { base64, mediaType, text, catalogo } = await req.json();
    const catalogoSeguro: ItemCatalogo[] = Array.isArray(catalogo) ? catalogo : [];

    // Monta o bloco de conteúdo: texto puro (Excel/CSV), imagem ou PDF.
    let contentBlock:
      | { type: "text"; text: string }
      | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
      | { type: "document"; source: { type: "base64"; media_type: string; data: string } };

    if (typeof text === "string" && text.trim()) {
      // Planilha já convertida para CSV/texto no cliente.
      contentBlock = { type: "text", text };
    } else if (typeof base64 === "string" && base64 && typeof mediaType === "string") {
      // Imagem -> bloco image; PDF -> bloco document. Ambos via base64.
      contentBlock = mediaType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
        : { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };
    } else {
      return json({ error: "Arquivo inválido." }, 400);
    }

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
            content: [contentBlock, { type: "text", text: montarPrompt(catalogoSeguro) }],
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
    const respText: string = Array.isArray(data?.content)
      ? data.content
          .filter((b: { type?: string }) => b?.type === "text")
          .map((b: { text?: string }) => b.text ?? "")
          .join("")
      : "";

    // Extrai o array JSON da resposta (o modelo pode envolver em texto/markdown).
    let itens: unknown = [];
    try {
      const inicio = respText.indexOf("[");
      const fim = respText.lastIndexOf("]");
      itens = inicio >= 0 && fim > inicio ? JSON.parse(respText.slice(inicio, fim + 1)) : [];
    } catch (e) {
      console.error("Falha ao parsear JSON da extração:", e, respText);
      itens = [];
    }

    return json({ itens });
  } catch (e) {
    console.error("extrair-pedido erro:", e);
    return json({ error: "Erro interno ao extrair pedido." }, 500);
  }
});
