// SQL para adicionar coluna vigencia_id em pedidos (rodar no Supabase):
// ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS vigencia_id UUID REFERENCES tabelas_vigencia(id);
// ALTER TABLE tabelas_vigencia ADD COLUMN IF NOT EXISTS desconto_livre boolean DEFAULT false;

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Upload, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { formatDate } from "@/lib/format";

type Vigencia = {
  id: string;
  nome: string;
  descricao: string | null;
  ativa: boolean;
  desconto_livre: boolean;
  created_at: string;
  total_produtos: number;
  tem_pedidos: boolean;
};

export default function TabelasPreco() {
  const [vigencias, setVigencias] = useState<Vigencia[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Modal importar
  const [showImportar, setShowImportar] = useState(false);
  const [importNome, setImportNome] = useState("");
  const [importDesc, setImportDesc] = useState("");
  const [importDescontoLivre, setImportDescontoLivre] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importando, setImportando] = useState(false);
  const [importResultado, setImportResultado] = useState<{ importados: number; naoEncontrados: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Excluir confirmação
  const [excluirVig, setExcluirVig] = useState<Vigencia | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    const { data: vigs } = await supabase
      .from("tabelas_vigencia")
      .select("id, nome, descricao, ativa, desconto_livre, created_at")
      .order("created_at", { ascending: false });

    if (!vigs) { setCarregando(false); return; }

    // Para cada vigência: contar produtos e verificar pedidos
    const enriched = await Promise.all(
      vigs.map(async (v) => {
        const [{ count: totalProd }, { count: totalPed }] = await Promise.all([
          supabase
            .from("precos")
            .select("produto_id", { count: "exact", head: true })
            .eq("vigencia_id", v.id),
          supabase
            .from("pedidos")
            .select("id", { count: "exact", head: true })
            .eq("vigencia_id", v.id),
        ]);
        return {
          ...v,
          desconto_livre: v.desconto_livre ?? false,
          total_produtos: totalProd ?? 0,
          tem_pedidos: (totalPed ?? 0) > 0,
        };
      })
    );

    setVigencias(enriched);
    setCarregando(false);
  };

  useEffect(() => { carregar(); }, []);

  const toggleAtiva = async (v: Vigencia) => {
    const { error } = await supabase
      .from("tabelas_vigencia")
      .update({ ativa: !v.ativa })
      .eq("id", v.id);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success(v.ativa ? "Vigência inativada" : "Vigência ativada");
    carregar();
  };

  const excluir = async () => {
    if (!excluirVig) return;
    setExcluindo(true);
    // Deletar preços vinculados primeiro
    await supabase.from("precos").delete().eq("vigencia_id", excluirVig.id);
    const { error } = await supabase.from("tabelas_vigencia").delete().eq("id", excluirVig.id);
    setExcluindo(false);
    if (error) { toast.error("Erro ao excluir: " + error.message); return; }
    toast.success("Vigência excluída");
    setExcluirVig(null);
    carregar();
  };

  const importar = async () => {
    if (!importNome.trim()) { toast.error("Informe o nome da vigência"); return; }
    if (!importFile) { toast.error("Selecione um arquivo Excel"); return; }

    setImportando(true);
    setImportResultado(null);

    try {
      // Lê o Excel
      const XLSX = await import("xlsx");
      const buffer = await importFile.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets["Planilha1"];
      if (!ws) {
        toast.error('Aba "Planilha1" não encontrada no arquivo');
        setImportando(false);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][];
      if (rows.length < 2 || !rows[0]) {
        toast.error("Planilha vazia ou sem dados");
        setImportando(false);
        return;
      }

      // Densifica o header: garante string para cada posição, sem buracos esparsos
      const rawHeader = rows[0] as unknown[];
      const headerRow: string[] = Array.from(
        { length: rawHeader.length },
        (_, i) => String(rawHeader[i] ?? "").trim()
      );
      const dataRows = rows.slice(1).filter((r) => Array.isArray(r) && r.some((c) => c != null && c !== ""));

      // Identifica colunas por header (guards desnecessários pois headerRow é string[])
      const codigoIdx = headerRow.findIndex((h) => /código|codigo/i.test(h));
      const t7Idx = headerRow.findIndex((h) => h.includes("7%") || h === "Tabela 7");
      const t12Idx = headerRow.findIndex((h) => h.includes("12%") || h === "Tabela 12");
      const t18Idx = headerRow.findIndex((h) => h.includes("18%") || h === "Tabela 18");
      const tSufIdx = headerRow.findIndex((h) => /suframa/i.test(h));

      if (codigoIdx < 0) {
        toast.error('Coluna "Código" não encontrada. Verifique os cabeçalhos.');
        setImportando(false);
        return;
      }

      // Cria a vigência
      const { data: vigData, error: vigErr } = await supabase
        .from("tabelas_vigencia")
        .insert({ nome: importNome.trim(), descricao: importDesc.trim() || null, ativa: true, desconto_livre: importDescontoLivre })
        .select("id")
        .single();

      if (vigErr || !vigData) {
        toast.error("Erro ao criar vigência: " + vigErr?.message);
        setImportando(false);
        return;
      }

      const vigId = vigData.id;

      // Coleta todos os códigos únicos
      const codigos = [...new Set(
        dataRows
          .map((r) => String(r[codigoIdx] ?? "").trim())
          .filter(Boolean)
      )];

      // Busca produtos em lotes de 200
      const prodMap: Record<string, string> = {};
      for (let i = 0; i < codigos.length; i += 200) {
        const { data: prods } = await supabase
          .from("produtos")
          .select("id, codigo_jiva")
          .in("codigo_jiva", codigos.slice(i, i + 200));
        (prods ?? []).forEach((p) => { prodMap[p.codigo_jiva] = p.id; });
      }

      // Monta inserts
      type PrecoInsert = { produto_id: string; tabela: string; preco_bruto: number; vigencia_id: string };
      const inserts: PrecoInsert[] = [];
      const naoEncontrados: string[] = [];
      const produtosImportados = new Set<string>();

      for (const row of dataRows) {
        if (!Array.isArray(row)) continue;
        const codigo = String(row[codigoIdx] ?? "").trim();
        if (!codigo) continue;
        const prodId = prodMap[codigo];
        if (!prodId) { if (!naoEncontrados.includes(codigo)) naoEncontrados.push(codigo); continue; }

        const tabelaMap = [
          { tabela: "7", idx: t7Idx },
          { tabela: "12", idx: t12Idx },
          { tabela: "18", idx: t18Idx },
          { tabela: "suframa", idx: tSufIdx },
        ];
        for (const { tabela, idx } of tabelaMap) {
          if (idx >= 0 && idx < row.length && row[idx] != null && row[idx] !== "") {
            const preco = Number(row[idx]);
            if (!isNaN(preco) && preco > 0) {
              inserts.push({ produto_id: prodId, tabela, preco_bruto: preco, vigencia_id: vigId });
              produtosImportados.add(prodId);
            }
          }
        }
      }

      // Insere em lotes de 500
      let insertError = false;
      for (let i = 0; i < inserts.length; i += 500) {
        const { error } = await supabase.from("precos").insert(inserts.slice(i, i + 500));
        if (error) { insertError = true; toast.error("Erro ao inserir preços: " + error.message); break; }
      }

      if (insertError) {
        // Rollback: deleta a vigência criada
        await supabase.from("tabelas_vigencia").delete().eq("id", vigId);
        setImportando(false);
        return;
      }

      setImportResultado({ importados: produtosImportados.size, naoEncontrados });
      toast.success(`${produtosImportados.size} produtos importados com sucesso!`);
      carregar();
    } catch (err) {
      toast.error("Erro ao processar arquivo: " + String(err));
    }

    setImportando(false);
  };

  const fecharModal = () => {
    setShowImportar(false);
    setImportNome("");
    setImportDesc("");
    setImportDescontoLivre(false);
    setImportFile(null);
    setImportResultado(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tabelas de Preço</h1>
          <p className="text-sm text-muted-foreground">Gerencie vigências de preços e importe novos dados</p>
        </div>
        <Button onClick={() => setShowImportar(true)}>
          <Upload className="h-4 w-4" />
          Importar tabela Excel
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {carregando ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : vigencias.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma vigência cadastrada. Importe uma tabela Excel para começar.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Modo desconto</TableHead>
                  <TableHead className="text-right">Produtos</TableHead>
                  <TableHead>Criada em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vigencias.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.nome}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{v.descricao || "—"}</TableCell>
                    <TableCell className="text-center">
                      <Badge className={v.ativa ? "bg-green-100 text-green-800 border-green-300" : "bg-gray-100 text-gray-600 border-gray-300"}>
                        {v.ativa ? "Ativa" : "Inativa"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={v.desconto_livre ? "bg-blue-100 text-blue-800 border-blue-300" : "bg-gray-100 text-gray-600 border-gray-300"}>
                        {v.desconto_livre ? "Livre" : "Por cluster"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{v.total_produtos.toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-sm">{formatDate(v.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleAtiva(v)}
                        >
                          {v.ativa ? (
                            <><XCircle className="h-3 w-3" /> Inativar</>
                          ) : (
                            <><CheckCircle2 className="h-3 w-3" /> Ativar</>
                          )}
                        </Button>
                        {!v.tem_pedidos && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setExcluirVig(v)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal importar */}
      <Dialog open={showImportar} onOpenChange={(o) => { if (!o) fecharModal(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar tabela de preços</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome da vigência *</Label>
              <Input
                value={importNome}
                onChange={(e) => setImportNome(e.target.value)}
                placeholder="Ex: Julho 2026"
                disabled={importando}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição (opcional)</Label>
              <Textarea
                value={importDesc}
                onChange={(e) => setImportDesc(e.target.value)}
                placeholder="Observações sobre esta tabela…"
                rows={2}
                disabled={importando}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="desconto-livre"
                checked={importDescontoLivre}
                onCheckedChange={setImportDescontoLivre}
                disabled={importando}
              />
              <Label htmlFor="desconto-livre" className="cursor-pointer">
                Desconto livre <span className="text-muted-foreground font-normal">(vendedor define o percentual)</span>
              </Label>
            </div>
            <div className="space-y-1.5">
              <Label>Arquivo Excel (.xlsx) *</Label>
              <div className="text-xs text-muted-foreground mb-1">
                Aba: Planilha1 — Colunas: SKU, Código, (num), Tabela 7%, Tabela 12%, Tabela 18%, Tabela Suframa
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                disabled={importando}
              />
              {importFile && (
                <p className="text-xs text-muted-foreground">{importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)</p>
              )}
            </div>

            {importResultado && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <div className="font-semibold text-green-700">
                  ✓ {importResultado.importados} produtos importados
                </div>
                {importResultado.naoEncontrados.length > 0 && (
                  <div className="text-muted-foreground">
                    <div className="font-medium text-amber-700">{importResultado.naoEncontrados.length} códigos não encontrados:</div>
                    <div className="text-xs font-mono mt-1 max-h-24 overflow-y-auto">
                      {importResultado.naoEncontrados.join(", ")}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={fecharModal} disabled={importando}>
              {importResultado ? "Fechar" : "Cancelar"}
            </Button>
            {!importResultado && (
              <Button onClick={importar} disabled={importando || !importNome.trim() || !importFile}>
                {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {importando ? "Importando…" : "Importar"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar exclusão */}
      <AlertDialog open={!!excluirVig} onOpenChange={(o) => { if (!o) setExcluirVig(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir vigência?</AlertDialogTitle>
            <AlertDialogDescription>
              A vigência <strong>{excluirVig?.nome}</strong> e todos os seus {excluirVig?.total_produtos} preços serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={excluir}
              disabled={excluindo}
            >
              {excluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
