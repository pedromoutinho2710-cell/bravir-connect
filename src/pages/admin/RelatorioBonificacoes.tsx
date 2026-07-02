import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatBRL, formatDate, hojeISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Gift, Download, Pencil, Trash2, Loader2, Users, DollarSign, ListOrdered, Plus } from "lucide-react";
import { toast } from "sonner";

// ─── Constantes ─────────────────────────────────────────────────────────────

const GREEN_FILL = "FF006130";
const AVISO_FILL = "FFFFCC00"; // amarelo aviso

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-amber-100 text-amber-800 border-amber-200" },
  aprovada: { label: "Aprovada", className: "bg-blue-100 text-blue-800 border-blue-200" },
  paga:     { label: "Paga",     className: "bg-green-100 text-green-800 border-green-200" },
};

// ─── Schema Zod ─────────────────────────────────────────────────────────────

const schema = z.object({
  vendedor_id:      z.string().min(1, "Selecione um vendedor"),
  cliente_id:       z.string().nullable().optional(),
  cliente_nome:     z.string().optional(),
  numero_pedido:    z.string().optional(),
  valor:            z.coerce.number({ invalid_type_error: "Informe um valor" }).positive("Valor deve ser maior que zero"),
  data_bonificacao: z.string().min(1, "Data obrigatória"),
  status:           z.enum(["pendente", "aprovada", "paga"]),
  motivo:           z.string().optional(),
  observacoes:      z.string().optional(),
});

type FormData = z.infer<typeof schema>;

// ─── Tipos ──────────────────────────────────────────────────────────────────

type Bonificacao = {
  id: string;
  vendedor_id: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  pedido_id: string | null;
  numero_pedido: string | null;
  valor: number;
  data_bonificacao: string;
  motivo: string | null;
  status: "pendente" | "aprovada" | "paga";
  registrado_por: string | null;
  observacoes: string | null;
  created_at: string;
  profiles?: { full_name?: string | null } | null;
  clientes?: { razao_social?: string | null; nome_parceiro?: string | null } | null;
};

type Vendedor = { id: string; full_name: string | null };
type ClienteLista = { id: string; razao_social: string | null; nome_parceiro: string | null };

// ─── Exportação Excel ────────────────────────────────────────────────────────

