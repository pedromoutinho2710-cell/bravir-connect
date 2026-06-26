import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatBRL, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Ban, Download, Loader2, Pencil, PlusCircle, Trash2 } from "lucide-react";

const MOTIVO_LABEL: Record<string, string> = {
  desistencia: "Desistência",
  inadimplencia: "Inadimplência",
  erro_comercial: "Erro Comercial",
  logistica: "Logística",
  outro: "Outro",
};

const schema = z.object({
  numero_pedido: z.string().min(1, "Obrigatório"),
  cliente_id: z.string().nullable().optional(),
  cliente_nome: z.string().optional(),
  vendedor_id: z.string().min(1, "Obrigatório"),
  valor_cancelado: z.coerce.number({ invalid_type_error: "Valor inválido" }).positive("Deve ser maior que zero"),
  data_cancelamento: z.string().min(1, "Obrigatório"),
  motivo: z.enum(["desistencia", "inadimplencia", "erro_comercial", "logistica", "outro"]),
  observacoes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

type Cancelamento = {
  id: string;
  numero_pedido: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  vendedor_id: string;
  vendedor_nome: string | null;
  valor_cancelado: number;
  data_cancelamento: string;
  motivo: string;
  observacoes: string | null;
  registrado_por: string | null;
  created_at: string;
};

type Vendedor = { id: string; full_name: string | null };
type Cliente = { id: string; razao_social: string | null; nome_parceiro: string | null };

const GREEN_FILL = "FF1A6B3A";

async function exportarExcel(rows: Cancelamento[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Cancelamentos");
  ws.columns = [
    { width: 14 }, { width: 36 }, { width: 26 }, { width: 16 },
    { width: 18 }, { width: 18 }, { width: 16 }, { width: 14 },
  ];
  const cols = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const headers = ["Nº Pedido", "Cliente", "Vendedor", "Valor Cancelado", "Data Cancelamento", "Motivo", "Registrado em", "Observações"];
  cols.forEach((c, i) => {
    const cell = ws.getCell(`${c}1`);
    cell.value = headers[i];
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_FILL } };
    cell.alignment = { horizontal: "center" };
  });
  ws.getRow(1).height = 22;
  rows.forEach((r, idx) => {
    const row = idx + 2;
    ws.getCell(`A${row}`).value = r.numero_pedido;
    ws.getCell(`B${row}`).value = r.cliente_nome ?? "";
    ws.getCell(`C${row}`).value = r.vendedor_nome ?? "";
    ws.getCell(`D${row}`).value = r.valor_cancelado;
    ws.getCell(`D${row}`).numFmt = "#,##0.00";
    ws.getCell(`D${row}`).alignment = { horizontal: "right" };
    ws.getCell(`E${row}`).value = r.data_cancelamento;
    ws.getCell(`F${row}`).value = MOTIVO_LABEL[r.motivo] ?? r.motivo;
    ws.getCell(`G${row}`).value = r.created_at ? new Date(r.created_at).toLocaleDateString("pt-BR") : "";
    ws.getCell(`H${row}`).value = r.observacoes ?? "";
    if (idx % 2 === 0) {
      cols.forEach((c) => {
        ws.getCell(`${c}${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
      });
    }
  });
  ws.autoFilter = { from: "A1", to: `H${rows.length + 1}` };
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url; a.download = "cancelamentos.xlsx"; a.click();
  URL.revokeObjectURL(url);
}

export default function PedidosCancelados() {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const qc = useQueryClient();

  // Filtros
  const hoje = new Date();
  const [filtroMesIni, setFiltroMesIni] = useState(`${hoje.getFullYear()}-01`);
  const [filtroMesFim, setFiltroMesFim] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`);
  const [filtroVendedor, setFiltroVendedor] = useState("todos");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroMotivo, setFiltroMotivo] = useState("todos");
  const [filtroNumero, setFiltroNumero] = useState("");

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Cancelamento | null>(null);
  const [clienteBusca, setClienteBusca] = useState("");

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { numero_pedido: "", cliente_id: null, cliente_nome: "", vendedor_id: "", valor_cancelado: 0, data_cancelamento: "", motivo: "desistencia", observacoes: "" },
  });

  // Queries
  const { data: vendedores = [] } = useQuery<Vendedor[]>({
    queryKey: ["vendedores-lista"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name").eq("role", "vendedor").order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: clientes = [] } = useQuery<Cliente[]>({
    queryKey: ["clientes-busca", clienteBusca],
    queryFn: async () => {
      if (clienteBusca.length < 2) return [];
      const { data, error } = await supabase
        .from("clientes")
        .select("id, razao_social, nome_parceiro")
        .or(`razao_social.ilike.%${clienteBusca}%,nome_parceiro.ilike.%${clienteBusca}%`)
        .is("deleted_at", null)
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: clienteBusca.length >= 2,
  });

  const iniDate = filtroMesIni ? `${filtroMesIni}-01` : undefined;
  const fimDate = filtroMesFim ? `${filtroMesFim}-31` : undefined;

  const { data: cancelamentos = [], isLoading } = useQuery<Cancelamento[]>({
    queryKey: ["cancelamentos", filtroMesIni, filtroMesFim, filtroVendedor, filtroCliente, filtroMotivo, filtroNumero],
    queryFn: async () => {
      let q = (supabase as any)
        .from("pedidos_cancelados")
        .select("*, profiles!pedidos_cancelados_vendedor_id_fkey(full_name)")
        .order("data_cancelamento", { ascending: false });

      if (iniDate) q = q.gte("data_cancelamento", iniDate);
      if (fimDate) q = q.lte("data_cancelamento", fimDate);
      if (filtroVendedor !== "todos") q = q.eq("vendedor_id", filtroVendedor);
      if (filtroMotivo !== "todos") q = q.eq("motivo", filtroMotivo);
      if (filtroNumero.trim()) q = q.ilike("numero_pedido", `%${filtroNumero.trim()}%`);

      const { data, error } = await q;
      if (error) throw error;

      let rows = (data ?? []).map((r: any) => ({
        ...r,
        vendedor_nome: r.profiles?.full_name ?? null,
      }));

      if (filtroCliente.trim()) {
        const t = filtroCliente.toLowerCase();
        rows = rows.filter((r: Cancelamento) => (r.cliente_nome ?? "").toLowerCase().includes(t));
      }

      return rows;
    },
  });

  const salvarMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        numero_pedido: data.numero_pedido,
        cliente_id: data.cliente_id || null,
        cliente_nome: data.cliente_nome || null,
        vendedor_id: data.vendedor_id,
        valor_cancelado: data.valor_cancelado,
        data_cancelamento: data.data_cancelamento,
        motivo: data.motivo,
        observacoes: data.observacoes || null,
        registrado_por: user?.id ?? null,
      };
      if (editando) {
        const { error } = await (supabase as any).from("pedidos_cancelados").update(payload).eq("id", editando.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("pedidos_cancelados").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cancelamentos"] });
      toast.success(editando ? "Cancelamento atualizado." : "Cancelamento registrado.");
      fecharDialog();
    },
    onError: () => toast.error("Erro ao salvar. Tente novamente."),
  });

  const excluirMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("pedidos_cancelados").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cancelamentos"] });
      toast.success("Cancelamento excluído.");
    },
    onError: () => toast.error("Erro ao excluir."),
  });

  function abrirNovo() {
    setEditando(null);
    form.reset({ numero_pedido: "", cliente_id: null, cliente_nome: "", vendedor_id: "", valor_cancelado: 0, data_cancelamento: "", motivo: "desistencia", observacoes: "" });
    setClienteBusca("");
    setDialogOpen(true);
  }

  function abrirEditar(c: Cancelamento) {
    setEditando(c);
    form.reset({
      numero_pedido: c.numero_pedido,
      cliente_id: c.cliente_id ?? null,
      cliente_nome: c.cliente_nome ?? "",
      vendedor_id: c.vendedor_id,
      valor_cancelado: c.valor_cancelado,
      data_cancelamento: c.data_cancelamento,
      motivo: c.motivo as any,
      observacoes: c.observacoes ?? "",
    });
    setClienteBusca(c.cliente_nome ?? "");
    setDialogOpen(true);
  }

  function fecharDialog() {
    setDialogOpen(false);
    setEditando(null);
  }

  function confirmarExcluir(c: Cancelamento) {
    if (!window.confirm(`Excluir o cancelamento do pedido ${c.numero_pedido}? Esta ação não pode ser desfeita.`)) return;
    excluirMutation.mutate(c.id);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Ban className="h-6 w-6" /> Pedidos Cancelados
          </h1>
          <p className="text-sm text-muted-foreground">Registro de cancelamentos e seus impactos no resultado do vendedor</p>
        </div>
        <Button onClick={abrirNovo} className="gap-2">
          <PlusCircle className="h-4 w-4" /> Registrar cancelamento
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground whitespace-nowrap">De</span>
              <Input type="month" value={filtroMesIni} onChange={(e) => setFiltroMesIni(e.target.value)} className="w-36" />
              <span className="text-xs text-muted-foreground">até</span>
              <Input type="month" value={filtroMesFim} onChange={(e) => setFiltroMesFim(e.target.value)} className="w-36" />
            </div>
            <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Todos os vendedores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os vendedores</SelectItem>
                {vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              placeholder="Cliente..."
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              className="w-44"
            />
            <Select value={filtroMotivo} onValueChange={setFiltroMotivo}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Todos os motivos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os motivos</SelectItem>
                {Object.entries(MOTIVO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              placeholder="Nº do pedido..."
              value={filtroNumero}
              onChange={(e) => setFiltroNumero(e.target.value)}
              className="w-36"
            />
            <Button variant="outline" size="sm" className="gap-2 ml-auto" onClick={() => exportarExcel(cancelamentos)} disabled={cancelamentos.length === 0}>
              <Download className="h-4 w-4" /> Exportar Excel
            </Button>
          </div>

          {/* Tabela */}
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : cancelamentos.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">Nenhum cancelamento encontrado</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">Valor Cancelado</TableHead>
                    <TableHead>Data Cancelamento</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Registrado em</TableHead>
                    <TableHead className="w-16">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cancelamentos.map((c) => (
                    <TableRow key={c.id} className="text-sm">
                      <TableCell className="font-mono font-medium">{c.numero_pedido}</TableCell>
                      <TableCell className="max-w-40 truncate">{c.cliente_nome ?? "—"}</TableCell>
                      <TableCell>{c.vendedor_nome ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium text-destructive">{formatBRL(c.valor_cancelado)}</TableCell>
                      <TableCell>{formatDate(c.data_cancelamento)}</TableCell>
                      <TableCell>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                          {MOTIVO_LABEL[c.motivo] ?? c.motivo}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => abrirEditar(c)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {isAdmin && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => confirmarExcluir(c)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de cadastro/edição */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) fecharDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar cancelamento" : "Registrar cancelamento"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((d) => salvarMutation.mutate(d))} className="space-y-4">
              <FormField control={form.control} name="numero_pedido" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nº do Pedido</FormLabel>
                  <FormControl><Input placeholder="Ex: 12345" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Cliente — busca livre + seleção */}
              <div className="space-y-1">
                <label className="text-sm font-medium leading-none">Cliente <span className="text-muted-foreground font-normal">(opcional)</span></label>
                <Input
                  placeholder="Buscar por nome do cliente..."
                  value={clienteBusca}
                  onChange={(e) => {
                    setClienteBusca(e.target.value);
                    form.setValue("cliente_id", null);
                    form.setValue("cliente_nome", e.target.value);
                  }}
                />
                {clientes.length > 0 && !form.watch("cliente_id") && (
                  <div className="rounded-md border bg-popover shadow-md max-h-40 overflow-y-auto">
                    {clientes.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                        onClick={() => {
                          const nome = c.nome_parceiro || c.razao_social || "";
                          form.setValue("cliente_id", c.id);
                          form.setValue("cliente_nome", nome);
                          setClienteBusca(nome);
                        }}
                      >
                        {c.nome_parceiro || c.razao_social}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <FormField control={form.control} name="vendedor_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Vendedor</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Selecionar vendedor..." /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="valor_cancelado" render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor Cancelado (R$)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0.01" placeholder="0,00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="data_cancelamento" render={({ field }) => (
                <FormItem>
                  <FormLabel>Data do cancelamento <span className="text-muted-foreground font-normal">(impacta resultado do mês selecionado)</span></FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="motivo" render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(MOTIVO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="observacoes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                  <FormControl><Textarea rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={fecharDialog}>Cancelar</Button>
                <Button type="submit" disabled={salvarMutation.isPending}>
                  {salvarMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editando ? "Salvar alterações" : "Registrar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
