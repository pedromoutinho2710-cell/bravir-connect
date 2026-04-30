import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatBRL, formatDate } from "@/lib/format";
import { Loader2, FileSpreadsheet, Eye, FileCheck, Clock, CheckCircle2, Timer, AlertTriangle, Trash2 } from "lucide-react";
import { MARCAS } from "@/lib/constants";
import { PedidoDetalhesDialog } from "@/components/pedido/PedidoDetalhesDialog";
import { exportarPedidoExcel } from "@/lib/excel";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

type PedidoFat = {
  id: string;
  numero_pedido: number;
  tipo: string;
  data_pedido: string;
  status: string;
  cond_pagamento: string | null;
  observacoes: string | null;
  responsavel_id: string | null;
  motivo: string | null;
  vendedor_id: string;
  razao_social: string;
  cnpj: string;
  cidade: string | null;
  uf: string | null;
  comprador: string | null;
  cep: string | null;
  perfil_cliente: string;
  tabela_preco: string;
  agendamento: boolean;
  total: number;
  marcas: string[];
  aberto_por: string | null;
  ultima_acao: { nome: string; data: string } | null;
  itens: ExcelItemRaw[];
};

type ExcelItemRaw = {
  nome: string;
  codigo: string;
  marca: string;
  quantidade: number;
  cx_embarque: number;
  peso_unitario: number;
  preco_bruto: number;
  desconto_perfil: number;
  desconto_comercial: number;
  desconto_trade: number;
  preco_apos_perfil: number;
  preco_apos_comercial: number;
  preco_final: number;
  total: number;
};

const STATUS_LABEL: Record<string, string> = {
  aguardando_faturamento: "Aguardando",
  em_faturamento: "Em faturamento",
  faturado: "Faturado",
  devolvido: "Devolvido",
  cancelado: "Cancelado",
};

const STATUS_COLOR: Record<string, string> = {
  aguardando_faturamento: "bg-yellow-100 text-yellow-800 border-yellow-300",
  em_faturamento: "bg-blue-100 text-blue-800 border-blue-300",
  faturado: "bg-green-100 text-green-800 border-green-300",
  devolvido: "bg-orange-100 text-orange-800 border-orange-300",
  cancelado: "bg-red-100 text-red-800 border-red-300",
};

