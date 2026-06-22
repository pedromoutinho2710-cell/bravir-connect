import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, corsHeaders as buildCors } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Secrets do servidor — nunca chegam ao browser.
//   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   npx supabase secrets set GITHUB_TOKEN=ghp_...
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Injetados automaticamente pela plataforma; usados para identificar o chamador
// automatizado (cron do GitHub Actions), que não envia um JWT de usuário.
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const GITHUB_OWNER = Deno.env.get("GITHUB_OWNER") ?? "pedromoutinho2710-cell";
const GITHUB_REPO = Deno.env.get("GITHUB_REPO") ?? "bravir-connect";
const GITHUB_API = "https://api.github.com";

const corsHeaders = buildCors();

// Service role: a função lê/grava solicitações ignorando RLS.
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Arquivos críticos da plataforma que o monitor sempre analisa.
const ARQUIVOS_CRITICOS = [
  "src/pages/Faturamento.tsx",
  "src/hooks/useNovoPedido.ts",
  "src/components/pedido/SecaoProdutos.tsx",
  "src/pages/vendedor/MeuPainel.tsx",
];

// Limites para não estourar o contexto da IA.
const MAX_CHARS_ARQUIVO = 45000;
const MAX_CHARS_FUNCAO = 18000;
const MAX_PROBLEMAS_CRIADOS = 10;

type Problema = {
  titulo: string;
  descricao: string;
  categoria: string; // bug | risco | performance | seguranca
  arquivo: string;
  prioridade: string; // alta | normal
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// GitHub (leitura)
// ---------------------------------------------------------------------------

function ghHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "bravir-connect-agente-monitor",
    ...extra,
  };
}

function ghFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: ghHeaders((init.headers as Record<string, string>) ?? {}),
  });
}

async function ghJson(path: string, ctx: string): Promise<unknown> {
  const res = await ghFetch(path);
  if (!res.ok) {
    throw new Error(`GitHub ${ctx} (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// Lê o conteúdo de um arquivo na branch padrão. Retorna null se não existir.
async function lerArquivo(path: string): Promise<string | null> {
  const res = await ghFetch(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodePath(path)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub contents ${path} (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { content?: string } | unknown[];
  if (Array.isArray(data)) return null;
  const content = (data as { content?: string }).content;
  return typeof content === "string" ? decodeBase64Utf8(content) : "";
}

// Lista os arquivos de Edge Functions (supabase/functions/**) do repositório.
async function listarFuncoes(): Promise<string[]> {
  try {
    const repo = (await ghJson(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}`, "repo")) as {
      default_branch?: string;
    };
    const base = repo.default_branch ?? "main";
    const tree = (await ghJson(
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees/${base}?recursive=1`,
      "tree",
    )) as { tree?: Array<{ path?: string; type?: string }> };
    return (tree.tree ?? [])
      .filter((t) => t.type === "blob" && typeof t.path === "string")
      .map((t) => t.path as string)
      .filter((p) => p.startsWith("supabase/functions/") && p.endsWith(".ts"));
  } catch (e) {
    console.error("listarFuncoes falhou:", e);
    return [];
  }
}

function cortar(conteudo: string, max: number): string {
  return conteudo.length > max ? conteudo.slice(0, max) + "\n/* …truncado… */" : conteudo;
}

// ---------------------------------------------------------------------------
// Claude
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Você é um engenheiro de software sênior fazendo auditoria de código do Bravir Connect, um sistema interno de gestão comercial.
Stack: React 18 + TypeScript + Vite + shadcn/ui + TanStack Query v5 + React Router v6 + Supabase (Postgres, RLS, Edge Functions). UI em português do Brasil.

Sua tarefa: revisar os arquivos fornecidos e identificar PROBLEMAS REAIS e ACIONÁVEIS, classificados em:
- bug: comportamento incorreto já presente no código.
- risco: armadilha que pode causar bug no futuro (ex.: query sem limite/paginação, dependências de hook erradas, falta de tratamento de erro, condição de corrida).
- performance: renders desnecessários, queries N+1, cálculos pesados sem memo, listas grandes sem virtualização.
- seguranca: vazamento de dado, RLS contornável, segredo exposto, falta de validação de entrada, RPC privilegiada chamada de superfície pública.

Regras:
- Reporte apenas problemas concretos que você consegue justificar a partir do código mostrado. Não invente.
- Seja específico: aponte o arquivo, o trecho/sintoma e a correção sugerida na descrição.
- Evite duplicatas e itens vagos. Priorize os mais importantes (no máximo 10).
- Responda SOMENTE com um único objeto JSON válido, sem markdown, sem texto antes ou depois.`;

function montarPrompt(arquivos: Array<{ path: string; conteudo: string }>): string {
  const blocos = arquivos
    .map((a) => `### ${a.path}\n\`\`\`\n${a.conteudo}\n\`\`\``)
    .join("\n\n");
  return [
    "Analise os arquivos abaixo do repositório bravir-connect.",
    "",
    blocos,
    "",
    "Responda APENAS com este JSON (sem markdown):",
    "{",
    '  "problemas": [',
    "    {",
    '      "titulo": "título curto e específico (até 80 caracteres)",',
    '      "descricao": "sintoma + por que é problema + correção sugerida",',
    '      "categoria": "bug" | "risco" | "performance" | "seguranca",',
    '      "arquivo": "caminho/do/arquivo",',
    '      "prioridade": "alta" | "normal"',
    "    }",
    "  ]",
    "}",
  ].join("\n");
}

function parseProblemas(texto: string): Problema[] {
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) throw new Error("A IA não retornou um JSON válido.");
  const obj = JSON.parse(texto.slice(inicio, fim + 1)) as { problemas?: unknown };
  const lista = Array.isArray(obj.problemas) ? obj.problemas : [];
  return lista
    .filter(
      (p): p is Record<string, unknown> =>
        !!p && typeof (p as { titulo?: unknown }).titulo === "string",
    )
    .map((p) => ({
      titulo: String(p.titulo).slice(0, 120),
      descricao: typeof p.descricao === "string" ? p.descricao : "",
      categoria: typeof p.categoria === "string" ? p.categoria : "bug",
      arquivo: typeof p.arquivo === "string" ? p.arquivo : "",
      prioridade: p.prioridade === "normal" ? "normal" : "alta",
    }));
}

async function analisarComIA(arquivos: Array<{ path: string; conteudo: string }>): Promise<Problema[]> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: montarPrompt(arquivos) }],
    }),
  });

  if (!res.ok) {
    console.error("Anthropic error:", res.status, await res.text());
    throw new Error("Falha ao consultar a IA.");
  }

  const data = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
  const texto = Array.isArray(data.content)
    ? data.content.filter((b) => b?.type === "text").map((b) => b.text ?? "").join("")
    : "";
  return parseProblemas(texto);
}

