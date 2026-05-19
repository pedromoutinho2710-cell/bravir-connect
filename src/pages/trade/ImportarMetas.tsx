import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, Download, Target, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { onlyDigits, formatBRL } from "@/lib/format";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type Vendedor = { id: string; full_name: string | null; email: string };
type Cliente = { id: string; cnpj: string; codigo_parceiro: string | null; codigo_cliente: string | null; razao_social: string };
type Campanha = { id: string; nome: string };

type LinhaVendedor = {
  raw_identificador: string;
  raw_valor: string;
  vendedor_id: string | null;
  vendedor_nome: string | null;
  valor: number | null;
  status: "ok" | "vendedor_nao_encontrado" | "valor_invalido";
};

type LinhaCliente = {
  raw_identificador: string;
  raw_campanha: string;
  raw_valor: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  campanha_id: string | null;
  campanha_nome: string | null;
  valor: number | null;
  status: "ok" | "cliente_nao_encontrado" | "campanha_nao_encontrada" | "valor_invalido";
};

function normalizar(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function parseValor(v: unknown): number | null {
  if (v == null || v === "") return null;
  const s = String(v).trim().replace(/\s/g, "").replace(/R\$/gi, "");
  // Trata "1.234,56" e "1234.56"
  const temVirgula = s.includes(",");
  const limpo = temVirgula ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(limpo);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const ANO_ATUAL = new Date().getFullYear();
const MES_ATUAL = new Date().getMonth() + 1;
const ANOS = [ANO_ATUAL - 1, ANO_ATUAL, ANO_ATUAL + 1];

export default function ImportarMetas() {
  return (
    <div className="container mx-auto py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Importar Metas</h1>
        <p className="text-sm text-muted-foreground">
          Importe metas em lote por vendedor ou por cliente via planilha Excel.
        </p>
      </div>

      <Tabs defaultValue="vendedor" className="w-full">
        <TabsList>
          <TabsTrigger value="vendedor" className="gap-2">
            <Target className="h-4 w-4" /> Metas por Vendedor
          </TabsTrigger>
          <TabsTrigger value="cliente" className="gap-2">
            <Megaphone className="h-4 w-4" /> Metas por Cliente
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vendedor" className="mt-4">
          <AbaVendedor />
        </TabsContent>
        <TabsContent value="cliente" className="mt-4">
          <AbaCliente />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ABA VENDEDOR
// ═════════════════════════════════════════════════════════════════════════════

function AbaVendedor() {
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [mes, setMes] = useState<number>(MES_ATUAL);
  const [ano, setAno] = useState<number>(ANO_ATUAL);
  const [linhas, setLinhas] = useState<LinhaVendedor[]>([]);
  const [salvando, setSalvando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "vendedor");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) { setVendedores([]); return; }
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      setVendedores(profs ?? []);
    })();
  }, []);

  async function baixarModelo() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Email", "Nome", "Valor Meta"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Metas Vendedor");
    XLSX.writeFile(wb, "modelo_metas_vendedor.xlsx");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", raw: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: false, raw: false });

    if (rows.length < 2) {
      toast.error("Planilha vazia.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    // Identifica colunas pelo cabeçalho
    const header = (rows[0] as unknown[]).map((c) => normalizar(String(c)));
    let idxIdent = -1;
    let idxValor = -1;
    header.forEach((h, i) => {
      if (idxIdent < 0 && (h.includes("email") || h.includes("nome") || h.includes("vendedor"))) idxIdent = i;
      if (idxValor < 0 && (h.includes("valor") || h.includes("meta"))) idxValor = i;
    });
    if (idxIdent < 0) idxIdent = 0;
    if (idxValor < 0) idxValor = header.length - 1;

    const out: LinhaVendedor[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as unknown[];
      const rawId = String(row[idxIdent] ?? "").trim();
      const rawVal = String(row[idxValor] ?? "").trim();
      if (!rawId && !rawVal) continue;

      const valor = parseValor(rawVal);
      const ident = normalizar(rawId);
      const v = vendedores.find(
        (vv) => normalizar(vv.email) === ident || normalizar(vv.full_name ?? "") === ident
      );

      let status: LinhaVendedor["status"] = "ok";
      if (!v) status = "vendedor_nao_encontrado";
      else if (valor == null) status = "valor_invalido";

      out.push({
        raw_identificador: rawId,
        raw_valor: rawVal,
        vendedor_id: v?.id ?? null,
        vendedor_nome: v ? (v.full_name || v.email) : null,
        valor,
        status,
      });
    }

    setLinhas(out);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function confirmar() {
    const validas = linhas.filter((l) => l.status === "ok" && l.vendedor_id && l.valor != null);
    if (validas.length === 0) { toast.error("Nenhuma linha válida para importar."); return; }

    setSalvando(true);
    const rows = validas.map((l) => ({
      vendedor_id: l.vendedor_id!,
      mes,
      ano,
      valor_meta_reais: l.valor!,
    }));

    const { error } = await supabase
      .from("metas")
      .upsert(rows, { onConflict: "vendedor_id,mes,ano" });

    setSalvando(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    toast.success(`${validas.length} meta(s) importada(s) para ${MESES[mes - 1]}/${ano}.`);
    setLinhas([]);
  }

  const totalOk = linhas.filter((l) => l.status === "ok").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Metas por Vendedor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Mês</label>
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Ano</label>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ANOS.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={baixarModelo} className="gap-2">
            <Download className="h-4 w-4" /> Baixar modelo
          </Button>
          <Button onClick={() => inputRef.current?.click()} className="gap-2">
            <Upload className="h-4 w-4" /> Selecionar planilha
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={onFile}
          />
        </div>

        {linhas.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {totalOk} de {linhas.length} linha(s) prontas para importar.
              </p>
              <Button onClick={confirmar} disabled={salvando || totalOk === 0}>
                {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirmar importação
              </Button>
            </div>
            <div className="rounded-md border max-h-[500px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Identificador</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{l.raw_identificador}</TableCell>
                      <TableCell className="text-xs">{l.vendedor_nome ?? "—"}</TableCell>
                      <TableCell className="text-xs">{l.valor != null ? formatBRL(l.valor) : l.raw_valor}</TableCell>
                      <TableCell>
                        {l.status === "ok" ? (
                          <Badge className="bg-green-100 text-green-800 border-green-300">OK</Badge>
                        ) : l.status === "vendedor_nao_encontrado" ? (
                          <Badge variant="destructive">Vendedor não encontrado</Badge>
                        ) : (
                          <Badge variant="destructive">Valor inválido</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ABA CLIENTE
// ═════════════════════════════════════════════════════════════════════════════

function AbaCliente() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [linhas, setLinhas] = useState<LinhaCliente[]>([]);
  const [salvando, setSalvando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const [cliRes, campRes] = await Promise.all([
        supabase.from("clientes").select("id, cnpj, codigo_parceiro, codigo_cliente, razao_social"),
        supabase.from("campanhas").select("id, nome").eq("ativa", true),
      ]);
      setClientes((cliRes.data as Cliente[]) ?? []);
      setCampanhas((campRes.data as Campanha[]) ?? []);
    })();
  }, []);

  async function baixarModelo() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["CNPJ ou Código", "Campanha", "Valor Meta"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Metas Cliente");
    XLSX.writeFile(wb, "modelo_metas_cliente.xlsx");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", raw: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: false, raw: false });

    if (rows.length < 2) {
      toast.error("Planilha vazia.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    const header = (rows[0] as unknown[]).map((c) => normalizar(String(c)));
    let idxIdent = -1;
    let idxCampanha = -1;
    let idxValor = -1;
    header.forEach((h, i) => {
      if (idxIdent < 0 && (h.includes("cnpj") || h.includes("codigo") || h.includes("cliente"))) idxIdent = i;
      if (idxCampanha < 0 && h.includes("campanha")) idxCampanha = i;
      if (idxValor < 0 && (h.includes("valor") || h.includes("meta"))) idxValor = i;
    });
    if (idxIdent < 0) idxIdent = 0;
    if (idxCampanha < 0) idxCampanha = 1;
    if (idxValor < 0) idxValor = header.length - 1;

    const out: LinhaCliente[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as unknown[];
      const rawId = String(row[idxIdent] ?? "").trim();
      const rawCamp = String(row[idxCampanha] ?? "").trim();
      const rawVal = String(row[idxValor] ?? "").trim();
      if (!rawId && !rawCamp && !rawVal) continue;

      const valor = parseValor(rawVal);

      const digits = onlyDigits(rawId);
      const identNorm = normalizar(rawId);
      const cli = clientes.find((c) => {
        if (digits.length >= 11 && onlyDigits(c.cnpj) === digits) return true;
        if (c.codigo_parceiro && normalizar(c.codigo_parceiro) === identNorm) return true;
        if (c.codigo_cliente && normalizar(c.codigo_cliente) === identNorm) return true;
        return false;
      });

      const campNorm = normalizar(rawCamp);
      const camp = campanhas.find((c) => normalizar(c.nome) === campNorm);

      let status: LinhaCliente["status"] = "ok";
      if (!cli) status = "cliente_nao_encontrado";
      else if (!camp) status = "campanha_nao_encontrada";
      else if (valor == null) status = "valor_invalido";

      out.push({
        raw_identificador: rawId,
        raw_campanha: rawCamp,
        raw_valor: rawVal,
        cliente_id: cli?.id ?? null,
        cliente_nome: cli?.razao_social ?? null,
        campanha_id: camp?.id ?? null,
        campanha_nome: camp?.nome ?? null,
        valor,
        status,
      });
    }

    setLinhas(out);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function confirmar() {
    const validas = linhas.filter(
      (l) => l.status === "ok" && l.cliente_id && l.campanha_id && l.valor != null
    );
    if (validas.length === 0) { toast.error("Nenhuma linha válida para importar."); return; }

    setSalvando(true);
    const rows = validas.map((l) => ({
      campanha_id: l.campanha_id!,
      cliente_id: l.cliente_id!,
      meta_valor: l.valor!,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("campanha_metas_clientes")
      .upsert(rows, { onConflict: "campanha_id,cliente_id" });

    setSalvando(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    toast.success(`${validas.length} meta(s) de cliente importada(s).`);
    setLinhas([]);
  }

  const totalOk = linhas.filter((l) => l.status === "ok").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Metas por Cliente</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Button variant="outline" onClick={baixarModelo} className="gap-2">
            <Download className="h-4 w-4" /> Baixar modelo
          </Button>
          <Button onClick={() => inputRef.current?.click()} className="gap-2">
            <Upload className="h-4 w-4" /> Selecionar planilha
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={onFile}
          />
          <p className="text-xs text-muted-foreground">
            Colunas: CNPJ ou Código, Campanha, Valor Meta.
          </p>
        </div>

        {linhas.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {totalOk} de {linhas.length} linha(s) prontas para importar.
              </p>
              <Button onClick={confirmar} disabled={salvando || totalOk === 0}>
                {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirmar importação
              </Button>
            </div>
            <div className="rounded-md border max-h-[500px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Identificador</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Campanha</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{l.raw_identificador}</TableCell>
                      <TableCell className="text-xs">{l.cliente_nome ?? "—"}</TableCell>
                      <TableCell className="text-xs">{l.campanha_nome ?? l.raw_campanha}</TableCell>
                      <TableCell className="text-xs">{l.valor != null ? formatBRL(l.valor) : l.raw_valor}</TableCell>
                      <TableCell>
                        {l.status === "ok" ? (
                          <Badge className="bg-green-100 text-green-800 border-green-300">OK</Badge>
                        ) : l.status === "cliente_nao_encontrado" ? (
                          <Badge variant="destructive">Cliente não encontrado</Badge>
                        ) : l.status === "campanha_nao_encontrada" ? (
                          <Badge variant="destructive">Campanha não encontrada</Badge>
                        ) : (
                          <Badge variant="destructive">Valor inválido</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
