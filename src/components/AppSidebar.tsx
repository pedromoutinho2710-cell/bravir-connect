import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  Target,
  ClipboardList,
  PlusCircle,
  ListChecks,
  Truck,
  LogOut,
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

type Item = { title: string; url: string; icon: typeof LayoutDashboard };

const MENU: Record<AppRole, Item[]> = {
  admin: [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "Pedidos", url: "/pedidos", icon: ShoppingCart },
    { title: "Vendedores", url: "/vendedores", icon: Users },
    { title: "Produtos", url: "/produtos", icon: Package },
    { title: "Metas", url: "/metas", icon: Target },
  ],
  vendedor: [
    { title: "Meu Painel", url: "/meu-painel", icon: LayoutDashboard },
    { title: "Novo Pedido", url: "/novo-pedido", icon: PlusCircle },
    { title: "Meus Pedidos", url: "/meus-pedidos", icon: ClipboardList },
  ],
  faturamento: [
    { title: "Fila de Pedidos", url: "/faturamento", icon: ListChecks },
    { title: "Todos os Pedidos", url: "/faturamento/todos", icon: ClipboardList },
  ],
  logistica: [
    { title: "Painel de Entregas", url: "/logistica", icon: Truck },
  ],
};

export function AppSidebar() {
  const { role, user, signOut } = useAuth();
  const { pathname } = useLocation();
  const items = role ? MENU[role] : [];

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
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/60">Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = pathname === item.url;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold"
                    >
                      <NavLink to={item.url} className="flex items-center gap-3">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
