import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import ExcelJS from "exceljs";

type Props = {
  formularioId: string;
  formularioNome: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
};

export function ImportarPlanilhaDialog({ formularioId, formularioNome, open, onOpenChange, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ codigo: string; nome: string; found: boolean }[]>([]);
  const [importando, setImportando] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);

  const handleFile = async (file: File) => {
    setArquivo(file);
    const buffer = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    const ws = wb.worksheets[0];
    if (!ws) { toast.error("Planilha vazia ou inválida"); return; }

    // Detecta coluna COD. JIVA (header na primeira linha não vazia)
    let headerRow: ExcelJS.Row | null = null;
    let codigoCol = -1;

    ws.eachRow((row, rowNum) => {
      if (codigoCol !== -1) return;
      row.eachCell((cell, colNum) => {
        const val = String(cell.value ?? "").trim().toLowerCase();
        if (val.includes("cod") && val.includes("jiva")) {
          codigoCol = colNum;
          headerRow = row;
        }
      });
      if (codigoCol !== -1 && !headerRow) headerRow = row;
    });

    const codigos: string[] = [];
    let reachouHeader = false;
    ws.eachRow((row) => {
      if (!reachouHeader) {
        if (row === headerRow) reachouHeader = true;
        return;
      }
      const val = String(row.getCell(codigoCol).value ?? "").trim();
      if (val) codigos.push(val);
    });

    if (codigos.length === 0) {
      toast.error('Nenhum código encontrado. Verifique se há coluna "COD. JIVA"');
      return;
    }

    // Verifica quais existem no banco
    const { data } = await supabase.from("produtos").select("id, codigo_jiva, nome").in("codigo_jiva", codigos);
    const encontrados = new Map((data ?? []).map((p) => [p.codigo_jiva, p]));

    setPreview(codigos.map((c) => ({
      codigo: c,
      nome: encontrados.get(c)?.nome ?? "—",
      found: encontrados.has(c),
    })));
  };

  const confirmar = async () => {
    if (!arquivo || preview.length === 0) return;
    const validos = preview.filter((p) => p.found);
    if (validos.length === 0) { toast.error("Nenhum produto válido para importar"); return; }

    setImportando(true);
    try {
      const { data: prods } = await supabase
        .from("produtos").select("id, codigo_jiva")
        .in("codigo_jiva", validos.map((v) => v.codigo));

      const codigoToId = new Map((prods ?? []).map((p) => [p.codigo_jiva, p.id]));

      await supabase.from("formulario_produtos").delete().eq("formulario_id", formularioId);
      const inserts = validos
        .map((v, idx) => ({ formulario_id: formularioId, produto_id: codigoToId.get(v.codigo)!, ordem: idx }))
        .filter((i) => i.produto_id);

      const { error } = await supabase.from("formulario_produtos").insert(inserts);
      if (error) throw error;

      toast.success(`${inserts.length} produtos importados para "${formularioNome}"`);
      onImported();
      onOpenChange(false);
      setPreview([]);
      setArquivo(null);
    } catch (err: unknown) {
      toast.error("Erro ao importar: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setImportando(false);
    }
  };

  const found = preview.filter((p) => p.found).length;
  const notFound = preview.filter((p) => !p.found).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setPreview([]); setArquivo(null); } }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar produtos da planilha</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Selecione uma planilha .xlsx com coluna <strong>COD. JIVA</strong>. Os produtos encontrados substituirão os atuais de "{formularioNome}".
          </p>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <Button variant="outline" className="w-full" onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            {arquivo ? arquivo.name : "Selecionar arquivo .xlsx"}
          </Button>

          {preview.length > 0 && (
            <div>
              <div className="flex gap-4 text-sm mb-2">
                <span className="text-green-700 font-medium">{found} encontrados</span>
                {notFound > 0 && <span className="text-red-600 font-medium">{notFound} não encontrados</span>}
              </div>
              <div className="max-h-48 overflow-y-auto rounded-md border text-xs">
                {preview.map((p, i) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-1.5 border-b last:border-0 ${!p.found ? "bg-red-50" : ""}`}>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${p.found ? "bg-green-500" : "bg-red-400"}`} />
                    <span className="font-mono text-muted-foreground w-20 flex-shrink-0">{p.codigo}</span>
                    <span className="truncate">{p.nome}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={confirmar} disabled={importando || found === 0}>
            {importando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Importar {found > 0 ? `${found} produtos` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
