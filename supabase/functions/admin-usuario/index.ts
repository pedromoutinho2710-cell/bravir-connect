import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("CORS_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Always HTTP 200 — supabase-js v2 loses the JSON body for non-2xx responses.
function ok(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function err(message: string): Response {
  return ok({ error: message });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Admin client — used for auth.admin.* and privileged DB writes
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Extract and verify the caller's JWT ───────────────────────────
  // supabase.functions.invoke() sends Authorization: Bearer <user_access_token>
  // when a user session is active. We pass that token to auth.getUser(jwt)
  // which calls GET /auth/v1/user with it — works for real user JWTs,
  // correctly rejects anon key and service role key.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!jwt) {
    return err("Unauthorized: missing Authorization header");
  }

  const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
  if (userErr || !user) {
    return err("Unauthorized: " + (userErr?.message ?? "invalid token"));
  }

  // ── Verify caller has admin role ──────────────────────────────────
  const { data: roleRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!roleRow) {
    return err("Forbidden: admin role required");
  }

  // ── Parse body ────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  const { acao } = body;

  // ── criar ─────────────────────────────────────────────────────────
  if (acao === "criar") {
    const email = body.email as string;
    const senha = body.senha as string;
    const full_name = body.full_name as string;
    const role = body.role as string;

    if (!email || !senha || !full_name || !role) {
      return err("Campos obrigatórios: email, senha, full_name, role");
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (error) return err(error.message);

    const userId = data.user.id;

    const [rolesResult, profilesResult] = await Promise.all([
      supabaseAdmin.from("user_roles").upsert({ user_id: userId, role }, { onConflict: "user_id" }),
      supabaseAdmin.from("profiles").upsert({ id: userId, email, full_name, role, ativo: true }, { onConflict: "id" }),
    ]);

    if (rolesResult.error) return err("Usuário criado mas erro ao definir role: " + rolesResult.error.message);
    if (profilesResult.error) return err("Usuário criado mas erro ao criar profile: " + profilesResult.error.message);

    return ok({ ok: true, user_id: userId });
  }

  // ── atualizar_role ────────────────────────────────────────────────
  if (acao === "atualizar_role") {
    const { user_id, role } = body as { user_id: string; role: string };
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id, role }, { onConflict: "user_id" });
    if (error) return err(error.message);
    return ok({ ok: true });
  }

  // ── toggle_ativo ──────────────────────────────────────────────────
  if (acao === "toggle_ativo") {
    const { user_id, ativo } = body as { user_id: string; ativo: boolean };

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({ ativo })
      .eq("id", user_id);
    if (profErr) return err(profErr.message);

    const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      ban_duration: ativo ? "none" : "87600h",
    });
    if (banErr) return err(banErr.message);

    return ok({ ok: true });
  }

  // ── excluir ───────────────────────────────────────────────────────────────
  if (acao === "excluir") {
    const { user_id } = body as { user_id: string };
    if (!user_id) return err("user_id obrigatório");

    const [authErr, profErr, roleErr] = await Promise.all([
      supabaseAdmin.auth.admin.deleteUser(user_id).then((r) => r.error),
      supabaseAdmin.from("profiles").delete().eq("id", user_id).then((r) => r.error),
      supabaseAdmin.from("user_roles").delete().eq("user_id", user_id).then((r) => r.error),
    ]);

    if (authErr) return err("Erro ao excluir auth: " + authErr.message);
    if (profErr) return err("Erro ao excluir profile: " + profErr.message);
    if (roleErr) return err("Erro ao excluir role: " + roleErr.message);

    return ok({ ok: true });
  }

  // ── atualizar_usuario ─────────────────────────────────────────────────────
  if (acao === "atualizar_usuario") {
    const { user_id, full_name, email, role, senha } = body as {
      user_id: string;
      full_name: string;
      email: string;
      role: string;
      senha?: string;
    };

    if (!user_id || !full_name || !email || !role) {
      return err("Campos obrigatórios: user_id, full_name, email, role");
    }

    // Update auth: email + optional password
    const authUpdate: Record<string, unknown> = { email, user_metadata: { full_name } };
    if (senha) authUpdate.password = senha;
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(user_id, authUpdate);
    if (authErr) return err("Erro ao atualizar autenticação: " + authErr.message);

    // Update profile
    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({ full_name, email })
      .eq("id", user_id);
    if (profErr) return err("Erro ao atualizar profile: " + profErr.message);

    // Update role
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id, role }, { onConflict: "user_id" });
    if (roleErr) return err("Erro ao atualizar perfil: " + roleErr.message);

    return ok({ ok: true });
  }

  // ── corrigir_nomes ────────────────────────────────────────────────────────
  if (acao === "corrigir_nomes") {
    const { data: profs, error: fetchErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .is("full_name", null);

    if (fetchErr) return err(fetchErr.message);

    let updated = 0;
    for (const p of (profs ?? [])) {
      if (!p.email) continue;
      const local = p.email.split("@")[0];
      const full_name = local
        .split(/[._-]/)
        .map((s: string) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" ");
      const { error: upErr } = await supabaseAdmin
        .from("profiles")
        .update({ full_name })
        .eq("id", p.id);
      if (!upErr) updated++;
    }

    return ok({ ok: true, updated });
  }

  return err("Ação desconhecida: " + String(acao));
});
