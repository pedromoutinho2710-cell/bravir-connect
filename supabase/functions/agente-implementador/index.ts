import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, corsHeaders as buildCors } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Secrets do servidor — nunca chegam ao browser.
// Configure com:
//   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   npx supabase secrets set GITHUB_TOKEN=ghp_...
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Repositório alvo (pode ser sobrescrito por secret, mas tem default do projeto).
const GITHUB_OWNER = Deno.env.get("GITHUB_OWNER") ?? "pedromoutinho2710-cell";
const GITHUB_REPO = Deno.env.get("GITHUB_REPO") ?? "bravir-connect";
const GITHUB_API = "https://api.github.com";

// Vercel — usado no modo "aprovar" para aguardar o deploy e testar a produção.
// Configure com: npx supabase secrets set VERCEL_TOKEN=...
const VERCEL_TOKEN = Deno.env.get("VERCEL_TOKEN") ?? "";
const VERCEL_PROJECT = Deno.env.get("VERCEL_PROJECT") ?? "bravir-connect";
const VERCEL_TEAM_ID = Deno.env.get("VERCEL_TEAM_ID") ?? "";
const PROD_URL = (Deno.env.get("PROD_URL") ?? "https://bravir-connect.vercel.app").replace(/\/$/, "");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const corsHeaders = buildCors();

// Cliente com service role: a função grava o resultado na solicitação ignorando RLS.
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Estrutura retornada pela IA (e persistida em solicitacoes_gestor.agente_mudancas).
type ArquivoMudanca = { path: string; acao: string; conteudo: string };
type Resultado = {
  resumo: string;
  plano: string[];
  arquivos: ArquivoMudanca[];
  titulo_pr?: string;
  mensagem_commit?: string;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

function ghHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    // A API do GitHub exige um User-Agent; sem ele responde 403.
    "User-Agent": "bravir-connect-agente",
    ...extra,
  };
}

function ghFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: ghHeaders((init.headers as Record<string, string>) ?? {}),
  });
}