export default function Faturamento() {
  const { user } = useAuth();

  const [pedidos, setPedidos] = useState<PedidoFat[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [vendedores, setVendedores] = useState<{ id: string; label: string }[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [atualizando, setAtualizando] = useState<string | null>(null);
  const [exportando, setExportando] = useState<string | null>(null);

  // Filtros
  const [filtroVendedor, setFiltroVendedor] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");
  const [filtroMarca, setFiltroMarca] = useState("todas");

  const [kpis, setKpis] = useState({ aguardando: 0, faturadosHoje: 0, tempoMedio: 0, comProblema: 0 });

  // Dialog motivo
  const [motivoDialog, setMotivoDialog] = useState<{ type: "devolver" | "cancelar"; id: string } | null>(null);
  const [motivo, setMotivo] = useState("");

  // Dialog editar
  const [editDialog, setEditDialog] = useState<PedidoFat | null>(null);
  const [editCondPag, setEditCondPag] = useState("");
  const [editObs, setEditObs] = useState("");
  const [salvandoEdit, setSalvandoEdit] = useState(false);

  // Dialog detalhes
  const [detalhesId, setDetalhesId] = useState<string | null>(null);
  const [detalhesOpen, setDetalhesOpen] = useState(false);

  // Dialog faturar NF
  const [faturarDialog, setFaturarDialog] = useState<PedidoFat | null>(null);
  const [nfData, setNfData] = useState<{ numero: string; rastreio: string; obs: string; file: File | null }>({
    numero: "", rastreio: "", obs: "", file: null,
  });
  const [itensQtd, setItensQtd] = useState<Record<number, number>>({});
  const [submetendoNf, setSubmetendoNf] = useState(false);

  // Dialog excluir
  const [excluirTarget, setExcluirTarget] = useState<PedidoFat | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(() => setRefreshKey((k) => k + 1), []);
  usePullToRefresh(carregar);

  useEffect(() => {
    supabase.from("profiles").select("id, email, full_name").then(({ data }) => {
      if (!data) return;
      const map: Record<string, string> = {};
      data.forEach((p) => { map[p.id] = p.full_name || p.email; });
      setProfiles(map);
      setVendedores(data.map((p) => ({ id: p.id, label: p.full_name || p.email })));
    });
  }, []);

  useEffect(() => {
    (async () => {
      const hoje = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const hojeStr = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;
      const hojeInicio = `${hojeStr}T00:00:00`;

      const [agRes, fatHojeRes, tempoRes, problemaRes] = await Promise.all([
        supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "aguardando_faturamento"),
        supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "faturado").gte("faturado_em", hojeInicio),
        supabase.from("pedidos").select("created_at, faturado_em").eq("status", "faturado").not("faturado_em", "is", null),
        supabase.from("pedidos").select("id", { count: "exact", head: true }).in("status", ["devolvido", "cancelado"]),
      ]);

      let tempoMedio = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const faturadosPedidos = (tempoRes.data ?? []) as any[];
      if (faturadosPedidos.length > 0) {
        const totalMs = faturadosPedidos.reduce((s: number, p: { created_at: string; faturado_em: string }) => {
          return s + (new Date(p.faturado_em).getTime() - new Date(p.created_at).getTime());
        }, 0);
        // Converter de ms para dias (1000ms * 60s * 60min * 24h)
        tempoMedio = totalMs / faturadosPedidos.length / (1000 * 60 * 60 * 24);
      }

      setKpis({
        aguardando: agRes.count ?? 0,
        faturadosHoje: fatHojeRes.count ?? 0,
        tempoMedio,
        comProblema: problemaRes.count ?? 0,
      });
    })();
  }, [refreshKey]);

  useEffect(() => {
    setLoading(true);
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = supabase
        .from("pedidos")
        .select(`
          id, numero_pedido, tipo, data_pedido, status, cond_pagamento, observacoes,
          responsavel_id, motivo, vendedor_id, perfil_cliente, tabela_preco, agendamento,
          clientes(razao_social, cnpj, cidade, uf, comprador, cep),
          itens_pedido(
            total_item, quantidade, preco_unitario_bruto, preco_unitario_liquido,
            desconto_perfil, desconto_comercial, desconto_trade,
            preco_apos_perfil, preco_apos_comercial, preco_final,
            produtos(nome, codigo_jiva, marca, cx_embarque, peso_unitario)
          )
        `)
        .neq("status", "rascunho")
        .order("created_at", { ascending: false });

      if (filtroVendedor !== "todos") query = query.eq("vendedor_id", filtroVendedor);
      if (filtroStatus !== "todos") query = query.eq("status", filtroStatus);
      if (filtroDataInicio) query = query.gte("data_pedido", filtroDataInicio);
      if (filtroDataFim) query = query.lte("data_pedido", filtroDataFim);

      const { data, error } = await query;
      if (error) { toast.error("Erro ao carregar pedidos"); return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let mapped: PedidoFat[] = (data ?? []).map((p: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const itensList = (p.itens_pedido ?? []) as any[];
        const marcas = [...new Set(itensList.map((i) => i.produtos?.marca).filter(Boolean))] as string[];
        const total = itensList.reduce((s: number, i) => s + Number(i.total_item), 0);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cl = p.clientes as any;
        return {
          id: p.id,
          numero_pedido: p.numero_pedido,
          tipo: p.tipo,
          data_pedido: p.data_pedido,
          status: p.status,
          cond_pagamento: p.cond_pagamento,
          observacoes: p.observacoes,
          responsavel_id: p.responsavel_id,
          motivo: p.motivo,
          vendedor_id: p.vendedor_id,
          perfil_cliente: p.perfil_cliente,
          tabela_preco: p.tabela_preco,
          agendamento: p.agendamento,
          razao_social: cl?.razao_social ?? "—",
          cnpj: cl?.cnpj ?? "—",
          cidade: cl?.cidade ?? null,
          uf: cl?.uf ?? null,
          comprador: cl?.comprador ?? null,
          cep: cl?.cep ?? null,
          total,
          marcas,
          aberto_por: null,
          ultima_acao: null,
          itens: itensList.map((i) => ({
            nome: i.produtos?.nome ?? "—",
            codigo: i.produtos?.codigo_jiva ?? "—",
            marca: i.produtos?.marca ?? "—",
            quantidade: i.quantidade,
            cx_embarque: Number(i.produtos?.cx_embarque ?? 1),
            peso_unitario: Number(i.produtos?.peso_unitario ?? 0),
            preco_bruto: Number(i.preco_unitario_bruto ?? 0),
            desconto_perfil: Number(i.desconto_perfil ?? 0),
            desconto_comercial: Number(i.desconto_comercial ?? 0),
            desconto_trade: Number(i.desconto_trade ?? 0),
            preco_apos_perfil: Number(i.preco_apos_perfil ?? i.preco_unitario_liquido ?? 0),
            preco_apos_comercial: Number(i.preco_apos_comercial ?? i.preco_unitario_liquido ?? 0),
            preco_final: Number(i.preco_final ?? i.preco_unitario_liquido ?? 0),
            total: Number(i.total_item),
          })),
        };
      });

      if (filtroMarca !== "todas") {
        mapped = mapped.filter((p) => p.marcas.includes(filtroMarca));
      }

      // Carrega aberto_por / ultima_acao do historico em batch
      if (mapped.length > 0) {
        const ids = mapped.map((p) => p.id);
        const { data: hist } = await supabase
          .from("historico_status")
          .select("pedido_id, usuario_nome, created_at, acao")
          .in("pedido_id", ids)
          .order("created_at", { ascending: true });

        if (hist) {
          const porPedido: Record<string, typeof hist> = {};
          hist.forEach((h) => {
            if (!porPedido[h.pedido_id]) porPedido[h.pedido_id] = [];
            porPedido[h.pedido_id].push(h);
          });
          mapped = mapped.map((p) => {
            const entries = porPedido[p.id] ?? [];
            return {
              ...p,
              aberto_por: entries[0]?.usuario_nome ?? null,
              ultima_acao: entries.length > 0
                ? { nome: entries[entries.length - 1].usuario_nome ?? "—", data: entries[entries.length - 1].created_at }
                : null,
            };
          });
        }
      }

      setPedidos(mapped);
    })().finally(() => setLoading(false));
  }, [filtroVendedor, filtroStatus, filtroDataInicio, filtroDataFim, filtroMarca, refreshKey]);

  useEffect(() => {
    const channel = supabase
      .channel("faturamento-realtime")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pedidos" }, (payload: any) => {
        if (payload.new?.status === "aguardando_faturamento") {
          toast.info(`Novo pedido #${payload.new.numero_pedido} recebido!`, { duration: 8000 });
        }
        setRefreshKey((k) => k + 1);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pedidos" }, () => {
        setRefreshKey((k) => k + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const atualizar = async (id: string, updates: Record<string, unknown>): Promise<boolean> => {
    setAtualizando(id);
    const { error } = await supabase.from("pedidos").update(updates).eq("id", id);
    setAtualizando(null);
    if (error) { toast.error("Erro: " + error.message); return false; }
    setRefreshKey((k) => k + 1);
    return true;
  };

  const assumir = (id: string) => atualizar(id, { status: "em_faturamento", responsavel_id: user?.id });

  const abrirFaturarDialog = (p: PedidoFat) => {
    setFaturarDialog(p);
    setNfData({ numero: "", rastreio: "", obs: "", file: null });
    const qtds: Record<number, number> = {};
    p.itens.forEach((item, idx) => { qtds[idx] = item.quantidade; });
    setItensQtd(qtds);
  };

  const excluirPedido = async () => {
    if (!excluirTarget) return;
    setExcluindo(true);
    const { error } = await supabase.from("pedidos").delete().eq("id", excluirTarget.id);
    setExcluindo(false);
    if (error) { toast.error("Erro ao excluir: " + error.message); return; }
    toast.success(`Pedido #${excluirTarget.numero_pedido} excluído`);
    setExcluirTarget(null);
    setRefreshKey((k) => k + 1);
  };

  const confirmarFaturamento = async () => {
    if (!faturarDialog) return;
    if (!nfData.numero.trim()) { toast.error("Informe o número da NF"); return; }
    setSubmetendoNf(true);

    let nf_pdf_url: string | null = null;
    if (nfData.file) {
      const path = `${faturarDialog.id}/${nfData.numero.trim()}.pdf`;
      const { data: upData, error: upErr } = await supabase.storage
        .from("notas_fiscais")
        .upload(path, nfData.file, { upsert: true });
      if (upErr) {
        toast.error("Erro ao enviar PDF da NF: " + upErr.message);
        setSubmetendoNf(false);
        return;
      }
      nf_pdf_url = upData?.path ?? null;
    }

    const { error } = await supabase
      .from("pedidos")
      .update({
        status: "faturado",
        nota_fiscal: nfData.numero.trim(),
        nf_pdf_url,
        rastreio: nfData.rastreio.trim() || null,
        obs_faturamento: nfData.obs.trim() || null,
        faturado_em: new Date().toISOString(),
      })
      .eq("id", faturarDialog.id);

    setSubmetendoNf(false);
    if (error) { toast.error("Erro ao faturar: " + error.message); return; }
    toast.success(`Pedido #${faturarDialog.numero_pedido} faturado com NF ${nfData.numero}`);
    setFaturarDialog(null);
    setRefreshKey((k) => k + 1);
  };

  const abrirMotivo = (type: "devolver" | "cancelar", id: string) => {
    setMotivoDialog({ type, id });
    setMotivo("");
  };

  const confirmarMotivo = async () => {
    if (!motivoDialog || !motivo.trim()) { toast.error("Informe o motivo"); return; }
    const status = motivoDialog.type === "devolver" ? "devolvido" : "cancelado";
    const ok = await atualizar(motivoDialog.id, { status, motivo: motivo.trim() });
    if (ok) {
      setMotivoDialog(null);
      toast.success(motivoDialog.type === "devolver" ? "Pedido devolvido ao vendedor" : "Pedido cancelado");
    }
  };

  const abrirEditar = (p: PedidoFat, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditDialog(p);
    setEditCondPag(p.cond_pagamento ?? "");
    setEditObs(p.observacoes ?? "");
  };

  const salvarEdicao = async () => {
    if (!editDialog) return;
    setSalvandoEdit(true);
    const ok = await atualizar(editDialog.id, {
      cond_pagamento: editCondPag || null,
      observacoes: editObs || null,
    });
    setSalvandoEdit(false);
    if (ok) { setEditDialog(null); toast.success("Pedido atualizado"); }
  };

  const handleExcel = async (p: PedidoFat, e: React.MouseEvent) => {
    e.stopPropagation();
    setExportando(p.id);
    try {
      await exportarPedidoExcel({
        numero_pedido: p.numero_pedido,
        data_pedido: p.data_pedido,
        cliente: {
          razao_social: p.razao_social,
          cnpj: p.cnpj,
          comprador: p.comprador ?? "",
          cidade: p.cidade ?? "",
          uf: p.uf ?? "",
          cep: p.cep ?? "",
        },
        vendedor: profiles[p.vendedor_id] ?? "",
        perfil: p.perfil_cliente,
        tabela_preco: p.tabela_preco,
        cond_pagamento: p.cond_pagamento ?? "",
        agendamento: p.agendamento,
        observacoes: p.observacoes ?? "",
        itens: p.itens.map((i) => ({
          codigo_jiva: i.codigo,
          cx_embarque: i.cx_embarque,
          quantidade: i.quantidade,
          nome: i.nome,
          preco_bruto: i.preco_bruto,
          desconto_perfil: i.desconto_perfil,
          desconto_comercial: i.desconto_comercial,
          desconto_trade: i.desconto_trade,
          preco_apos_perfil: i.preco_apos_perfil,
          preco_apos_comercial: i.preco_apos_comercial,
          preco_final: i.preco_final,
          total: i.total,
          peso_unitario: i.peso_unitario,
          total_peso: i.peso_unitario * i.quantidade,
          qtd_volumes: Math.ceil(i.quantidade / (i.cx_embarque || 1)),
        })),
      });
    } catch {
      toast.error("Erro ao gerar Excel");
    } finally {
      setExportando(null);
    }
  };

  const podeCancelar = (status: string) =>
    status === "aguardando_faturamento" || status === "em_faturamento";

  function AcoesPedido({ p, stopProp = true }: { p: PedidoFat; stopProp?: boolean }) {
    const wrap = (fn: (e: React.MouseEvent) => void) => (e: React.MouseEvent) => {
      if (stopProp) e.stopPropagation();
      fn(e);
    };
    return (
      <div className="flex flex-wrap gap-1.5">
        {p.status === "aguardando_faturamento" && (
          <Button size="sm" variant="outline" disabled={atualizando === p.id}
            onClick={wrap((e) => { e.stopPropagation(); assumir(p.id); })}>
            {atualizando === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Assumir"}
          </Button>
        )}
        {(p.status === "aguardando_faturamento" || p.status === "em_faturamento") && (
          <Button size="sm" variant="outline" onClick={(e) => abrirEditar(p, e)}>Editar</Button>
        )}
        {p.status === "em_faturamento" && (
          <>
            <Button size="sm" disabled={atualizando === p.id}
              onClick={wrap((e) => { e.stopPropagation(); abrirFaturarDialog(p); })}>
              <FileCheck className="h-3 w-3 mr-1" />
              Faturar
            </Button>
            <Button size="sm" variant="outline"
              onClick={wrap((e) => { e.stopPropagation(); abrirMotivo("devolver", p.id); })}>
              Devolver
            </Button>
          </>
        )}
        {podeCancelar(p.status) && (
          <Button size="sm" variant="destructive"
            onClick={wrap((e) => { e.stopPropagation(); abrirMotivo("cancelar", p.id); })}>
            Cancelar
          </Button>
        )}
        {["faturado", "devolvido", "cancelado"].includes(p.status) && (
          <Button size="sm" variant="destructive"
            onClick={wrap((e) => { e.stopPropagation(); setExcluirTarget(p); })}>
            <Trash2 className="h-3 w-3 mr-1" />
            Excluir
          </Button>
        )}
        <Button size="sm" variant="outline"
          onClick={wrap((e) => { e.stopPropagation(); setDetalhesId(p.id); setDetalhesOpen(true); })}
          title="Ver detalhes">
          <Eye className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="outline" disabled={exportando === p.id}
          onClick={(e) => handleExcel(p, e)} title="Exportar Excel">
          {exportando === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSpreadsheet className="h-3 w-3" />}
        </Button>
      </div>
    );
  }

  function StatusBadge({ status }: { status: string }) {
    return (
      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[status] ?? "bg-gray-100 text-gray-800 border-gray-300"}`}>
        {STATUS_LABEL[status] ?? status}
      </span>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <div>
        <h1 className="text-2xl font-bold">Faturamento</h1>
        <p className="text-sm text-muted-foreground">Gerencie e processe pedidos enviados pelos vendedores</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Aguardando faturamento</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-700">{kpis.aguardando}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Faturados hoje</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{kpis.faturadosHoje}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tempo médio de faturamento</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {kpis.tempoMedio > 0 ? `${kpis.tempoMedio.toFixed(1)} dias` : "—"}
            </div>
          </CardContent>
        </Card>

        <Card className={kpis.comProblema > 0 ? "border-red-300 bg-red-50" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className={`text-sm font-medium ${kpis.comProblema > 0 ? "text-red-800" : "text-muted-foreground"}`}>
              Com problema
            </CardTitle>
            <AlertTriangle className={`h-4 w-4 ${kpis.comProblema > 0 ? "text-red-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${kpis.comProblema > 0 ? "text-red-700" : ""}`}>
              {kpis.comProblema}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
          <SelectTrigger><SelectValue placeholder="Vendedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os vendedores</SelectItem>
            {vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>

        <Input type="date" value={filtroDataInicio} onChange={(e) => setFiltroDataInicio(e.target.value)} title="De" />
        <Input type="date" value={filtroDataFim} onChange={(e) => setFiltroDataFim(e.target.value)} title="Até" />

        <Select value={filtroMarca} onValueChange={setFiltroMarca}>
          <SelectTrigger><SelectValue placeholder="Marca" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as marcas</SelectItem>
            {MARCAS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="grid gap-3 md:hidden">
            {pedidos.length === 0 && (
              <p className="text-center text-muted-foreground py-12">Nenhum pedido encontrado</p>
            )}
            {pedidos.map((p) => (
              <Card key={p.id} className="cursor-pointer active:opacity-70"
                onClick={() => { setDetalhesId(p.id); setDetalhesOpen(true); }}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm">#{p.numero_pedido}</span>
                        <StatusBadge status={p.status} />
                      </div>
                      <div className="font-medium text-sm mt-0.5">{p.razao_social}</div>
                      <div className="text-xs text-muted-foreground">{profiles[p.vendedor_id] ?? "—"}</div>
                    </div>
                    <div className="text-right text-sm font-semibold">{formatBRL(p.total)}</div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {p.marcas.map((m) => <Badge key={m} variant="outline" className="text-xs">{m}</Badge>)}
                  </div>
                  {p.aberto_por && (
                    <div className="text-xs text-muted-foreground">Aberto por: {p.aberto_por}</div>
                  )}
                  {p.motivo && (
                    <div className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">{p.motivo}</div>
                  )}
                  <div onClick={(e) => e.stopPropagation()}>
                    <AcoesPedido p={p} stopProp={false} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop: tabela */}
          <div className="hidden md:block rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">#</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Marcas</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status / Auditoria</TableHead>
                  <TableHead className="min-w-[220px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pedidos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                      Nenhum pedido encontrado
                    </TableCell>
                  </TableRow>
                )}
                {pedidos.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50"
                    onClick={() => { setDetalhesId(p.id); setDetalhesOpen(true); }}>
                    <TableCell className="font-mono font-semibold text-sm">
                      #{p.numero_pedido}
                      <div className="mt-0.5">
                        <Button size="sm" variant="ghost" className="h-5 px-0 text-xs text-muted-foreground hover:text-foreground"
                          onClick={(e) => { e.stopPropagation(); setDetalhesId(p.id); setDetalhesOpen(true); }}>
                          <Eye className="h-3 w-3 mr-1" />ver
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(p.data_pedido)}</TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{p.razao_social}</div>
                      <div className="text-xs text-muted-foreground">{p.tipo}</div>
                    </TableCell>
                    <TableCell className="text-sm">{profiles[p.vendedor_id] ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {p.marcas.map((m) => <Badge key={m} variant="outline" className="text-xs">{m}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm">{formatBRL(p.total)}</TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} />
                      {p.aberto_por && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Aberto por: <span className="font-medium">{p.aberto_por}</span>
                        </div>
                      )}
                      {p.ultima_acao && (
                        <div className="text-xs text-muted-foreground">
                          Última ação: <span className="font-medium">{p.ultima_acao.nome}</span>
                          {" "}às {new Date(p.ultima_acao.data).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      )}
                      {p.motivo && (
                        <div className="text-xs text-muted-foreground mt-1 max-w-[180px] truncate" title={p.motivo}>
                          {p.motivo}
                        </div>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <AcoesPedido p={p} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Dialog: devolver / cancelar */}
      <Dialog open={!!motivoDialog} onOpenChange={(o) => !o && setMotivoDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {motivoDialog?.type === "devolver" ? "Devolver ao vendedor" : "Cancelar pedido"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Motivo *</Label>
            <Textarea rows={4} value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Descreva o motivo para o vendedor…" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMotivoDialog(null)}>Voltar</Button>
            <Button variant={motivoDialog?.type === "cancelar" ? "destructive" : "default"}
              onClick={confirmarMotivo} disabled={!motivo.trim()}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: editar */}
      <Dialog open={!!editDialog} onOpenChange={(o) => !o && setEditDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar pedido #{editDialog?.numero_pedido}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Condição de pagamento</Label>
              <Input value={editCondPag} onChange={(e) => setEditCondPag(e.target.value)}
                placeholder="Ex: 30/60/90 dias" />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea rows={3} value={editObs} onChange={(e) => setEditObs(e.target.value)}
                placeholder="Informações adicionais…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>Fechar</Button>
            <Button onClick={salvarEdicao} disabled={salvandoEdit}>
              {salvandoEdit && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: faturar com NF */}
      <Dialog open={!!faturarDialog} onOpenChange={(o) => !o && setFaturarDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Faturar pedido #{faturarDialog?.numero_pedido}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Itens do pedido */}
            <div className="space-y-1.5">
              <Label>Itens a faturar</Label>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-3 py-2">Produto</th>
                      <th className="text-center px-3 py-2 w-16">Pedido</th>
                      <th className="text-center px-3 py-2 w-24">Faturar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(faturarDialog?.itens ?? []).map((item, idx) => (
                      <tr key={idx} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <div className="font-medium">{item.nome}</div>
                          <div className="text-xs text-muted-foreground">{item.codigo}</div>
                        </td>
                        <td className="text-center px-3 py-2 text-muted-foreground">{item.quantidade}</td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={0}
                            max={item.quantidade}
                            value={itensQtd[idx] ?? item.quantidade}
                            onChange={(e) => {
                              const v = Math.max(0, Math.min(item.quantidade, Number(e.target.value) || 0));
                              setItensQtd((prev) => ({ ...prev, [idx]: v }));
                            }}
                            className="h-7 w-20 text-sm text-center mx-auto block"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Número da NF *</Label>
              <Input
                value={nfData.numero}
                onChange={(e) => setNfData((d) => ({ ...d, numero: e.target.value }))}
                placeholder="Ex: 001234"
              />
            </div>
            <div className="space-y-1.5">
              <Label>PDF da NF</Label>
              <Input
                type="file"
                accept=".pdf"
                onChange={(e) => setNfData((d) => ({ ...d, file: e.target.files?.[0] ?? null }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Código de rastreio</Label>
              <Input
                value={nfData.rastreio}
                onChange={(e) => setNfData((d) => ({ ...d, rastreio: e.target.value }))}
                placeholder="Ex: BR123456789"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                rows={3}
                value={nfData.obs}
                onChange={(e) => setNfData((d) => ({ ...d, obs: e.target.value }))}
                placeholder="Informações adicionais do faturamento…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFaturarDialog(null)}>Voltar</Button>
            <Button onClick={confirmarFaturamento} disabled={submetendoNf || !nfData.numero.trim()}>
              {submetendoNf && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar faturamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: excluir pedido */}
      <Dialog open={!!excluirTarget} onOpenChange={(o) => !o && setExcluirTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir pedido #{excluirTarget?.numero_pedido}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Esta ação é irreversível. O pedido e todos os seus itens serão removidos permanentemente.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluirTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={excluirPedido} disabled={excluindo}>
              {excluindo && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Excluir permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PedidoDetalhesDialog pedidoId={detalhesId} open={detalhesOpen} onOpenChange={setDetalhesOpen} />
    </div>
  );
}
