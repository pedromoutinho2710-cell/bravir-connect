import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
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
    label: "Pré-faturamento",
    items: [
      { title: "Fila de Pedidos", url: "/faturamento", icon: ListChecks },
      { title: "Clientes", url: "/faturamento/clientes", icon: Users },
      { title: "Fila de Cadastros", url: "/faturamento/cadastros", icon: ClipboardCheck },
      { title: "Clientes p/ cadastrar", url: "/faturamento/clientes-pendentes", icon: UserPlus },
    ],
  },
  {
    label: "Logística",
    items: [
      { title: "Dashboard", url: "/logistica", icon: LayoutDashboard },
      { title: "Fila de Pedidos", url: "/logistica/fila", icon: Truck },
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
    label: "Gestora",
    items: [
      { title: "Dashboard", url: "/gestora", icon: LayoutDashboard },
      { title: "Meu Time", url: "/gestora/time", icon: Users },
      { title: "Clientes", url: "/gestora/clientes", icon: Users },
      { title: "Novo Pedido", url: "/gestora/novo-pedido", icon: PlusCircle },
      { title: "Pedidos", url: "/gestora/pedidos", icon: ClipboardList },
      { title: "Fila de Cadastros", url: "/faturamento/cadastros", icon: ClipboardCheck },
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
    { title: "Dashboard", url: "/logistica", icon: LayoutDashboard },
    { title: "Fila de Pedidos", url: "/logistica/fila", icon: ListChecks },
  ],
  gestora: [
    { title: "Dashboard", url: "/gestora", icon: LayoutDashboard },
    { title: "Meu Time", url: "/gestora/time", icon: Users },
    { title: "Clientes", url: "/gestora/clientes", icon: Users },
    { title: "Novo Pedido", url: "/gestora/novo-pedido", icon: PlusCircle },
    { title: "Pedidos", url: "/gestora/pedidos", icon: ClipboardList },
    { title: "Fila de Cadastros", url: "/faturamento/cadastros", icon: ClipboardCheck },
  ],
  trade: [
    { title: "Clientes aguardando", url: "/trade", icon: Store },
    { title: "Campanhas", url: "/trade/campanhas", icon: Megaphone },
  ],
};

type Props = { onNavigate: () => void };

export function MobileNav({ onNavigate }: Props) {
  const { role, user, fullName, signOut } = useAuth();
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

  const getFlatItems = (): Item[] => {
    if (role === "faturamento") return faturamentoItems;
    return FLAT_MENU_STATIC[role as AppRole] ?? [];
  };

  const adminSections: Section[] = ADMIN_SECTIONS.map((section) =>
    section.label === "Pré-faturamento"
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
      <div className="border-b border-sidebar-border px-5 py-5">
        <div className="text-lg font-bold tracking-tight">Bravir CRM</div>
        <div className="text-[11px] uppercase tracking-wider text-sidebar-foreground/70 mt-0.5">
          {role ? ROLE_LABEL[role] : ""}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {role === "admin" ? (
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
