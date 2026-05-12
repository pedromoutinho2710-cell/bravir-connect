import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CLUSTERS } from "@/lib/constants";
import {
  Loader2, TrendingUp, ShoppingCart, Users, Clock, AlertTriangle,
  ClipboardCheck, ExternalLink, UserPlus,
} from "lucide-react";
import { toast } from "sonner";

const ANO = new Date().getFullYear();
const MES = new Date().getMonth() + 1;
const DIA = new Date().getDate();
const INICIO_MES = `${ANO}-${String(MES).padStart(2, "0")}-01`;
const FIM_MES = new Date(ANO, MES, 0).toISOString().slice(0, 10);

type VendedorRanking = {
  id: string;
  nome: string;
  pedidos: number;
  total: number;
  meta: number;
  pct: number;
};

type Cadastro = {
  id: string;
  nome_cliente: string | null;
  cnpj: string | null;
  razao_social: string | null;
  contato_principal: string | null;
  email: string | null;
  telefone: string | null;
  classificacao: string | null;
  qtd_vendedores: number | null;
  perfil_atacado_distribuidor: string | null;
  qtd_lojas: string | null;
  marcas_interesse: string[] | null;
  produtos_alivik: string[] | null;
  produtos_bravir: string[] | null;
  produtos_bendita: string[] | null;
  produtos_laby: string[] | null;
  vende_digital: boolean | null;
  tem_ecommerce: boolean | null;
  canal_ecommerce: string | null;
  percentual_b2c: number | null;
  percentual_b2b: number | null;
  status: string;
  origem: string;
  vendedor_id: string | null;
  vendedor_nome: string | null;
  cluster_sugerido: string | null;
  observacoes: string | null;
  negativado: boolean | null;
  motivo_reprovacao: string | null;
  created_at: string;
};

type AlertaCliente = { id: string; razao_social: string; ultimoPedido: string };
type Analise = { id: string; cliente_id: string; observacoes: string | null; created_at: string; razao_social?: string };

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value && value !== 0 && value !== false) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="font-medium text-muted-foreground min-w-40">{label}:</span>
      <span>{value}</span>
    </div>
  );
}

function StatusBadge({ pct }: { pct: number }) {
  if (pct >= 100) return <Badge className="bg-green-100 text-green-800 border-green-300">Atingiu</Badge>;
  if (pct >= 70) return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">Em curso</Badge>;
  return <Badge className="bg-red-100 text-red-800 border-red-300">Abaixo</Badge>;
}

