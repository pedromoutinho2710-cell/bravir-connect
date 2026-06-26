import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { LogOut, FileText, Calculator, ClipboardList } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { ROLE_LABEL, type AppRole } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  ADMIN_SECTIONS,
  BASE_FATURAMENTO_ITEMS,
  FLAT_MENU_STATIC,
  type Item,
  type Section,
} from "@/lib/menu";

type Props = { onNavigate: () => void };

export function MobileNav({ onNavigate }: Props) {
  const { role: realRole, user, fullName, signOut } = useAuth();
  const { active, userRole } = useImpersonation();
  const role = active ? userRole : realRole;
  const [semPerfilCount, setSemPerfilCount] = useState(0);
  const [leadsNovosCount, setLeadsNovosCount] = useState(0);

  useEffect(() => {
    if (realRole !== "faturamento" && realRole !== "admin") return;
    supabase
      .from("clientes")
      .select("id", { count: "exact", head: true })
      .is("cluster", null)
      .then(({ count }) => setSemPerfilCount(count ?? 0));
  }, [realRole]);

  useEffect(() => {
    if (realRole !== "gestora" && realRole !== "admin") return;
    (supabase as any)
      .from("leads_evento")
      .select("id", { count: "exact", head: true })
      .eq("status", "novo")
      .then(({ count }: { count: number | null }) => setLeadsNovosCount(count ?? 0));
  }, [realRole]);

  const faturamentoItems: Item[] = BASE_FATURAMENTO_ITEMS.map((item) =>
    item.url === "/faturamento/clientes" && semPerfilCount > 0
      ? { ...item, badge: semPerfilCount }
      : item
  );

  const gestoraItems: Item[] = (FLAT_MENU_STATIC["gestora"] ?? []).map((item) =>
    item.url === "/gestora/leads-evento" && leadsNovosCount > 0
      ? { ...item, badge: leadsNovosCount }
      : item
  );

  const getFlatItems = (): Item[] => {
    const roleParaMenu = (active && userRole ? userRole : realRole) as AppRole;
    if (roleParaMenu === "faturamento") return faturamentoItems;
    if (roleParaMenu === "gestora") return gestoraItems;
    return FLAT_MENU_STATIC[roleParaMenu] ?? [];
  };

  const adminSections: Section[] = ADMIN_SECTIONS.map((section) => {
    if (section.label === "Pré-faturamento") {
      return {
        ...section,
        items: section.items.map((item) =>
          item.url === "/faturamento/clientes" && semPerfilCount > 0
            ? { ...item, badge: semPerfilCount }
            : item
        ),
      };
    }
    if (section.label === "Gestora") {
      return {
        ...section,
        items: section.items.map((item) =>
          item.url === "/gestora/leads-evento" && leadsNovosCount > 0
            ? { ...item, badge: leadsNovosCount }
            : item
        ),
      };
    }
    return section;
  });

  const isPedroMenezes = user?.email === "pedro.menezes@bravir.com.br";
  const extraItems: Item[] = isPedroMenezes
    ? [
        { title: "Propostas", url: "/propostas", icon: FileText },
        { title: "Calculadora", url: "/calculadora", icon: Calculator },
        { title: "Solicitações de melhoria", url: "/admin/solicitacoes", icon: ClipboardList },
      ]
    : [];

  const navLink = (item: Item) => (
    <NavLink
      key={item.url}
      to={item.url}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
            : "text-sidebar-foreground hover:bg-sidebar-accent/60"
        }`
      }
    >
      <item.icon className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1">{item.title}</span>
      {item.badge != null && item.badge > 0 && (
        <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 border border-red-300 px-1.5 py-0.5 text-[10px] font-bold leading-none">
          {item.badge}
        </span>
      )}
    </NavLink>
  );

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="border-b border-sidebar-border px-5 py-5 flex flex-col">
        <div className="bg-[#1A5C2A] rounded-md px-2 py-0.5 self-start">
          <span className="text-white font-bold text-sm tracking-widest">BRAVIR</span>
        </div>
        <span className="text-[9px] uppercase tracking-widest text-sidebar-foreground/45 mt-0.5">
          Cosmética e Farmacêutica
        </span>
        <div className="text-[11px] uppercase tracking-wider text-sidebar-foreground/70 mt-1">
          {active && userRole ? `${userRole} — visualização` : (role ? ROLE_LABEL[role] : "")}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {realRole === "admin" && !active ? (
          adminSections.map((section) => (
            <div key={section.label} className="mb-3">
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/50 font-semibold">
                {section.label}
              </div>
              {section.items.map(navLink)}
            </div>
          ))
        ) : (
          getFlatItems().map(navLink)
        )}
        {extraItems.length > 0 && (
          <div className="mb-3">{extraItems.map(navLink)}</div>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-4 space-y-2">
        <div className="text-xs text-sidebar-foreground/70 truncate px-1">
          {fullName || user?.email}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent/60"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </Button>
      </div>
    </div>
  );
}
