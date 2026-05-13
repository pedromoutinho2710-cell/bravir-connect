import {
  LayoutDashboard,
  Users,
  Target,
  ClipboardList,
  PlusCircle,
  ListChecks,
  Truck,
  FileStack,
  UserCog,
  UserPlus,
  Megaphone,
  Store,
  Upload,
  Tag,
  Settings,
  ClipboardCheck,
  History,
} from "lucide-react";
import type { AppRole } from "@/lib/roles";

export type Item = { title: string; url: string; icon: typeof LayoutDashboard; badge?: number };
export type Section = { label: string; items: Item[] };

export const ADMIN_SECTIONS: Section[] = [
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
      { title: "Campanhas", url: "/admin/campanhas", icon: Megaphone },
      { title: "Configurações", url: "/admin/configuracoes", icon: Settings },
    ],
  },
];

export const BASE_FATURAMENTO_ITEMS: Item[] = [
  { title: "Fila de Pedidos", url: "/faturamento", icon: ListChecks },
  { title: "Clientes", url: "/faturamento/clientes", icon: Users },
  { title: "Clientes p/ cadastrar", url: "/faturamento/clientes-pendentes", icon: UserPlus },
];

export const FLAT_MENU_STATIC: Partial<Record<AppRole, Item[]>> = {
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
    { title: "Dashboard", url: "/gestora/dashboard", icon: LayoutDashboard },
    { title: "Novo Pedido", url: "/gestora/novo-pedido", icon: PlusCircle },
    { title: "Pedidos", url: "/gestora/pedidos", icon: ClipboardList },
    { title: "Clientes", url: "/gestora/clientes", icon: Users },
    { title: "Cadastrar Cliente", url: "/gestora/cadastrar-cliente", icon: UserPlus },
    { title: "Gestão do Time", url: "/gestora/time", icon: UserCog },
  ],
  gestora_faturamento: [
    { title: "Histórico Faturamento", url: "/gestora/historico-faturamento", icon: History },
    { title: "Fila de Pedidos", url: "/faturamento", icon: ListChecks },
    { title: "Clientes", url: "/faturamento/clientes", icon: Users },
    { title: "Fila de Cadastros", url: "/faturamento/cadastros", icon: ClipboardCheck },
  ],
  trade: [
    { title: "Clientes aguardando", url: "/trade", icon: Store },
    { title: "Campanhas", url: "/trade/campanhas", icon: Megaphone },
  ],
};
