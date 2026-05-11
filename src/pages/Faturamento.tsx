import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatBRL, formatDate, formatCNPJ } from "@/lib/format";
import { Loader2, Eye, FileCheck, Clock, CheckCircle2, Timer, AlertTriangle, Trash2, Database, FileText, ExternalLink, ClipboardList, Upload } from "lucide-react";
import ImportarPedidoDialog from "@/components/faturamento/ImportarPedidoDialog";
import { MARCAS } from "@/lib/constants";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Tipos ─────────────────────────────────────────────────────────
type PedidoFat = {
  id: string;
  numero_pedido: number;
  tipo: string;
  data_pedido: string;
  status: string;
  status_atualizado_em: string | null;
  cond_pagamento: string | null;
  observacoes: string | null;
  responsavel_id: string | null;
  motivo: string | null;
  vendedor_id: string;
  cliente_id: string | null;
  razao_social: string;
  cnpj: string;
  cidade: string | null;
  uf: string | null;
  comprador: string | null;
  cep: string | null;
  codigo_parceiro: string | null;
  codigo_cliente: string | null;
  cluster: string;
  tabela_preco: string;
  agendamento: boolean;
  aceita_saldo_cliente: boolean;
  negativado_cliente: boolean;
  email_xml: string | null;
  rua: string | null;
  numero_endereco: string | null;
  bairro: string | null;
  telefone: string | null;
  vendedor_nome: string;
  total: number;
  peso_total: number;
  marcas: string[];
  aberto_por: string | null;
  ultima_acao: { nome: string; data: string } | null;
  itens: ExcelItemRaw[];
};

type ExcelItemRaw = {
  id: string;
  nome: string;
  codigo: string;
  marca: string;
  quantidade: number;
  qtd_faturada: number;
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

// ── Status ────────────────────────────────────────────────────────
export const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_faturamento: "Pré-faturamento",
  no_sankhya: "Aguardando faturamento",
  faturado: "Pré-faturado",
  parcialmente_faturado: "Parc. pré-faturado",
  com_problema: "Com problema",
  devolvido: "Devolvido",
  cancelado: "Cancelado",
  em_faturamento: "Em faturamento", // legado
};

export const STATUS_COLOR: Record<string, string> = {
  rascunho: "bg-gray-100 text-gray-700 border-gray-300",
  aguardando_faturamento: "bg-yellow-100 text-yellow-800 border-yellow-300",
  no_sankhya: "bg-blue-100 text-blue-800 border-blue-300",
  faturado: "bg-green-100 text-green-800 border-green-300",
  parcialmente_faturado: "bg-teal-100 text-teal-800 border-teal-300",
  com_problema: "bg-red-100 text-red-800 border-red-300",
  devolvido: "bg-orange-100 text-orange-800 border-orange-300",
  cancelado: "bg-gray-800 text-gray-100 border-gray-700",
  em_faturamento: "bg-blue-100 text-blue-800 border-blue-300",
};

const STATUS_TERMINAL = new Set(["faturado", "devolvido", "cancelado"]);
const STATUS_ACTIVE = new Set(["aguardando_faturamento", "no_sankhya", "parcialmente_faturado", "com_problema", "em_faturamento"]);

function tempoAguardando(dt: string | null): string | null {
  if (!dt) return null;
  try {
    return formatDistanceToNow(new Date(dt), { addSuffix: true, locale: ptBR });
  } catch { return null; }
}

function horasDesde(dt: string | null): number {
  if (!dt) return 0;
  return (Date.now() - new Date(dt).getTime()) / 3_600_000;
}

function urgencyClass(p: PedidoFat): string {
  if (!STATUS_ACTIVE.has(p.status)) return "";
  const dias = Math.floor((Date.now() - new Date(p.status_atualizado_em ?? p.data_pedido).getTime()) / 86400000);
  if (dias >= 4) return "bg-red-100";
  if (dias >= 2) return "bg-yellow-50";
  return "";
}

function calcScore(p: PedidoFat): number {
  const horas = STATUS_ACTIVE.has(p.status)
    ? horasDesde(p.status_atualizado_em ?? p.data_pedido)
    : 0;
  return p.total / 100 + horas * 2;
}

type PrioLevel = "alto" | "medio" | "normal";
function prioLevel(score: number): PrioLevel {
  if (score >= 300) return "alto";
  if (score >= 100) return "medio";
  return "normal";
}
const PRIO_LABEL: Record<PrioLevel, string> = { alto: "Alto", medio: "Médio", normal: "Normal" };
const PRIO_COLOR: Record<PrioLevel, string> = {
  alto: "bg-red-100 text-red-800 border-red-300",
  medio: "bg-yellow-100 text-yellow-800 border-yellow-300",
  normal: "bg-gray-100 text-gray-700 border-gray-300",
};

