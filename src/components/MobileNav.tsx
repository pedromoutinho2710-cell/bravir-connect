import { NavLink } from "react-router-dom";
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
  FileStack,
} from "lucide-react";
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
    { title: "Formulários", url: "/admin/formularios", icon: FileStack },
  ],
  vendedor: [
    { title: "Meu Painel", url: "/meu-painel", icon: LayoutDashboard },
    { title: "Novo Pedido", url: "/novo-pedido", icon: PlusCircle },
    { title: "Meus Pedidos", url: "/meus-pedidos", icon: ClipboardList },
    { title: "Meus Clientes", url: "/meus-clientes", icon: Users },
  ],
  faturamento: [
    { title: "Fila de Pedidos", url: "/faturamento", icon: ListChecks },
    { title: "Todos os Pedidos", url: "/faturamento/todos", icon: ClipboardList },
  ],
  logistica: [
    { title: "Painel de Entregas", url: "/logistica", icon: Truck },
  ],
};

type Props = { onNavigate: () => void };

export function MobileNav({ onNavigate }: Props) {
  const { role, user, fullName, signOut } = useAuth();
  const items = role ? MENU[role] : [];

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="border-b border-sidebar-border px-5 py-5">
        <div className="text-lg font-bold tracking-tight">Bravir CRM</div>
        <div className="text-[11px] uppercase tracking-wider text-sidebar-foreground/70 mt-0.5">
          {role ? ROLE_LABEL[role] : ""}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {items.map((item) => (
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
            {item.title}
          </NavLink>
        ))}
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
