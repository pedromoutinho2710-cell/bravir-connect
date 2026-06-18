import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, FileText, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Produto } from "@/components/pedido/SecaoProdutos";

// Item bruto extraído do arquivo (pela IA ou pelo Excel)
type ItemExtraido = {
  nome_produto: string | null;
  codigo: string | null;
  quantidade: number | null;
  preco_unitario: number | null;
};

// Linha já com o match (ou não) no catálogo e quantidade editável
type LinhaRevisao = ItemExtraido & {
  match: Produto | null;
  quantidade: number;
};

type Props = {
  produtos: Produto[];
  onAdicionarItens: (itens: { produto: Produto; quantidade: number }[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const TIPOS_ACEITOS = "image/*,application/pdf,.xlsx,.xls";

function fileParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      // result = "data:<mime>;base64,XXXX" -> queremos só o XXXX
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Lê o Excel com SheetJS, converte a 1ª aba para texto (CSV) e deixa a IA
// extrair os itens — mais robusto que regras fixas de detecção de colunas.
async function lerExcel(file: File): Promise<ItemExtraido[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];

  const csv = XLSX.utils.sheet_to_csv(sheet);
  if (!csv.trim()) return [];

  const { data, error } = await supabase.functions.invoke("extrair-pedido", {
    body: { text: csv },
  });
  if (error) throw error;
  return Array.isArray(data?.itens) ? (data.itens as ItemExtraido[]) : [];
}

// Match: primeiro por codigo_jiva, depois por nome (parcial, case-insensitive)
function acharMatch(item: ItemExtraido, produtos: Produto[]): Produto | null {
  const codigo = item.codigo?.trim().toLowerCase();
  if (codigo) {
    const porCodigo = produtos.find((p) => p.codigo_jiva.trim().toLowerCase() === codigo);
    if (porCodigo) return porCodigo;
  }
  const nome = item.nome_produto?.trim().toLowerCase();
  if (nome) {
    const porNome = produtos.find(
      (p) => p.nome.toLowerCase().includes(nome) || nome.includes(p.nome.toLowerCase()),
    );
    if (porNome) return porNome;
  }
  return null;
}

export function ImportarPedidoDialog({ produtos, onAdicionarItens, open, onOpenChange }: Props) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [linhas, setLinhas] = useState<LinhaRevisao[] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const limpar = () => {
    setArquivo(null);
    setPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    setLinhas(null);
    setAnalisando(false);
  };

  const fecharDialog = (v: boolean) => {
    if (!v) limpar();
    onOpenChange(v);
  };

  const selecionarArquivo = (file: File | undefined | null) => {
    if (!file) return;
    setLinhas(null);
    setArquivo(file);
    setPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    });
  };

  const ehExcel = (f: File) =>
    /\.(xlsx|xls)$/i.test(f.name) ||
    f.type.includes("spreadsheet") ||
    f.type.includes("excel");

  const analisar = async () => {
    if (!arquivo) return;
    setAnalisando(true);
    try {
      let itens: ItemExtraido[] = [];

      if (ehExcel(arquivo)) {
        itens = await lerExcel(arquivo);
      } else {
        // Imagem ou PDF -> Claude Vision via edge function
        const base64 = await fileParaBase64(arquivo);
        const mediaType = arquivo.type || "application/octet-stream";
        const { data, error } = await supabase.functions.invoke("extrair-pedido", {
          body: { base64, mediaType },
        });
        if (error) throw error;
        itens = Array.isArray(data?.itens) ? (data.itens as ItemExtraido[]) : [];
      }

      if (itens.length === 0) {
        toast.warning("Nenhum item encontrado no arquivo.");
        setLinhas([]);
        return;
      }

      const revisao: LinhaRevisao[] = itens.map((it) => {
        const match = acharMatch(it, produtos);
        const qtd = it.quantidade && it.quantidade > 0
          ? Math.round(it.quantidade)
          : match?.cx_embarque ?? 1;
        return { ...it, match, quantidade: qtd };
      });
      setLinhas(revisao);
    } catch (e) {
      console.error("Erro ao analisar pedido:", e);
      toast.error("Não foi possível analisar o arquivo. Tente novamente.");
    } finally {
      setAnalisando(false);
    }
  };

  const setQtd = (idx: number, valor: number) => {
    setLinhas((ls) =>
      ls?.map((l, i) => (i === idx ? { ...l, quantidade: Math.max(1, Math.floor(valor) || 1) } : l)) ?? null,
    );
  };

  const adicionar = () => {
    const comMatch = (linhas ?? []).filter((l) => l.match);
    if (comMatch.length === 0) {
      toast.warning("Nenhum item com correspondência no catálogo.");
      return;
    }
    onAdicionarItens(comMatch.map((l) => ({ produto: l.match as Produto, quantidade: l.quantidade })));
    toast.success(`${comMatch.length} item(ns) adicionado(s) ao pedido.`);
    fecharDialog(false);
  };

  const totalMatch = (linhas ?? []).filter((l) => l.match).length;

  return (
    <Dialog open={open} onOpenChange={fecharDialog}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar pedido</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Área de upload */}
          {!arquivo ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                selecionarArquivo(e.dataTransfer.files?.[0]);
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors cursor-pointer",
                dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
              )}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div className="text-sm font-medium">Arraste um arquivo aqui ou clique para selecionar</div>
              <div className="text-xs text-muted-foreground">Foto (JPG/PNG), PDF ou Excel (.xlsx/.xls)</div>
              <input
                ref={inputRef}
                type="file"
                accept={TIPOS_ACEITOS}
                className="hidden"
                onChange={(e) => selecionarArquivo(e.target.files?.[0])}
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              {previewUrl ? (
                <img src={previewUrl} alt="Pré-visualização" className="h-20 w-20 rounded object-cover" />
              ) : ehExcel(arquivo) ? (
                <FileSpreadsheet className="h-10 w-10 text-green-600" />
              ) : (
                <FileText className="h-10 w-10 text-red-600" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{arquivo.name}</div>
                <div className="text-xs text-muted-foreground">{(arquivo.size / 1024).toFixed(0)} KB</div>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={limpar} disabled={analisando}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Botão analisar */}
          {arquivo && linhas === null && (
            <Button type="button" onClick={analisar} disabled={analisando} className="w-full">
              {analisando ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analisando…
                </>
              ) : (
                "Analisar"
              )}
            </Button>
          )}

          {/* Tabela de revisão */}
          {linhas && linhas.length > 0 && (
            <div className="space-y-3">
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px]">Produto encontrado</TableHead>
                      <TableHead className="text-[11px]">Código</TableHead>
                      <TableHead className="text-[11px] text-right w-24">Qtd</TableHead>
                      <TableHead className="text-[11px] text-right">Preço unit.</TableHead>
                      <TableHead className="text-[11px]">Match no catálogo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.map((l, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs">{l.nome_produto ?? "—"}</TableCell>
                        <TableCell className="font-mono text-[11px]">{l.codigo ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={1}
                            value={l.quantidade}
                            onChange={(e) => setQtd(idx, Number(e.target.value))}
                            disabled={!l.match}
                            className="h-7 w-20 ml-auto text-xs"
                          />
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {l.preco_unitario != null
                            ? l.preco_unitario.toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {l.match ? (
                            <div className="flex items-center gap-1.5">
                              <Badge className="bg-green-600 hover:bg-green-600">✓</Badge>
                              <span className="text-xs text-green-700 truncate max-w-[180px]">
                                {l.match.nome}
                              </span>
                            </div>
                          ) : (
                            <Badge variant="destructive">Não encontrado</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {totalMatch} de {linhas.length} item(ns) com correspondência. Itens sem match serão ignorados.
                </span>
                <Button type="button" onClick={adicionar} disabled={totalMatch === 0}>
                  Adicionar ao pedido
                </Button>
              </div>
            </div>
          )}

          {linhas && linhas.length === 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Nenhum item encontrado. Verifique o arquivo e tente novamente.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
