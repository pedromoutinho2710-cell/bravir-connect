import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Upload, Download, FileSpreadsheet, CheckCircle2, XCircle } from "lucide-react";
import { formatBRL, formatCNPJ, onlyDigits } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";

type Etapa = "upload" | "preview" | "importando" | "concluido";

type LinhaRaw = {
  identificador: string;
  valor: string;
};

type LinhaPreview = {
  identificador_raw: string;
  valor_raw: string;
  cliente_id: string | null;
  razao_social: string | null;
  cnpj: string | null;
  vendedor_id: string | null;
  valor: number;
  erro: string | null;
};

function normalizar(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function detectarColuna(header: string): "identificador" | "valor" | null {
  const n = normalizar(header);
  if (n.includes("cnpj") || (n.includes("codigo") && n.includes("cliente")) || n === "identificador") {
    return "identificador";
  }
  if (n.includes("valor") || n.includes("faturado") || n.includes("faturamento")) {
    return "valor";
  }
  return null;
}

function parseValor(raw: string): number {
  if (raw == null) return NaN;
  const s = String(raw).trim();
  if (!s) return NaN;
  const limpo = s
    .replace(/[R$\s]/gi, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : NaN;
}

export default function ImportarFaturamento() {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [etapa, setEtapa] = useState<Etapa>("upload");
  const [linhas, setLinhas] = useState<LinhaPreview[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });
  const [resultado, setResultado] = useState({ ok: 0, erro: 0 });

  const baixarModelo = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      ["CNPJ ou Codigo Cliente", "Valor Faturado"],
      ["00.000.000/0001-00", 1500.5],
      ["12345", 2300],
    ]);
    ws["!cols"] = [{ wch: 28 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Faturamento");
    XLSX.writeFile(wb, "modelo-importar-faturamento.xlsx");
  };

  const handleArquivo = async (file: File) => {
    setCarregando(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true });
      if (rows.length === 0) {
        toast.error("Planilha vazia");
        setCarregando(false);
        return;
      }

      const headers = Object.keys(rows[0]);
      let colId: string | null = null;
      let colValor: string | null = null;
      for (const h of headers) {
        const tipo = detectarColuna(h);
        if (tipo === "identificador" && !colId) colId = h;
        if (tipo === "valor" && !colValor) colValor = h;
      }
      if (!colId || !colValor) {
        toast.error("Não encontrei colunas de CNPJ/Código e Valor");
        setCarregando(false);
        return;
      }

      const raws: LinhaRaw[] = rows
        .map((r) => ({
          identificador: String(r[colId!] ?? "").trim(),
          valor: String(r[colValor!] ?? "").trim(),
        }))
        .filter((r) => r.identificador || r.valor);

      const cnpjs = new Set<string>();
      const codigos = new Set<string>();
      for (const r of raws) {
        const digitos = onlyDigits(r.identificador);
        if (digitos.length === 14) cnpjs.add(digitos);
        else if (r.identificador) codigos.add(r.identificador);
      }

      const clientesPorCnpj = new Map<string, { id: string; razao_social: string; cnpj: string; vendedor_id: string | null }>();
      const clientesPorCodigo = new Map<string, { id: string; razao_social: string; cnpj: string; vendedor_id: string | null }>();

      if (cnpjs.size > 0) {
        const { data } = await supabase
          .from("clientes")
          .select("id, razao_social, cnpj, vendedor_id, codigo_cliente")
          .in("cnpj", Array.from(cnpjs));
        (data ?? []).forEach((c) => {
          clientesPorCnpj.set(onlyDigits(c.cnpj), {
            id: c.id,
            razao_social: c.razao_social,
            cnpj: c.cnpj,
            vendedor_id: c.vendedor_id,
          });
        });
      }
      if (codigos.size > 0) {
        const { data } = await supabase
          .from("clientes")
          .select("id, razao_social, cnpj, vendedor_id, codigo_cliente")
          .in("codigo_cliente", Array.from(codigos));
        (data ?? []).forEach((c) => {
          if (c.codigo_cliente) {
            clientesPorCodigo.set(c.codigo_cliente, {
              id: c.id,
              razao_social: c.razao_social,
              cnpj: c.cnpj,
              vendedor_id: c.vendedor_id,
            });
          }
        });
      }

      const preview: LinhaPreview[] = raws.map((r) => {
        const valor = parseValor(r.valor);
        const digitos = onlyDigits(r.identificador);
        let match: { id: string; razao_social: string; cnpj: string; vendedor_id: string | null } | undefined;
        if (digitos.length === 14) match = clientesPorCnpj.get(digitos);
        if (!match && r.identificador) match = clientesPorCodigo.get(r.identificador);

        let erro: string | null = null;
        if (!r.identificador) erro = "Identificador vazio";
        else if (!match) erro = "Cliente não encontrado";
        else if (!Number.isFinite(valor) || valor <= 0) erro = "Valor inválido";

        return {
          identificador_raw: r.identificador,
          valor_raw: r.valor,
          cliente_id: match?.id ?? null,
          razao_social: match?.razao_social ?? null,
          cnpj: match?.cnpj ?? null,
          vendedor_id: match?.vendedor_id ?? null,
          valor: Number.isFinite(valor) ? valor : 0,
          erro,
        };
      });

      setLinhas(preview);
      setEtapa("preview");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao ler planilha");
    } finally {
      setCarregando(false);
    }
  };

  const confirmar = async () => {
    const validas = linhas.filter((l) => !l.erro && l.cliente_id);
    if (validas.length === 0) {
      toast.error("Nenhuma linha válida para importar");
      return;
    }
    setEtapa("importando");
    setProgresso({ feitos: 0, total: validas.length });
    let ok = 0;
    let erro = 0;

    const lote = 200;
    for (let i = 0; i < validas.length; i += lote) {
      const slice = validas.slice(i, i + lote);
      const payload = slice.map((l) => ({
        cliente_id: l.cliente_id!,
        vendedor_id: l.vendedor_id,
        valor: l.valor,
        importado_por: user?.id ?? null,
      }));
      const { error } = await supabase.from("faturamentos_externos").insert(payload);
      if (error) {
        erro += slice.length;
      } else {
        ok += slice.length;
      }
      setProgresso({ feitos: Math.min(i + slice.length, validas.length), total: validas.length });
    }
    setResultado({ ok, erro });
    setEtapa("concluido");
    if (erro === 0) toast.success(`${ok} faturamento(s) importado(s)`);
    else toast.error(`${ok} ok, ${erro} com erro`);
  };

  const reiniciar = () => {
    setLinhas([]);
    setResultado({ ok: 0, erro: 0 });
    setProgresso({ feitos: 0, total: 0 });
    setEtapa("upload");
    if (inputRef.current) inputRef.current.value = "";
  };

  const validas = linhas.filter((l) => !l.erro).length;
  const invalidas = linhas.length - validas;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Importar Faturamento</h1>
          <p className="text-sm text-muted-foreground">
            Suba uma planilha Excel com CNPJ ou Código do Cliente e o valor faturado.
          </p>
        </div>
        <Button variant="outline" onClick={baixarModelo}>
          <Download className="mr-2 h-4 w-4" /> Baixar modelo
        </Button>
      </div>

      {etapa === "upload" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 p-12">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground" />
            <p className="text-center text-sm text-muted-foreground">
              Formato esperado: 2 colunas — <strong>CNPJ ou Código Cliente</strong> e <strong>Valor Faturado</strong>.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleArquivo(f);
              }}
            />
            <Button onClick={() => inputRef.current?.click()} disabled={carregando}>
              {carregando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Selecionar planilha
            </Button>
          </CardContent>
        </Card>
      )}

      {etapa === "preview" && (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="flex gap-3">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                  {validas} válida(s)
                </Badge>
                {invalidas > 0 && (
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
                    {invalidas} com erro
                  </Badge>
                )}
                <Badge variant="outline">Total: {linhas.length}</Badge>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={reiniciar}>Cancelar</Button>
                <Button onClick={confirmar} disabled={validas === 0}>
                  Confirmar importação ({validas})
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Identificador</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l, i) => (
                    <TableRow key={i} className={l.erro ? "bg-red-50/50" : undefined}>
                      <TableCell className="font-mono text-xs">{l.identificador_raw}</TableCell>
                      <TableCell>{l.razao_social ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{l.cnpj ? formatCNPJ(l.cnpj) : "—"}</TableCell>
                      <TableCell className="text-right">
                        {Number.isFinite(l.valor) && l.valor > 0 ? formatBRL(l.valor) : "—"}
                      </TableCell>
                      <TableCell>
                        {l.erro ? (
                          <span className="inline-flex items-center gap-1 text-xs text-red-700">
                            <XCircle className="h-3 w-3" /> {l.erro}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700">
                            <CheckCircle2 className="h-3 w-3" /> OK
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {etapa === "importando" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 p-12">
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Importando {progresso.feitos} de {progresso.total}...
            </p>
          </CardContent>
        </Card>
      )}

      {etapa === "concluido" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 p-12">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
            <div className="text-center">
              <p className="text-lg font-semibold">Importação concluída</p>
              <p className="text-sm text-muted-foreground">
                {resultado.ok} sucesso(s){resultado.erro > 0 ? `, ${resultado.erro} erro(s)` : ""}
              </p>
            </div>
            <Button onClick={reiniciar}>Nova importação</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
