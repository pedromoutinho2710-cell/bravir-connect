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
import PlaceholderPage from "@/components/PlaceholderPage";
import NovoPedido from "./pages/NovoPedido";
import MeusPedidos from "./pages/MeusPedidos";
import MeuPainel from "./pages/MeuPainel";
import MeusClientes from "./pages/MeusClientes";
import CadastrarCliente from "./pages/CadastrarCliente";
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
import PedidosAdmin from "./pages/admin/PedidosAdmin";
import ClientesAdmin from "./pages/admin/ClientesAdmin";
import ImportarClientes from "./pages/admin/ImportarClientes";
import ClienteDetalhe from "./pages/ClienteDetalhe";
import TabelasPreco from "./pages/admin/TabelasPreco";
import Configuracoes from "./pages/admin/Configuracoes";
import DashboardLogistica from "./pages/logistica/DashboardLogistica";
import FilaLogistica from "./pages/logistica/FilaLogistica";
import SiteLanding from "./pages/site/SiteLanding";
import SiteCandidatura from "./pages/site/SiteCandidatura";

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
            <Route element={<ProtectedRoute allow={["faturamento", "admin"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/faturamento" element={<Faturamento />} />
              <Route path="/faturamento/clientes-pendentes" element={<FaturamentoClientesPendentes />} />
              <Route path="/faturamento/clientes" element={<FaturamentoClientes />} />
              <Route path="/faturamento/cadastros" element={<FilaCadastros />} />
            </Route>

            {/* Detalhe de cliente — acessível por vendedor, admin, faturamento, trade */}
            <Route element={<ProtectedRoute allow={["vendedor", "admin", "faturamento", "trade"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/clientes/:id" element={<ClienteDetalhe />} />
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
