import { Link, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  ClipboardList,
  Calculator,
  FileText,
  MessageSquare,
  CheckSquare,
  GitBranch,
  BarChart2,
  TrendingUp,
  Package,
  Settings,
  Trash2,
  Star,
  Truck,
  DollarSign,
  UserCheck,
  Target,
  Megaphone,
  Bot,
  FormInput,
  Upload,
  Eye,
  PieChart,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import UserMenu from "./UserMenu";
import NotificationsBadge from "./NotificationsBadge";
import { temAcesso } from "@/lib/roles";

export default function AppSidebar() {
  const { perfil } = useAuth();
  const location = useLocation();
  const papel = perfil?.papel ?? "";

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + "/");

  const itemClass = (path: string) =>
    isActive(path)
      ? "bg-primary/10 text-primary font-semibold"
      : "hover:bg-muted";

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3 border-b">
        <div className="flex items-center justify-between">
          <span className="font-bold text-lg tracking-tight">Bravir Connect</span>
          <NotificationsBadge />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Vendedor */}
        {temAcesso(papel, "vendedor") && (
          <SidebarGroup>
            <SidebarGroupLabel>Meu Espaço</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/vendedor/painel")}>
                    <Link to="/vendedor/painel"><LayoutDashboard className="h-4 w-4" /><span>Meu Painel</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/vendedor/clientes")}>
                    <Link to="/vendedor/clientes"><Users className="h-4 w-4" /><span>Meus Clientes</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/vendedor/pedidos")}>
                    <Link to="/vendedor/pedidos"><ShoppingCart className="h-4 w-4" /><span>Meus Pedidos</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/vendedor/pipeline")}>
                    <Link to="/vendedor/pipeline"><GitBranch className="h-4 w-4" /><span>Meu Pipeline</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/vendedor/tarefas")}>
                    <Link to="/vendedor/tarefas"><CheckSquare className="h-4 w-4" /><span>Minhas Tarefas</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/vendedor/propostas")}>
                    <Link to="/vendedor/propostas"><FileText className="h-4 w-4" /><span>Minhas Propostas</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/vendedor/solicitacoes")}>
                    <Link to="/vendedor/solicitacoes"><MessageSquare className="h-4 w-4" /><span>Solicitações</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/vendedor/calculadora")}>
                    <Link to="/vendedor/calculadora"><Calculator className="h-4 w-4" /><span>Calculadora</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/vendedor/iqvia")}>
                    <Link to="/vendedor/iqvia"><PieChart className="h-4 w-4" /><span>Dashboard IQVIA</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Gestora */}
        {temAcesso(papel, "gestora") && (
          <SidebarGroup>
            <SidebarGroupLabel>Gestora</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/gestora/dashboard")}>
                    <Link to="/gestora/dashboard"><LayoutDashboard className="h-4 w-4" /><span>Dashboard</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/gestora/clientes")}>
                    <Link to="/gestora/clientes"><Users className="h-4 w-4" /><span>Clientes</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/gestora/pedidos")}>
                    <Link to="/gestora/pedidos"><ShoppingCart className="h-4 w-4" /><span>Pedidos</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/gestora/time")}>
                    <Link to="/gestora/time"><UserCheck className="h-4 w-4" /><span>Meu Time</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/gestora/historico")}>
                    <Link to="/gestora/historico"><BarChart2 className="h-4 w-4" /><span>Histórico</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/gestora/leads")}>
                    <Link to="/gestora/leads"><Star className="h-4 w-4" /><span>Leads Evento</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Trade */}
        {temAcesso(papel, "trade") && (
          <SidebarGroup>
            <SidebarGroupLabel>Trade</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/trade")}>
                    <Link to="/trade"><TrendingUp className="h-4 w-4" /><span>Dashboard Trade</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/trade/campanhas")}>
                    <Link to="/trade/campanhas"><Megaphone className="h-4 w-4" /><span>Campanhas</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/trade/importar-faturamento")}>
                    <Link to="/trade/importar-faturamento"><Upload className="h-4 w-4" /><span>Importar Faturamento</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/trade/importar-metas")}>
                    <Link to="/trade/importar-metas"><Target className="h-4 w-4" /><span>Importar Metas</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Faturamento */}
        {temAcesso(papel, "faturamento") && (
          <SidebarGroup>
            <SidebarGroupLabel>Faturamento</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/fat/dashboard")}>
                    <Link to="/fat/dashboard"><LayoutDashboard className="h-4 w-4" /><span>Dashboard</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/fat/fila-cadastros")}>
                    <Link to="/fat/fila-cadastros"><ClipboardList className="h-4 w-4" /><span>Fila de Cadastros</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/fat/estoque")}>
                    <Link to="/fat/estoque"><Package className="h-4 w-4" /><span>Estoque</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Logística */}
        {temAcesso(papel, "logistica") && (
          <SidebarGroup>
            <SidebarGroupLabel>Logística</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/logistica/dashboard")}>
                    <Link to="/logistica/dashboard"><Truck className="h-4 w-4" /><span>Dashboard</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/logistica/fila")}>
                    <Link to="/logistica/fila"><ClipboardList className="h-4 w-4" /><span>Fila de Entregas</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Financeiro */}
        {temAcesso(papel, "financeiro") && (
          <SidebarGroup>
            <SidebarGroupLabel>Financeiro</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/financeiro/fila")}>
                    <Link to="/financeiro/fila"><DollarSign className="h-4 w-4" /><span>Fila Financeira</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Admin */}
        {temAcesso(papel, "admin") && (
          <SidebarGroup>
            <SidebarGroupLabel>Administração</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/admin/visao-macro")}>
                    <Link to="/admin/visao-macro"><Eye className="h-4 w-4" /><span>Visão Macro</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/admin/pedidos")}>
                    <Link to="/admin/pedidos"><ShoppingCart className="h-4 w-4" /><span>Pedidos</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/admin/clientes")}>
                    <Link to="/admin/clientes"><Users className="h-4 w-4" /><span>Clientes</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/admin/equipe")}>
                    <Link to="/admin/equipe"><UserCheck className="h-4 w-4" /><span>Equipe</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/admin/precos")}>
                    <Link to="/admin/precos"><DollarSign className="h-4 w-4" /><span>Preços</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/admin/metas")}>
                    <Link to="/admin/metas"><Target className="h-4 w-4" /><span>Metas</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/admin/campanhas")}>
                    <Link to="/admin/campanhas"><Megaphone className="h-4 w-4" /><span>Campanhas</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/admin/formularios")}>
                    <Link to="/admin/formularios"><FormInput className="h-4 w-4" /><span>Formulários</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/admin/estoque")}>
                    <Link to="/admin/estoque"><Package className="h-4 w-4" /><span>Estoque</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/admin/agente-ia")}>
                    <Link to="/admin/agente-ia"><Bot className="h-4 w-4" /><span>Agente IA</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={itemClass("/admin/configuracoes")}>
                    <Link to="/admin/configuracoes"><Settings className="h-4 w-4" /><span>Configurações</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Utilitários */}
        <SidebarGroup>
          <SidebarGroupLabel>Utilitários</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className={itemClass("/bolsao")}>
                  <Link to="/bolsao"><Package className="h-4 w-4" /><span>Bolsão</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className={itemClass("/lixeira")}>
                  <Link to="/lixeira"><Trash2 className="h-4 w-4" /><span>Lixeira</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t px-4 py-3">
        <UserMenu />
      </SidebarFooter>
    </Sidebar>
  );
}
