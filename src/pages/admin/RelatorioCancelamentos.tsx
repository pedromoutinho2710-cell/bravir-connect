import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileX, Download, Loader2, Users, AlertCircle, DollarSign, Undo2, Trash2 } from "lucide-react";
import { toast } from "sonner";

const MOTIVO_LABEL: Record<string, string> = {
  desistencia: "Desistência",
  inadimplencia: "Inadimplência",
  erro_comercial: "Erro Comercial",
  logistica: "Logística",
  outro: "Outro",
};

const GREEN_FILL = "FF006130";
const PAGE_SIZE = 20;

function fmtDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function rangeDoMes(mesIni: string, mesFim: string) {
  const ini = mesIni ? `${mesIni}-01` : undefined;
  const fim = mesFim
    ? (() => {
        const [y, m] = mesFim.split("-").map(Number);
        return `${mesFim}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
      })()
    : undefined;
  return { ini, fim };
}

type Vendedor = { id: string; full_name: string | null };

// ══════════════════════════════════════════════════════════════════
// Aba: Cancelados
// ══════════════════════════════════════════════════════════════════

type Cancelamento = {
  id: string;
  numero_pedido: string;
  cliente_nome: string | null;
  vendedor_id: string;
  vendedor_nome: string | null;
  valor_cancelado: number;
  data_cancelamento: string;
  motivo: string;
  observacoes: string | null;
  created_at: string;
};

async function exportarExcel(rows: Cancelamento[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Cancelamentos");
  ws.columns = [
    { width: 14 }, { width: 36 }, { width: 26 }, { width: 16 },
    { width: 18 }, { width: 18 }, { width: 14 }, { width: 40 },
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
  a.href = url; a.download = "relatorio_cancelamentos.xlsx"; a.click();
  URL.revokeObjectURL(url);
}

function AbaCancelados() {
  const hoje = new Date();
  const [filtroMesIni, setFiltroMesIni] = useState(`${hoje.getFullYear()}-01`);
  const [filtroMesFim, setFiltroMesFim] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`);
  const [filtroVendedor, setFiltroVendedor] = useState("todos");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroMotivo, setFiltroMotivo] = useState("todos");
  const [pagina, setPagina] = useState(0);

  const { data: vendedores = [] } = useQuery<Vendedor[]>({
    queryKey: ["vendedores-lista"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name").eq("role", "vendedor").order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { ini: iniDate, fim: fimDate } = rangeDoMes(filtroMesIni, filtroMesFim);

  const { data: cancelamentos = [], isLoading } = useQuery<Cancelamento[]>({
    queryKey: ["cancelamentos-admin", filtroMesIni, filtroMesFim, filtroVendedor, filtroMotivo],
    queryFn: async () => {
      let q = (supabase as any)
        .from("pedidos_cancelados")
        .select("*, profiles!pedidos_cancelados_vendedor_id_fkey(full_name)")
        .order("data_cancelamento", { ascending: false });

      if (iniDate) q = q.gte("data_cancelamento", iniDate);
      if (fimDate) q = q.lte("data_cancelamento", fimDate);
      if (filtroVendedor !== "todos") q = q.eq("vendedor_id", filtroVendedor);
      if (filtroMotivo !== "todos") q = q.eq("motivo", filtroMotivo);

      const { data, error } = await q;
      if (error) { toast.error("Erro ao carregar cancelamentos."); throw error; }
      return (data ?? []).map((r: any) => ({
        ...r,
        valor_cancelado: Number(r.valor_cancelado),
        vendedor_nome: r.profiles?.full_name ?? null,
      }));
    },
  });

  const filtrados = useMemo(() => {
    if (!filtroCliente.trim()) return cancelamentos;
    const t = filtroCliente.toLowerCase();
    return cancelamentos.filter((c) => (c.cliente_nome ?? "").toLowerCase().includes(t));
  }, [cancelamentos, filtroCliente]);

  const totalValor = useMemo(() => filtrados.reduce((s, c) => s + c.valor_cancelado, 0), [filtrados]);
  const vendedoresImpactados = useMemo(() => new Set(filtrados.map((c) => c.vendedor_id)).size, [filtrados]);

  const porVendedor = useMemo(() => {
    const map: Record<string, { nome: string; qtd: number; valor: number }> = {};
    filtrados.forEach((c) => {
      if (!map[c.vendedor_id]) map[c.vendedor_id] = { nome: c.vendedor_nome ?? c.vendedor_id, qtd: 0, valor: 0 };
      map[c.vendedor_id].qtd++;
      map[c.vendedor_id].valor += c.valor_cancelado;
    });
    return Object.values(map).sort((a, b) => b.valor - a.valor);
  }, [filtrados]);

  const porMotivo = useMemo(() => {
    const map: Record<string, { qtd: number; valor: number }> = {};
    filtrados.forEach((c) => {
      if (!map[c.motivo]) map[c.motivo] = { qtd: 0, valor: 0 };
      map[c.motivo].qtd++;
      map[c.motivo].valor += c.valor_cancelado;
    });
    return Object.entries(map)
      .map(([motivo, v]) => ({ motivo, ...v, pct: totalValor > 0 ? (v.valor / totalValor) * 100 : 0 }))
      .sort((a, b) => b.valor - a.valor);
  }, [filtrados, totalValor]);

  const porCliente = useMemo(() => {
    const map: Record<string, { qtd: number; valor: number }> = {};
    filtrados.forEach((c) => {
      const k = c.cliente_nome ?? "(sem cliente)";
      if (!map[k]) map[k] = { qtd: 0, valor: 0 };
      map[k].qtd++;
      map[k].valor += c.valor_cancelado;
    });
    return Object.entries(map)
      .map(([cliente, v]) => ({ cliente, ...v }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);
  }, [filtrados]);

  const paginados = useMemo(() => filtrados.slice(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE), [filtrados, pagina]);
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => exportarExcel(filtrados)} disabled={filtrados.length === 0}>
          <Download className="h-4 w-4" /> Exportar Excel
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground whitespace-nowrap">De</span>
              <Input type="month" value={filtroMesIni} onChange={(e) => { setFiltroMesIni(e.target.value); setPagina(0); }} className="w-36" />
              <span className="text-xs text-muted-foreground">até</span>
              <Input type="month" value={filtroMesFim} onChange={(e) => { setFiltroMesFim(e.target.value); setPagina(0); }} className="w-36" />
            </div>
            <Select value={filtroVendedor} onValueChange={(v) => { setFiltroVendedor(v); setPagina(0); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Todos os vendedores" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os vendedores</SelectItem>
                {vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Cliente..." value={filtroCliente} onChange={(e) => { setFiltroCliente(e.target.value); setPagina(0); }} className="w-44" />
            <Select value={filtroMotivo} onValueChange={(v) => { setFiltroMotivo(v); setPagina(0); }}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Todos os motivos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os motivos</SelectItem>
                {Object.entries(MOTIVO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> Total de Cancelamentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{filtrados.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Valor Total Cancelado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-destructive">{formatBRL(totalValor)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" /> Vendedores Impactados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{vendedoresImpactados}</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* Por Vendedor */}
          <Card>
            <CardHeader><CardTitle className="text-base">Por Vendedor</CardTitle></CardHeader>
            <CardContent>
              {porVendedor.length === 0 ? (
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
                      {porVendedor.map((v) => (
                        <TableRow key={v.nome}>
                          <TableCell>{v.nome}</TableCell>
                          <TableCell className="text-center">{v.qtd}</TableCell>
                          <TableCell className="text-right font-medium text-destructive">{formatBRL(v.valor)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Por Motivo e Por Cliente lado a lado */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Por Motivo</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Motivo</TableHead>
                        <TableHead className="text-center">Qtd</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {porMotivo.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Sem dados</TableCell></TableRow>
                      ) : porMotivo.map((m) => (
                        <TableRow key={m.motivo}>
                          <TableCell>{MOTIVO_LABEL[m.motivo] ?? m.motivo}</TableCell>
                          <TableCell className="text-center">{m.qtd}</TableCell>
                          <TableCell className="text-right">{formatBRL(m.valor)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{m.pct.toFixed(1)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Top 10 Clientes</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="text-center">Qtd</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {porCliente.length === 0 ? (
                        <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Sem dados</TableCell></TableRow>
                      ) : porCliente.map((c) => (
                        <TableRow key={c.cliente}>
                          <TableCell className="max-w-40 truncate">{c.cliente}</TableCell>
                          <TableCell className="text-center">{c.qtd}</TableCell>
                          <TableCell className="text-right">{formatBRL(c.valor)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Histórico completo paginado */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Histórico Completo</CardTitle>
              <span className="text-xs text-muted-foreground">{filtrados.length} registros</span>
            </CardHeader>
            <CardContent>
              {filtrados.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum cancelamento no período</p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nº Pedido</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Vendedor</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Motivo</TableHead>
                          <TableHead>Obs.</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginados.map((c) => (
                          <TableRow key={c.id} className="text-sm">
                            <TableCell className="font-mono font-medium">{c.numero_pedido}</TableCell>
                            <TableCell className="max-w-36 truncate">{c.cliente_nome ?? "—"}</TableCell>
                            <TableCell>{c.vendedor_nome ?? "—"}</TableCell>
                            <TableCell className="text-right text-destructive font-medium">{formatBRL(c.valor_cancelado)}</TableCell>
                            <TableCell>{formatDate(c.data_cancelamento)}</TableCell>
                            <TableCell>
                              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                                {MOTIVO_LABEL[c.motivo] ?? c.motivo}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-32 truncate">{c.observacoes ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {totalPaginas > 1 && (
                    <div className="flex items-center justify-between pt-4">
                      <Button variant="outline" size="sm" onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0}>Anterior</Button>
                      <span className="text-sm text-muted-foreground">Página {pagina + 1} de {totalPaginas}</span>
                      <Button variant="outline" size="sm" onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))} disabled={pagina >= totalPaginas - 1}>Próxima</Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// Aba: Devolvidos
// ══════════════════════════════════════════════════════════════════

type Devolvido = {
  id: string;
  numero_pedido: number | null;
  cliente_nome: string | null;
  vendedor_id: string | null;
  vendedor_nome: string | null;
  valor: number;
  data: string;
  motivo: string | null;
  usuario_nome: string | null;
};

function AbaDevolvidos() {
  const hoje = new Date();
  const [filtroMesIni, setFiltroMesIni] = useState(`${hoje.getFullYear()}-01`);
  const [filtroMesFim, setFiltroMesFim] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`);
  const [filtroVendedor, setFiltroVendedor] = useState("todos");
  const [pagina, setPagina] = useState(0);

  const { data: vendedores = [] } = useQuery<Vendedor[]>({
    queryKey: ["vendedores-lista"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name").eq("role", "vendedor").order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { ini, fim } = rangeDoMes(filtroMesIni, filtroMesFim);
  const iniDate = ini ? `${ini}T00:00:00` : undefined;
  const fimDate = fim ? `${fim}T23:59:59` : undefined;

  const { data: devolvidos = [], isLoading } = useQuery<Devolvido[]>({
    queryKey: ["devolvidos-admin", filtroMesIni, filtroMesFim],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("historico_status")
        .select(`
          id, pedido_id, observacao, usuario_nome, created_at,
          pedidos(numero_pedido, vendedor_id, itens_pedido(total_item), clientes(razao_social, nome_parceiro))
        `)
        .eq("status_novo", "devolvido")
        .order("created_at", { ascending: false });

      if (iniDate) q = q.gte("created_at", iniDate);
      if (fimDate) q = q.lte("created_at", fimDate);

      const { data, error } = await q;
      if (error) { toast.error("Erro ao carregar devoluções."); throw error; }

      const vendedorIds = new Set<string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).forEach((r: any) => { if (r.pedidos?.vendedor_id) vendedorIds.add(r.pedidos.vendedor_id); });
      const nomes: Record<string, string> = {};
      if (vendedorIds.size > 0) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", Array.from(vendedorIds));
        (profs ?? []).forEach((p) => { nomes[p.id] = p.full_name ?? "—"; });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        id: r.id,
        numero_pedido: r.pedidos?.numero_pedido ?? null,
        cliente_nome: r.pedidos?.clientes?.nome_parceiro || r.pedidos?.clientes?.razao_social || null,
        vendedor_id: r.pedidos?.vendedor_id ?? null,
        vendedor_nome: r.pedidos?.vendedor_id ? (nomes[r.pedidos.vendedor_id] ?? "—") : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        valor: (r.pedidos?.itens_pedido ?? []).reduce((s: number, i: any) => s + Number(i.total_item), 0),
        data: r.created_at,
        motivo: r.observacao,
        usuario_nome: r.usuario_nome,
      }));
    },
  });

  const filtrados = useMemo(() => {
    if (filtroVendedor === "todos") return devolvidos;
    return devolvidos.filter((d) => d.vendedor_id === filtroVendedor);
  }, [devolvidos, filtroVendedor]);

  const totalValor = useMemo(() => filtrados.reduce((s, d) => s + d.valor, 0), [filtrados]);
  const paginados = useMemo(() => filtrados.slice(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE), [filtrados, pagina]);
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground whitespace-nowrap">De</span>
              <Input type="month" value={filtroMesIni} onChange={(e) => { setFiltroMesIni(e.target.value); setPagina(0); }} className="w-36" />
              <span className="text-xs text-muted-foreground">até</span>
              <Input type="month" value={filtroMesFim} onChange={(e) => { setFiltroMesFim(e.target.value); setPagina(0); }} className="w-36" />
            </div>
            <Select value={filtroVendedor} onValueChange={(v) => { setFiltroVendedor(v); setPagina(0); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Todos os vendedores" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os vendedores</SelectItem>
                {vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Undo2 className="h-4 w-4" /> Total de Devoluções
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-3xl font-bold">{filtrados.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Valor Total Devolvido
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-3xl font-bold text-destructive">{formatBRL(totalValor)}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Histórico de Devoluções</CardTitle>
          <span className="text-xs text-muted-foreground">{filtrados.length} registros</span>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtrados.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma devolução no período</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nº Pedido</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Quem devolveu</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginados.map((d) => (
                      <TableRow key={d.id} className="text-sm">
                        <TableCell className="font-mono font-medium">{d.numero_pedido ?? "—"}</TableCell>
                        <TableCell className="max-w-36 truncate">{d.cliente_nome ?? "—"}</TableCell>
                        <TableCell>{d.vendedor_nome ?? "—"}</TableCell>
                        <TableCell className="text-right text-destructive font-medium">{formatBRL(d.valor)}</TableCell>
                        <TableCell className="whitespace-nowrap">{fmtDataHora(d.data)}</TableCell>
                        <TableCell>{d.usuario_nome ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-40 truncate">{d.motivo ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPaginas > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <Button variant="outline" size="sm" onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0}>Anterior</Button>
                  <span className="text-sm text-muted-foreground">Página {pagina + 1} de {totalPaginas}</span>
                  <Button variant="outline" size="sm" onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))} disabled={pagina >= totalPaginas - 1}>Próxima</Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// Aba: Excluídos
// ══════════════════════════════════════════════════════════════════

type Excluido = {
  id: string;
  numero_pedido: number;
  cliente_nome: string | null;
  vendedor_id: string | null;
  vendedor_nome: string | null;
  valor: number;
  deleted_at: string;
  excluido_por_nome: string | null;
};

function AbaExcluidos() {
  const hoje = new Date();
  const [filtroMesIni, setFiltroMesIni] = useState(`${hoje.getFullYear()}-01`);
  const [filtroMesFim, setFiltroMesFim] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`);
  const [pagina, setPagina] = useState(0);

  const { ini, fim } = rangeDoMes(filtroMesIni, filtroMesFim);
  const iniDate = ini ? `${ini}T00:00:00` : undefined;
  const fimDate = fim ? `${fim}T23:59:59` : undefined;

  const { data: excluidos = [], isLoading } = useQuery<Excluido[]>({
    queryKey: ["excluidos-admin", filtroMesIni, filtroMesFim],
    queryFn: async () => {
      let q = supabase
        .from("pedidos")
        .select("id, numero_pedido, vendedor_id, deleted_at, deleted_by, itens_pedido(total_item), clientes(razao_social, nome_parceiro)")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

      if (iniDate) q = q.gte("deleted_at", iniDate);
      if (fimDate) q = q.lte("deleted_at", fimDate);

      const { data, error } = await q;
      if (error) { toast.error("Erro ao carregar exclusões."); throw error; }

      const ids = new Set<string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).forEach((r: any) => { if (r.vendedor_id) ids.add(r.vendedor_id); if (r.deleted_by) ids.add(r.deleted_by); });
      const nomes: Record<string, string> = {};
      if (ids.size > 0) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", Array.from(ids));
        (profs ?? []).forEach((p) => { nomes[p.id] = p.full_name ?? "—"; });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        id: r.id,
        numero_pedido: r.numero_pedido,
        cliente_nome: r.clientes?.nome_parceiro || r.clientes?.razao_social || null,
        vendedor_id: r.vendedor_id,
        vendedor_nome: r.vendedor_id ? (nomes[r.vendedor_id] ?? "—") : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        valor: (r.itens_pedido ?? []).reduce((s: number, i: any) => s + Number(i.total_item), 0),
        deleted_at: r.deleted_at,
        excluido_por_nome: r.deleted_by ? (nomes[r.deleted_by] ?? "—") : null,
      }));
    },
  });

  const totalValor = useMemo(() => excluidos.reduce((s, d) => s + d.valor, 0), [excluidos]);
  const paginados = useMemo(() => excluidos.slice(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE), [excluidos, pagina]);
  const totalPaginas = Math.max(1, Math.ceil(excluidos.length / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground whitespace-nowrap">De</span>
            <Input type="month" value={filtroMesIni} onChange={(e) => { setFiltroMesIni(e.target.value); setPagina(0); }} className="w-36" />
            <span className="text-xs text-muted-foreground">até</span>
            <Input type="month" value={filtroMesFim} onChange={(e) => { setFiltroMesFim(e.target.value); setPagina(0); }} className="w-36" />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Trash2 className="h-4 w-4" /> Total de Exclusões
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-3xl font-bold">{excluidos.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Valor Total Excluído
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-3xl font-bold text-destructive">{formatBRL(totalValor)}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Pedidos Excluídos</CardTitle>
          <span className="text-xs text-muted-foreground">{excluidos.length} registros</span>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : excluidos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum pedido excluído no período</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nº Pedido</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Excluído em</TableHead>
                      <TableHead>Excluído por</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginados.map((d) => (
                      <TableRow key={d.id} className="text-sm">
                        <TableCell className="font-mono font-medium">{d.numero_pedido}</TableCell>
                        <TableCell className="max-w-36 truncate">{d.cliente_nome ?? "—"}</TableCell>
                        <TableCell>{d.vendedor_nome ?? "—"}</TableCell>
                        <TableCell className="text-right text-destructive font-medium">{formatBRL(d.valor)}</TableCell>
                        <TableCell className="whitespace-nowrap">{fmtDataHora(d.deleted_at)}</TableCell>
                        <TableCell>{d.excluido_por_nome ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPaginas > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <Button variant="outline" size="sm" onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0}>Anterior</Button>
                  <span className="text-sm text-muted-foreground">Página {pagina + 1} de {totalPaginas}</span>
                  <Button variant="outline" size="sm" onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))} disabled={pagina >= totalPaginas - 1}>Próxima</Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// Página
// ══════════════════════════════════════════════════════════════════

export default function RelatorioCancelamentos() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileX className="h-6 w-6" /> Relatório de Cancelamentos, Devoluções e Exclusões
        </h1>
        <p className="text-sm text-muted-foreground">O que saiu da meta de entrada de pedidos, por período</p>
      </div>

      <Tabs defaultValue="cancelados">
        <TabsList>
          <TabsTrigger value="cancelados">Cancelados</TabsTrigger>
          <TabsTrigger value="devolvidos">Devolvidos</TabsTrigger>
          <TabsTrigger value="excluidos">Excluídos</TabsTrigger>
        </TabsList>
        <TabsContent value="cancelados" className="mt-4">
          <AbaCancelados />
        </TabsContent>
        <TabsContent value="devolvidos" className="mt-4">
          <AbaDevolvidos />
        </TabsContent>
        <TabsContent value="excluidos" className="mt-4">
          <AbaExcluidos />
        </TabsContent>
      </Tabs>
    </div>
  );
}