// ---------------------------------------------------------------------------
// Deduplicação por título similar
// ---------------------------------------------------------------------------

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(normalizar(s).split(" ").filter((t) => t.length > 2));
}

// Considera dois títulos "similares" por igualdade, contenção ou alta sobreposição
// de tokens (Jaccard ≥ 0.6) — evita recriar uma solicitação já aberta.
function tituloSimilar(a: string, b: string): boolean {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return false;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const uniao = new Set([...ta, ...tb]).size;
  return inter / uniao >= 0.6;
}

// ---------------------------------------------------------------------------
// Autenticação: aceita JWT de usuário (botão da UI) OU o chamador automatizado
// (cron do GitHub Actions, que envia a anon/service key — rejeitada por getUser).
// ---------------------------------------------------------------------------

function ehChamadorAutomatizado(req: Request): boolean {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return false;
  return (!!ANON_KEY && token === ANON_KEY) || (!!SERVICE_ROLE_KEY && token === SERVICE_ROLE_KEY);
}

// ---------------------------------------------------------------------------
// Criação de solicitações
// ---------------------------------------------------------------------------

// Cria solicitações para os problemas novos (sem similar já aberta). Reutilizado
// pelo fluxo automático (cron) e pela aprovação do plano de ação na UI.
async function criarSolicitacoes(
  problemas: Problema[],
): Promise<{ criados: Problema[]; ignorados: Problema[] }> {
  // Carrega solicitações abertas para deduplicar por título.
  const { data: abertas } = await supabase
    .from("solicitacoes_gestor")
    .select("titulo, descricao")
    .eq("status", "aberto")
    .is("deleted_at", null);
  const titulosAbertos = ((abertas ?? []) as Array<{ titulo: string | null; descricao: string | null }>)
    .map((s) => s.titulo || (s.descricao ?? "").slice(0, 80))
    .filter(Boolean);

  const criados: Problema[] = [];
  const ignorados: Problema[] = [];
  for (const p of problemas) {
    if (criados.length >= MAX_PROBLEMAS_CRIADOS) {
      ignorados.push(p);
      continue;
    }
    const jaExiste = titulosAbertos.some((t) => tituloSimilar(t, p.titulo));
    if (jaExiste) {
      ignorados.push(p);
      continue;
    }

    const descricao = [
      `[${p.categoria}] ${p.arquivo}`.trim(),
      "",
      p.descricao,
      "",
      "_Detectado automaticamente pelo Agente Monitor._",
    ].join("\n");

    const { error } = await supabase.from("solicitacoes_gestor").insert({
      tipo: "bug",
      titulo: p.titulo,
      descricao,
      criado_por: null,
      criado_por_nome: "Agente Monitor",
      status: "aberto",
      prioridade: p.prioridade === "normal" ? "normal" : "alta",
      tela: p.arquivo || null,
    });
    if (error) {
      console.error("Falha ao criar solicitação:", error.message);
      ignorados.push(p);
      continue;
    }
    criados.push(p);
    // Inclui o título recém-criado no conjunto para deduplicar dentro do mesmo run.
    titulosAbertos.push(p.titulo);
  }
  return { criados, ignorados };
}