export default function DashboardGestora() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  // KPIs
  const [totalFaturado, setTotalFaturado] = useState(0);
  const [totalPedidos, setTotalPedidos] = useState(0);
  const [novosCientes, setNovasClientes] = useState(0);
  const [leadsPendentes, setLeadsPendentes] = useState(0);

  // Ranking
  const [ranking, setRanking] = useState<VendedorRanking[]>([]);

  // Fila cadastros
  const [cadastros, setCadastros] = useState<Cadastro[]>([]);
  const [selected, setSelected] = useState<Cadastro | null>(null);
  const [clusterEdit, setClusterEdit] = useState("");
  const [negativadoEdit, setNegativadoEdit] = useState(false);
  const [showReprovar, setShowReprovar] = useState(false);
  const [motivoReprovacao, setMotivoReprovacao] = useState("");
  const [saving, setSaving] = useState(false);

  // Alertas
  const [clientesInativos, setClientesInativos] = useState<AlertaCliente[]>([]);
  const [analises, setAnalises] = useState<Analise[]>([]);
  const [vendedoresSemPedido, setVendedoresSemPedido] = useState<string[]>([]);

  // load usa apenas setters estáveis (useState) e constantes de módulo — seguro executar só na montagem
  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const ha60Dias = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const ha90Dias = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const [
        pedidosMesRes,
        clientesAprovadosRes,
        pendentesRes,
        metasRes,
        vendedoresRes,
        profRes,
        pedidosRecentesRes,
        clientesRes,
        analisesRes,
        cadastrosRes,
      ] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("pedidos")
          .select("id, vendedor_id, itens_pedido(total_item)")
          .gte("data_pedido", INICIO_MES)
          .lte("data_pedido", FIM_MES)
          .not("status", "in", '("rascunho","cancelado")'),

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("cadastros_pendentes")
          .select("id", { count: "exact", head: true })
          .eq("status", "aprovado")
          .gte("created_at", `${INICIO_MES}T00:00:00`),

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("cadastros_pendentes")
          .select("id", { count: "exact", head: true })
          .eq("status", "pendente"),

        supabase.from("metas").select("vendedor_id, valor_meta_reais").eq("mes", MES).eq("ano", ANO),

        supabase.from("user_roles").select("user_id").eq("role", "vendedor"),

        supabase.from("profiles").select("id, full_name, email"),

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("pedidos")
          .select("cliente_id, data_pedido")
          .gte("data_pedido", ha90Dias)
          .not("status", "in", '("rascunho","cancelado")'),

        supabase.from("clientes").select("id, razao_social"),

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("solicitacoes_analise")
          .select("id, cliente_id, observacoes, created_at")
          .eq("status", "pendente")
          .order("created_at", { ascending: false }),

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("cadastros_pendentes")
          .select("*")
          .eq("status", "pendente")
          .order("created_at", { ascending: true }),
      ]);

      // KPIs — pedidos do mês
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pedidosMes = (pedidosMesRes.data ?? []) as any[];
      let faturado = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pedidosMes.forEach((p: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p.itens_pedido ?? []).forEach((i: any) => { faturado += Number(i.total_item ?? 0); });
      });
      setTotalFaturado(faturado);
      setTotalPedidos(pedidosMes.length);
      setNovasClientes(clientesAprovadosRes.count ?? 0);
      setLeadsPendentes(pendentesRes.count ?? 0);

      // Ranking vendedores
      const profMap: Record<string, string> = {};
      (profRes.data ?? []).forEach((p: { id: string; full_name: string | null; email: string | null }) => {
        profMap[p.id] = p.full_name || p.email || p.id;
      });
      const metaMap: Record<string, number> = {};
      (metasRes.data ?? []).forEach((m: { vendedor_id: string; valor_meta_reais: number }) => {
        metaMap[m.vendedor_id] = Number(m.valor_meta_reais);
      });

      // Group pedidos por vendedor
      const vendedorTotais: Record<string, { total: number; pedidos: number }> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pedidosMes.forEach((p: any) => {
        const vid = p.vendedor_id;
        if (!vid) return;
        if (!vendedorTotais[vid]) vendedorTotais[vid] = { total: 0, pedidos: 0 };
        vendedorTotais[vid].pedidos += 1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p.itens_pedido ?? []).forEach((i: any) => {
          vendedorTotais[vid].total += Number(i.total_item ?? 0);
        });
      });

      const vendedorIds = new Set([
        ...(vendedoresRes.data ?? []).map((r: { user_id: string }) => r.user_id),
        ...Object.keys(vendedorTotais),
      ]);

      const rankingList: VendedorRanking[] = Array.from(vendedorIds).map((vid) => {
        const dados = vendedorTotais[vid] ?? { total: 0, pedidos: 0 };
        const meta = metaMap[vid] ?? 0;
        const pct = meta > 0 ? (dados.total / meta) * 100 : 0;
        return {
          id: vid,
          nome: profMap[vid] ?? vid,
          pedidos: dados.pedidos,
          total: dados.total,
          meta,
          pct,
        };
      });
      rankingList.sort((a, b) => b.total - a.total);
      setRanking(rankingList);

      // Alertas — clientes inativos (>60 dias)
      const ultimoPedidoMap: Record<string, string> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pedidosRecentesRes.data ?? []).forEach((p: any) => {
        const cid = p.cliente_id;
        if (!ultimoPedidoMap[cid] || p.data_pedido > ultimoPedidoMap[cid]) {
          ultimoPedidoMap[cid] = p.data_pedido;
        }
      });
      const clienteNomeMap: Record<string, string> = {};
      (clientesRes.data ?? []).forEach((c: { id: string; razao_social: string }) => {
        clienteNomeMap[c.id] = c.razao_social;
      });
      const inativos: AlertaCliente[] = Object.entries(ultimoPedidoMap)
        .filter(([, date]) => date < ha60Dias)
        .map(([id, ultimoPedido]) => ({ id, razao_social: clienteNomeMap[id] ?? id, ultimoPedido }))
        .sort((a, b) => a.ultimoPedido.localeCompare(b.ultimoPedido));
      setClientesInativos(inativos.slice(0, 10));

      // Alertas — solicitações análise
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const analisesRaw = (analisesRes.data ?? []) as any[];
      const analisesComNome = analisesRaw.map((a) => ({
        ...a,
        razao_social: clienteNomeMap[a.cliente_id] ?? "—",
      }));
      setAnalises(analisesComNome);

      // Alertas — vendedores sem pedido no mês
      const comPedido = new Set(Object.keys(vendedorTotais));
      const semPedido = (vendedoresRes.data ?? [])
        .map((r: { user_id: string }) => r.user_id)
        .filter((id: string) => !comPedido.has(id))
        .map((id: string) => profMap[id] ?? id);
      setVendedoresSemPedido(semPedido);

      // Fila de cadastros pendentes
      setCadastros((cadastrosRes.data ?? []) as Cadastro[]);
    } catch (err) {
      console.error("Erro no DashboardGestora:", err);
      toast.error("Erro ao carregar dashboard.");
    } finally {
      setLoading(false);
    }
  };

  const openDialog = (c: Cadastro) => {
    setSelected(c);
    setClusterEdit(c.cluster_sugerido ?? "");
    setNegativadoEdit(c.negativado ?? false);
    setMotivoReprovacao("");
  };

  const handleAprovar = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: upErr } = await (supabase as any)
        .from("cadastros_pendentes")
        .update({ status: "aprovado", cluster_sugerido: clusterEdit || null, negativado: negativadoEdit })
        .eq("id", selected.id);
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from("clientes").insert({
        razao_social: selected.razao_social ?? selected.nome_cliente ?? "Sem nome",
        cnpj: selected.cnpj ?? "00000000000000",
        email: selected.email ?? null,
        telefone: selected.telefone ?? null,
        cluster: clusterEdit || null,
        negativado: negativadoEdit,
        vendedor_id: selected.vendedor_id ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      if (insErr) throw insErr;

      toast.success("Cadastro aprovado e cliente criado!");
      setSelected(null);
      load();
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Erro ao aprovar.");
    } finally {
      setSaving(false);
    }
  };

  const handleReprovar = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("cadastros_pendentes")
        .update({
          status: "reprovado",
          motivo_reprovacao: motivoReprovacao || null,
          cluster_sugerido: clusterEdit || null,
          negativado: negativadoEdit,
        })
        .eq("id", selected.id);
      if (error) throw error;
      toast.success("Cadastro reprovado.");
      setShowReprovar(false);
      setSelected(null);
      load();
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Erro ao reprovar.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const media = totalPedidos > 0 ? totalFaturado / totalPedidos : 0;
  const mesPorExtenso = new Date(ANO, MES - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard — Gestora</h1>
        <p className="text-sm text-muted-foreground capitalize">{mesPorExtenso}</p>
      </div>

      {/* BLOCO 1 — KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total faturado</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{formatBRL(totalFaturado)}</div>
            <div className="text-xs text-muted-foreground mt-1">no mês atual</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Pedidos enviados</CardTitle>
            <ShoppingCart className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{totalPedidos}</div>
            <div className="text-xs text-muted-foreground mt-1">no mês atual</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Média por pedido</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-700">{formatBRL(media)}</div>
            <div className="text-xs text-muted-foreground mt-1">ticket médio</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Novos clientes</CardTitle>
            <Users className="h-4 w-4 text-teal-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-teal-700">{novosCientes}</div>
            <div className="text-xs text-muted-foreground mt-1">aprovados no mês</div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate("/faturamento/cadastros")}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Leads pendentes</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-700">{leadsPendentes}</div>
            <div className="text-xs text-muted-foreground mt-1">aguardando aprovação</div>
          </CardContent>
        </Card>
      </div>

      {/* BLOCO 2 — Ranking vendedores */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Ranking de vendedores — {mesPorExtenso}</h2>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendedor</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Total vendido</TableHead>
                <TableHead className="text-right">Meta</TableHead>
                <TableHead className="text-right">% Atingido</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranking.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nenhum dado.</TableCell></TableRow>
              )}
              {ranking.map((v) => {
                const emAlerta = DIA > 15 && v.pct < 50;
                return (
                  <TableRow key={v.id} className={emAlerta ? "bg-red-50" : ""}>
                    <TableCell className="font-medium text-sm">{v.nome}</TableCell>
                    <TableCell className="text-right text-sm">{v.pedidos}</TableCell>
                    <TableCell className="text-right font-semibold text-sm">{formatBRL(v.total)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {v.meta > 0 ? formatBRL(v.meta) : <span className="italic">Sem meta</span>}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold">
                      {v.meta > 0 ? `${v.pct.toFixed(0)}%` : "—"}
                    </TableCell>
                    <TableCell>
                      {v.meta > 0 ? <StatusBadge pct={v.pct} /> : <Badge variant="outline">Sem meta</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* BLOCO 3 — Fila de cadastros pendentes */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          Cadastros pendentes de aprovação
          {cadastros.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300 px-2 py-0.5 text-xs font-bold">
              {cadastros.length}
            </span>
          )}
        </h2>
        {cadastros.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum cadastro pendente.</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cadastros.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(c.created_at.slice(0, 10))}</TableCell>
                    <TableCell className="font-medium text-sm">{c.nome_cliente ?? c.razao_social ?? "—"}</TableCell>
                    <TableCell>
                      {c.origem === "site" ? (
                        <Badge variant="outline" className="border-blue-400 bg-blue-50 text-blue-700 text-xs">Site</Badge>
                      ) : (
                        <Badge variant="outline" className="border-green-400 bg-green-50 text-green-700 text-xs">Vendedor</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.vendedor_nome ?? "—"}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => openDialog(c)}>
                        Ver e aprovar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* BLOCO 4 — Alertas */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Clientes inativos */}
        <Card className="border-orange-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Clientes inativos (+60 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {clientesInativos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum cliente inativo.</p>
            ) : (
              <div className="space-y-2">
                {clientesInativos.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-sm">
                    <span className="truncate max-w-[160px]">{c.razao_social}</span>
                    <span className="text-muted-foreground text-xs ml-2 flex-shrink-0">{formatDate(c.ultimoPedido)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Solicitações análise crédito */}
        <Card className="border-purple-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-purple-500" />
              Análises de crédito pendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analises.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma pendente.</p>
            ) : (
              <div className="space-y-2">
                {analises.slice(0, 8).map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-sm">
                    <span className="truncate max-w-[160px]">{a.razao_social}</span>
                    <span className="text-muted-foreground text-xs ml-2 flex-shrink-0">{formatDate(a.created_at.slice(0, 10))}</span>
                  </div>
                ))}
                {analises.length > 8 && (
                  <p className="text-xs text-muted-foreground">+{analises.length - 8} mais</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Vendedores sem pedido */}
        <Card className="border-red-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Vendedores sem pedido no mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            {vendedoresSemPedido.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todos venderam no mês.</p>
            ) : (
              <div className="space-y-1">
                {vendedoresSemPedido.map((nome) => (
                  <div key={nome} className="text-sm text-red-700 font-medium">{nome}</div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* BLOCO 5 — Configurações rápidas */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Configurações rápidas</h2>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => navigate("/gestora/cadastrar-cliente")} className="gap-2">
            <UserPlus className="h-4 w-4" /> Cadastrar Cliente
          </Button>
          <Button variant="outline" onClick={() => navigate("/gestora/time")} className="gap-2">
            <ExternalLink className="h-4 w-4" /> Ver time completo
          </Button>
        </div>
      </div>

      {/* Dialog de aprovação de cadastro */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.nome_cliente ?? selected.razao_social ?? "Cadastro"}</DialogTitle>
              </DialogHeader>

              <div className="space-y-5 py-2">
                <div>
                  <h3 className="font-semibold mb-2">Dados básicos</h3>
                  <div className="space-y-1">
                    <InfoRow label="Nome fantasia" value={selected.nome_cliente} />
                    <InfoRow label="Razão social" value={selected.razao_social} />
                    <InfoRow label="CNPJ" value={selected.cnpj} />
                    <InfoRow label="Contato" value={selected.contato_principal} />
                    <InfoRow label="E-mail" value={selected.email} />
                    <InfoRow label="Telefone" value={selected.telefone} />
                    <InfoRow label="Origem" value={selected.origem === "site" ? "Site" : "Vendedor"} />
                    <InfoRow label="Vendedor" value={selected.vendedor_nome} />
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Classificação</h3>
                  <div className="space-y-1">
                    <InfoRow label="Tipo" value={selected.classificacao} />
                    {selected.qtd_vendedores != null && <InfoRow label="Qtd. vendedores" value={selected.qtd_vendedores} />}
                    {selected.perfil_atacado_distribuidor && <InfoRow label="Perfil" value={selected.perfil_atacado_distribuidor} />}
                    {selected.qtd_lojas && <InfoRow label="Qtd. lojas" value={selected.qtd_lojas} />}
                    {selected.marcas_interesse && selected.marcas_interesse.length > 0 && (
                      <InfoRow label="Marcas de interesse" value={selected.marcas_interesse.join(", ")} />
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Digital</h3>
                  <div className="space-y-1">
                    <InfoRow label="Vende digital" value={selected.vende_digital ? "Sim" : "Não"} />
                    {selected.vende_digital && (
                      <InfoRow label="Tem e-commerce" value={selected.tem_ecommerce ? "Sim" : "Não"} />
                    )}
                  </div>
                </div>

                {selected.observacoes && (
                  <div>
                    <h3 className="font-semibold mb-2">Observações</h3>
                    <p className="text-sm text-muted-foreground">{selected.observacoes}</p>
                  </div>
                )}

                {selected.status === "pendente" && (
                  <div className="space-y-4 border-t pt-4">
                    <h3 className="font-semibold">Análise</h3>
                    <div className="space-y-1.5">
                      <Label>Cluster</Label>
                      <Select value={clusterEdit} onValueChange={setClusterEdit}>
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {CLUSTERS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={negativadoEdit} onCheckedChange={setNegativadoEdit} />
                      <Label>Marcar como negativado</Label>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 flex-wrap">
                <Button variant="outline" onClick={() => setSelected(null)}>Fechar</Button>
                {selected.status === "pendente" && (
                  <>
                    <Button variant="destructive" onClick={() => setShowReprovar(true)} disabled={saving}>
                      Reprovar
                    </Button>
                    <Button onClick={handleAprovar} disabled={saving}>
                      {saving ? "Salvando..." : "Aprovar"}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showReprovar} onOpenChange={setShowReprovar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reprovar cadastro</AlertDialogTitle>
            <AlertDialogDescription>
              Informe o motivo da reprovação (opcional).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            rows={3}
            value={motivoReprovacao}
            onChange={(e) => setMotivoReprovacao(e.target.value)}
            placeholder="Ex: cliente já cadastrado, CNPJ inativo..."
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReprovar} disabled={saving}>
              Confirmar reprovação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