// Faz a chamada e devolve o JSON, lançando erro descritivo em caso de falha.
async function ghJson(path: string, init: RequestInit, ctx: string): Promise<unknown> {
  const res = await ghFetch(path, init);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub ${ctx} (${res.status}): ${txt.slice(0, 300)}`);
  }
  return res.json();
}

// Caminho com barras preservadas (cada segmento é escapado individualmente).
function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function decodeBase64Utf8(b64: string): string {
  const limpo = b64.replace(/\s/g, "");
  const bin = atob(limpo);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// Lê o conteúdo de um arquivo na branch padrão. Retorna null se não existir (404) ou for diretório.
async function lerArquivo(path: string): Promise<string | null> {
  const res = await ghFetch(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodePath(path)}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub contents ${path} (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { content?: string } | unknown[];
  if (Array.isArray(data)) return null; // é um diretório
  const content = (data as { content?: string }).content;
  return typeof content === "string" ? decodeBase64Utf8(content) : "";
}

// Lista os caminhos de arquivos do repo (src/ e supabase/) para dar contexto à IA.
async function listarArquivos(): Promise<string[]> {
  try {
    const repo = (await ghJson(
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}`,
      {},
      "repo",
    )) as { default_branch?: string };
    const base = repo.default_branch ?? "main";
    const tree = (await ghJson(
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees/${base}?recursive=1`,
      {},
      "tree",
    )) as { tree?: Array<{ path?: string; type?: string }> };
    const paths = (tree.tree ?? [])
      .filter((t) => t.type === "blob" && typeof t.path === "string")
      .map((t) => t.path as string)
      .filter((p) => p.startsWith("src/") || p.startsWith("supabase/"));
    return paths.slice(0, 500);
  } catch (e) {
    console.error("listarArquivos falhou:", e);
    return [];
  }
}

// Cria branch, commit (Git Data API) e abre o Pull Request.
async function abrirPullRequest(
  arquivos: ArquivoMudanca[],
  tituloPr: string,
  mensagemCommit: string,
  corpoPr: string,
): Promise<{ pr_url: string; pr_number: number; branch: string }> {
  const repo = (await ghJson(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}`, {}, "repo")) as {
    default_branch?: string;
  };
  const base = repo.default_branch ?? "main";

  const ref = (await ghJson(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/ref/heads/${base}`,
    {},
    "ref base",
  )) as { object?: { sha?: string } };
  const baseSha = ref.object?.sha;
  if (!baseSha) throw new Error("Não foi possível obter o SHA da branch base.");

  const baseCommit = (await ghJson(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits/${baseSha}`,
    {},
    "commit base",
  )) as { tree?: { sha?: string } };
  const baseTreeSha = baseCommit.tree?.sha;
  if (!baseTreeSha) throw new Error("Não foi possível obter a tree da branch base.");

  // Um blob por arquivo alterado.
  const treeItems: Array<{ path: string; mode: string; type: string; sha: string }> = [];
  for (const arq of arquivos) {
    const blob = (await ghJson(
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/blobs`,
      { method: "POST", body: JSON.stringify({ content: arq.conteudo, encoding: "utf-8" }) },
      `blob ${arq.path}`,
    )) as { sha?: string };
    if (!blob.sha) throw new Error(`Falha ao criar blob para ${arq.path}.`);
    treeItems.push({ path: arq.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const novaTree = (await ghJson(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees`,
    { method: "POST", body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }) },
    "tree",
  )) as { sha?: string };
  if (!novaTree.sha) throw new Error("Falha ao criar a tree do commit.");

  const novoCommit = (await ghJson(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits`,
    {
      method: "POST",
      body: JSON.stringify({ message: mensagemCommit, tree: novaTree.sha, parents: [baseSha] }),
    },
    "commit",
  )) as { sha?: string };
  if (!novoCommit.sha) throw new Error("Falha ao criar o commit.");

  const branch = `fix/agente-${Date.now()}`;
  await ghJson(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs`,
    { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: novoCommit.sha }) },
    "branch",
  );

  const pr = (await ghJson(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls`,
    { method: "POST", body: JSON.stringify({ title: tituloPr, head: branch, base, body: corpoPr }) },
    "pull request",
  )) as { html_url?: string; number?: number };
  if (!pr.html_url || typeof pr.number !== "number") {
    throw new Error("PR criado, mas a resposta do GitHub veio incompleta.");
  }

  return { pr_url: pr.html_url, pr_number: pr.number, branch };
}

// Faz o merge (squash) de um PR e devolve o SHA do commit gerado no branch base.
async function mergearPullRequest(prNumber: number): Promise<string> {
  let ultimoErro = "";
  // O GitHub pode levar um instante para calcular a "mergeability" de um PR
  // recém-criado; 405/409 indicam "ainda não mergeável" — tentamos algumas vezes.
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const res = await ghFetch(
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls/${prNumber}/merge`,
      { method: "PUT", body: JSON.stringify({ merge_method: "squash" }) },
    );
    if (res.ok) {
      const data = (await res.json()) as { merged?: boolean; sha?: string };
      if (data.merged && data.sha) return data.sha;
      ultimoErro = "GitHub respondeu sem confirmar o merge.";
    } else {
      ultimoErro = `GitHub merge (${res.status}): ${(await res.text()).slice(0, 200)}`;
      if (res.status !== 405 && res.status !== 409) break;
    }
    await sleep(3000);
  }
  throw new Error(ultimoErro || "Falha ao mergear o PR.");
}

// Abre um PR que reverte um commit de merge (squash) já aplicado no branch base.
// Para um squash, o commit tem um único pai (o estado anterior do main); recriar
// a tree desse pai reverte exatamente o que o merge introduziu.
async function abrirRevertPr(mergeSha: string, tituloOriginal: string): Promise<string> {
  const repo = (await ghJson(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}`, {}, "repo")) as {
    default_branch?: string;
  };
  const base = repo.default_branch ?? "main";

  const mergeCommit = (await ghJson(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits/${mergeSha}`,
    {},
    "commit de merge",
  )) as { parents?: Array<{ sha?: string }> };
  const parentSha = mergeCommit.parents?.[0]?.sha;
  if (!parentSha) throw new Error("Commit de merge sem pai — não é possível reverter.");

  const parentCommit = (await ghJson(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits/${parentSha}`,
    {},
    "commit pai",
  )) as { tree?: { sha?: string } };
  const parentTreeSha = parentCommit.tree?.sha;
  if (!parentTreeSha) throw new Error("Não foi possível obter a tree anterior ao merge.");

  const revertCommit = (await ghJson(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits`,
    {
      method: "POST",
      body: JSON.stringify({
        message: `revert: ${tituloOriginal}\n\nReverte o merge ${mergeSha.slice(0, 7)} (deploy/testes falharam).`,
        tree: parentTreeSha,
        parents: [mergeSha],
      }),
    },
    "commit de revert",
  )) as { sha?: string };
  if (!revertCommit.sha) throw new Error("Falha ao criar o commit de revert.");

  const branch = `revert/agente-${Date.now()}`;
  await ghJson(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs`,
    { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: revertCommit.sha }) },
    "branch de revert",
  );

  const pr = (await ghJson(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls`,
    {
      method: "POST",
      body: JSON.stringify({
        title: `revert: ${tituloOriginal}`,
        head: branch,
        base,
        body: [
          "## Revert automático",
          "",
          `O merge \`${mergeSha.slice(0, 7)}\` foi revertido automaticamente porque o deploy no Vercel falhou ou os testes de produção não passaram.`,
          "",
          "_PR gerado automaticamente pelo Agente de IA do Bravir Connect._",
        ].join("\n"),
      }),
    },
    "pull request de revert",
  )) as { html_url?: string };
  if (!pr.html_url) throw new Error("PR de revert criado, mas a resposta do GitHub veio incompleta.");
  return pr.html_url;
}

