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
  UserCheck,
  PlusSquare,
  Boxes,
  FileText,
  Calculator,
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
      { title: "Gestão de Estoque", url: "/faturamento/gestao-estoque", icon: Boxes },
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
      { title: "Importar Faturamento", url: "/trade/importar-faturamento", icon: Upload },
      { title: "Importar Metas", url: "/trade/importar-metas", icon: Target },
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
      { title: "Leads Evento", url: "/gestora/leads-evento", icon: UserCheck },
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
      { title: "Solicitações de melhoria", url: "/admin/solicitacoes", icon: ClipboardList },
      { title: "Nova solicitação", url: "/solicitacao", icon: PlusSquare },
    ],
  },
];

export const BASE_FATURAMENTO_ITEMS: Item[] = [
  { title: "Novo Pedido", url: "/faturamento/novo-pedido", icon: PlusCircle },
  { title: "Fila de Pedidos", url: "/faturamento", icon: ListChecks },
  { title: "Dashboard", url: "/dashboard-faturamento", icon: LayoutDashboard },
  { title: "Clientes", url: "/faturamento/clientes", icon: Users },
  { title: "Clientes p/ cadastrar", url: "/faturamento/clientes-pendentes", icon: UserPlus },
  { title: "Gestão de Estoque", url: "/faturamento/gestao-estoque", icon: Boxes },
  { title: "Solicitações de melhoria", url: "/admin/solicitacoes", icon: ClipboardCheck },
  { title: "Nova solicitação", url: "/solicitacao", icon: PlusSquare },
];

export const FLAT_MENU_STATIC: Partial<Record<AppRole, Item[]>> = {
  vendedor: [
    { title: "Meu Painel", url: "/meu-painel", icon: LayoutDashboard },
    { title: "Novo Pedido", url: "/novo-pedido", icon: PlusCircle },
    { title: "Meus Pedidos", url: "/meus-pedidos", icon: ClipboardList },
    { title: "Meus Clientes", url: "/meus-clientes", icon: Users },
    { title: "Cadastrar Cliente", url: "/cadastrar-cliente", icon: UserPlus },
    { title: "Solicitações de melhoria", url: "/admin/solicitacoes", icon: ClipboardCheck },
    { title: "Nova solicitação", url: "/solicitacao", icon: PlusSquare },
  ],
  logistica: [
    { title: "Dashboard", url: "/logistica", icon: LayoutDashboard },
    { title: "Fila de Pedidos", url: "/logistica/fila", icon: ListChecks },
    { title: "Solicitações de melhoria", url: "/admin/solicitacoes", icon: ClipboardCheck },
    { title: "Nova solicitação", url: "/solicitacao", icon: PlusSquare },
  ],
  gestora: [
    { title: "Dashboard", url: "/gestora/dashboard", icon: LayoutDashboard },
    { title: "Novo Pedido", url: "/gestora/novo-pedido", icon: PlusCircle },
    { title: "Pedidos", url: "/gestora/pedidos", icon: ClipboardList },
    { title: "Clientes", url: "/gestora/clientes", icon: Users },
    { title: "Cadastrar Cliente", url: "/gestora/cadastrar-cliente", icon: UserPlus },
    { title: "Gestão do Time", url: "/gestora/time", icon: UserCog },
    { title: "Leads Evento", url: "/gestora/leads-evento", icon: UserCheck },
    { title: "Solicitações de melhoria", url: "/admin/solicitacoes", icon: ClipboardCheck },
    { title: "Nova solicitação", url: "/solicitacao", icon: PlusSquare },
  ],
  gestora_faturamento: [
    { title: "Dashboard", url: "/dashboard-faturamento", icon: LayoutDashboard },
    { title: "Histórico Faturamento", url: "/gestora/historico-faturamento", icon: History },
    { title: "Novo Pedido", url: "/faturamento/novo-pedido", icon: PlusCircle },
    { title: "Fila de Pedidos", url: "/faturamento", icon: ListChecks },
    { title: "Clientes", url: "/faturamento/clientes", icon: Users },
    { title: "Fila de Cadastros", url: "/faturamento/cadastros", icon: ClipboardCheck },
    { title: "Gestão de Estoque", url: "/faturamento/gestao-estoque", icon: Boxes },
    { title: "Solicitações de melhoria", url: "/admin/solicitacoes", icon: ClipboardCheck },
    { title: "Nova solicitação", url: "/solicitacao", icon: PlusSquare },
  ],
  trade: [
    { title: "Clientes aguardando", url: "/trade", icon: Store },
    { title: "Campanhas", url: "/trade/campanhas", icon: Megaphone },
    { title: "Importar Faturamento", url: "/trade/importar-faturamento", icon: Upload },
    { title: "Importar Metas", url: "/trade/importar-metas", icon: Target },
  ],
};
