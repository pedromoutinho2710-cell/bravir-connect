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

const MAX_LOGIN_ATTEMPTS = 3;

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const isTransientLoginError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /500|PGRST|Database error querying schema|schema cache|connection|unexpected_failure/i.test(message);
};

export default function Login() {
  const { user, role, signIn, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const navigate = useNavigate();

  if (!loading && user && role) {
    return <Navigate to={ROLE_HOME[role]} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setAttempt(1);

    let error: Error | null = null;
    for (let currentAttempt = 1; currentAttempt <= MAX_LOGIN_ATTEMPTS; currentAttempt += 1) {
      setAttempt(currentAttempt);
      const result = await signIn(email.trim(), password);
      error = result.error;
      if (!error || !isTransientLoginError(error) || currentAttempt === MAX_LOGIN_ATTEMPTS) break;
      await wait(750 * currentAttempt);
    }

    setSubmitting(false);
    setAttempt(0);
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
              disabled={submitting}
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
              disabled={submitting}
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]"
            disabled={submitting}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting && attempt > 1 ? `Tentando novamente (${attempt}/${MAX_LOGIN_ATTEMPTS})` : "Entrar"}
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
