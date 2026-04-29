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

            {/* Admin */}
            <Route element={<ProtectedRoute allow={["admin"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<PlaceholderPage title="Dashboard" />} />
              <Route path="/pedidos" element={<PlaceholderPage title="Pedidos" />} />
              <Route path="/vendedores" element={<PlaceholderPage title="Vendedores" />} />
              <Route path="/produtos" element={<PlaceholderPage title="Produtos" />} />
              <Route path="/metas" element={<PlaceholderPage title="Metas" />} />
            </Route>

            {/* Vendedor */}
            <Route element={<ProtectedRoute allow={["vendedor"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/meu-painel" element={<PlaceholderPage title="Meu Painel" />} />
              <Route path="/novo-pedido" element={<PlaceholderPage title="Novo Pedido" />} />
              <Route path="/meus-pedidos" element={<PlaceholderPage title="Meus Pedidos" />} />
            </Route>

            {/* Faturamento */}
            <Route element={<ProtectedRoute allow={["faturamento"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/faturamento" element={<PlaceholderPage title="Fila de Pedidos" />} />
              <Route path="/faturamento/todos" element={<PlaceholderPage title="Todos os Pedidos" />} />
            </Route>

            {/* Logistica */}
            <Route element={<ProtectedRoute allow={["logistica"]}><AppLayout /></ProtectedRoute>}>
              <Route path="/logistica" element={<PlaceholderPage title="Painel de Entregas" />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
