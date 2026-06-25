import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ImpersonationProvider } from "@/contexts/ImpersonationContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { type AppRole } from "@/lib/roles";
import AgenteChatFlutuante from "@/components/AgenteChatFlutuante";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import NovoPedido from "./pages/vendedor/NovoPedido";
import MeusPedidos from "./pages/vendedor/MeusPedidos";
import MeusClientes from "./pages/vendedor/MeusClientes";
import MinhasTarefas from "./pages/vendedor/MinhasTarefas";
import CadastrarCliente from "./pages/vendedor/CadastrarCliente";
import Formularios from "./pages/admin/Formularios";
import Equipe from "./pages/admin/Equipe";
import Metas from "./pages/admin/Metas";
import GestaoMetas from "./pages/admin/GestaoMetas";
import BlingCallback from "@/pages/admin/BlingCallback";
import Trade from "./pages/Trade";
import TradeCampanhas from "./pages/TradeCampanhas";
import ImportarFaturamento from "./pages/trade/ImportarFaturamento";
import ImportarMetas from "./pages/trade/ImportarMetas";
import FaturamentoClientesPendentes from "./pages/FaturamentoClientesPendentes";
import FaturamentoClientes from "./pages/FaturamentoClientes";
import FilaCadastros from "./pages/faturamento/FilaCadastros";
import DashboardFaturamento from "./pages/faturamento/DashboardFaturamento";
import GestaoEstoque from "./pages/faturamento/GestaoEstoque";
import NovoPedidoFaturamento from "./pages/faturamento/NovoPedidoFaturamento";
import EditarPedido from "./pages/faturamento/EditarPedido";
import EditarPedidoFaturamento from "@/pages/faturamento/EditarPedidoFaturamento";
import GestaoEstoqueAdmin from "./pages/admin/GestaoEstoque";
import PedidosAdmin from "./pages/admin/PedidosAdmin";
import Solicitacoes from "./pages/admin/Solicitacoes";
import NovaSolicitacao from "./pages/NovaSolicitacao";
import MinhasSolicitacoes from "@/pages/MinhasSolicitacoes";
import ClientesAdmin from "./pages/admin/ClientesAdmin";
import ClientesAdminLista from "./pages/admin/ClientesAdminLista";
import Lixeira from "./pages/Lixeira";
import ImportarClientes from "./pages/admin/ImportarClientes";
import BolsaoPage from "./pages/BolsaoPage";
import TabelasPreco from "./pages/admin/TabelasPreco";
import GestaoPrecos from "./pages/admin/GestaoPrecos";
import Configuracoes from "./pages/admin/Configuracoes";
import Campanhas from "./pages/admin/Campanhas";
import AgenteIA from "./pages/admin/AgenteIA";
import MeuAgente from "./pages/MeuAgente";
import DashboardLogistica from "./pages/logistica/DashboardLogistica";
import FilaLogistica from "./pages/logistica/FilaLogistica";
import SiteLanding from "./pages/site/SiteLanding";
import SiteCandidatura from "./pages/site/SiteCandidatura";
import EventoFormulario from "./pages/EventoFormulario";
import EventoQR from "./pages/EventoQR";
import LeadsEvento from "./pages/gestora/LeadsEvento";
import DashboardGestora from "./pages/gestora/DashboardGestora";
import GestaoTime from "./pages/gestora/GestaoTime";
import CadastrarClienteGestora from "./pages/gestora/CadastrarClienteGestora";
import CadastrarClienteFaturamento from "@/pages/faturamento/CadastrarClienteFaturamento";
import ClientesGestora from "./pages/gestora/ClientesGestora";
import NovoPedidoGestora from "./pages/gestora/NovoPedidoGestora";
import PedidosGestora from "./pages/gestora/PedidosGestora";
import HistoricoFaturamento from "@/pages/gestora/HistoricoFaturamento";
import FilaFinanceiro from "./pages/financeiro/FilaFinanceiro";
import DadosIQVIA from "./pages/DadosIQVIA";

const MeuPipeline = lazy(() => import("./pages/vendedor/MeuPipeline"));
const PropostaPublica = lazy(() => import("./pages/PropostaPublica"));
const CalculadoraPublica = lazy(() => import("./pages/CalculadoraPublica"));
const MinhasPropostas = lazy(() => import("./pages/MinhasPropostas"));
const CalculadoraMargem = lazy(() => import("./pages/CalculadoraMargem"));

