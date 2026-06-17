import {
  LayoutDashboard,
  Users,
  Target,
  ClipboardList,
  PlusCircle,
  ListChecks,
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
  Boxes,
  FileText,
  Calculator,
  CheckSquare,
  BarChart2,
  Wallet,
} from "lucide-react";
import type { AppRole } from "@/lib/roles";

export type Item = { title: string; url: string; icon: typeof LayoutDashboard; badge?: number };
export type Section = { label: string; items: Item[] };

export const ADMIN_SECTIONS: Section[] = [
  {
    label: "Visão Geral",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "Visão Macro", url: "/admin/visao-macro", icon: BarChart2 },
    ],
  },
  {
    label: "Administração",
    items: [
      { title: "Clientes (Lista)", url: "/admin/clientes-lista", icon: Users },
      { title: "Equipe", url: "/admin/equipe", icon: UserCog },
      { title: "Metas", url: "/admin/metas", icon: Target },
      { title: "Gestão de Metas", url: "/admin/gestao-metas", icon: Target },
      { title: "Formulários", url: "/admin/formularios", icon: FileStack },
      { title: "Importar Clientes", url: "/admin/importar-clientes", icon: Upload },
      { title: "Tabelas de Preço", url: "/admin/tabelas-preco", icon: Tag },
      { title: "Configurações", url: "/admin/configuracoes", icon: Settings },
      { title: "Minhas Solicitações", url: "/minhas-solicitacoes", icon: ClipboardList },
      { title: "Solicitações de melhoria", url: "/admin/solicitacoes", icon: ClipboardList },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { title: "Fila Financeiro", url: "/financeiro/fila", icon: Wallet },
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
  { title: "Minhas Solicitações", url: "/minhas-solicitacoes", icon: ClipboardList },
];

// Nota: o admin usa ADMIN_SECTIONS (que também inclui "Minhas Solicitações"),
// não FLAT_MENU_STATIC. "Minhas Solicitações" está disponível para todos os roles.
export const FLAT_MENU_STATIC: Partial<Record<AppRole, Item[]>> = {
  vendedor: [
    { title: "Meu Painel", url: "/meu-painel", icon: LayoutDashboard },
    { title: "Novo Pedido", url: "/novo-pedido", icon: PlusCircle },
    { title: "Meus Pedidos", url: "/meus-pedidos", icon: ClipboardList },
    { title: "Meus Clientes", url: "/meus-clientes", icon: Users },
    { title: "Minhas Tarefas", url: "/minhas-tarefas", icon: CheckSquare },
    { title: "Cadastrar Cliente", url: "/cadastrar-cliente", icon: UserPlus },
    { title: "Minhas Solicitações", url: "/minhas-solicitacoes", icon: ClipboardList },
  ],
  logistica: [
    { title: "Dashboard", url: "/logistica", icon: LayoutDashboard },
    { title: "Fila de Pedidos", url: "/logistica/fila", icon: ListChecks },
    { title: "Minhas Solicitações", url: "/minhas-solicitacoes", icon: ClipboardList },
  ],
  gestora: [
    { title: "Dashboard", url: "/gestora/dashboard", icon: LayoutDashboard },
    { title: "Novo Pedido", url: "/gestora/novo-pedido", icon: PlusCircle },
    { title: "Pedidos", url: "/gestora/pedidos", icon: ClipboardList },
    { title: "Clientes", url: "/gestora/clientes", icon: Users },
    { title: "Cadastrar Cliente", url: "/gestora/cadastrar-cliente", icon: UserPlus },
    { title: "Gestão do Time", url: "/gestora/time", icon: UserCog },
    { title: "Gestão de Metas", url: "/admin/gestao-metas", icon: Target },
    { title: "Leads Evento", url: "/gestora/leads-evento", icon: UserCheck },
    { title: "Minhas Solicitações", url: "/minhas-solicitacoes", icon: ClipboardList },
  ],
  gestora_faturamento: [
    { title: "Dashboard", url: "/dashboard-faturamento", icon: LayoutDashboard },
    { title: "Histórico Faturamento", url: "/gestora/historico-faturamento", icon: History },
    { title: "Gestão de Metas", url: "/admin/gestao-metas", icon: Target },
    { title: "Novo Pedido", url: "/faturamento/novo-pedido", icon: PlusCircle },
    { title: "Fila de Pedidos", url: "/faturamento", icon: ListChecks },
    { title: "Clientes", url: "/faturamento/clientes", icon: Users },
    { title: "Fila de Cadastros", url: "/faturamento/cadastros", icon: ClipboardCheck },
    { title: "Gestão de Estoque", url: "/faturamento/gestao-estoque", icon: Boxes },
    { title: "Minhas Solicitações", url: "/minhas-solicitacoes", icon: ClipboardList },
  ],
  financeiro: [
    { title: "Fila Financeiro", url: "/financeiro/fila", icon: Wallet },
    { title: "Minhas Solicitações", url: "/minhas-solicitacoes", icon: ClipboardList },
  ],
  trade: [
    { title: "Clientes aguardando", url: "/trade", icon: Store },
    { title: "Campanhas", url: "/trade/campanhas", icon: Megaphone },
    { title: "Importar Faturamento", url: "/trade/importar-faturamento", icon: Upload },
    { title: "Importar Metas", url: "/trade/importar-metas", icon: Target },
    { title: "Minhas Solicitações", url: "/minhas-solicitacoes", icon: ClipboardList },
  ],
};