async function exportarExcel(rows: Bonificacao[], vendedorMap: Record<string, string>) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Bonificações");
  ws.columns = [
    { width: 14 }, { width: 28 }, { width: 32 }, { width: 16 },
    { width: 16 }, { width: 36 }, { width: 14 },
  ];
  const cols = ["A", "B", "C", "D", "E", "F", "G"];

  // Linha de aviso — NÃO compõe faturamento
  ws.mergeCells("A1:G1");
  const aviso = ws.getCell("A1");
  aviso.value = "BONIFICAÇÕES — não compõe faturamento";
  aviso.font = { bold: true, size: 12, color: { argb: "FF7A4A00" } };
  aviso.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AVISO_FILL } };
  aviso.alignment = { horizontal: "center", vertical: "center" };
  ws.getRow(1).height = 22;

  // Cabeçalho
  const headers = ["Data", "Vendedor", "Cliente", "Nº Pedido", "Valor (R$)", "Motivo", "Status"];
  cols.forEach((c, i) => {
    const cell = ws.getCell(`${c}2`);
    cell.value = headers[i];
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_FILL } };
    cell.alignment = { horizontal: "center" };
  });
  ws.getRow(2).height = 20;

  rows.forEach((r, idx) => {
    const row = idx + 3;
    const nomeVendedor = r.profiles?.full_name ?? vendedorMap[r.vendedor_id] ?? "";
    const nomeCliente = r.clientes?.nome_parceiro || r.clientes?.razao_social || r.cliente_nome || "";
    ws.getCell(`A${row}`).value = r.data_bonificacao;
    ws.getCell(`B${row}`).value = nomeVendedor;
    ws.getCell(`C${row}`).value = nomeCliente;
    ws.getCell(`D${row}`).value = r.numero_pedido ?? "";
    ws.getCell(`E${row}`).value = r.valor;
    ws.getCell(`E${row}`).numFmt = "#,##0.00";
    ws.getCell(`E${row}`).alignment = { horizontal: "right" };
    ws.getCell(`F${row}`).value = r.motivo ?? "";
    ws.getCell(`G${row}`).value = STATUS_BADGE[r.status]?.label ?? r.status;
    if (idx % 2 === 0) {
      cols.forEach((c) => {
        ws.getCell(`${c}${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
      });
    }
  });

  ws.autoFilter = { from: "A2", to: `G${rows.length + 2}` };

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "relatorio_bonificacoes.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function RelatorioBonificacoes() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const hoje = new Date();

  const [filtroIni, setFiltroIni] = useState(`${hoje.getFullYear()}-01-01`);
  const [filtroFim, setFiltroFim] = useState(hojeISO());
  const [filtroVendedor, setFiltroVendedor] = useState("todos");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<Bonificacao | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [buscaCliente, setBuscaCliente] = useState("");

  // ── Queries ──

  const { data: vendedores = [] } = useQuery<Vendedor[]>({
    queryKey: ["vendedores-lista"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "vendedor")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: clientes = [] } = useQuery<ClienteLista[]>({
    queryKey: ["clientes-lista-bonificacao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, razao_social, nome_parceiro")
        .is("deleted_at", null)
        .order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: bonificacoes = [], isLoading } = useQuery<Bonificacao[]>({
    queryKey: ["bonificacoes-admin", filtroIni, filtroFim, filtroVendedor, filtroStatus],
    queryFn: async () => {
      let q = (supabase as any)
        .from("bonificacoes")
        .select("*, profiles!bonificacoes_vendedor_id_fkey(full_name), clientes(razao_social, nome_parceiro)")
        .order("data_bonificacao", { ascending: false });
      if (filtroIni) q = q.gte("data_bonificacao", filtroIni);
      if (filtroFim) q = q.lte("data_bonificacao", filtroFim);
      if (filtroVendedor !== "todos") q = q.eq("vendedor_id", filtroVendedor);
      if (filtroStatus !== "todos") q = q.eq("status", filtroStatus);
      const { data, error } = await q;
      if (error) { toast.error("Erro ao carregar bonificações."); throw error; }
      return (data ?? []).map((r: any) => ({ ...r, valor: Number(r.valor) }));
    },
  });

  // ── Filtragem client-side por cliente ──

  const filtrados = useMemo(() => {
    if (!filtroCliente.trim()) return bonificacoes;
    const t = filtroCliente.toLowerCase();
    return bonificacoes.filter((b) => {
      const nome = b.clientes?.nome_parceiro || b.clientes?.razao_social || b.cliente_nome || "";
      return nome.toLowerCase().includes(t);
    });
  }, [bonificacoes, filtroCliente]);

  // ── Agregados ──

  const totalValor = useMemo(() => filtrados.reduce((s, b) => s + b.valor, 0), [filtrados]);
  const vendedoresDistintos = useMemo(() => new Set(filtrados.map((b) => b.vendedor_id)).size, [filtrados]);

  const rankingVendedor = useMemo(() => {
    const map: Record<string, { nome: string; qtd: number; valor: number }> = {};
    filtrados.forEach((b) => {
      if (!map[b.vendedor_id]) {
        map[b.vendedor_id] = { nome: b.profiles?.full_name ?? b.vendedor_id, qtd: 0, valor: 0 };
      }
      map[b.vendedor_id].qtd++;
      map[b.vendedor_id].valor += b.valor;
    });
    return Object.values(map).sort((a, b) => b.valor - a.valor);
  }, [filtrados]);

  const vendedorMap = useMemo(() => {
    const m: Record<string, string> = {};
    vendedores.forEach((v) => { m[v.id] = v.full_name ?? ""; });
    return m;
  }, [vendedores]);

  // ── Form ──

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      vendedor_id: "",
      cliente_id: null,
      cliente_nome: "",
      numero_pedido: "",
      valor: 0,
      data_bonificacao: hojeISO(),
      status: "pendente",
      motivo: "",
      observacoes: "",
    },
  });

  useEffect(() => {
    if (dialogAberto && editando) {
      form.reset({
        vendedor_id:      editando.vendedor_id,
        cliente_id:       editando.cliente_id ?? null,
        cliente_nome:     editando.cliente_nome ?? "",
        numero_pedido:    editando.numero_pedido ?? "",
        valor:            editando.valor,
        data_bonificacao: editando.data_bonificacao,
        status:           editando.status,
        motivo:           editando.motivo ?? "",
        observacoes:      editando.observacoes ?? "",
      });
      setBuscaCliente(
        editando.clientes?.nome_parceiro || editando.clientes?.razao_social || editando.cliente_nome || ""
      );
    } else if (dialogAberto && !editando) {
      form.reset({
        vendedor_id: "",
        cliente_id: null,
        cliente_nome: "",
        numero_pedido: "",
        valor: 0,
        data_bonificacao: hojeISO(),
        status: "pendente",
        motivo: "",
        observacoes: "",
      });
      setBuscaCliente("");
    }
  }, [dialogAberto, editando]);

  // ── Mutations ──

  const salvar = useMutation({
    mutationFn: async (values: FormData) => {
      const payload = {
        vendedor_id:      values.vendedor_id,
        cliente_id:       values.cliente_id || null,
        cliente_nome:     values.cliente_nome || null,
        numero_pedido:    values.numero_pedido || null,
        valor:            values.valor,
        data_bonificacao: values.data_bonificacao,
        status:           values.status,
        motivo:           values.motivo || null,
        observacoes:      values.observacoes || null,
        registrado_por:   user?.id ?? null,
      };
      if (editando) {
        const { error } = await (supabase as any).from("bonificacoes").update(payload).eq("id", editando.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("bonificacoes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bonificacoes-admin"] });
      setDialogAberto(false);
      setEditando(null);
      toast.success(editando ? "Bonificação atualizada." : "Bonificação registrada.");
    },
    onError: () => toast.error("Erro ao salvar bonificação."),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("bonificacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bonificacoes-admin"] });
      setExcluindoId(null);
      toast.success("Bonificação excluída.");
    },
    onError: () => toast.error("Erro ao excluir bonificação."),
  });

  const abrirNova = () => {
    setEditando(null);
    setDialogAberto(true);
  };

  const abrirEdicao = (b: Bonificacao) => {
    setEditando(b);
    setDialogAberto(true);
  };

  const clientesFiltrados = useMemo(() => {
    if (!buscaCliente.trim()) return clientes.slice(0, 20);
    const t = buscaCliente.toLowerCase();
    return clientes
      .filter((c) =>
        (c.razao_social ?? "").toLowerCase().includes(t) ||
        (c.nome_parceiro ?? "").toLowerCase().includes(t)
      )
      .slice(0, 20);
  }, [clientes, buscaCliente]);

  const [clienteDropOpen, setClienteDropOpen] = useState(false);
  const clienteId = form.watch("cliente_id");

  const nomeClienteExibido = (b: Bonificacao) =>
    b.profiles?.full_name ?? vendedorMap[b.vendedor_id] ?? b.vendedor_id;

  const nomeClienteLinha = (b: Bonificacao) =>
    b.clientes?.nome_parceiro || b.clientes?.razao_social || b.cliente_nome || "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gift className="h-6 w-6" /> Relatório de Bonificações
          </h1>
          <p className="text-sm text-muted-foreground">
            Controle gerencial — não compõe faturamento, metas ou rankings
          </p>
        </div>
        <Button onClick={abrirNova} className="gap-2">
          <Plus className="h-4 w-4" /> Registrar bonificação
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground whitespace-nowrap">De</span>
              <Input
                type="date"
                value={filtroIni}
                onChange={(e) => setFiltroIni(e.target.value)}
                className="w-36"
              />
              <span className="text-xs text-muted-foreground">até</span>
              <Input
                type="date"
                value={filtroFim}
                onChange={(e) => setFiltroFim(e.target.value)}
                className="w-36"
              />
            </div>
            <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Todos os vendedores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os vendedores</SelectItem>
                {vendedores.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Cliente..."
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              className="w-44"
            />
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="aprovada">Aprovada</SelectItem>
                <SelectItem value="paga">Paga</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => exportarExcel(filtrados, vendedorMap)}
              disabled={filtrados.length === 0}
            >
              <Download className="h-4 w-4" /> Exportar Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Valor Total no Período
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-700">{formatBRL(totalValor)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <ListOrdered className="h-4 w-4" /> Quantidade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{filtrados.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" /> Vendedores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{vendedoresDistintos}</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Ranking por Vendedor */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ranking por Vendedor</CardTitle>
            </CardHeader>
            <CardContent>
              {rankingVendedor.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Sem dados</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendedor</TableHead>
                        <TableHead className="text-center">Qtd</TableHead>
                        <TableHead className="text-right">Valor Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rankingVendedor.map((v) => (
                        <TableRow key={v.nome}>
                          <TableCell>{v.nome}</TableCell>
                          <TableCell className="text-center">{v.qtd}</TableCell>
                          <TableCell className="text-right font-medium text-green-700">
                            {formatBRL(v.valor)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Histórico Completo */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Histórico Completo</CardTitle>
              <span className="text-xs text-muted-foreground">{filtrados.length} registros</span>
            </CardHeader>
            <CardContent>
              {filtrados.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-muted-foreground gap-2">
                  <Gift className="h-8 w-8 opacity-40" />
                  <p className="text-sm">Nenhuma bonificação no período</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Vendedor</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Nº Pedido</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Motivo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-center">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtrados.map((b) => {
                        const badge = STATUS_BADGE[b.status] ?? STATUS_BADGE.pendente;
                        return (
                          <TableRow key={b.id} className="text-sm">
                            <TableCell>{formatDate(b.data_bonificacao)}</TableCell>
                            <TableCell>{nomeClienteExibido(b)}</TableCell>
                            <TableCell className="max-w-36 truncate">{nomeClienteLinha(b)}</TableCell>
                            <TableCell className="font-mono">{b.numero_pedido ?? "—"}</TableCell>
                            <TableCell className="text-right font-medium">{formatBRL(b.valor)}</TableCell>
                            <TableCell className="max-w-36 truncate text-muted-foreground">
                              {b.motivo ?? "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={badge.className}>
                                {badge.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex justify-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => abrirEdicao(b)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => setExcluindoId(b.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Dialog cadastro/edição */}
      <Dialog open={dialogAberto} onOpenChange={(o) => { setDialogAberto(o); if (!o) setEditando(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Bonificação" : "Registrar Bonificação"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => salvar.mutate(v))} className="space-y-4">
              {/* Vendedor */}
              <FormField
                control={form.control}
                name="vendedor_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendedor *</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o vendedor" />
                        </SelectTrigger>
                        <SelectContent>
                          {vendedores.map((v) => (
                            <SelectItem key={v.id} value={v.id}>{v.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Cliente — busca + fallback texto */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Cliente</label>
                <div className="relative">
                  <Input
                    placeholder="Buscar cliente..."
                    value={buscaCliente}
                    onFocus={() => setClienteDropOpen(true)}
                    onBlur={() => setTimeout(() => setClienteDropOpen(false), 150)}
                    onChange={(e) => {
                      setBuscaCliente(e.target.value);
                      form.setValue("cliente_id", null);
                      form.setValue("cliente_nome", e.target.value);
                      setClienteDropOpen(true);
                    }}
                  />
                  {clienteDropOpen && buscaCliente && clientesFiltrados.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {clientesFiltrados.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            form.setValue("cliente_id", c.id);
                            form.setValue("cliente_nome", "");
                            setBuscaCliente(c.nome_parceiro || c.razao_social || "");
                            setClienteDropOpen(false);
                          }}
                        >
                          <span className="font-medium">{c.nome_parceiro || c.razao_social}</span>
                          {c.nome_parceiro && c.razao_social && (
                            <span className="text-muted-foreground ml-2 text-xs">{c.razao_social}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {clienteId && (
                  <p className="text-xs text-muted-foreground">Cliente vinculado ao cadastro.</p>
                )}
              </div>

              {/* Nº Pedido */}
              <FormField
                control={form.control}
                name="numero_pedido"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nº Pedido (opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: 12345" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Valor */}
              <FormField
                control={form.control}
                name="valor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor (R$) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0,00"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Data */}
              <FormField
                control={form.control}
                name="data_bonificacao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data da Bonificação *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Status */}
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pendente">Pendente</SelectItem>
                          <SelectItem value="aprovada">Aprovada</SelectItem>
                          <SelectItem value="paga">Paga</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Motivo */}
              <FormField
                control={form.control}
                name="motivo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Motivo</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Descreva o motivo da bonificação..."
                        className="resize-none"
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Observações */}
              <FormField
                control={form.control}
                name="observacoes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Observações internas..."
                        className="resize-none"
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setDialogAberto(false); setEditando(null); }}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={salvar.isPending}>
                  {salvar.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {editando ? "Salvar alterações" : "Registrar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* AlertDialog de exclusão */}
      <AlertDialog open={!!excluindoId} onOpenChange={(o) => { if (!o) setExcluindoId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir bonificação?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A bonificação será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => excluindoId && excluir.mutate(excluindoId)}
              disabled={excluir.isPending}
            >
              {excluir.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
