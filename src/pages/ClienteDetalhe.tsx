import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatBRL, formatDate, formatCNPJ, formatCEP } from "@/lib/format";
import {
  AlertCircle, ArrowLeft, CreditCard, Pencil, Plus, Trash2,
  MapPin, Phone, Mail, User, DollarSign, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { CLUSTERS, TABELAS_PRECO } from "@/lib/constants";
import { PedidoDetalhesDialog } from "@/components/pedido/PedidoDetalhesDialog";
import { BadgeNegativado } from "@/components/BadgeNegativado";

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_faturamento: "Aguardando faturamento",
  no_sankhya: "No Sankhya",
  faturado: "Pré-faturado",
  parcialmente_faturado: "Parc. pré-faturado",
  com_problema: "Com problema",
  devolvido: "Devolvido",
  cancelado: "Cancelado",
  em_faturamento: "Em faturamento",
  em_cadastro: "Em cadastro",
  pendente: "Pendente",
  em_rota: "Em rota",
  entregue: "Entregue",
  revisao_necessaria: "Revisão necessária",
};

const STATUS_COLOR: Record<string, string> = {
  rascunho: "bg-gray-100 text-gray-600 border-gray-300",
  aguardando_faturamento: "bg-yellow-100 text-yellow-800 border-yellow-300",
  no_sankhya: "bg-blue-100 text-blue-800 border-blue-300",
  faturado: "bg-green-100 text-green-800 border-green-300",
  parcialmente_faturado: "bg-emerald-100 text-emerald-800 border-emerald-300",
  com_problema: "bg-red-100 text-red-800 border-red-300",
  devolvido: "bg-orange-100 text-orange-800 border-orange-300",
  cancelado: "bg-gray-800 text-gray-100 border-gray-700",
  em_faturamento: "bg-blue-100 text-blue-800 border-blue-300",
  pendente: "bg-orange-100 text-orange-800 border-orange-300",
  em_rota: "bg-gray-700 text-gray-100 border-gray-800",
  entregue: "bg-lime-100 text-lime-800 border-lime-300",
  revisao_necessaria: "bg-red-100 text-red-800 border-red-300",
};

function computeAtividade(data: string | null): "ativo" | "em_risco" | "inativo" {
  if (!data) return "inativo";
  const dias = Math.floor((Date.now() - new Date(data).getTime()) / 86_400_000);
  return dias <= 30 ? "ativo" : dias <= 90 ? "em_risco" : "inativo";
}

