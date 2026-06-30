import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

type AppRole = Database["public"]["Enums"]["app_role"];

type Colaborador = {
  user_id: string;
  full_name: string | null;
  email: string | null;
};

const ABAS: { role: AppRole; label: string }[] = [
  { role: "vendedor", label: "Vendedor" },
  { role: "faturamento", label: "Faturamento" },
  { role: "logistica", label: "Logística" },
  { role: "trade", label: "Trade" },
  { role: "gestora", label: "Gestora" },
];

export function ImpersonationBar() {
  const { role: realRole } = useAuth();
  const { active, userName, userRole, setImpersonation, clearImpersonation } = useImpersonation();
  const [abaAtiva, setAbaAtiva] = useState<AppRole>("vendedor");
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (realRole !== "admin") return;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("user_roles")
      .select("user_id, role, profiles(id, full_name, email)")
      .eq("role", abaAtiva)
      .then(({ data }: { data: any[] | null }) => {
        const lista: Colaborador[] = (data ?? []).map((r) => ({
          user_id: r.user_id,
          full_name: r.profiles?.full_name ?? null,
          email: r.profiles?.email ?? null,
        }));
        setColaboradores(lista);
        setLoading(false);
      });
  }, [realRole, abaAtiva]);

  if (realRole !== "admin") return null;

  const handleSelect = (userId: string) => {
    const c = colaboradores.find((x) => x.user_id === userId);
    if (!c) return;
    setImpersonation({
      active: true,
      userId: c.user_id,
      userName: c.full_name || c.email || "Sem nome",
      userRole: abaAtiva,
    });
  };

  return (
    <div className="w-full bg-white border-b border-gray-200 px-4 py-2 flex flex-wrap items-center gap-3">
      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
        Visualizar como
      </span>

      <div className="flex flex-wrap items-center gap-1">
        {ABAS.map((a) => {
          const ativa = a.role === abaAtiva;
          return (
            <button
              key={a.role}
              type="button"
              onClick={() => setAbaAtiva(a.role)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                ativa
                  ? "bg-primary text-primary-foreground"
                  : "text-gray-600 hover:bg-primary/10"
              }`}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      <Select
        value=""
        onValueChange={handleSelect}
        disabled={loading || colaboradores.length === 0}
      >
        <SelectTrigger className="w-[220px] h-8">
          <SelectValue placeholder={loading ? "Carregando..." : "Selecionar colaborador"} />
        </SelectTrigger>
        <SelectContent>
          {colaboradores.map((c) => (
            <SelectItem key={c.user_id} value={c.user_id}>
              {c.full_name || c.email || "Sem nome"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {active && (
        <div className="flex items-center gap-2 ml-auto">
          <span className="bg-yellow-50 text-yellow-800 border border-yellow-300 rounded px-3 py-1 text-sm font-medium">
            Visualizando como {userName} ({userRole})
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={clearImpersonation}
            className="h-8"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Sair da visualização
          </Button>
        </div>
      )}
    </div>
  );
}