// Páginas pesadas (queries/relatórios grandes) — carregadas sob demanda.
const Faturamento = lazy(() => import("./pages/Faturamento"));
const MeuPainel = lazy(() => import("./pages/vendedor/MeuPainel"));
const VisaoMacro = lazy(() => import("./pages/admin/VisaoMacro"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ClienteDetalhe = lazy(() => import("./pages/ClienteDetalhe"));

const queryClient = new QueryClient();

// Guard inline: libera /admin/solicitacoes para admin OU pedro.menezes (por email).
// Reaproveita o ProtectedRoute (loading/auth/redirect) incluindo o próprio role do
// pedro.menezes no allow quando o email confere.
function SolicitacoesRoute() {
  const { user, role } = useAuth();
  const isPedroMenezes = user?.email === "pedro.menezes@bravir.com.br";
  const allow: AppRole[] = isPedroMenezes && role ? ["admin", role] : ["admin"];
  return (
    <ProtectedRoute allow={allow}>
      <AppLayout />
    </ProtectedRoute>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ImpersonationProvider>
          <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />

            {/* Rotas públicas — sem autenticação */}
            <Route path="/site" element={<SiteLanding />} />
            <Route path="/site/candidatura" element={<SiteCandidatura />} />
            <Route path="/evento" element={<EventoFormulario />} />
            <Route path="/evento/qr" element={<EventoQR />} />
            <Route path="/evento-qr" element={<EventoQR />} />
            <Route path="/proposta/:token" element={<PropostaPublica />} />
            <Route path="/calc/:token" element={<CalculadoraPublica />} />

            {/* Rotas exclusivas do admin */}
            <Route element={<ProtectedRoute allow={["admin"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/admin/visao-macro" element={<VisaoMacro />} />
              <Route path="/admin/bling-callback" element={<BlingCallback />} />
              <Route path="/admin/equipe" element={<Equipe />} />
              <Route path="/admin/metas" element={<Metas />} />
              <Route path="/admin/formularios" element={<Formularios />} />
              <Route path="/admin/pedidos" element={<PedidosAdmin />} />
              <Route path="/admin/clientes" element={<ClientesAdmin />} />
              <Route path="/admin/clientes-lista" element={<ClientesAdminLista />} />
              <Route path="/admin/importar-clientes" element={<ImportarClientes />} />
              <Route path="/admin/tabelas-preco" element={<TabelasPreco />} />
              <Route path="/admin/gestao-precos" element={<GestaoPrecos />} />
              <Route path="/admin/configuracoes" element={<Configuracoes />} />
              <Route path="/admin/campanhas" element={<Campanhas />} />
              <Route path="/admin/agente-ia" element={<AgenteIA />} />
            </Route>

            {/* Gestão de Estoque (mockado — Sankhya) — admin e gestora */}
            <Route element={<ProtectedRoute allow={["admin", "gestora"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/admin/gestao-estoque" element={<GestaoEstoqueAdmin />} />
            </Route>

            {/* Meu Agente — acessível por qualquer role autenticado; guarda por email dentro do componente */}
            <Route element={<ProtectedRoute allow={["admin", "vendedor", "faturamento", "logistica", "gestora", "gestora_faturamento", "trade", "financeiro"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/meu-agente" element={<MeuAgente />} />
            </Route>

            {/* Solicitações de melhoria — admin e pedro.menezes (liberado por email) */}
            <Route element={<SolicitacoesRoute />}>
              <Route path="/admin/solicitacoes" element={<Solicitacoes />} />
            </Route>

            {/* Gestão de Metas — admin, gestora e gestora_faturamento */}
            <Route element={<ProtectedRoute allow={["admin", "gestora", "gestora_faturamento"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/admin/gestao-metas" element={<GestaoMetas />} />
            </Route>

            {/* Nova solicitação de melhoria — acessível por todos os roles */}
            <Route element={<ProtectedRoute allow={["admin", "vendedor", "faturamento", "logistica", "gestora", "gestora_faturamento", "financeiro"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/solicitacao" element={<NovaSolicitacao />} />
            </Route>

            {/* Minhas Solicitações — colaborador acompanha as próprias solicitações */}
            <Route element={<ProtectedRoute allow={["admin", "vendedor", "faturamento", "logistica", "gestora", "gestora_faturamento", "trade", "financeiro"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/minhas-solicitacoes" element={<MinhasSolicitacoes />} />
            </Route>

            {/* Lixeira — soft-delete global */}
            <Route element={<ProtectedRoute allow={["admin", "gestora", "vendedor", "faturamento", "logistica", "trade", "gestora_faturamento", "financeiro"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/lixeira" element={<Lixeira />} />
            </Route>

            {/* Dados IQVIA — visão de mercado por marca (acessível por todos os roles) */}
            <Route element={<ProtectedRoute allow={["admin", "vendedor", "faturamento", "logistica", "gestora", "gestora_faturamento", "trade", "financeiro"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/dados-iqvia" element={<DadosIQVIA />} />
            </Route>

            {/* Rotas de vendedor — acessíveis por vendedor e admin */}
            <Route element={<ProtectedRoute allow={["vendedor", "admin"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/meu-painel" element={<MeuPainel />} />
              <Route path="/novo-pedido" element={<NovoPedido />} />
              <Route path="/meus-pedidos" element={<MeusPedidos />} />
              <Route path="/meus-clientes" element={<MeusClientes />} />
              <Route path="/minhas-tarefas" element={<MinhasTarefas />} />
              <Route path="/cadastrar-cliente" element={<CadastrarCliente />} />
              <Route path="/meu-pipeline" element={<MeuPipeline />} />
            </Route>

            {/* Propostas e Calculadora — vendedor, gestora e admin */}
            <Route element={<ProtectedRoute allow={["vendedor", "gestora", "admin"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/propostas" element={<MinhasPropostas />} />
              <Route path="/calculadora" element={<CalculadoraMargem />} />
            </Route>

            {/* Rotas de faturamento — acessíveis por faturamento e admin */}
            <Route element={<ProtectedRoute allow={["faturamento", "admin", "gestora", "gestora_faturamento"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/faturamento" element={<Faturamento />} />
              <Route path="/faturamento/clientes-pendentes" element={<FilaCadastros />} />
              <Route path="/faturamento/clientes" element={<FaturamentoClientes />} />
              <Route path="/faturamento/cadastrar-cliente" element={<CadastrarClienteFaturamento />} />
              <Route path="/faturamento/cadastros" element={<FilaCadastros />} />
              <Route path="/dashboard-faturamento" element={<DashboardFaturamento />} />
              <Route path="/faturamento/novo-pedido" element={<NovoPedidoFaturamento />} />
            </Route>

            {/* Gestão de Estoque — acessível por faturamento, admin e gestora_faturamento */}
            <Route element={<ProtectedRoute allow={["faturamento", "admin", "gestora_faturamento"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/faturamento/gestao-estoque" element={<GestaoEstoque />} />
            </Route>

            {/* Edição de pedido — acessível por faturamento e admin */}
            <Route element={<ProtectedRoute allow={["faturamento", "admin", "gestora_faturamento"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/faturamento/pedidos/:id/editar" element={<EditarPedidoFaturamento />} />
            </Route>

            {/* Bolsão — vendedor (própria carteira), gestora e admin (todos) */}
            <Route element={<ProtectedRoute allow={["admin", "gestora", "vendedor"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/bolsao" element={<BolsaoPage />} />
            </Route>

            {/* Detalhe de cliente — acessível por vendedor, admin, faturamento, trade, gestora, logistica */}
            <Route element={<ProtectedRoute allow={["vendedor", "admin", "faturamento", "trade", "gestora", "logistica", "gestora_faturamento"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/clientes/:id" element={<ClienteDetalhe />} />
            </Route>

            {/* Gestora */}
            <Route element={<ProtectedRoute allow={["gestora", "admin"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/gestora" element={<DashboardGestora />} />
              <Route path="/gestora/dashboard" element={<DashboardGestora />} />
              <Route path="/gestora/time" element={<GestaoTime />} />
              <Route path="/gestora/clientes" element={<ClientesGestora />} />
              <Route path="/gestora/cadastrar-cliente" element={<CadastrarClienteGestora />} />
              <Route path="/gestora/novo-pedido" element={<NovoPedidoGestora />} />
              <Route path="/gestora/pedidos" element={<PedidosGestora />} />
              <Route path="/gestora/leads-evento" element={<LeadsEvento />} />
            </Route>

            {/* Gestora Faturamento */}
            <Route element={<ProtectedRoute allow={["gestora_faturamento", "admin"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/gestora/historico-faturamento" element={<HistoricoFaturamento />} />
            </Route>

            {/* Financeiro — fila de pagamentos à vista */}
            <Route element={<ProtectedRoute allow={["financeiro", "admin"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/financeiro" element={<FilaFinanceiro />} />
              <Route path="/financeiro/fila" element={<FilaFinanceiro />} />
            </Route>

            {/* Logística */}
            <Route element={<ProtectedRoute allow={["logistica", "admin"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/logistica" element={<DashboardLogistica />} />
              <Route path="/logistica/fila" element={<FilaLogistica />} />
            </Route>

            {/* Trade — acessível por trade e admin */}
            <Route element={<ProtectedRoute allow={["trade", "admin"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/trade" element={<Trade />} />
              <Route path="/trade/campanhas" element={<TradeCampanhas />} />
              <Route path="/trade/importar-faturamento" element={<ImportarFaturamento />} />
              <Route path="/trade/importar-metas" element={<ImportarMetas />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          <AgenteChatFlutuante />
          </ImpersonationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
