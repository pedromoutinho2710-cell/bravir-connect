import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_HOME, type AppRole } from "@/lib/roles";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const TEST_ACCOUNTS: { email: string; password: string; role: AppRole; full_name: string }[] = [
  { email: "admin@bravir.com.br", password: "Bravir2026", role: "admin", full_name: "Administrador Bravir" },
  { email: "vendedor@bravir.com.br", password: "Bravir2026", role: "vendedor", full_name: "Vendedor Bravir" },
  { email: "faturamento@bravir.com.br", password: "Bravir2026", role: "faturamento", full_name: "Faturamento Bravir" },
  { email: "logistica@bravir.com.br", password: "Bravir2026", role: "logistica", full_name: "Logística Bravir" },
];

const SEED_KEY = "bravir_seed_v1";

async function seedTestAccountsIfNeeded() {
  if (localStorage.getItem(SEED_KEY)) return;
  for (const acc of TEST_ACCOUNTS) {
    const { data, error } = await supabase.auth.signUp({
      email: acc.email,
      password: acc.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: acc.full_name },
      },
    });
    if (!error && data.user) {
      // Insert role; ignore duplicates / RLS issues silently
      await supabase.from("user_roles").insert({ user_id: data.user.id, role: acc.role });
    }
  }
  // Logout the last seeded session so user lands on a fresh login screen
  await supabase.auth.signOut();
  localStorage.setItem(SEED_KEY, "1");
}

export default function Login() {
  const { user, role, signIn, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [seeding, setSeeding] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    seedTestAccountsIfNeeded().finally(() => setSeeding(false));
  }, []);

  if (!loading && user && role) {
    return <Navigate to={ROLE_HOME[role]} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (error) {
      toast.error("Não foi possível entrar", { description: "E-mail ou senha inválidos." });
      return;
    }
    // Fetch role and redirect
    const { data: { user: u } } = await supabase.auth.getUser();
    if (u) {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.id)
        .maybeSingle();
      const r = (data?.role as AppRole) ?? null;
      if (r) navigate(ROLE_HOME[r], { replace: true });
      else toast.error("Usuário sem perfil atribuído.");
    }
  };

  const handleForgot = () => {
    toast.info("Recuperação de senha", {
      description: "Solicite a redefinição de senha ao administrador.",
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary p-4">
      <div className="w-full max-w-md rounded-xl bg-card p-8 shadow-elevated">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-primary">Bravir CRM</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bravir Farmacêutica e Cosmética
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@bravir.com.br"
              disabled={submitting || seeding}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={submitting || seeding}
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]"
            disabled={submitting || seeding}
          >
            {(submitting || seeding) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {seeding ? "Preparando..." : "Entrar"}
          </Button>

          <button
            type="button"
            onClick={handleForgot}
            className="block w-full text-center text-sm text-primary hover:underline"
          >
            Esqueci minha senha
          </button>
        </form>
      </div>
    </div>
  );
}
