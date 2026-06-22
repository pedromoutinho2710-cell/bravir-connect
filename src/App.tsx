import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ImpersonationProvider } from "./contexts/ImpersonationContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import CalculadoraPublica from "./pages/CalculadoraPublica";
import PropostaPublica from "./pages/PropostaPublica";
import SiteLanding from "./pages/site/SiteLanding";
import SiteCandidatura from "./pages/site/SiteCandidatura";
import EventoQR from "./pages/EventoQR";
import EventoFormulario from "./pages/EventoFormulario";

// Vendedor
import MeuPainel from "./pages/vendedor/MeuPainel";
import MeusClientes from "./pages/vendedor/MeusClientes";
import MeusPedidos from "./pages/vendedor/MeusPedidos";
import NovoPedido from "./pages/vendedor/NovoPedido";
import CadastrarCliente from "./pages/vendedor/CadastrarCliente";
import MinhasTarefas from "./pages/vendedor/MinhasTarefas";
import MeuPipeline from "./pages/vendedor/MeuPipeline";
import DashboardIQVIA from "./pages/vendedor/DashboardIQVIA";

// Shared
import ClienteDetalhe from "./pages/ClienteDetalhe";
import MinhasPropostas from "./pages/MinhasPropostas";
import MinhasSolicitacoes from "./pages/MinhasSolicitacoes";
import NovaSolicitacao from "./pages/NovaSolicitacao";
import CalculadoraMargem from "./pages/CalculadoraMargem";
import Faturamento from "./pages/Faturamento";
import FaturamentoClientes from "./pages/FaturamentoClientes";
import FaturamentoClientesPendentes from "./pages/FaturamentoClientesPendentes";
import Trade from "./pages/Trade";
import TradeCampanhas from "./pages/TradeCampanhas";
import BolsaoPage from "./pages/BolsaoPage";
import Lixeira from "./pages/Lixeira";

// Admin
import VisaoMacro from "./pages/admin/VisaoMacro";
import PedidosAdmin from "./pages/admin/PedidosAdmin";
import ClientesAdmin from "./pages/admin/ClientesAdmin";
import ClientesAdminLista from "./pages/admin/ClientesAdminLista";
import Equipe from "./pages/admin/Equipe";
import GestaoPrecos from "./pages/admin/GestaoPrecos";
import TabelasPreco from "./pages/admin/TabelasPreco";
import GestaoMetas from "./pages/admin/GestaoMetas";
import Metas from "./pages/admin/Metas";
import Configuracoes from "./pages/admin/Configuracoes";
import Solicitacoes from "./pages/admin/Solicitacoes";
import Campanhas from "./pages/admin/Campanhas";
import AgenteIA from "./pages/admin/AgenteIA";
import Formularios from "./pages/admin/Formularios";
import ImportarClientes from "./pages/admin/ImportarClientes";
import GestaoEstoque from "./pages/admin/GestaoEstoque";
import BlingCallback from "./pages/admin/BlingCallback";

// Faturamento
import DashboardFaturamento from "./pages/faturamento/DashboardFaturamento";
import NovoPedidoFaturamento from "./pages/faturamento/NovoPedidoFaturamento";
import EditarPedidoFaturamento from "./pages/faturamento/EditarPedidoFaturamento";
import EditarPedido from "./pages/faturamento/EditarPedido";
import FilaCadastros from "./pages/faturamento/FilaCadastros";
import CadastrarClienteFaturamento from "./pages/faturamento/CadastrarClienteFaturamento";
import GestaoEstoqueFaturamento from "./pages/faturamento/GestaoEstoque";

// Financeiro
import FilaFinanceiro from "./pages/financeiro/FilaFinanceiro";

// Logística
import DashboardLogistica from "./pages/logistica/DashboardLogistica";
import FilaLogistica from "./pages/logistica/FilaLogistica";

// Gestora
import DashboardGestora from "./pages/gestora/DashboardGestora";
import ClientesGestora from "./pages/gestora/ClientesGestora";
import PedidosGestora from "./pages/gestora/PedidosGestora";
import NovoPedidoGestora from "./pages/gestora/NovoPedidoGestora";
import CadastrarClienteGestora from "./pages/gestora/CadastrarClienteGestora";
import GestaoTime from "./pages/gestora/GestaoTime";
import HistoricoFaturamento from "./pages/gestora/HistoricoFaturamento";
import LeadsEvento from "./pages/gestora/LeadsEvento";

