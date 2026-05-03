import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("CORS_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── Verify caller identity via their JWT ──────────────────────────
  // Pattern: anon client + forwarded user JWT → auth.getUser()
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) {
    return json({ error: "Missing Authorization header" }, 401);
  }

  const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !user) {
    return json({ error: "Invalid or expired token: " + (userErr?.message ?? "no user") }, 401);
  }

  // ── Admin client for privileged operations ────────────────────────
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Verify caller has admin role ──────────────────────────────────
  const { data: roleRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!roleRow) {
    return json({ error: "Forbidden: admin role required" }, 403);
  }

  // ── Parse body ────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { acao } = body;

  // ── criar ─────────────────────────────────────────────────────────
  if (acao === "criar") {
    const email = body.email as string;
    const senha = body.senha as string;
    const full_name = body.full_name as string;
    const role = body.role as string;

    if (!email || !senha || !full_name || !role) {
      return json({ error: "Campos obrigatórios: email, senha, full_name, role" }, 400);
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (error) {
      return json({ error: error.message }, 400);
    }

    const userId = data.user.id;

    const [rolesResult, profilesResult] = await Promise.all([
      supabaseAdmin.from("user_roles").upsert({ user_id: userId, role }, { onConflict: "user_id" }),
      supabaseAdmin.from("profiles").upsert({ id: userId, email, full_name, ativo: true }, { onConflict: "id" }),
    ]);

    if (rolesResult.error) {
      return json({ error: "Usuário criado mas erro ao definir role: " + rolesResult.error.message }, 500);
    }
    if (profilesResult.error) {
      return json({ error: "Usuário criado mas erro ao criar profile: " + profilesResult.error.message }, 500);
    }

    return json({ ok: true, user_id: userId });
  }

  // ── atualizar_role ────────────────────────────────────────────────
  if (acao === "atualizar_role") {
    const { user_id, role } = body as { user_id: string; role: string };
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id, role }, { onConflict: "user_id" });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ── toggle_ativo ──────────────────────────────────────────────────
  if (acao === "toggle_ativo") {
    const { user_id, ativo } = body as { user_id: string; ativo: boolean };

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({ ativo })
      .eq("id", user_id);
    if (profErr) return json({ error: profErr.message }, 500);

    const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      ban_duration: ativo ? "none" : "87600h",
    });
    if (banErr) return json({ error: banErr.message }, 500);

    return json({ ok: true });
  }

  return json({ error: "Ação desconhecida: " + acao }, 400);
});