const ATIVIDADE = {
  ativo: { label: "Ativo", cls: "bg-green-100 text-green-800 border-green-300" },
  em_risco: { label: "Em risco", cls: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  inativo: { label: "Inativo", cls: "bg-red-100 text-red-800 border-red-300" },
};

type ClienteInfo = {
  id: string;
  razao_social: string;
  cnpj: string;
  codigo_parceiro: string | null;
  cluster: string | null;
  tabela_preco: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  telefone: string | null;
  email: string | null;
  comprador: string | null;
  negativado: boolean;
  aceita_saldo: boolean;
  suframa: boolean | null;
  vendedor_id: string | null;
  observacoes_trade: string | null;
};

type PedidoLinha = {
  id: string;
  numero_pedido: number;
  tipo: string;
  data_pedido: string;
  status: string;
  total: number;
};

type Vendedor = { id: string; nome: string };

function InfoItem({ label, value, icon }: { label: string; value: string | null | undefined; icon?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold mt-0.5">{value}</div>
    </div>
  );
}

export default function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role, user } = useAuth();

  const [cliente, setCliente] = useState<ClienteInfo | null>(null);
  const [pedidos, setPedidos] = useState<PedidoLinha[]>([]);
  const [vendedorNome, setVendedorNome] = useState<string | null>(null);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editNome, setEditNome] = useState("");
  const [editCnpj, setEditCnpj] = useState("");
  const [editCluster, setEditCluster] = useState("");
  const [editTabela, setEditTabela] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editComprador, setEditComprador] = useState("");
  const [editVendedorId, setEditVendedorId] = useState("");
  const [editObs, setEditObs] = useState("");
  const [salvandoEdit, setSalvandoEdit] = useState(false);

  // Obs tab
  const [obsLocal, setObsLocal] = useState("");
  const [salvandoObs, setSalvandoObs] = useState(false);

  // Delete
  const [excluirOpen, setExcluirOpen] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  // Order details
  const [detalhesId, setDetalhesId] = useState<string | null>(null);
  const [detalhesOpen, setDetalhesOpen] = useState(false);

  // Análise de crédito
  const [analiseOpen, setAnaliseOpen] = useState(false);
  const [analiseObs, setAnaliseObs] = useState("");
  const [salvandoAnalise, setSalvandoAnalise] = useState(false);

  const canEdit = role === "admin" || role === "faturamento";
  const canObs = canEdit || (role === "vendedor" && !!cliente && cliente.vendedor_id === user?.id);

  const enviarAnalise = async () => {
    if (!cliente) return;
    setSalvandoAnalise(true);
    const { error } = await (supabase.from("solicitacoes_analise") as any).insert({
      cliente_id: cliente.id,
      observacoes: analiseObs.trim() || null,
      status: "pendente",
    });
    setSalvandoAnalise(false);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Solicitação enviada!");
    setAnaliseOpen(false);
    setAnaliseObs("");
  };

  const carregar = async () => {
    if (!id) return;
    setLoading(true);
    const [cRes, pRes, profRes, roleRes] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, razao_social, cnpj, codigo_parceiro, cluster, tabela_preco, cidade, uf, cep, rua, numero, bairro, telefone, email, comprador, negativado, aceita_saldo, suframa, vendedor_id, observacoes_trade")
        .eq("id", id)
        .single(),
      supabase
        .from("pedidos")
        .select("id, numero_pedido, tipo, data_pedido, status, itens_pedido(total_item)")
        .eq("cliente_id", id)
        .order("data_pedido", { ascending: false })
        .limit(100),
      supabase.from("profiles").select("id, full_name, email"),
      supabase.from("user_roles").select("user_id").eq("role", "vendedor"),
    ]);

    if (cRes.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = cRes.data as any;
      const info: ClienteInfo = {
        id: c.id,
        razao_social: c.razao_social,
        cnpj: c.cnpj,
        codigo_parceiro: c.codigo_parceiro,
        cluster: c.cluster,
        tabela_preco: c.tabela_preco,
        cidade: c.cidade,
        uf: c.uf,
        cep: c.cep,
        rua: c.rua,
        numero: c.numero,
        bairro: c.bairro,
        telefone: c.telefone,
        email: c.email,
        comprador: c.comprador,
        negativado: c.negativado ?? false,
        aceita_saldo: c.aceita_saldo ?? false,
        suframa: c.suframa ?? null,
        vendedor_id: c.vendedor_id,
        observacoes_trade: c.observacoes_trade,
      };
      setCliente(info);
      setObsLocal(info.observacoes_trade ?? "");
    }

    if (pRes.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setPedidos((pRes.data as any[]).map((p) => ({
        id: p.id,
        numero_pedido: p.numero_pedido,
        tipo: p.tipo,
        data_pedido: p.data_pedido,
        status: p.status,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        total: (p.itens_pedido ?? []).reduce((s: number, i: any) => s + Number(i.total_item), 0),
      })));
    }

    if (profRes.data && roleRes.data) {
      const profMap: Record<string, string> = {};
      profRes.data.forEach((p) => { profMap[p.id] = p.full_name || p.email; });
      const vendedorIds = new Set(roleRes.data.map((r) => r.user_id));
      setVendedores(profRes.data.filter((p) => vendedorIds.has(p.id)).map((p) => ({ id: p.id, nome: p.full_name || p.email })));
      if (cRes.data?.vendedor_id) setVendedorNome(profMap[cRes.data.vendedor_id] ?? null);
    }

    setLoading(false);
  };

  useEffect(() => { carregar(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Financial calculations
  const agora = new Date();
  const mesAtual = agora.getMonth();
  const anoAtual = agora.getFullYear();

  const { totalMes, totalAno, ticketMedio, maiorPedido, pedidosAno, ultimaData } = useMemo(() => {
    const faturados = pedidos.filter((p) => p.status === "faturado");
    const desteAno = (p: PedidoLinha) => new Date(p.data_pedido).getFullYear() === anoAtual;
    const desteMes = (p: PedidoLinha) => {
      const d = new Date(p.data_pedido);
      return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
    };
    const totalMes = faturados.filter(desteMes).reduce((s, p) => s + p.total, 0);
    const totalAno = faturados.filter(desteAno).reduce((s, p) => s + p.total, 0);
    const totalGeral = faturados.reduce((s, p) => s + p.total, 0);
    const ticketMedio = faturados.length > 0 ? totalGeral / faturados.length : 0;
    const maiorPedido = pedidos.length > 0 ? Math.max(...pedidos.map((p) => p.total)) : 0;
    const pedidosAno = pedidos.filter((p) => p.status !== "rascunho" && desteAno(p)).length;
    const ultimaData = pedidos.find((p) => p.status !== "rascunho")?.data_pedido ?? null;
    return { totalMes, totalAno, ticketMedio, maiorPedido, pedidosAno, ultimaData };
  }, [pedidos, mesAtual, anoAtual]);

  const atividade = computeAtividade(ultimaData);
  const atividadeConf = ATIVIDADE[atividade];

  const abrirEdicao = () => {
    if (!cliente) return;
    setEditNome(cliente.razao_social);
    setEditCnpj(formatCNPJ(cliente.cnpj));
    setEditCluster(cliente.cluster ?? "");
    setEditTabela(cliente.tabela_preco ?? "");
    setEditEmail(cliente.email ?? "");
    setEditComprador(cliente.comprador ?? "");
    setEditVendedorId(cliente.vendedor_id ?? "");
    setEditObs(cliente.observacoes_trade ?? "");
    setEditOpen(true);
  };

  const salvarEdicao = async () => {
    if (!cliente || !editNome.trim()) return;
    setSalvandoEdit(true);
    const { error } = await supabase
      .from("clientes")
      .update({
        razao_social: editNome.trim(),
        cnpj: editCnpj.replace(/\D/g, ""),
        cluster: editCluster || null,
        tabela_preco: editTabela || null,
        email: editEmail.trim() || null,
        comprador: editComprador.trim() || null,
        vendedor_id: editVendedorId || null,
        observacoes_trade: editObs.trim() || null,
      })
      .eq("id", cliente.id);
    setSalvandoEdit(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    toast.success("Cliente atualizado");
    setEditOpen(false);
    carregar();
  };

  const salvarObs = async () => {
    if (!cliente) return;
    setSalvandoObs(true);
    const { error } = await supabase
      .from("clientes")
      .update({ observacoes_trade: obsLocal.trim() || null })
      .eq("id", cliente.id);
    setSalvandoObs(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    setCliente((c) => c ? { ...c, observacoes_trade: obsLocal } : c);
    toast.success("Observações salvas");
  };

  const excluir = async () => {
    if (!cliente) return;
    setExcluindo(true);
    const { error } = await supabase.from("clientes").delete().eq("id", cliente.id);
    setExcluindo(false);
    if (error) { toast.error("Erro ao excluir: " + error.message); return; }
    toast.success(`${cliente.razao_social} excluído`);
    navigate(-1);
  };

  const solicitarCredito = async () => {
    if (!cliente) return;
    const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    const adminIds = (adminRoles ?? []).map((r) => r.user_id);
    if (adminIds.length > 0) {
      const { error } = await supabase.from("notificacoes").insert(
        adminIds.map((uid) => ({
          destinatario_id: uid,
          destinatario_role: "admin",
          tipo: "analise_credito",
          mensagem: `Solicitação de análise de crédito: ${cliente.razao_social}`,
        }))
      );
      if (error) { toast.error("Erro ao enviar solicitação"); return; }
    }
    toast.success("Solicitação de análise de crédito enviada ao administrativo");
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <p className="text-muted-foreground">Cliente não encontrado.</p>
      </div>
    );
  }

  const enderecoPartes = [cliente.rua, cliente.numero ? `nº ${cliente.numero}` : null, cliente.bairro].filter(Boolean);
  const enderecoLinha = enderecoPartes.join(", ");

  return (
    <div className="space-y-6 pb-10">
      {/* Cabeçalho */}
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold leading-tight">{cliente.razao_social}</h1>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${atividadeConf.cls}`}>
                {atividadeConf.label}
              </span>
              {cliente.negativado && <BadgeNegativado />}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="font-mono">{formatCNPJ(cliente.cnpj)}</span>
              {(cliente.cidade || cliente.uf) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {[cliente.cidade, cliente.uf].filter(Boolean).join(" / ")}
                </span>
              )}
              {cliente.cluster && <Badge variant="outline">{cliente.cluster}</Badge>}
              {vendedorNome && <span className="flex items-center gap-1"><User className="h-3 w-3" />{vendedorNome}</span>}
              {cliente.tabela_preco && <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />Tabela {cliente.tabela_preco}</span>}
            </div>
          </div>

          {/* Ações */}
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              size="sm"
              onClick={() => navigate("/novo-pedido", { state: { fromCliente: { cliente_id: cliente.id, cnpj: cliente.cnpj, razao_social: cliente.razao_social, cidade: cliente.cidade, uf: cliente.uf, cep: cliente.cep, comprador: cliente.comprador, cluster: cliente.cluster, tabela_preco: cliente.tabela_preco } } })}
            >
              <Plus className="h-4 w-4" />
              Novo Pedido
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setAnaliseObs(""); setAnaliseOpen(true); }}>
              <CreditCard className="h-4 w-4" />
              Solicitar análise de crédito
            </Button>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={abrirEdicao}>
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            )}
            {canEdit && (
              <Button size="sm" variant="destructive" onClick={() => setExcluirOpen(true)}>
                <Trash2 className="h-4 w-4" />
                Excluir
              </Button>
            )}
          </div>
        </div>

        {/* Cards financeiros */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total no mês" value={formatBRL(totalMes)} />
          <StatCard label="Total no ano" value={formatBRL(totalAno)} />
          <StatCard label="Pedidos no ano" value={String(pedidosAno)} />
          <StatCard label="Último pedido" value={ultimaData ? formatDate(ultimaData) : "—"} />
        </div>
      </div>

      {/* Abas */}
      <Tabs defaultValue="dados">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="dados">Dados cadastrais</TabsTrigger>
          <TabsTrigger value="pedidos">Histórico de pedidos</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="obs">Observações</TabsTrigger>
        </TabsList>

        {/* ABA 1 — Dados cadastrais */}
        <TabsContent value="dados" className="mt-4">
          <Card>
            <CardContent className="pt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <InfoItem label="Razão Social" value={cliente.razao_social} />
              <InfoItem label="CNPJ" value={formatCNPJ(cliente.cnpj)} />
              {cliente.codigo_parceiro && <InfoItem label="Código Sankhya" value={cliente.codigo_parceiro} />}
              <InfoItem label="Comprador" value={cliente.comprador} icon={<User className="h-3 w-3" />} />
              <InfoItem label="Telefone" value={cliente.telefone} icon={<Phone className="h-3 w-3" />} />
              <InfoItem label="Email XML/Boleto" value={cliente.email} icon={<Mail className="h-3 w-3" />} />
              <InfoItem label="Cluster" value={cliente.cluster} />
              <InfoItem label="Tabela de preço" value={cliente.tabela_preco} />
              <InfoItem label="Vendedor" value={vendedorNome} icon={<User className="h-3 w-3" />} />

              {(cliente.cidade || cliente.uf || cliente.cep || enderecoLinha) && (
                <div className="flex flex-col gap-0.5 sm:col-span-2">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Endereço
                  </span>
                  {enderecoLinha && <span className="text-sm font-medium">{enderecoLinha}</span>}
                  <span className="text-sm font-medium">
                    {[cliente.cidade, cliente.uf].filter(Boolean).join(" / ")}
                    {cliente.cep ? ` — CEP ${formatCEP(cliente.cep)}` : ""}
                  </span>
                </div>
              )}

              <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3 pt-1">
                {cliente.negativado && <BadgeNegativado />}
                {cliente.aceita_saldo && (
                  <span className="inline-flex items-center rounded-full border border-green-300 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                    Aceita saldo de bolsão
                  </span>
                )}
                {cliente.suframa && (
                  <span className="inline-flex items-center rounded-full border border-purple-300 bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                    Suframa
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA 2 — Histórico de pedidos */}
        <TabsContent value="pedidos" className="mt-4 space-y-2">
          {pedidos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum pedido registrado</p>
          ) : (
            pedidos.slice(0, 10).map((p) => (
              <button
                key={p.id}
                type="button"
                className="w-full text-left rounded-md border bg-background p-4 hover:bg-muted/50 transition-colors"
                onClick={() => { setDetalhesId(p.id); setDetalhesOpen(true); }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-sm">#{p.numero_pedido}</span>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[p.status] ?? "bg-gray-100 text-gray-700 border-gray-300"}`}>
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(p.data_pedido)} · {p.tipo}
                      </div>
                    </div>
                  </div>
                  <span className="font-semibold text-sm text-green-700 whitespace-nowrap">{formatBRL(p.total)}</span>
                </div>
              </button>
            ))
          )}
        </TabsContent>

        {/* ABA 3 — Financeiro */}
        <TabsContent value="financeiro" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label={`Total faturado em ${agora.toLocaleString("pt-BR", { month: "long", year: "numeric" })}`} value={formatBRL(totalMes)} />
            <StatCard label={`Total faturado em ${anoAtual}`} value={formatBRL(totalAno)} />
            <StatCard label="Ticket médio (faturado)" value={formatBRL(ticketMedio)} />
            <StatCard label="Maior pedido" value={formatBRL(maiorPedido)} />
            <StatCard label={`Pedidos em ${anoAtual}`} value={String(pedidosAno)} />
            <StatCard label="Total de pedidos" value={String(pedidos.filter((p) => p.status !== "rascunho").length)} />
          </div>

          {ultimaData && (
            <p className="mt-4 text-sm text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Último pedido em {formatDate(ultimaData)} — status: <strong>{atividadeConf.label}</strong>
            </p>
          )}
        </TabsContent>

        {/* ABA 4 — Observações internas */}
        <TabsContent value="obs" className="mt-4">
          <Card>
            <CardContent className="pt-6 space-y-3">
              <p className="text-xs text-muted-foreground">
                Visível apenas internamente (admin, faturamento e vendedor do cliente). Não aparece no PDF.
              </p>
              <Textarea
                value={obsLocal}
                onChange={(e) => setObsLocal(e.target.value)}
                placeholder="Observações internas sobre o cliente..."
                rows={6}
                disabled={!canObs}
              />
              {canObs && (
                <div className="flex justify-end">
                  <Button onClick={salvarObs} disabled={salvandoObs} size="sm">
                    {salvandoObs && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Salvar observações
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal: editar cliente */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar cliente</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Razão Social *</Label>
                <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>CNPJ</Label>
                <Input value={editCnpj} onChange={(e) => setEditCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
              </div>
              <div className="space-y-1.5">
                <Label>Email XML/Boleto</Label>
                <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Cluster</Label>
                <Select value={editCluster} onValueChange={setEditCluster}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">— Nenhum —</SelectItem>
                    {CLUSTERS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tabela de preço</Label>
                <Select value={editTabela} onValueChange={setEditTabela}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">— Nenhuma —</SelectItem>
                    {TABELAS_PRECO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Comprador</Label>
                <Input value={editComprador} onChange={(e) => setEditComprador(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Vendedor (encarteiramento)</Label>
                <Select value={editVendedorId} onValueChange={setEditVendedorId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">— Nenhum —</SelectItem>
                    {vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Observações internas</Label>
                <Textarea value={editObs} onChange={(e) => setEditObs(e.target.value)} rows={3} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={salvarEdicao} disabled={salvandoEdit}>
              {salvandoEdit && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: excluir cliente */}
      <AlertDialog open={excluirOpen} onOpenChange={setExcluirOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. <strong>{cliente.razao_social}</strong> e todos os seus dados serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluir} disabled={excluindo} className="bg-red-600 hover:bg-red-700">
              {excluindo && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Excluir permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PedidoDetalhesDialog pedidoId={detalhesId} open={detalhesOpen} onOpenChange={setDetalhesOpen} />

      {/* Dialog: análise de crédito */}
      <Dialog open={analiseOpen} onOpenChange={setAnaliseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Solicitar análise de crédito — {cliente.razao_social}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Observações</Label>
            <Textarea
              rows={4}
              value={analiseObs}
              onChange={(e) => setAnaliseObs(e.target.value)}
              placeholder="Informe o motivo, histórico relevante, urgência..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnaliseOpen(false)}>Cancelar</Button>
            <Button onClick={enviarAnalise} disabled={salvandoAnalise}>
              {salvandoAnalise && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Enviar solicitação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