// ── Componente ────────────────────────────────────────────────────
export default function Faturamento() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [pedidos, setPedidos] = useState<PedidoFat[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [vendedores, setVendedores] = useState<{ id: string; label: string }[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [atualizando, setAtualizando] = useState<string | null>(null);
  // Filtros
  const [filtroVendedor, setFiltroVendedor] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");
  const [filtroMarca, setFiltroMarca] = useState("todas");
  const [filtroValorMin, setFiltroValorMin] = useState("");

  const [kpis, setKpis] = useState({ aguardando: 0, noSankhya: 0, faturadosHoje: 0, comProblema: 0 });

  // Motivo dialog (devolver / cancelar / com_problema)
  const [motivoDialog, setMotivoDialog] = useState<{ type: "devolver" | "cancelar" | "com_problema"; id: string; numero: number } | null>(null);
  const [motivo, setMotivo] = useState("");

  // Dialog detalhes
  const [detalhePedido, setDetalhePedido] = useState<PedidoFat | null>(null);

  // Dialog faturar NF
  type ItemFat = { marcar: boolean; qtd: number; alreadyFaturado: number };
  const [faturarDialog, setFaturarDialog] = useState<PedidoFat | null>(null);
  const [nfData, setNfData] = useState<{ numero: string; rastreio: string; obs: string; file: File | null }>({
    numero: "", rastreio: "", obs: "", file: null,
  });
  const [itensFat, setItensFat] = useState<Record<number, ItemFat>>({});
  const [submetendoNf, setSubmetendoNf] = useState(false);

  // Dialog excluir
  const [excluirTarget, setExcluirTarget] = useState<PedidoFat | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  // Filtros extras
  const [filtroNumero, setFiltroNumero] = useState("");
  const [filtroSaldoPendente, setFiltroSaldoPendente] = useState(false);

  // Dialog faturamento por produto
  const [prodFatDialog, setProdFatDialog] = useState<PedidoFat | null>(null);
  const [prodFatQtds, setProdFatQtds] = useState<Record<string, number>>({});
  const [salvandoProdFat, setSalvandoProdFat] = useState(false);

  // Dialog importar pedido
  const [importarOpen, setImportarOpen] = useState(false);

  const carregar = useCallback(() => setRefreshKey((k) => k + 1), []);
  usePullToRefresh(carregar);

  // Carregar profiles / vendedores
  useEffect(() => {
    supabase.from("profiles").select("id, email, full_name, name").then(({ data }) => {
      if (!data) return;
      const map: Record<string, string> = {};
      data.forEach((p) => { map[p.id] = p.full_name || p.name || p.email; });
      setProfiles(map);
      setVendedores(data.map((p) => ({ id: p.id, label: p.full_name || p.name || p.email })));
    });
  }, []);

  // KPIs
  useEffect(() => {
    (async () => {
      const hoje = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const hojeStr = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;

      const [agRes, snRes, fatHojeRes, probRes] = await Promise.all([
        supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "aguardando_faturamento"),
        supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "no_sankhya"),
        supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "faturado").gte("faturado_em", `${hojeStr}T00:00:00`),
        supabase.from("pedidos").select("id", { count: "exact", head: true }).in("status", ["com_problema", "devolvido", "cancelado"]),
      ]);

      setKpis({
        aguardando: agRes.count ?? 0,
        noSankhya: snRes.count ?? 0,
        faturadosHoje: fatHojeRes.count ?? 0,
        comProblema: probRes.count ?? 0,
      });
    })();
  }, [refreshKey]);

  // Pedidos
  useEffect(() => {
    setLoading(true);
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = supabase
        .from("pedidos")
        .select(`
          id, numero_pedido, tipo, data_pedido, status, status_atualizado_em,
          cond_pagamento, observacoes, responsavel_id, motivo, vendedor_id,
          cliente_id, perfil_cliente, tabela_preco, agendamento,
          clientes(razao_social, cnpj, cidade, uf, comprador, cep, codigo_parceiro, codigo_cliente, aceita_saldo, negativado, email, rua, numero, bairro, telefone),
          itens_pedido(
            id, total_item, quantidade, qtd_faturada, preco_unitario_bruto, preco_unitario_liquido,
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
        const pesoTotal = itensList.reduce((s: number, i) => s + Number(i.produtos?.peso_unitario ?? 0) * Number(i.quantidade), 0);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cl = p.clientes as any;
        return {
          id: p.id,
          numero_pedido: p.numero_pedido,
          tipo: p.tipo,
          data_pedido: p.data_pedido,
          status: p.status,
          status_atualizado_em: p.status_atualizado_em ?? null,
          cond_pagamento: p.cond_pagamento,
          observacoes: p.observacoes,
          responsavel_id: p.responsavel_id,
          motivo: p.motivo,
          vendedor_id: p.vendedor_id,
          cliente_id: p.cliente_id ?? null,
          cluster: p.perfil_cliente,
          tabela_preco: p.tabela_preco,
          agendamento: p.agendamento,
          razao_social: cl?.razao_social ?? "—",
          cnpj: cl?.cnpj ?? "—",
          cidade: cl?.cidade ?? null,
          uf: cl?.uf ?? null,
          comprador: cl?.comprador ?? null,
          cep: cl?.cep ?? null,
          codigo_parceiro: cl?.codigo_parceiro ?? null,
          codigo_cliente: cl?.codigo_cliente ?? null,
          aceita_saldo_cliente: cl?.aceita_saldo ?? false,
          negativado_cliente: cl?.negativado ?? false,
          email_xml: cl?.email ?? null,
          rua: cl?.rua ?? null,
          numero_endereco: cl?.numero ?? null,
          bairro: cl?.bairro ?? null,
          telefone: cl?.telefone ?? null,
          vendedor_nome: profiles[p.vendedor_id] ?? "—",
          total,
          peso_total: pesoTotal,
          marcas,
          aberto_por: null,
          ultima_acao: null,
          itens: itensList.map((i) => ({
            id: i.id,
            nome: i.produtos?.nome ?? "—",
            codigo: i.produtos?.codigo_jiva ?? "—",
            marca: i.produtos?.marca ?? "—",
            quantidade: i.quantidade,
            qtd_faturada: Number(i.qtd_faturada ?? 0),
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

      // Filtro marca + valor mínimo + número + saldo pendente (client-side)
      if (filtroMarca !== "todas") mapped = mapped.filter((p) => p.marcas.includes(filtroMarca));
      const valorMin = parseFloat(filtroValorMin);
      if (!isNaN(valorMin) && valorMin > 0) mapped = mapped.filter((p) => p.total >= valorMin);
      if (filtroNumero.trim()) {
        const num = parseInt(filtroNumero.trim(), 10);
        if (!isNaN(num)) mapped = mapped.filter((p) => p.numero_pedido === num);
      }
      if (filtroSaldoPendente) {
        mapped = mapped.filter((p) => p.itens.some((i) => i.qtd_faturada < i.quantidade));
      }

      // Ordenar por score de prioridade decrescente
      mapped.sort((a, b) => calcScore(b) - calcScore(a));

      // Historico em batch
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
  }, [filtroVendedor, filtroStatus, filtroDataInicio, filtroDataFim, filtroMarca, filtroValorMin, refreshKey]);

  // Realtime
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

  // ── Ações ─────────────────────────────────────────────────────────
  const atualizar = async (id: string, updates: Record<string, unknown>): Promise<boolean> => {
    setAtualizando(id);
    const { error } = await supabase.from("pedidos").update({
      ...updates,
      status_atualizado_em: new Date().toISOString(),
    }).eq("id", id);
    setAtualizando(null);
    if (error) { toast.error("Erro: " + error.message); return false; }
    setRefreshKey((k) => k + 1);
    return true;
  };

  const assumir = (id: string) => atualizar(id, { responsavel_id: user?.id });

  const cadastrarNoSankhya = async (p: PedidoFat) => {
    const ok = await atualizar(p.id, { status: "no_sankhya", responsavel_id: user?.id });
    if (ok) toast.success(`Pedido #${p.numero_pedido} cadastrado no Sankhya`);
  };

  const abrirFaturarDialog = async (p: PedidoFat) => {
    setFaturarDialog(p);
    setNfData({ numero: "", rastreio: "", obs: "", file: null });

    const { data: existingFat } = await supabase
      .from("itens_faturados")
      .select("item_pedido_id, quantidade_faturada")
      .eq("pedido_id", p.id);

    const fatMap: Record<string, number> = {};
    (existingFat ?? []).forEach((f) => {
      fatMap[f.item_pedido_id] = (fatMap[f.item_pedido_id] ?? 0) + f.quantidade_faturada;
    });

    const fat: Record<number, ItemFat> = {};
    p.itens.forEach((item, idx) => {
      const alreadyFaturado = fatMap[item.id] ?? 0;
      const remaining = item.quantidade - alreadyFaturado;
      fat[idx] = { marcar: remaining > 0, qtd: Math.max(remaining, 0), alreadyFaturado };
    });
    setItensFat(fat);
  };

  const confirmarFaturamento = async () => {
    if (!faturarDialog) return;

    const marcadosEntries = Object.entries(itensFat).filter(([, v]) => v.marcar && v.qtd > 0);
    if (marcadosEntries.length === 0) { toast.error("Selecione ao menos um produto"); return; }

    setSubmetendoNf(true);

    let nf_pdf_url: string | null = null;
    if (nfData.file) {
      const nfSuffix = nfData.numero.trim() ? `_${nfData.numero.trim()}` : "";
      const path = `${faturarDialog.id}/${Date.now()}${nfSuffix}.pdf`;
      const { data: upData, error: upErr } = await supabase.storage.from("notas_fiscais").upload(path, nfData.file);
      if (upErr) { toast.error("Erro ao enviar PDF: " + upErr.message); setSubmetendoNf(false); return; }
      nf_pdf_url = upData?.path ?? null;
    }

    const { data: fatData, error: fatErr } = await supabase
      .from("faturamentos")
      .insert({
        pedido_id: faturarDialog.id,
        nota_fiscal: nfData.numero.trim() || null,
        nf_pdf_url,
        rastreio: nfData.rastreio.trim() || null,
        obs: nfData.obs.trim() || null,
        usuario_id: user?.id ?? null,
      })
      .select("id")
      .single();

    if (fatErr || !fatData) { toast.error("Erro ao registrar faturamento: " + (fatErr?.message ?? "")); setSubmetendoNf(false); return; }

    const itensFaturadosPayload = marcadosEntries.map(([idx, v]) => ({
      faturamento_id: fatData.id,
      pedido_id: faturarDialog.id,
      item_pedido_id: faturarDialog.itens[Number(idx)].id,
      quantidade_faturada: v.qtd,
    }));

    const { error: itensErr } = await supabase.from("itens_faturados").insert(itensFaturadosPayload);
    if (itensErr) { toast.error("Erro ao registrar itens: " + itensErr.message); setSubmetendoNf(false); return; }

    const { data: allFaturados } = await supabase
      .from("itens_faturados")
      .select("item_pedido_id, quantidade_faturada")
      .eq("pedido_id", faturarDialog.id);

    const totalFaturadoMap: Record<string, number> = {};
    (allFaturados ?? []).forEach((f) => {
      totalFaturadoMap[f.item_pedido_id] = (totalFaturadoMap[f.item_pedido_id] ?? 0) + f.quantidade_faturada;
    });

    const todosCompletos = faturarDialog.itens.every((item) => (totalFaturadoMap[item.id] ?? 0) >= item.quantidade);
    const novoStatus = todosCompletos ? "faturado" : "parcialmente_faturado";

    const { error: updErr } = await supabase
      .from("pedidos")
      .update({ status: novoStatus, faturado_em: new Date().toISOString(), status_atualizado_em: new Date().toISOString() })
      .eq("id", faturarDialog.id);

    setSubmetendoNf(false);
    if (updErr) { toast.error("Erro ao atualizar status: " + updErr.message); return; }

    // Notificar vendedor
    const nfNumero = nfData.numero.trim();
    await supabase.from("notificacoes").insert({
      destinatario_id: faturarDialog.vendedor_id,
      destinatario_role: "vendedor",
      tipo: "pedido_faturado",
      mensagem: novoStatus === "faturado"
        ? `Pedido #${faturarDialog.numero_pedido} faturado!${nfNumero ? ` NF: ${nfNumero}` : ""}`
        : `Pedido #${faturarDialog.numero_pedido} parcialmente faturado${nfNumero ? ` — NF: ${nfNumero}` : ""}`,
    });

    toast.success(novoStatus === "faturado"
      ? `Pedido #${faturarDialog.numero_pedido} faturado completamente`
      : `Pedido #${faturarDialog.numero_pedido} parcialmente faturado`);
    setFaturarDialog(null);
    setRefreshKey((k) => k + 1);
  };

  const abrirMotivo = (type: "devolver" | "cancelar" | "com_problema", p: PedidoFat) => {
    setMotivoDialog({ type, id: p.id, numero: p.numero_pedido });
    setMotivo("");
  };

  const confirmarMotivo = async () => {
    if (!motivoDialog || !motivo.trim()) { toast.error("Informe o motivo"); return; }
    const status = motivoDialog.type === "devolver" ? "devolvido"
      : motivoDialog.type === "cancelar" ? "cancelado"
      : "com_problema";
    const ok = await atualizar(motivoDialog.id, { status, motivo: motivo.trim() });
    if (ok) {
      if (motivoDialog.type === "devolver") {
        const pedido = pedidos.find((p) => p.id === motivoDialog.id);
        if (pedido) {
          await supabase.from("notificacoes").insert({
            destinatario_id: pedido.vendedor_id,
            destinatario_role: "vendedor",
            tipo: "pedido_devolvido",
            mensagem: `Pedido #${pedido.numero_pedido} devolvido: ${motivo.trim()}`,
          });
        }
      }
      setMotivoDialog(null);
      toast.success(
        motivoDialog.type === "devolver" ? "Pedido devolvido ao vendedor"
        : motivoDialog.type === "cancelar" ? "Pedido cancelado"
        : "Pedido marcado com problema"
      );
    }
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

  const abrirProdFat = (p: PedidoFat, e: React.MouseEvent) => {
    e.stopPropagation();
    setProdFatDialog(p);
    const qtds: Record<string, number> = {};
    p.itens.forEach((i) => { qtds[i.id] = i.qtd_faturada; });
    setProdFatQtds(qtds);
  };

  const salvarProdFat = async () => {
    if (!prodFatDialog) return;
    setSalvandoProdFat(true);
    const updates = prodFatDialog.itens.map((item) =>
      supabase.from("itens_pedido").update({ qtd_faturada: prodFatQtds[item.id] ?? 0 } as any).eq("id", item.id)
    );
    await Promise.all(updates);
    const todosCompletos = prodFatDialog.itens.every((i) => (prodFatQtds[i.id] ?? 0) >= i.quantidade);
    const algumParcial = prodFatDialog.itens.some((i) => (prodFatQtds[i.id] ?? 0) > 0);
    let novoStatus = prodFatDialog.status;
    if (todosCompletos) novoStatus = "faturado";
    else if (algumParcial) novoStatus = "parcialmente_faturado";
    if (novoStatus !== prodFatDialog.status) {
      await supabase.from("pedidos").update({
        status: novoStatus,
        status_atualizado_em: new Date().toISOString(),
        ...(novoStatus === "faturado" ? { faturado_em: new Date().toISOString() } : {}),
      }).eq("id", prodFatDialog.id);
    }
    toast.success("Faturamento salvo!");
    setSalvandoProdFat(false);
    setProdFatDialog(null);
    setRefreshKey((k) => k + 1);
  };

  const gerarPdf = (p: PedidoFat, e: React.MouseEvent) => {
    e.stopPropagation();
    const vendedor = profiles[p.vendedor_id] ?? "—";

    const totalBruto = p.itens.reduce((s, i) => s + i.preco_bruto * i.quantidade, 0);
    const totalVolumes = p.itens.reduce((s, i) => s + Math.ceil(i.quantidade / (i.cx_embarque || 1)), 0);
    const pesoTotal = p.itens.reduce((s, i) => s + i.peso_unitario * i.quantidade, 0);
    const totalDesconto = totalBruto - p.total;

    const uniqPct = (fn: (i: ExcelItemRaw) => number, mult = 1) => {
      const vals = [...new Set(p.itens.map(fn))];
      const toP = (v: number) => `${(v * mult).toFixed(1)}%`;
      return vals.length === 1
        ? toP(vals[0])
        : `${toP(Math.min(...vals))}~${toP(Math.max(...vals))}`;
    };
    const descCluster = uniqPct((i) => i.desconto_perfil, 100);
    const descVendedor = uniqPct((i) => i.desconto_comercial);
    const descTrade = uniqPct((i) => i.desconto_trade);

    const linhas = p.itens.map((i) => `
      <tr>
        <td>${i.codigo}</td>
        <td>${i.nome}</td>
        <td style="text-align:center">${i.cx_embarque}</td>
        <td style="text-align:center">${i.quantidade}</td>
        <td style="text-align:center">${Math.ceil(i.quantidade / (i.cx_embarque || 1))}</td>
        <td style="text-align:center">${i.qtd_faturada}</td>
        <td style="text-align:center">${(i.peso_unitario * i.quantidade).toFixed(2)} kg</td>
        <td style="text-align:center">${(i.preco_bruto > 0 ? (1 - i.preco_final / i.preco_bruto) * 100 : 0).toFixed(2)}%</td>
        <td style="text-align:center">${Number(i.desconto_comercial).toFixed(1)}%</td>
        <td style="text-align:center">${Number(i.desconto_trade).toFixed(1)}%</td>
        <td style="text-align:right">R$ ${(i.preco_bruto * i.quantidade).toFixed(2)}</td>
        <td style="text-align:right">R$ ${i.total.toFixed(2)}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Pedido #${p.numero_pedido}</title>
      <style>
        body{font-family:sans-serif;font-size:11px;padding:20px}
        table{width:100%;border-collapse:collapse;margin-top:10px}
        th,td{border:1px solid #ccc;padding:3px 6px}
        th{background:#f0f0f0}
        h2{margin:0 0 4px}p{margin:2px 0}
        .total-box{margin-top:12px;border:1px solid #aaa;padding:8px 12px;display:inline-block;background:#f9f9f9}
        .total-box p{margin:3px 0;font-size:12px}
        .hl{font-weight:bold;color:#1a6b3a}
      </style>
      </head><body>
      <h2>Pedido #${p.numero_pedido} — ${p.razao_social}</h2>
      <p>CNPJ: ${formatCNPJ(p.cnpj)} | Data: ${formatDate(p.data_pedido)} | Vendedor: ${vendedor}</p>
      ${p.codigo_cliente ? `<p><strong>Código Sankhya:</strong> ${p.codigo_cliente}</p>` : ""}
      <p>Cidade/UF: ${p.cidade ?? "—"} - ${p.uf ?? "—"}</p>
      <p>Cond. Pagamento: ${p.cond_pagamento ?? "—"} | Cluster: ${p.cluster ?? "—"} | Agendamento: ${p.agendamento ? "Sim" : "Não"}</p>
      ${p.comprador ? `<p>Comprador: ${p.comprador}</p>` : ""}
      ${p.email_xml ? `<p>Email XML/Boleto: ${p.email_xml}</p>` : ""}
      ${p.rua ? `<p>Endereço: ${[p.rua, p.numero_endereco, p.bairro].filter(Boolean).join(", ")}</p>` : ""}
      ${p.telefone ? `<p>Telefone: ${p.telefone}</p>` : ""}
      <table><thead><tr>
        <th>Código</th><th>Produto</th><th>Cx Emb.</th><th>Qtd Pedida</th><th>Qtd Volumes</th><th>Qtd Faturada</th><th>Peso Total</th><th>Desc. Cluster</th><th>Desc. Comercial</th><th>Desc. Trade</th><th>Total Bruto</th><th>Total c/ Desc.</th>
      </tr></thead><tbody>${linhas}</tbody></table>
      <div class="total-box">
        <p>Peso total: ${pesoTotal.toFixed(2)} kg &nbsp;|&nbsp; Volumes: ${totalVolumes}</p>
        <p>Soma total de desconto: <strong>R$ ${totalDesconto.toFixed(2)}</strong></p>
        <p>Valor líquido <em>sem</em> desconto: <strong>R$ ${totalBruto.toFixed(2)}</strong></p>
        <p>Valor líquido <em>com</em> desconto: <span class="hl">R$ ${p.total.toFixed(2)}</span></p>
      </div>
      </body></html>`;
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); win.print(); }
  };

  const gerarFormularioPdf = async (p: PedidoFat, e: React.MouseEvent) => {
    e.stopPropagation();
    const { gerarFormularioPDF } = await import("@/lib/pdf");
    const doc = gerarFormularioPDF({
      numero_pedido: p.numero_pedido,
      tipo: p.tipo,
      data_pedido: p.data_pedido,
      razao_social: p.razao_social,
      cnpj: p.cnpj,
      codigo_cliente: p.codigo_cliente,
      cond_pagamento: p.cond_pagamento,
      cidade: p.cidade,
      uf: p.uf,
      cep: p.cep,
      cluster: p.cluster,
      comprador: p.comprador,
      agendamento: p.agendamento,
      tabela_preco: p.tabela_preco,
      observacoes: p.observacoes,
      email_xml: p.email_xml,
      vendedor: profiles[p.vendedor_id] ?? "—",
      itens: p.itens.map((i) => ({
        codigo_jiva: i.codigo,
        cx_embarque: i.cx_embarque,
        quantidade: i.quantidade,
        nome: i.nome,
        preco_bruto: i.preco_bruto,
        desconto_perfil: i.desconto_perfil,
        desconto_comercial: i.desconto_comercial,
        preco_apos_perfil: i.preco_apos_perfil,
        desconto_trade: i.desconto_trade,
        preco_final: i.preco_final,
        total_item: i.total,
        peso_unitario: i.peso_unitario,
      })),
      total: p.total,
      peso_total: p.peso_total,
    });
    doc.save(`formulario-pedido-${p.numero_pedido}.pdf`);
  };

  // ── Sub-componentes ───────────────────────────────────────────────
  function StatusBadge({ status }: { status: string }) {
    return (
      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[status] ?? "bg-gray-100 text-gray-800 border-gray-300"}`}>
        {STATUS_LABEL[status] ?? status}
      </span>
    );
  }

  function AcoesPedido({ p, stopProp = true }: { p: PedidoFat; stopProp?: boolean }) {
    const wrap = (fn: (e: React.MouseEvent) => void) => (e: React.MouseEvent) => {
      if (stopProp) e.stopPropagation();
      fn(e);
    };
    const isAtivo = STATUS_ACTIVE.has(p.status);
    const isTerminal = STATUS_TERMINAL.has(p.status);

    return (
      <div className="flex flex-wrap gap-1.5">
        {/* Assumir */}
        {p.status === "aguardando_faturamento" && !p.responsavel_id && (
          <Button size="sm" variant="outline" disabled={atualizando === p.id}
            onClick={wrap(() => assumir(p.id))}>
            {atualizando === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Assumir"}
          </Button>
        )}

        {/* Registrar faturamento com NF */}
        {(p.status === "no_sankhya" || p.status === "parcialmente_faturado") && (
          <Button size="sm" disabled={atualizando === p.id}
            onClick={wrap(() => abrirFaturarDialog(p))}>
            <FileCheck className="h-3 w-3 mr-1" />
            Faturar NF
          </Button>
        )}

        {/* Faturamento por produto */}
        {!isTerminal && (
          <Button size="sm" variant="outline" disabled={atualizando === p.id}
            onClick={(e) => abrirProdFat(p, e)} title="Faturamento por produto">
            <FileText className="h-3 w-3 mr-1" />
            Produtos
          </Button>
        )}

        {/* Editar */}
        {isAtivo && (
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); navigate(`/faturamento/pedidos/${p.id}/editar`); }}>Editar</Button>
        )}

        {/* Com problema */}
        {isAtivo && (
          <Button size="sm" variant="outline"
            onClick={wrap(() => abrirMotivo("com_problema", p))}>
            <AlertTriangle className="h-3 w-3 mr-1 text-red-500" />
            Problema
          </Button>
        )}

        {/* Devolver */}
        {isAtivo && (
          <Button size="sm" variant="outline"
            onClick={wrap(() => abrirMotivo("devolver", p))}>
            Devolver
          </Button>
        )}

        {/* Cancelar */}
        {isAtivo && (
          <Button size="sm" variant="destructive"
            onClick={wrap(() => abrirMotivo("cancelar", p))}>
            Cancelar
          </Button>
        )}

        {/* Excluir (somente terminais) */}
        {isTerminal && (
          <Button size="sm" variant="destructive"
            onClick={wrap(() => setExcluirTarget(p))}>
            <Trash2 className="h-3 w-3 mr-1" />
            Excluir
          </Button>
        )}

        {/* Ver cliente */}
        {p.cliente_id && (
          <Button size="sm" variant="outline"
            onClick={wrap(() => navigate(`/clientes/${p.cliente_id}`))}
            title="Ver cliente">
            <ExternalLink className="h-3 w-3" />
          </Button>
        )}

        {/* Ver detalhes */}
        <Button size="sm" variant="outline"
          onClick={wrap(() => setDetalhePedido(p))}
          title="Ver detalhes">
          <Eye className="h-3 w-3" />
        </Button>

        {/* PDF resumo */}
        <Button size="sm" variant="outline"
          onClick={(e) => gerarPdf(p, e)} title="Resumo PDF">
          <FileText className="h-3 w-3" />
        </Button>

        {/* PDF formulário antigo */}
        <Button size="sm" variant="outline"
          onClick={(e) => gerarFormularioPdf(p, e)} title="Formulário Completo PDF">
          <ClipboardList className="h-3 w-3" />
        </Button>

      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pré-faturamento</h1>
          <p className="text-sm text-muted-foreground">Gerencie e processe pedidos enviados pelos vendedores</p>
        </div>
        <Button onClick={() => setImportarOpen(true)} variant="outline" className="shrink-0">
          <Upload className="h-4 w-4 mr-2" />
          Importar Pedido
        </Button>
      </div>

      <ImportarPedidoDialog
        open={importarOpen}
        onOpenChange={setImportarOpen}
        onImportado={carregar}
      />

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pré-faturamento</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-yellow-700">{kpis.aguardando}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Aguardando faturamento</CardTitle>
            <Database className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-blue-700">{kpis.noSankhya}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pré-faturados hoje</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-700">{kpis.faturadosHoje}</div></CardContent>
        </Card>
        <Card className={kpis.comProblema > 0 ? "border-red-300 bg-red-50" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className={`text-sm font-medium ${kpis.comProblema > 0 ? "text-red-800" : "text-muted-foreground"}`}>
              Problemas
            </CardTitle>
            <AlertTriangle className={`h-4 w-4 ${kpis.comProblema > 0 ? "text-red-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${kpis.comProblema > 0 ? "text-red-700" : ""}`}>{kpis.comProblema}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            {Object.entries(STATUS_LABEL).filter(([k]) => k !== "rascunho" && k !== "em_faturamento").map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
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
        <Input
          type="number"
          min={0}
          step={100}
          value={filtroValorMin}
          onChange={(e) => setFiltroValorMin(e.target.value)}
          placeholder="Valor mínimo (R$)"
          title="Filtrar por valor mínimo"
        />
        <Input
          type="number"
          min={1}
          value={filtroNumero}
          onChange={(e) => setFiltroNumero(e.target.value)}
          placeholder="Nº do pedido"
          title="Filtrar por número de pedido"
        />
        <div className="flex items-center gap-2 self-center">
          <Checkbox
            id="saldo-pendente"
            checked={filtroSaldoPendente}
            onCheckedChange={(c) => setFiltroSaldoPendente(!!c)}
          />
          <Label htmlFor="saldo-pendente" className="text-sm cursor-pointer">Apenas com saldo pendente</Label>
        </div>
      </div>

      {/* Legenda urgência */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-yellow-50 border border-yellow-200 inline-block" /> 2-3 dias aguardando</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-red-100 border border-red-300 inline-block" /> 4+ dias aguardando</span>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="grid gap-3 md:hidden">
            {pedidos.length === 0 && <p className="text-center text-muted-foreground py-12">Nenhum pedido encontrado</p>}
            {pedidos.map((p) => (
              <Card key={p.id} className={`cursor-pointer active:opacity-70 ${urgencyClass(p)}`}
                onClick={() => setDetalhePedido(p)}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm">#{p.numero_pedido}</span>
                        <StatusBadge status={p.status} />
                      </div>
                      <div className="font-medium text-sm mt-0.5">{p.razao_social}</div>
                      {p.codigo_parceiro && (
                        <div className="text-xs text-muted-foreground font-mono">Cód: {p.codigo_parceiro}</div>
                      )}
                      <div className="text-xs text-muted-foreground">Vendedor: {profiles[p.vendedor_id] ?? p.vendedor_nome}</div>
                      {p.email_xml && (
                        <div className="text-xs text-muted-foreground truncate">Email: {p.email_xml}</div>
                      )}
                      {p.rua && (
                        <div className="text-xs text-muted-foreground">
                          {[p.rua, p.numero_endereco, p.bairro].filter(Boolean).join(", ")}
                        </div>
                      )}
                      {p.telefone && (
                        <div className="text-xs text-muted-foreground">Tel: {p.telefone}</div>
                      )}
                    </div>
                    <div className="text-right text-sm font-semibold text-green-700">{formatBRL(p.total)}</div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {p.marcas.map((m) => <Badge key={m} variant="outline" className="text-xs">{m}</Badge>)}
                  </div>
                  {p.status_atualizado_em && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Timer className="h-3 w-3" />{tempoAguardando(p.status_atualizado_em)}
                    </div>
                  )}
                  {p.motivo && <div className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">{p.motivo}</div>}
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
                  <TableHead className="w-28"># / Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Marcas</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Peso</TableHead>
                  <TableHead>Aguardando</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="min-w-[320px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pedidos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-12">Nenhum pedido encontrado</TableCell>
                  </TableRow>
                )}
                {pedidos.map((p) => (
                  <TableRow key={p.id}
                    className={`cursor-pointer hover:bg-muted/50 ${urgencyClass(p)}`}
                    onClick={() => setDetalhePedido(p)}>
                    <TableCell className="font-mono font-semibold text-sm">
                      <div>#{p.numero_pedido}</div>
                      <div className="text-xs font-normal text-muted-foreground">{formatDate(p.data_pedido)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          className="font-medium text-sm hover:underline text-left"
                          onClick={(e) => { e.stopPropagation(); if (p.cliente_id) navigate(`/clientes/${p.cliente_id}`); }}
                        >
                          {p.razao_social}
                        </button>
                        {p.negativado_cliente && (
                          <span className="inline-flex items-center rounded-full border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">⚠ Neg.</span>
                        )}
                      </div>
                      {p.codigo_parceiro && (
                        <div className="text-xs font-mono text-muted-foreground">Cód: {p.codigo_parceiro}</div>
                      )}
                      {p.email_xml && (
                        <div className="text-xs text-muted-foreground truncate max-w-[160px]" title={p.email_xml}>{p.email_xml}</div>
                      )}
                      {p.rua && (
                        <div className="text-xs text-muted-foreground truncate max-w-[160px]">
                          {[p.rua, p.numero_endereco, p.bairro].filter(Boolean).join(", ")}
                        </div>
                      )}
                      {p.telefone && (
                        <div className="text-xs text-muted-foreground">{p.telefone}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{profiles[p.vendedor_id] ?? p.vendedor_nome}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {p.marcas.map((m) => <Badge key={m} variant="outline" className="text-xs">{m}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-bold text-sm text-green-700">{formatBRL(p.total)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{p.peso_total > 0 ? `${p.peso_total.toFixed(1)} kg` : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {STATUS_ACTIVE.has(p.status) ? (tempoAguardando(p.status_atualizado_em) ?? "—") : "—"}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const score = calcScore(p);
                        const prio = prioLevel(score);
                        return (
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${PRIO_COLOR[prio]}`}>
                            {PRIO_LABEL[prio]}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} />
                      {p.responsavel_id && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {profiles[p.responsavel_id] ?? "—"}
                        </div>
                      )}
                      {p.motivo && (
                        <div className="text-xs text-muted-foreground mt-1 max-w-[160px] truncate" title={p.motivo}>
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

      {/* Dialog: motivo (devolver / cancelar / com_problema) */}
      <Dialog open={!!motivoDialog} onOpenChange={(o) => !o && setMotivoDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {motivoDialog?.type === "devolver" ? `Devolver pedido #${motivoDialog.numero} ao vendedor`
                : motivoDialog?.type === "cancelar" ? `Cancelar pedido #${motivoDialog.numero}`
                : `Marcar pedido #${motivoDialog?.numero} com problema`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Motivo *</Label>
            <Textarea rows={4} value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Descreva o motivo…" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMotivoDialog(null)}>Voltar</Button>
            <Button
              variant={motivoDialog?.type === "devolver" ? "default" : "destructive"}
              onClick={confirmarMotivo}
              disabled={!motivo.trim()}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: faturar com NF */}
      <Dialog open={!!faturarDialog} onOpenChange={(o) => !o && setFaturarDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar faturamento — Pedido #{faturarDialog?.numero_pedido}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Produtos a faturar</Label>
                {(() => {
                  const marcados = Object.entries(itensFat).filter(([, v]) => v.marcar && v.qtd > 0).length;
                  const total = faturarDialog?.itens.length ?? 0;
                  return <span className="text-xs text-muted-foreground">{marcados}/{total} selecionados</span>;
                })()}
              </div>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 w-10">
                      <Checkbox
                        checked={Object.values(itensFat).length > 0 && Object.values(itensFat).every((v) => v.marcar || v.alreadyFaturado >= (faturarDialog?.itens[0]?.quantidade ?? 0))}
                        onCheckedChange={(c) => setItensFat((prev) => {
                          const next = { ...prev };
                          Object.keys(next).forEach((k) => {
                            const rem = (faturarDialog?.itens[Number(k)]?.quantidade ?? 0) - next[Number(k)].alreadyFaturado;
                            if (rem > 0) next[Number(k)] = { ...next[Number(k)], marcar: !!c };
                          });
                          return next;
                        })}
                      />
                    </th>
                    <th className="text-left px-3 py-2">Produto</th>
                    <th className="text-center px-3 py-2 w-16">Pedido</th>
                    <th className="text-center px-3 py-2 w-20">Já fat.</th>
                    <th className="text-center px-3 py-2 w-24">Qtd. faturar</th>
                  </tr></thead>
                  <tbody>
                    {(faturarDialog?.itens ?? []).map((item, idx) => {
                      const fat = itensFat[idx] ?? { marcar: true, qtd: item.quantidade, alreadyFaturado: 0 };
                      const remaining = item.quantidade - fat.alreadyFaturado;
                      const fullyBilled = remaining <= 0;
                      return (
                        <tr key={idx} className={`border-b last:border-0 ${!fat.marcar || fullyBilled ? "opacity-40" : ""}`}>
                          <td className="px-3 py-2">
                            <Checkbox checked={fat.marcar && !fullyBilled} disabled={fullyBilled}
                              onCheckedChange={(c) => setItensFat((prev) => ({ ...prev, [idx]: { ...prev[idx], marcar: !!c } }))} />
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{item.nome}</div>
                            <div className="text-xs text-muted-foreground">{item.codigo}</div>
                          </td>
                          <td className="text-center px-3 py-2 text-muted-foreground">{item.quantidade}</td>
                          <td className="text-center px-3 py-2 text-muted-foreground">{fat.alreadyFaturado > 0 ? fat.alreadyFaturado : "—"}</td>
                          <td className="px-3 py-2">
                            <Input type="number" min={1} max={remaining} value={fat.qtd} disabled={!fat.marcar || fullyBilled}
                              onChange={(e) => {
                                const v = Math.max(1, Math.min(remaining, Number(e.target.value) || 1));
                                setItensFat((prev) => ({ ...prev, [idx]: { ...prev[idx], qtd: v } }));
                              }}
                              className="h-7 w-20 text-sm text-center mx-auto block" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Número da NF</Label>
              <Input value={nfData.numero} onChange={(e) => setNfData((d) => ({ ...d, numero: e.target.value }))} placeholder="Ex: 001234 (opcional)" />
            </div>
            <div className="space-y-1.5">
              <Label>PDF da NF</Label>
              <Input type="file" accept=".pdf" onChange={(e) => setNfData((d) => ({ ...d, file: e.target.files?.[0] ?? null }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Código de rastreio</Label>
              <Input value={nfData.rastreio} onChange={(e) => setNfData((d) => ({ ...d, rastreio: e.target.value }))} placeholder="Ex: BR123456789 (opcional)" />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea rows={2} value={nfData.obs} onChange={(e) => setNfData((d) => ({ ...d, obs: e.target.value }))} placeholder="Informações adicionais…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFaturarDialog(null)}>Voltar</Button>
            <Button onClick={confirmarFaturamento} disabled={submetendoNf}>
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

      {/* Dialog: detalhes pedido */}
      <Dialog open={!!detalhePedido} onOpenChange={(o) => !o && setDetalhePedido(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pedido #{detalhePedido?.numero_pedido} — {detalhePedido?.razao_social}</DialogTitle>
          </DialogHeader>
          {detalhePedido && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <div><span className="text-muted-foreground">CNPJ:</span> {formatCNPJ(detalhePedido.cnpj)}</div>
                <div><span className="text-muted-foreground">Data:</span> {formatDate(detalhePedido.data_pedido)}</div>
                <div><span className="text-muted-foreground">Cidade/UF:</span> {detalhePedido.cidade ?? "—"} / {detalhePedido.uf ?? "—"}</div>
                <div><span className="text-muted-foreground">Cond. Pagamento:</span> {detalhePedido.cond_pagamento ?? "—"}</div>
                <div><span className="text-muted-foreground">Cluster:</span> {detalhePedido.cluster ?? "—"}</div>
                <div><span className="text-muted-foreground">Tabela Preço:</span> {detalhePedido.tabela_preco ?? "—"}</div>
                <div><span className="text-muted-foreground">Agendamento:</span> {detalhePedido.agendamento ? "Sim" : "Não"}</div>
                <div><span className="text-muted-foreground">Vendedor:</span> {profiles[detalhePedido.vendedor_id] ?? detalhePedido.vendedor_nome}</div>
                {detalhePedido.comprador && <div><span className="text-muted-foreground">Comprador:</span> {detalhePedido.comprador}</div>}
                {detalhePedido.codigo_cliente && <div><span className="text-muted-foreground">Cód. Sankhya:</span> {detalhePedido.codigo_cliente}</div>}
                {detalhePedido.codigo_parceiro && <div><span className="text-muted-foreground">Cód. Parceiro:</span> {detalhePedido.codigo_parceiro}</div>}
                {detalhePedido.email_xml && (
                  <div className="col-span-2"><span className="text-muted-foreground">Email XML/Boleto:</span> {detalhePedido.email_xml}</div>
                )}
                {detalhePedido.rua && (
                  <div className="col-span-2"><span className="text-muted-foreground">Endereço:</span> {[detalhePedido.rua, detalhePedido.numero_endereco, detalhePedido.bairro].filter(Boolean).join(", ")}</div>
                )}
                {detalhePedido.telefone && <div><span className="text-muted-foreground">Telefone:</span> {detalhePedido.telefone}</div>}
                {detalhePedido.observacoes && (
                  <div className="col-span-2"><span className="text-muted-foreground">Obs:</span> {detalhePedido.observacoes}</div>
                )}
                {detalhePedido.motivo && (
                  <div className="col-span-2"><span className="text-muted-foreground">Motivo:</span> <span className="text-amber-700">{detalhePedido.motivo}</span></div>
                )}
              </div>

              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-3 py-2">Produto</th>
                      <th className="text-center px-2 py-2">Cx</th>
                      <th className="text-center px-2 py-2">Qtd</th>
                      <th className="text-center px-2 py-2">Perf%</th>
                      <th className="text-center px-2 py-2">Com%</th>
                      <th className="text-center px-2 py-2">Trade%</th>
                      <th className="text-right px-3 py-2">Bruto un.</th>
                      <th className="text-right px-3 py-2">Final un.</th>
                      <th className="text-right px-3 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalhePedido.itens.map((i) => (
                      <tr key={i.id} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <div className="font-medium">{i.nome}</div>
                          <div className="text-muted-foreground font-mono">{i.codigo}</div>
                        </td>
                        <td className="text-center px-2 py-2">{i.cx_embarque}</td>
                        <td className="text-center px-2 py-2">{i.quantidade}</td>
                        <td className="text-center px-2 py-2">{(i.preco_bruto > 0 ? (1 - i.preco_final / i.preco_bruto) * 100 : 0).toFixed(2)}%</td>
                        <td className="text-center px-2 py-2">{i.desconto_comercial.toFixed(1)}%</td>
                        <td className="text-center px-2 py-2">{i.desconto_trade.toFixed(1)}%</td>
                        <td className="text-right px-3 py-2">{formatBRL(i.preco_bruto)}</td>
                        <td className="text-right px-3 py-2">{formatBRL(i.preco_final)}</td>
                        <td className="text-right px-3 py-2 font-medium">{formatBRL(i.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-4 text-sm">
                <span className="text-muted-foreground">Peso total: {detalhePedido.peso_total.toFixed(2)} kg</span>
                <span className="font-bold text-green-700">Total: {formatBRL(detalhePedido.total)}</span>
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => {
              if (!detalhePedido) return;
              const endereco = [detalhePedido.rua, detalhePedido.numero_endereco, detalhePedido.bairro].filter(Boolean).join(", ");
              const linhas = [
                `Pedido #${detalhePedido.numero_pedido}`,
                `Razão Social: ${detalhePedido.razao_social}`,
                `CNPJ: ${formatCNPJ(detalhePedido.cnpj)}`,
                detalhePedido.codigo_cliente ? `Código Sankhya: ${detalhePedido.codigo_cliente}` : null,
                detalhePedido.codigo_parceiro ? `Código Parceiro: ${detalhePedido.codigo_parceiro}` : null,
                `Cidade/UF: ${detalhePedido.cidade ?? "—"}/${detalhePedido.uf ?? "—"}`,
                detalhePedido.cep ? `CEP: ${detalhePedido.cep}` : null,
                endereco ? `Endereço: ${endereco}` : null,
                detalhePedido.telefone ? `Telefone: ${detalhePedido.telefone}` : null,
                detalhePedido.email_xml ? `Email XML: ${detalhePedido.email_xml}` : null,
                `Cond. Pagamento: ${detalhePedido.cond_pagamento ?? "—"}`,
                `Tabela Preço: ${detalhePedido.tabela_preco ?? "—"}`,
                `Cluster: ${detalhePedido.cluster ?? "—"}`,
                detalhePedido.comprador ? `Comprador: ${detalhePedido.comprador}` : null,
                `Agendamento: ${detalhePedido.agendamento ? "Sim" : "Não"}`,
                detalhePedido.observacoes ? `Obs: ${detalhePedido.observacoes}` : null,
              ].filter(Boolean).join("\n");
              navigator.clipboard.writeText(linhas).then(() => toast.success("Dados copiados!"));
            }}>
              Copiar dados para Sankhya
            </Button>
            <Button variant="outline" onClick={() => setDetalhePedido(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: faturamento por produto */}
      <Dialog open={!!prodFatDialog} onOpenChange={(o) => !o && setProdFatDialog(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Faturamento por produto — Pedido #{prodFatDialog?.numero_pedido}</DialogTitle>
          </DialogHeader>
          {prodFatDialog && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                {prodFatDialog.razao_social} — {prodFatDialog.cond_pagamento ?? ""}
                {prodFatDialog.email_xml && <span className="ml-2">• Email XML: {prodFatDialog.email_xml}</span>}
              </p>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-3 py-2">Produto</th>
                      <th className="text-center px-2 py-2 w-10">Cx</th>
                      <th className="text-center px-2 py-2 w-20">Qtd Pedida</th>
                      <th className="text-center px-2 py-2 w-24">Qtd Faturada</th>
                      <th className="text-center px-2 py-2 w-24">Saldo</th>
                      <th className="text-center px-2 py-2 w-20">Peso Un.</th>
                      <th className="text-center px-2 py-2 w-24">Peso Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prodFatDialog.itens.map((item) => {
                      const qtdFat = prodFatQtds[item.id] ?? 0;
                      const saldo = item.quantidade - qtdFat;
                      return (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            <div className="font-medium">{item.nome}</div>
                            <div className="text-xs text-muted-foreground">{item.codigo}</div>
                          </td>
                          <td className="text-center px-2 py-2 text-muted-foreground">{item.cx_embarque}</td>
                          <td className="text-center px-2 py-2">{item.quantidade}</td>
                          <td className="px-2 py-2">
                            <Input
                              type="number"
                              min={0}
                              max={item.quantidade}
                              value={qtdFat}
                              onChange={(e) => {
                                const v = Math.max(0, Math.min(item.quantidade, Number(e.target.value) || 0));
                                setProdFatQtds((prev) => ({ ...prev, [item.id]: v }));
                              }}
                              className="h-7 w-20 text-sm text-center mx-auto block"
                            />
                          </td>
                          <td className={`text-center px-2 py-2 font-medium ${saldo > 0 ? "text-red-600" : "text-green-600"}`}>
                            {saldo}
                          </td>
                          <td className="text-center px-2 py-2 text-muted-foreground">{item.peso_unitario.toFixed(3)}</td>
                          <td className="text-center px-2 py-2 text-muted-foreground">{(item.peso_unitario * qtdFat).toFixed(2)} kg</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                Peso total faturado: <strong>{prodFatDialog.itens.reduce((s, i) => s + i.peso_unitario * (prodFatQtds[i.id] ?? 0), 0).toFixed(2)} kg</strong>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProdFatDialog(null)}>Fechar</Button>
            <Button onClick={salvarProdFat} disabled={salvandoProdFat}>
              {salvandoProdFat && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar faturamento parcial
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
