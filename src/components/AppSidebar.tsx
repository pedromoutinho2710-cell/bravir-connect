import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LogOut, FileText, Calculator, LayoutTemplate, Eye, ClipboardList } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
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

function NavItem({ item, pathname }: { item: Item; pathname: string }) {
  const active = pathname === item.url;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold"
      >
        <NavLink to={item.url} className="flex items-center gap-3">
          <item.icon className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{item.title}</span>
          {item.badge != null && item.badge > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 border border-red-300 px-1.5 py-0.5 text-[10px] font-bold leading-none">
              {item.badge}
            </span>
          )}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const { role: realRole, user, signOut } = useAuth();
  const { active, userId, userRole, setImpersonation, clearImpersonation } = useImpersonation();
  const { pathname } = useLocation();
  const [semPerfilCount, setSemPerfilCount] = useState(0);
  const [leadsNovosCount, setLeadsNovosCount] = useState(0);
  const [impRole, setImpRole] = useState<AppRole>("vendedor");
  const [colaboradores, setColaboradores] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    if (realRole !== "admin") return;
    supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", impRole)
      .then(async ({ data: roleData }) => {
        if (!roleData || roleData.length === 0) {
          setColaboradores([]);
          return;
        }
        const ids = roleData.map((r: any) => r.user_id);
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ids);
        const lista = (profileData ?? []).map((p: any) => ({
          id: p.id,
          nome: p.full_name || p.email || p.id,
        }));
        setColaboradores(lista);
      });
  }, [impRole, realRole]);

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

  const getFlatMenu = (): Item[] => {
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
        { title: "Meu Pipeline", url: "/meu-pipeline", icon: LayoutTemplate },
        { title: "Propostas", url: "/propostas", icon: FileText },
        { title: "Calculadora", url: "/calculadora", icon: Calculator },
        { title: "Solicitações de melhoria", url: "/admin/solicitacoes", icon: ClipboardList },
      ]
    : [];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-5">
        <div className="flex flex-col gap-1">
          <div className="bg-[#1A5C2A] rounded-md px-2 py-1 self-start">
            <span className="text-white font-bold text-base tracking-widest">BRAVIR</span>
          </div>
          <span className="text-[9px] uppercase tracking-widest text-sidebar-foreground/45">
            Cosmética e Farmacêutica
          </span>
          <span
            className={
              "text-[10px] uppercase tracking-wider mt-1 " +
              (active ? "text-yellow-300/80" : "text-sidebar-foreground/60")
            }
          >
            {active && userRole
              ? "visualizando: " + userRole
              : (realRole ? ROLE_LABEL[realRole] : "")}
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {realRole === "admin" ? (
          <>
            {!active ? (
              adminSections.map((section) => (
                <SidebarGroup key={section.label}>
                  <SidebarGroupLabel className="text-sidebar-foreground/60">{section.label}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {section.items.map((item) => (
                        <NavItem key={item.url} item={item} pathname={pathname} />
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))
            ) : (
              <SidebarGroup>
                <SidebarGroupLabel className="text-yellow-300/70 text-[10px]">
                  Menu — {userRole}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {getFlatMenu().map((item) => (
                      <NavItem key={item.url} item={item} pathname={pathname} />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {realRole === "admin" && (
              <>
                <div className="mx-3 my-2 border-t border-sidebar-border/40" />

                <SidebarGroup>
                  <SidebarGroupLabel className="text-yellow-300/80 flex items-center gap-1.5 text-[10px]">
                    <Eye className="h-3 w-3" />
                    Visualizar como
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <div className="flex flex-wrap gap-1 px-2 pb-2">
                      {(["vendedor", "faturamento", "logistica", "trade", "gestora"] as AppRole[]).map((r) => {
                        const label =
                          r === "vendedor" ? "Vendedor" :
                          r === "faturamento" ? "Faturamento" :
                          r === "logistica" ? "Logística" :
                          r === "trade" ? "Trade" : "Gestora";
                        return (
                          <button
                            key={r}
                            onClick={() => setImpRole(r)}
                            className={
                              "px-2 py-0.5 rounded text-[11px] font-medium border transition-colors " +
                              (impRole === r
                                ? "bg-yellow-300 text-[#1A3A1F] border-yellow-300"
                                : "border-sidebar-border/40 text-sidebar-foreground/50 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground")
                            }
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    {colaboradores.length === 0 ? (
                      <p className="px-3 py-1 text-[11px] text-sidebar-foreground/40">Nenhum colaborador</p>
                    ) : (
                      <div className="px-2 space-y-0.5">
                        {colaboradores.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => setImpersonation({ active: true, userId: c.id, userName: c.nome, userRole: impRole })}
                            className={
                              "w-full text-left px-2 py-1.5 rounded text-[12px] transition-colors flex items-center gap-2 " +
                              (active && userId === c.id
                                ? "bg-yellow-300/20 text-yellow-200 font-medium"
                                : "text-sidebar-foreground/65 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground")
                            }
                          >
                            <span className="w-5 h-5 rounded-full bg-sidebar-accent/60 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                              {c.nome.charAt(0).toUpperCase()}
                            </span>
                            <span className="truncate">{c.nome}</span>
                            {active && userId === c.id && (
                              <Eye className="h-3 w-3 ml-auto flex-shrink-0 text-yellow-300" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    {active && (
                      <button
                        onClick={clearImpersonation}
                        className="mx-2 mt-2 w-[calc(100%-16px)] py-1 rounded text-[11px] border border-yellow-300/30 text-yellow-300/70 hover:bg-yellow-300/10 transition-colors"
                      >
                        Sair da visualização
                      </button>
                    )}
                  </SidebarGroupContent>
                </SidebarGroup>
              </>
            )}
          </>
        ) : (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/60">Menu</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {getFlatMenu().map((item) => (
                  <NavItem key={item.url} item={item} pathname={pathname} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {extraItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {extraItems.map((item) => (
                  <NavItem key={item.url} item={item} pathname={pathname} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="mb-2 px-2 text-xs text-sidebar-foreground/70 truncate">
          {user?.email}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
