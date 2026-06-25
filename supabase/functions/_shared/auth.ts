import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Origem permitida para CORS. Em produção é o domínio do app; pode ser
// sobrescrita via secret CORS_ORIGIN (ex.: para ambientes de preview).
export const allowedOrigin =
  Deno.env.get("CORS_ORIGIN") ?? "https://bravir-connect.vercel.app";

/** Monta os headers de CORS aceitando a origem do request se for localhost ou a URL de produção. */
export function corsHeaders(reqOrExtra?: Request | null | string, extraAllowHeaders = ""): Record<string, string> {
  const req = reqOrExtra instanceof Request ? reqOrExtra : null;
  const extra = typeof reqOrExtra === "string" ? reqOrExtra : extraAllowHeaders;

  const requestOrigin = req?.headers.get("origin") ?? "";
  const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(requestOrigin);
  const origin = isLocalhost || requestOrigin === allowedOrigin ? requestOrigin : allowedOrigin;

  const allow =
    "authorization, x-client-info, apikey, content-type" +
    (extra ? ", " + extra : "");
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export type AuthResult =
  | { ok: true; userId: string; role: string }
  | { ok: false; status: number; message: string };

/**
 * Verifica o JWT do header Authorization e, opcionalmente, o papel do usuário.
 *
 * @param allowedRoles  lista de papéis aceitos em `user_roles`; passe `null`
 *                       para exigir apenas um JWT válido (qualquer autenticado).
 *
 * Reutiliza a lógica de `admin-usuario`: chama auth.getUser(jwt), que valida
 * JWTs reais de usuário e rejeita a anon key / service role key.
 */
export async function authenticate(
  req: Request,
  allowedRoles: string[] | null,
): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) {
    return { ok: false, status: 401, message: "Unauthorized: missing Authorization header" };
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error } = await admin.auth.getUser(jwt);
  if (error || !user) {
    return { ok: false, status: 401, message: "Unauthorized: " + (error?.message ?? "invalid token") };
  }

  if (allowedRoles === null) {
    return { ok: true, userId: user.id, role: "" };
  }

  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", allowedRoles)
    .maybeSingle();

  if (!roleRow) {
    return { ok: false, status: 403, message: "Forbidden: required role" };
  }

  return { ok: true, userId: user.id, role: roleRow.role };
}