// Trade
import ImportarFaturamento from "./pages/trade/ImportarFaturamento";
import ImportarMetas from "./pages/trade/ImportarMetas";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ImpersonationProvider>
          <Routes>
            {/* Públicas */}
            <Route path="/login" element={<Login />} />
            <Route path="/calculadora" element={<CalculadoraPublica />} />
            <Route path="/proposta/:token" element={<PropostaPublica />} />
            <Route path="/" element={<SiteLanding />} />
            <Route path="/candidatura" element={<SiteCandidatura />} />
            <Route path="/evento/:id/qr" element={<EventoQR />} />
            <Route path="/evento/:id/formulario" element={<EventoFormulario />} />
            <Route path="/bling/callback" element={<BlingCallback />} />

            {/* App */}
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />

              {/* Vendedor */}
              <Route path="/vendedor/painel" element={<MeuPainel />} />
              <Route path="/vendedor/clientes" element={<MeusClientes />} />
              <Route path="/vendedor/clientes/:id" element={<ClienteDetalhe />} />
              <Route path="/vendedor/clientes/novo" element={<CadastrarCliente />} />
              <Route path="/vendedor/pedidos" element={<MeusPedidos />} />
              <Route path="/vendedor/pedidos/novo" element={<NovoPedido />} />
              <Route path="/vendedor/tarefas" element={<MinhasTarefas />} />
              <Route path="/vendedor/pipeline" element={<MeuPipeline />} />
              <Route path="/vendedor/iqvia" element={<DashboardIQVIA />} />
              <Route path="/vendedor/propostas" element={<MinhasPropostas />} />
              <Route path="/vendedor/solicitacoes" element={<MinhasSolicitacoes />} />
              <Route path="/vendedor/solicitacoes/nova" element={<NovaSolicitacao />} />
              <Route path="/vendedor/calculadora" element={<CalculadoraMargem />} />

              {/* Shared */}
              <Route path="/clientes/:id" element={<ClienteDetalhe />} />
              <Route path="/faturamento" element={<Faturamento />} />
              <Route path="/faturamento/clientes" element={<FaturamentoClientes />} />
              <Route path="/faturamento/pendentes" element={<FaturamentoClientesPendentes />} />
              <Route path="/trade" element={<Trade />} />
              <Route path="/trade/campanhas" element={<TradeCampanhas />} />
              <Route path="/bolsao" element={<BolsaoPage />} />
              <Route path="/lixeira" element={<Lixeira />} />

              {/* Admin */}
              <Route path="/admin/visao-macro" element={<VisaoMacro />} />
              <Route path="/admin/pedidos" element={<PedidosAdmin />} />
              <Route path="/admin/clientes" element={<ClientesAdmin />} />
              <Route path="/admin/clientes/lista" element={<ClientesAdminLista />} />
              <Route path="/admin/clientes/:id" element={<ClienteDetalhe />} />
              <Route path="/admin/equipe" element={<Equipe />} />
              <Route path="/admin/precos" element={<GestaoPrecos />} />
              <Route path="/admin/tabelas-preco" element={<TabelasPreco />} />
              <Route path="/admin/metas" element={<GestaoMetas />} />
              <Route path="/admin/metas/painel" element={<Metas />} />
              <Route path="/admin/configuracoes" element={<Configuracoes />} />
              <Route path="/admin/solicitacoes" element={<Solicitacoes />} />
              <Route path="/admin/campanhas" element={<Campanhas />} />
              <Route path="/admin/agente-ia" element={<AgenteIA />} />
              <Route path="/admin/formularios" element={<Formularios />} />
              <Route path="/admin/importar-clientes" element={<ImportarClientes />} />
              <Route path="/admin/estoque" element={<GestaoEstoque />} />

              {/* Faturamento interno */}
              <Route path="/fat/dashboard" element={<DashboardFaturamento />} />
              <Route path="/fat/novo-pedido" element={<NovoPedidoFaturamento />} />
              <Route path="/fat/pedidos/:id/editar" element={<EditarPedidoFaturamento />} />
              <Route path="/fat/pedidos/:id" element={<EditarPedido />} />
              <Route path="/fat/fila-cadastros" element={<FilaCadastros />} />
              <Route path="/fat/cadastrar-cliente" element={<CadastrarClienteFaturamento />} />
              <Route path="/fat/estoque" element={<GestaoEstoqueFaturamento />} />

              {/* Financeiro */}
              <Route path="/financeiro/fila" element={<FilaFinanceiro />} />

              {/* Logística */}
              <Route path="/logistica/dashboard" element={<DashboardLogistica />} />
              <Route path="/logistica/fila" element={<FilaLogistica />} />

              {/* Gestora */}
              <Route path="/gestora/dashboard" element={<DashboardGestora />} />
              <Route path="/gestora/clientes" element={<ClientesGestora />} />
              <Route path="/gestora/clientes/:id" element={<ClienteDetalhe />} />
              <Route path="/gestora/clientes/novo" element={<CadastrarClienteGestora />} />
              <Route path="/gestora/pedidos" element={<PedidosGestora />} />
              <Route path="/gestora/pedidos/novo" element={<NovoPedidoGestora />} />
              <Route path="/gestora/time" element={<GestaoTime />} />
              <Route path="/gestora/historico" element={<HistoricoFaturamento />} />
              <Route path="/gestora/leads" element={<LeadsEvento />} />

              {/* Trade */}
              <Route path="/trade/importar-faturamento" element={<ImportarFaturamento />} />
              <Route path="/trade/importar-metas" element={<ImportarMetas />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </ImpersonationProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
