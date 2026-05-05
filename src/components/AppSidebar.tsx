import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Target,
  ClipboardList,
  PlusCircle,
  ListChecks,
  Truck,
  LogOut,
  FileStack,
  UserCog,
  UserPlus,
  Megaphone,
  Store,
  Upload,
  Tag,
  Settings,
  ClipboardCheck,
} from "lucide-react";
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
import { ROLE_LABEL, type AppRole } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type Item = { title: string; url: string; icon: typeof LayoutDashboard; badge?: number };
type Section = { label: string; items: Item[] };

const ADMIN_SECTIONS: Section[] = [
  {
    label: "Visão Geral",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Vendas",
    items: [
      { title: "Pedidos", url: "/admin/pedidos", icon: ClipboardList },
      { title: "Clientes", url: "/admin/clientes", icon: Users },
    ],
  },
  {
    label: "Faturamento",
    items: [
      { title: "Fila de Pedidos", url: "/faturamento", icon: ListChecks },
      { title: "Clientes", url: "/faturamento/clientes", icon: Users },
      { title: "Fila de Cadastros", url: "/faturamento/cadastros", icon: ClipboardCheck },
      { title: "Clientes p/ cadastrar", url: "/faturamento/clientes-pendentes", icon: UserPlus },
    ],
  },
  {
    label: "Trade",
    items: [
      { title: "Clientes aguardando", url: "/trade", icon: Store },
      { title: "Campanhas", url: "/trade/campanhas", icon: Megaphone },
    ],
  },
  {
    label: "Administração",
    items: [
      { title: "Equipe", url: "/admin/equipe", icon: UserCog },
      { title: "Metas", url: "/admin/metas", icon: Target },
      { title: "Formulários", url: "/admin/formularios", icon: FileStack },
      { title: "Importar Clientes", url: "/admin/importar-clientes", icon: Upload },
      { title: "Tabelas de Preço", url: "/admin/tabelas-preco", icon: Tag },
      { title: "Configurações", url: "/admin/configuracoes", icon: Settings },
    ],
  },
];

const BASE_FATURAMENTO_ITEMS: Item[] = [
  { title: "Fila de Pedidos", url: "/faturamento", icon: ListChecks },
  { title: "Clientes", url: "/faturamento/clientes", icon: Users },
  { title: "Fila de Cadastros", url: "/faturamento/cadastros", icon: ClipboardCheck },
  { title: "Clientes p/ cadastrar", url: "/faturamento/clientes-pendentes", icon: UserPlus },
];

const FLAT_MENU_STATIC: Partial<Record<AppRole, Item[]>> = {
  vendedor: [
    { title: "Meu Painel", url: "/meu-painel", icon: LayoutDashboard },
    { title: "Novo Pedido", url: "/novo-pedido", icon: PlusCircle },
    { title: "Meus Pedidos", url: "/meus-pedidos", icon: ClipboardList },
    { title: "Meus Clientes", url: "/meus-clientes", icon: Users },
    { title: "Cadastrar Cliente", url: "/cadastrar-cliente", icon: UserPlus },
  ],
  logistica: [
    { title: "Painel de Entregas", url: "/logistica", icon: Truck },
  ],
  trade: [
    { title: "Clientes aguardando", url: "/trade", icon: Store },
    { title: "Campanhas", url: "/trade/campanhas", icon: Megaphone },
  ],
};

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
  const { role, user, signOut } = useAuth();
  const { pathname } = useLocation();
  const [semPerfilCount, setSemPerfilCount] = useState(0);

  useEffect(() => {
    if (role !== "faturamento" && role !== "admin") return;
    supabase
      .from("clientes")
      .select("id", { count: "exact", head: true })
      .is("cluster", null)
      .then(({ count }) => setSemPerfilCount(count ?? 0));
  }, [role]);

  const faturamentoItems: Item[] = BASE_FATURAMENTO_ITEMS.map((item) =>
    item.url === "/faturamento/clientes" && semPerfilCount > 0
      ? { ...item, badge: semPerfilCount }
      : item
  );

  const getFlatMenu = (): Item[] => {
    if (role === "faturamento") return faturamentoItems;
    return FLAT_MENU_STATIC[role as AppRole] ?? [];
  };

  const adminSections: Section[] = ADMIN_SECTIONS.map((section) =>
    section.label === "Faturamento"
      ? {
          ...section,
          items: section.items.map((item) =>
            item.url === "/faturamento/clientes" && semPerfilCount > 0
              ? { ...item, badge: semPerfilCount }
              : item
          ),
        }
      : section
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-5">
        <div className="flex flex-col">
          <span className="text-lg font-bold tracking-tight text-sidebar-foreground">
            Bravir CRM
          </span>
          <span className="text-[11px] uppercase tracking-wider text-sidebar-foreground/70">
            {role ? ROLE_LABEL[role] : ""}
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {role === "admin" ? (
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
