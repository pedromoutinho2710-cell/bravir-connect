import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface ImpersonationState {
  active: boolean;
  userId: string | null;
  userName: string | null;
  userRole: AppRole | null;
}

interface ImpersonationContextType extends ImpersonationState {
  setImpersonation: (state: ImpersonationState) => void;
  clearImpersonation: () => void;
}

const ImpersonationContext = createContext<ImpersonationContextType | null>(null);

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ImpersonationState>({
    active: false,
    userId: null,
    userName: null,
    userRole: null,
  });
  const setImpersonation = (s: ImpersonationState) => setState(s);
  const clearImpersonation = () =>
    setState({ active: false, userId: null, userName: null, userRole: null });

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setState({ active: false, userId: null, userName: null, userRole: null });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <ImpersonationContext.Provider value={{ ...state, setImpersonation, clearImpersonation }}>
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  const ctx = useContext(ImpersonationContext);
  if (!ctx) throw new Error("useImpersonation must be used inside ImpersonationProvider");
  return ctx;
}
