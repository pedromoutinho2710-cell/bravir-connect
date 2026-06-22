import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verificarAdmin } from "../_shared/auth.ts";

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";
const GITHUB_OWNER = Deno.env.get("GITHUB_OWNER") ?? "";
const GITHUB_REPO = Deno.env.get("GITHUB_REPO") ?? "";
const GITHUB_DEFAULT_BRANCH = Deno.env.get("GITHUB_DEFAULT_BRANCH") ?? "main";

const githubHeaders = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function githubRequest(path: string, method = "GET", body?: unknown) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}${path}`;
  const res = await fetch(url, {
    method,
    headers: githubHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    await verificarAdmin(supabase, authHeader);

    const { acao, tarefa_id, branch, arquivos, mensagem_commit, titulo_pr, descricao_pr, pr_number } =
      await req.json();

    // ─── CRIAR PR ────────────────────────────────────────────────────────────
    if (acao === "criar_pr") {
      // 1. Obter SHA da branch padrão
      const refData = await githubRequest(`/git/ref/heads/${GITHUB_DEFAULT_BRANCH}`);
      const baseSha: string = refData.object.sha;

      // 2. Criar branch de feature
      await githubRequest("/git/refs", "POST", {
        ref: `refs/heads/${branch}`,
        sha: baseSha,
      });

      // 3. Fazer commit dos arquivos
      const tree = await Promise.all(
        (arquivos as Array<{ path: string; conteudo: string }>).map(async (arq) => {
          const blobData = await githubRequest("/git/blobs", "POST", {
            content: btoa(unescape(encodeURIComponent(arq.conteudo))),
            encoding: "base64",
          });
          return {
            path: arq.path,
            mode: "100644",
            type: "blob",
            sha: blobData.sha,
          };
        })
      );

      const treeData = await githubRequest("/git/trees", "POST", {
        base_tree: baseSha,
        tree,
      });

      const commitData = await githubRequest("/git/commits", "POST", {
        message: mensagem_commit,
        tree: treeData.sha,
        parents: [baseSha],
      });

      await githubRequest(`/git/refs/heads/${branch}`, "PATCH", {
        sha: commitData.sha,
        force: false,
      });

      // 4. Abrir PR
      const prData = await githubRequest("/pulls", "POST", {
        title: titulo_pr,
        body: descricao_pr,
        head: branch,
        base: GITHUB_DEFAULT_BRANCH,
        draft: false,
      });

      // 5. Adicionar comentário orientando revisão humana obrigatória
      await githubRequest(`/issues/${prData.number}/comments`, "POST", {
        body:
          "🤖 **PR gerado automaticamente pelo Agente Implementador.**\n\n" +
          "⚠️ **O merge NÃO foi realizado automaticamente.** \n\n" +
          "Um revisor humano deve analisar as alterações, aprovar o PR e realizar o merge manualmente, " +
          "respeitando as proteções de branch configuradas no repositório (revisões obrigatórias e status checks).\n\n" +
          `Tarefa relacionada: \`${tarefa_id ?? "N/A"}\``,
      });

      // 6. Registrar na tabela de auditoria (se existir)
      await supabase.from("agente_ia_logs").insert({
        acao: "criar_pr",
        tarefa_id: tarefa_id ?? null,
        detalhes: {
          pr_number: prData.number,
          pr_url: prData.html_url,
          branch,
          mensagem_commit,
        },
      });

      return new Response(
        JSON.stringify({
          ok: true,
          mensagem:
            "PR aberto com sucesso. O merge deve ser realizado manualmente por um revisor humano no GitHub.",
          pr_number: prData.number,
          pr_url: prData.html_url,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── REVERT ──────────────────────────────────────────────────────────────
    if (acao === "revert") {
      if (!pr_number) {
        return new Response(
          JSON.stringify({ ok: false, erro: "pr_number é obrigatório para revert" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Obter informações do PR original
      const prData = await githubRequest(`/pulls/${pr_number}`);
      const mergeCommitSha: string | null = prData.merge_commit_sha ?? null;

      if (!mergeCommitSha) {
        return new Response(
          JSON.stringify({ ok: false, erro: "PR ainda não foi mergeado; nada a reverter." }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Criar branch de revert
      const refData = await githubRequest(`/git/ref/heads/${GITHUB_DEFAULT_BRANCH}`);
      const baseSha: string = refData.object.sha;
      const revertBranch = `revert/pr-${pr_number}-${Date.now()}`;

      await githubRequest("/git/refs", "POST", {
        ref: `refs/heads/${revertBranch}`,
        sha: baseSha,
      });

      // Abrir PR de revert
      const revertPr = await githubRequest("/pulls", "POST", {
        title: `revert: desfazer PR #${pr_number} — ${prData.title}`,
        body:
          `Reverte as alterações introduzidas pelo PR #${pr_number}.\n\n` +
          `Merge commit: \`${mergeCommitSha}\`\n\n` +
          "⚠️ **Revisão humana obrigatória antes do merge.**",
        head: revertBranch,
        base: GITHUB_DEFAULT_BRANCH,
        draft: false,
      });

      await supabase.from("agente_ia_logs").insert({
        acao: "revert",
        tarefa_id: tarefa_id ?? null,
        detalhes: {
          pr_original: pr_number,
          revert_pr_number: revertPr.number,
          revert_pr_url: revertPr.html_url,
        },
      });

      return new Response(
        JSON.stringify({
          ok: true,
          mensagem:
            "PR de revert aberto. O merge deve ser realizado manualmente por um revisor humano no GitHub.",
          revert_pr_number: revertPr.number,
          revert_pr_url: revertPr.html_url,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── AÇÃO DESCONHECIDA ───────────────────────────────────────────────────
    return new Response(
      JSON.stringify({ ok: false, erro: `Ação desconhecida: ${acao}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[agente-implementador] erro:", err);
    return new Response(
      JSON.stringify({ ok: false, erro: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
