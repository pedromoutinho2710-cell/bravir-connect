import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/roles";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  fullName: string | null;
  loading: boolean;
  roleLoaded: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const MAX_ROLE_ATTEMPTS = 3;

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const isTransientRoleError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /500|PGRST|Database error querying schema|schema cache|connection|unexpected_failure/i.test(message);
};

const getRoleFromUser = (currentUser: User | null) => {
  const metadataRole = currentUser?.app_metadata?.role;
  return typeof metadataRole === "string" ? (metadataRole as AppRole) : null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleLoaded, setRoleLoaded] = useState(false);

  useEffect(() => {
    const fetchRole = async (currentUser: User) => {
      const fallbackRole = getRoleFromUser(currentUser);
      for (let attempt = 1; attempt <= MAX_ROLE_ATTEMPTS; attempt += 1) {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", currentUser.id)
          .limit(1)
          .maybeSingle();

        if (!error) {
          setRole((data?.role as AppRole) ?? null);
          return;
        }

        if (!isTransientRoleError(error) || attempt === MAX_ROLE_ATTEMPTS) {
          setRole(fallbackRole);
          return;
        }

        await wait(750 * attempt);
      }
    };

    const fetchFullName = async (currentUser: User) => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (data) {
        setFullName(data.full_name);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (event === "SIGNED_OUT") {
        setRole(null);
        setFullName(null);
        setRoleLoaded(true);
        return;
      }

      if (event === "SIGNED_IN") {
        if (newSession?.user) {
          setRoleLoaded(false);
          setRole(getRoleFromUser(newSession.user));
          fetchRole(newSession.user).finally(() => setRoleLoaded(true));
          fetchFullName(newSession.user);
        }
        return;
      }

      // TOKEN_REFRESHED, USER_UPDATED e outros: apenas atualiza session/user,
      // não reseta role nem roleLoaded para evitar remontagem desnecessária.
    });

    supabase.auth.getSession().then(async ({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      if (existing?.user) {
        await Promise.all([
          fetchRole(existing.user),
          fetchFullName(existing.user),
        ]);
      }
      setRoleLoaded(true);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, role, fullName, loading, roleLoaded, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