// Sanitiza a lista de problemas recebida do cliente (aprovação do plano de ação).
function sanitizarProblemas(raw: unknown): Problema[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (p): p is Record<string, unknown> =>
        !!p && typeof (p as { titulo?: unknown }).titulo === "string",
    )
    .map((p) => ({
      titulo: String(p.titulo).slice(0, 120),
      descricao: typeof p.descricao === "string" ? p.descricao : "",
      categoria: typeof p.categoria === "string" ? p.categoria : "bug",
      arquivo: typeof p.arquivo === "string" ? p.arquivo : "",
      prioridade: p.prioridade === "normal" ? "normal" : "alta",
    }));
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!ehChamadorAutomatizado(req)) {
    const auth = await authenticate(req, null);
    if (!auth.ok) return json({ error: auth.message }, auth.status);
  }

  if (!ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY não configurada");
    return json({ error: "Monitor indisponível: ANTHROPIC_API_KEY não configurada." }, 500);
  }
  if (!GITHUB_TOKEN) {
    console.error("GITHUB_TOKEN não configurado");
    return json({ error: "Monitor indisponível: GITHUB_TOKEN não configurado." }, 500);
  }

  // Body opcional. O cron (GitHub Actions) chama sem body (analisa + cria).
  //   { dry_run: true }      → apenas detecta e devolve o plano de ação.
  //   { criar: Problema[] }  → cria as solicitações já revisadas (aprovação do plano).
  let body: { dry_run?: boolean; criar?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    // Aprovação do plano de ação: cria as solicitações já revisadas, sem nova
    // chamada à IA nem leitura do repositório.
    if (Array.isArray(body.criar)) {
      const problemas = sanitizarProblemas(body.criar);
      const { criados, ignorados } = await criarSolicitacoes(problemas);
      return json({
        ok: true,
        encontrados: problemas.length,
        criados: criados.length,
        ignorados: ignorados.length,
        problemas,
      });
    }

    // 1. Lê os arquivos críticos + as Edge Functions.
    const arquivos: Array<{ path: string; conteudo: string }> = [];
    for (const path of ARQUIVOS_CRITICOS) {
      try {
        const conteudo = await lerArquivo(path);
        if (conteudo !== null) arquivos.push({ path, conteudo: cortar(conteudo, MAX_CHARS_ARQUIVO) });
      } catch (e) {
        console.error("Falha ao ler", path, e);
      }
    }
    const funcoes = await listarFuncoes();
    for (const path of funcoes) {
      try {
        const conteudo = await lerArquivo(path);
        if (conteudo !== null) arquivos.push({ path, conteudo: cortar(conteudo, MAX_CHARS_FUNCAO) });
      } catch (e) {
        console.error("Falha ao ler", path, e);
      }
    }

    if (!arquivos.length) {
      return json({ error: "Nenhum arquivo pôde ser lido do repositório." }, 502);
    }

    // 2. Analisa com a IA.
    const problemas = await analisarComIA(arquivos);

    // dry_run: devolve só o plano de ação para revisão na UI, sem criar nada.
    if (body.dry_run) {
      return json({
        ok: true,
        dry_run: true,
        analisados: arquivos.map((a) => a.path),
        encontrados: problemas.length,
        problemas,
      });
    }

    // 3. Fluxo automático: cria solicitações para os problemas novos.
    const { criados, ignorados } = await criarSolicitacoes(problemas);

    return json({
      ok: true,
      analisados: arquivos.map((a) => a.path),
      encontrados: problemas.length,
      criados: criados.length,
      ignorados: ignorados.length,
      problemas,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("agente-monitor erro:", msg);
    return json({ error: "Falha no monitor: " + msg }, 500);
  }
});
