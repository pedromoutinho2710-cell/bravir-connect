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
import Faturamento from "./pages/Faturamento";
import Formularios from "./pages/admin/Formularios";
import Equipe from "./pages/admin/Equipe";
import Metas from "./pages/admin/Metas";
import Dashboard from "./pages/Dashboard";

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

            {/* Admin — tem acesso a tudo */}
            <Route element={<ProtectedRoute allow={["admin"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/admin/equipe" element={<Equipe />} />
              <Route path="/admin/metas" element={<Metas />} />
              <Route path="/admin/formularios" element={<Formularios />} />
              {/* rotas de vendedor acessíveis ao admin */}
              <Route path="/meu-painel" element={<MeuPainel />} />
              <Route path="/novo-pedido" element={<NovoPedido />} />
              <Route path="/meus-pedidos" element={<MeusPedidos />} />
              <Route path="/meus-clientes" element={<MeusClientes />} />
              {/* rota de faturamento acessível ao admin */}
              <Route path="/faturamento" element={<Faturamento />} />
            </Route>

            {/* Vendedor */}
            <Route element={<ProtectedRoute allow={["vendedor"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/meu-painel" element={<MeuPainel />} />
              <Route path="/novo-pedido" element={<NovoPedido />} />
              <Route path="/meus-pedidos" element={<MeusPedidos />} />
              <Route path="/meus-clientes" element={<MeusClientes />} />
            </Route>

            {/* Faturamento */}
            <Route element={<ProtectedRoute allow={["faturamento"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/faturamento" element={<Faturamento />} />
            </Route>

            {/* Logistica */}
            <Route element={<ProtectedRoute allow={["logistica"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/logistica" element={<PlaceholderPage title="Painel de Entregas" />} />
            </Route>

            {/* Trade */}
            <Route element={<ProtectedRoute allow={["trade"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/trade" element={<PlaceholderPage title="Painel Trade" />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