// Tenta abrir o PR de revert sem propagar erro (a falha no revert não deve
// mascarar o erro original de deploy/teste). Devolve a URL do PR ou null.
async function tentarReverter(mergeSha: string, tituloOriginal: string): Promise<string | null> {
  try {
    return await abrirRevertPr(mergeSha, tituloOriginal);
  } catch (e) {
    console.error("Falha ao reverter:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Vercel
// ---------------------------------------------------------------------------

type VercelDeployment = {
  uid?: string;
  url?: string;
  state?: string;
  readyState?: string;
  meta?: { githubCommitSha?: string };
};

function vercelUrl(path: string): string {
  if (!VERCEL_TEAM_ID) return `https://api.vercel.com${path}`;
  const sep = path.includes("?") ? "&" : "?";
  return `https://api.vercel.com${path}${sep}teamId=${encodeURIComponent(VERCEL_TEAM_ID)}`;
}

// Aguarda (polling a cada 10s, por até 3 min) o deploy de produção correspondente
// ao commit de merge ficar READY. Persiste status READY/ERROR/CANCELED.
async function esperarDeployVercel(mergeSha: string): Promise<{ ok: boolean; state: string; url: string }> {
  const inicio = Date.now();
  const LIMITE_MS = 3 * 60 * 1000;
  const INTERVALO_MS = 10_000;
  let ultimoEstado = "desconhecido";
  let url = "";

  while (Date.now() - inicio < LIMITE_MS) {
    try {
      const res = await fetch(
        vercelUrl(`/v6/deployments?app=${encodeURIComponent(VERCEL_PROJECT)}&target=production&limit=20`),
        { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } },
      );
      if (res.ok) {
        const data = (await res.json()) as { deployments?: VercelDeployment[] };
        const lista = data.deployments ?? [];
        // Prioriza o deployment do nosso commit; se ainda não apareceu, usa o mais recente.
        const alvo = lista.find((d) => d.meta?.githubCommitSha === mergeSha) ?? lista[0];
        if (alvo) {
          ultimoEstado = alvo.readyState ?? alvo.state ?? "desconhecido";
          if (alvo.url) url = alvo.url;
          if (ultimoEstado === "READY") return { ok: true, state: ultimoEstado, url };
          if (ultimoEstado === "ERROR" || ultimoEstado === "CANCELED") {
            return { ok: false, state: ultimoEstado, url };
          }
        }
      } else {
        ultimoEstado = `vercel ${res.status}`;
      }
    } catch (e) {
      ultimoEstado = e instanceof Error ? e.message : String(e);
    }
    await sleep(INTERVALO_MS);
  }
  return { ok: false, state: `timeout (último: ${ultimoEstado})`, url };
}

// Testa a URL de produção: a home e a rota de login devem responder 200.
async function testarProducao(): Promise<{ ok: boolean; detail: string }> {
  for (const rota of ["/", "/login"]) {
    try {
      const res = await fetch(`${PROD_URL}${rota}`, { redirect: "follow" });
      if (res.status !== 200) {
        return { ok: false, detail: `${rota} retornou ${res.status}` };
      }
    } catch (e) {
      return { ok: false, detail: `${rota} falhou: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  return { ok: true, detail: "200 em / e /login" };
}

// ---------------------------------------------------------------------------
// Claude
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Você é um engenheiro de software sênior trabalhando no Bravir Connect, um sistema interno de gestão comercial.
Stack: React 18 + TypeScript + Vite + shadcn/ui (Radix + Tailwind) + TanStack Query v5 + React Router v6 + Supabase. As strings da UI são em português do Brasil.
Convenções: cliente único do Supabase em "@/integrations/supabase/client"; helpers de formatação em "@/lib"; componentes shadcn/ui em "@/components/ui".

Sua tarefa: analisar uma solicitação de correção/melhoria e produzir as mudanças de código necessárias.
Regras:
- Faça a menor mudança que resolve o problema, seguindo o estilo do código existente.
- Para cada arquivo alterado, devolva o CONTEÚDO COMPLETO E FINAL do arquivo (não use diffs nem trechos parciais).
- Use "acao": "editar" para arquivos que já existem e "criar" para arquivos novos.
- Não invente caminhos: use o mapa de arquivos fornecido.
- Responda SOMENTE com um único objeto JSON válido, sem markdown, sem texto antes ou depois.`;

function montarPromptAnalise(
  titulo: string,
  descricao: string,
  contexto: ArquivoMudanca[],
  mapa: string[],
): string {
  const blocoArquivos = contexto.length
    ? contexto.map((a) => `### ${a.path}\n\`\`\`\n${a.conteudo}\n\`\`\``).join("\n\n")
    : "(nenhum arquivo de contexto foi informado)";

  return [
    "SOLICITAÇÃO:",
    `Título: ${titulo}`,
    `Descrição: ${descricao}`,
    "",
    "MAPA DE ARQUIVOS DO REPOSITÓRIO (caminhos existentes):",
    mapa.length ? mapa.join("\n") : "(indisponível)",
    "",
    "CONTEÚDO ATUAL DOS ARQUIVOS RELEVANTES:",
    blocoArquivos,
    "",
    "Responda APENAS com este JSON (sem markdown):",
    "{",
    '  "resumo": "explicação do problema e da solução proposta, em português",',
    '  "plano": ["passo 1", "passo 2"],',
    '  "arquivos": [',
    '    { "path": "caminho/do/arquivo", "acao": "editar" | "criar", "conteudo": "CONTEÚDO COMPLETO do arquivo" }',
    "  ],",
    '  "titulo_pr": "título curto do Pull Request",',
    '  "mensagem_commit": "mensagem de commit no padrão convencional (ex.: fix: ...)"',
    "}",
  ].join("\n");
}

function parseResultado(texto: string): Resultado {
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) {
    throw new Error("A IA não retornou um JSON válido.");
  }
  const obj = JSON.parse(texto.slice(inicio, fim + 1)) as Partial<Resultado>;
  const arquivos = Array.isArray(obj.arquivos)
    ? obj.arquivos
        .filter(
          (a): a is ArquivoMudanca =>
            !!a && typeof a.path === "string" && typeof a.conteudo === "string",
        )
        .map((a) => ({ path: a.path, acao: a.acao === "criar" ? "criar" : "editar", conteudo: a.conteudo }))
    : [];
  return {
    resumo: typeof obj.resumo === "string" ? obj.resumo : "",
    plano: Array.isArray(obj.plano) ? obj.plano.map((p) => String(p)) : [],
    arquivos,
    titulo_pr: typeof obj.titulo_pr === "string" ? obj.titulo_pr : undefined,
    mensagem_commit: typeof obj.mensagem_commit === "string" ? obj.mensagem_commit : undefined,
  };
}

async function analisarComIA(
  titulo: string,
  descricao: string,
  contexto: ArquivoMudanca[],
  mapa: string[],
): Promise<Resultado> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: montarPromptAnalise(titulo, descricao, contexto, mapa) },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Anthropic error:", res.status, err);
    throw new Error("Falha ao consultar a IA.");
  }

  const data = (await res.json()) as {
    stop_reason?: string;
    content?: Array<{ type?: string; text?: string }>;
  };
  if (data.stop_reason === "max_tokens") {
    throw new Error("A resposta da IA foi truncada (max_tokens). Reduza o escopo da solicitação.");
  }
  const texto = Array.isArray(data.content)
    ? data.content
        .filter((b) => b?.type === "text")
        .map((b) => b.text ?? "")
        .join("")
    : "";
  return parseResultado(texto);
}

// ---------------------------------------------------------------------------
// Helpers de fluxo
// ---------------------------------------------------------------------------

async function lerContexto(arquivosRelevantes: unknown): Promise<ArquivoMudanca[]> {
  if (!Array.isArray(arquivosRelevantes)) return [];
  const contexto: ArquivoMudanca[] = [];
  for (const raw of arquivosRelevantes.slice(0, 20)) {
    const path = String(raw);
    try {
      const conteudo = await lerArquivo(path);
      if (conteudo !== null) contexto.push({ path, acao: "editar", conteudo });
    } catch (e) {
      console.error("Falha ao ler arquivo de contexto:", path, e);
    }
  }
  return contexto;
}

function montarCorpoPr(titulo: string, descricao: string, resultado: Resultado): string {
  const passos = resultado.plano.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const arquivos = resultado.arquivos.map((a) => `- \`${a.path}\` (${a.acao})`).join("\n");
  return [
    "## Solicitação",
    `**${titulo}**`,
    "",
    descricao,
    "",
    "## Resumo da IA",
    resultado.resumo || "(sem resumo)",
    "",
    "## Plano",
    passos || "(sem plano)",
    "",
    "## Arquivos alterados",
    arquivos || "(nenhum)",
    "",
    "---",
    "_PR gerado automaticamente pelo Agente de IA do Bravir Connect. Revise antes de fazer merge._",
  ].join("\n");
}

async function persistir(id: string, campos: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from("solicitacoes_gestor").update(campos).eq("id", id);
  if (error) console.error("Falha ao persistir resultado do agente:", error.message);
}

// Extrai o número do PR a partir da URL (https://github.com/owner/repo/pull/123).
function prNumberFromUrl(url: string | null | undefined): number | null {
  if (!url) return null;
  const m = url.match(/\/pull\/(\d+)/);
  return m ? Number(m[1]) : null;
}

// Gera (ou reaproveita) a análise e abre o Pull Request, persistindo o resultado.
// Compartilhado pelos modos "implementar" e "aprovar".
async function gerarEAbrirPr(
  solicitacaoId: string,
  titulo: string,
  descricao: string,
  arquivosRelevantes: unknown,
): Promise<{ pr_url: string; pr_number: number; branch: string; resultado: Resultado }> {
  let resultado: Resultado | null = null;
  const { data: row } = await supabase
    .from("solicitacoes_gestor")
    .select("agente_mudancas")
    .eq("id", solicitacaoId)
    .maybeSingle();
  const persistido = (row as { agente_mudancas?: Resultado } | null)?.agente_mudancas;
  if (persistido && Array.isArray(persistido.arquivos) && persistido.arquivos.length > 0) {
    resultado = persistido;
  } else {
    const [mapa, contexto] = await Promise.all([
      listarArquivos(),
      lerContexto(arquivosRelevantes),
    ]);
    resultado = await analisarComIA(titulo, descricao, contexto, mapa);
  }

  if (!resultado.arquivos.length) {
    await persistir(solicitacaoId, {
      agente_status: "erro",
      agente_resumo: resultado.resumo || "A IA não propôs alterações de arquivos.",
    });
    throw new Error("A IA não propôs alterações de arquivos.");
  }

  const corpoPr = montarCorpoPr(titulo, descricao, resultado);
  const pr = await abrirPullRequest(
    resultado.arquivos,
    resultado.titulo_pr || titulo,
    resultado.mensagem_commit || `fix: ${titulo}`,
    corpoPr,
  );

  await persistir(solicitacaoId, {
    agente_status: "pr_criado",
    agente_resumo: resultado.resumo,
    agente_pr_url: pr.pr_url,
    agente_mudancas: resultado,
  });

  return { ...pr, resultado };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Qualquer usuário autenticado pode acionar o agente (a tela é restrita a admin).
  const auth = await authenticate(req, null);
  if (!auth.ok) {
    return json({ error: auth.message }, auth.status);
  }

  if (!ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY não configurada");
    return json({ error: "Agente indisponível: ANTHROPIC_API_KEY não configurada." }, 500);
  }
  if (!GITHUB_TOKEN) {
    console.error("GITHUB_TOKEN não configurado");
    return json({ error: "Agente indisponível: GITHUB_TOKEN não configurado." }, 500);
  }

  let body: {
    solicitacao_id?: string;
    titulo?: string;
    descricao?: string;
    arquivos_relevantes?: unknown;
    modo?: string;
    pr_number?: number;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido." }, 400);
  }

  const { solicitacao_id, titulo, descricao, arquivos_relevantes } = body;
  if (!solicitacao_id || !titulo || !descricao) {
    return json(
      { error: "Parâmetros inválidos: solicitacao_id, titulo e descricao são obrigatórios." },
      400,
    );
  }
  const modo =
    body.modo === "implementar"
      ? "implementar"
      : body.modo === "aprovar"
        ? "aprovar"
        : "analisar";

  try {
    if (modo === "analisar") {
      const [mapa, contexto] = await Promise.all([
        listarArquivos(),
        lerContexto(arquivos_relevantes),
      ]);
      const resultado = await analisarComIA(titulo, descricao, contexto, mapa);

      await persistir(solicitacao_id, {
        agente_status: "analisado",
        agente_resumo: resultado.resumo,
        agente_mudancas: resultado,
      });

      return json({
        ok: true,
        status: "analisado",
        resumo: resultado.resumo,
        plano: resultado.plano,
        arquivos: resultado.arquivos.map((a) => ({ path: a.path, acao: a.acao })),
      });
    }

    if (modo === "implementar") {
      // Reaproveita a análise revisada (ou re-analisa) e abre o PR.
      const pr = await gerarEAbrirPr(solicitacao_id, titulo, descricao, arquivos_relevantes);
      return json({
        ok: true,
        status: "pr_criado",
        pr_url: pr.pr_url,
        pr_number: pr.pr_number,
        branch: pr.branch,
        resumo: pr.resultado.resumo,
      });
    }

    // modo === "aprovar": abre o PR (se ainda não existir), faz merge squash,
    // aguarda o deploy no Vercel, testa a produção e reverte em caso de falha.
    if (!VERCEL_TOKEN) {
      return json({ error: "Agente indisponível: VERCEL_TOKEN não configurado." }, 500);
    }

    const { data: row } = await supabase
      .from("solicitacoes_gestor")
      .select("agente_pr_url")
      .eq("id", solicitacao_id)
      .maybeSingle();
    let prUrl = (row as { agente_pr_url?: string } | null)?.agente_pr_url ?? null;
    let prNumber = (typeof body.pr_number === "number" ? body.pr_number : null) ?? prNumberFromUrl(prUrl);

    if (!prNumber) {
      const pr = await gerarEAbrirPr(solicitacao_id, titulo, descricao, arquivos_relevantes);
      prUrl = pr.pr_url;
      prNumber = pr.pr_number;
    }

    // 1. Merge (squash).
    await persistir(solicitacao_id, { agente_status: "mergeando", agente_pr_url: prUrl });
    const mergeSha = await mergearPullRequest(prNumber);
    await persistir(solicitacao_id, {
      agente_status: "mergeado",
      agente_resumo: `PR mergeado (${mergeSha.slice(0, 7)}). Aguardando deploy no Vercel…`,
    });

    // 2. Aguarda o deploy de produção.
    const deploy = await esperarDeployVercel(mergeSha);
    if (!deploy.ok) {
      const revertUrl = await tentarReverter(mergeSha, titulo);
      await persistir(solicitacao_id, {
        agente_status: revertUrl ? "revertido" : "erro",
        agente_resumo: `Deploy falhou (${deploy.state}).${revertUrl ? " Revert aberto: " + revertUrl : ""}`,
      });
      return json({
        ok: false,
        error: `Deploy falhou: ${deploy.state}`,
        deployed: false,
        tests_passed: false,
        reverted: !!revertUrl,
        revert_url: revertUrl,
      });
    }

    // 3. Testa a produção.
    const testes = await testarProducao();
    if (!testes.ok) {
      const revertUrl = await tentarReverter(mergeSha, titulo);
      await persistir(solicitacao_id, {
        agente_status: revertUrl ? "revertido" : "erro",
        agente_resumo: `Testes de produção falharam (${testes.detail}).${revertUrl ? " Revert aberto: " + revertUrl : ""}`,
      });
      return json({
        ok: false,
        error: `Testes falharam: ${testes.detail}`,
        deployed: true,
        tests_passed: false,
        reverted: !!revertUrl,
        revert_url: revertUrl,
      });
    }

    // 4. Sucesso: merge feito, deploy concluído e testes ok.
    await persistir(solicitacao_id, {
      agente_status: "implementado",
      agente_resumo: `Merge feito (${mergeSha.slice(0, 7)}), deploy concluído e testes de produção ok (${testes.detail}).`,
    });
    return json({
      ok: true,
      deployed: true,
      tests_passed: true,
      pr_url: prUrl,
      merge_sha: mergeSha,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("agente-implementador erro:", msg);
    await persistir(solicitacao_id, {
      agente_status: "erro",
      agente_resumo: ("Erro: " + msg).slice(0, 2000),
    });
    return json({ error: "Falha no agente: " + msg }, 500);
  }
});
