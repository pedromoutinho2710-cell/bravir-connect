import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import NovoPedido from "./pages/vendedor/NovoPedido";
import MeusPedidos from "./pages/vendedor/MeusPedidos";
import MeuPainel from "./pages/vendedor/MeuPainel";
import MeusClientes from "./pages/vendedor/MeusClientes";
import CadastrarCliente from "./pages/vendedor/CadastrarCliente";
import Faturamento from "./pages/Faturamento";
import Formularios from "./pages/admin/Formularios";
import Equipe from "./pages/admin/Equipe";
import Metas from "./pages/admin/Metas";
import Dashboard from "./pages/Dashboard";
import Trade from "./pages/Trade";
import TradeCampanhas from "./pages/TradeCampanhas";
import FaturamentoClientesPendentes from "./pages/FaturamentoClientesPendentes";
import FaturamentoClientes from "./pages/FaturamentoClientes";
import FilaCadastros from "./pages/faturamento/FilaCadastros";
import EditarPedido from "./pages/faturamento/EditarPedido";
import EditarPedidoFaturamento from "@/pages/faturamento/EditarPedidoFaturamento";
import PedidosAdmin from "./pages/admin/PedidosAdmin";
import ClientesAdmin from "./pages/admin/ClientesAdmin";
import ImportarClientes from "./pages/admin/ImportarClientes";
import ClienteDetalhe from "./pages/ClienteDetalhe";
import TabelasPreco from "./pages/admin/TabelasPreco";
import Configuracoes from "./pages/admin/Configuracoes";
import Campanhas from "./pages/admin/Campanhas";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />

            {/* Rotas públicas — sem autenticação */}
            <Route path="/site" element={<SiteLanding />} />
            <Route path="/site/candidatura" element={<SiteCandidatura />} />
            <Route path="/evento" element={<EventoFormulario />} />
            <Route path="/evento/qr" element={<EventoQR />} />
            <Route path="/evento-qr" element={<EventoQR />} />

            {/* Rotas exclusivas do admin */}
            <Route element={<ProtectedRoute allow={["admin"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/admin/equipe" element={<Equipe />} />
              <Route path="/admin/metas" element={<Metas />} />
              <Route path="/admin/formularios" element={<Formularios />} />
              <Route path="/admin/pedidos" element={<PedidosAdmin />} />
              <Route path="/admin/clientes" element={<ClientesAdmin />} />
              <Route path="/admin/importar-clientes" element={<ImportarClientes />} />
              <Route path="/admin/tabelas-preco" element={<TabelasPreco />} />
              <Route path="/admin/configuracoes" element={<Configuracoes />} />
              <Route path="/admin/campanhas" element={<Campanhas />} />
            </Route>

            {/* Rotas de vendedor — acessíveis por vendedor e admin */}
            <Route element={<ProtectedRoute allow={["vendedor", "admin"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/meu-painel" element={<MeuPainel />} />
              <Route path="/novo-pedido" element={<NovoPedido />} />
              <Route path="/meus-pedidos" element={<MeusPedidos />} />
              <Route path="/meus-clientes" element={<MeusClientes />} />
              <Route path="/cadastrar-cliente" element={<CadastrarCliente />} />
            </Route>

            {/* Rotas de faturamento — acessíveis por faturamento e admin */}
            <Route element={<ProtectedRoute allow={["faturamento", "admin", "gestora", "gestora_faturamento"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/faturamento" element={<Faturamento />} />
              <Route path="/faturamento/clientes-pendentes" element={<FilaCadastros />} />
              <Route path="/faturamento/clientes" element={<FaturamentoClientes />} />
              <Route path="/faturamento/cadastrar-cliente" element={<CadastrarClienteFaturamento />} />
              <Route path="/faturamento/cadastros" element={<FilaCadastros />} />
            </Route>

            {/* Edição de pedido — acessível por faturamento e admin */}
            <Route element={<ProtectedRoute allow={["faturamento", "admin", "gestora_faturamento"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/faturamento/pedidos/:id/editar" element={<EditarPedidoFaturamento />} />
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

            {/* Logística */}
            <Route element={<ProtectedRoute allow={["logistica", "admin"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/logistica" element={<DashboardLogistica />} />
              <Route path="/logistica/fila" element={<FilaLogistica />} />
            </Route>

            {/* Trade — acessível por trade e admin */}
            <Route element={<ProtectedRoute allow={["trade", "admin"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/trade" element={<Trade />} />
              <Route path="/trade/campanhas" element={<TradeCampanhas />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
