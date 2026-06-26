import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, FileText, Upload, ExternalLink, Trash2, Plus, Pencil, X } from "lucide-react";
import { toast } from "sonner";

type Politica = {
  id: string;
  titulo: string;
  conteudo_html: string;
  pdf_url: string | null;
  atualizado_em: string | null;
  ordem: number;
};

const VAZIO: Omit<Politica, "id" | "atualizado_em"> = {
  titulo: "",
  conteudo_html: "",
  pdf_url: null,
  ordem: 0,
};

export default function PoliticaComercial() {
  const [lista, setLista] = useState<Politica[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<Politica | null>(null);
  const [novoMode, setNovoMode] = useState(false);
  const [form, setForm] = useState(VAZIO);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfParaRemover, setPdfParaRemover] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const carregar = async () => {
    const { data } = await supabase
      .from("politica_comercial")
      .select("id, titulo, conteudo_html, pdf_url, atualizado_em, ordem")
      .order("ordem", { ascending: true })
      .order("atualizado_em", { ascending: false });
    setLista(data ?? []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const abrirNovo = () => {
    setEditando(null);
    setForm({ ...VAZIO, ordem: lista.length });
    setPdfFile(null);
    setNovoMode(true);
  };

  const abrirEditar = (p: Politica) => {
    setNovoMode(false);
    setEditando(p);
    setForm({ titulo: p.titulo, conteudo_html: p.conteudo_html, pdf_url: p.pdf_url, ordem: p.ordem });
    setPdfFile(null);
  };

  const fecharForm = () => {
    setEditando(null);
    setNovoMode(false);
    setPdfFile(null);
    setPdfParaRemover(null);
  };

  const nomePdf = (path: string | null) =>
    path ? decodeURIComponent(path.split("/").pop() ?? path) : null;

  const abrirPdf = async (path: string) => {
    const { data } = await supabase.storage.from("documentos").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  // Marca o PDF para remoção ao salvar — não deleta do storage ainda,
  // para evitar perda de arquivo se o admin clicar Cancelar depois.
  const removerPdfForm = () => {
    if (!form.pdf_url) return;
    setPdfParaRemover(form.pdf_url);
    setForm((f) => ({ ...f, pdf_url: null }));
    setPdfFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const salvar = async () => {
    if (!form.titulo.trim()) { toast.error("Título obrigatório."); return; }
    setSalvando(true);
    const pdfUrlOriginal = form.pdf_url;
    let novoPdfPath = form.pdf_url;

    if (pdfFile) {
      // Upload do novo arquivo ANTES de deletar o antigo —
      // se o upload falhar, o arquivo original continua intacto.
      const path = `politica/${Date.now()}_${pdfFile.name}`;
      const { data: upData, error: upErr } = await supabase.storage
        .from("documentos")
        .upload(path, pdfFile);
      if (upErr) { toast.error("Erro ao enviar PDF: " + upErr.message); setSalvando(false); return; }
      novoPdfPath = upData?.path ?? null;
    }

    const payload = {
      titulo: form.titulo,
      conteudo_html: form.conteudo_html,
      pdf_url: novoPdfPath,
      ordem: form.ordem,
      atualizado_em: new Date().toISOString(),
    };

    if (novoMode) {
      const { error } = await supabase.from("politica_comercial").insert(payload);
      if (error) {
        // Banco falhou — remove o arquivo que acabou de subir para não ficar órfão
        if (pdfFile && novoPdfPath) await supabase.storage.from("documentos").remove([novoPdfPath]);
        toast.error("Erro ao criar: " + error.message); setSalvando(false); return;
      }
      toast.success("Política criada.");
    } else if (editando) {
      const { error } = await supabase
        .from("politica_comercial")
        .update(payload)
        .eq("id", editando.id);
      if (error) {
        // Banco falhou — remove o arquivo que acabou de subir para não ficar órfão
        if (pdfFile && novoPdfPath) await supabase.storage.from("documentos").remove([novoPdfPath]);
        toast.error("Erro ao salvar: " + error.message); setSalvando(false); return;
      }
      toast.success("Política salva.");
    }

    // Banco confirmado — agora é seguro limpar arquivos antigos do storage
    if (pdfFile && pdfUrlOriginal) {
      await supabase.storage.from("documentos").remove([pdfUrlOriginal]);
    }
    if (pdfParaRemover) {
      await supabase.storage.from("documentos").remove([pdfParaRemover]);
    }

    setSalvando(false);
    fecharForm();
    carregar();
  };

  const excluir = async (p: Politica) => {
    if (!confirm(`Excluir "${p.titulo}"?`)) return;
    // Banco primeiro: se falhar, o arquivo no storage continua íntegro
    const { error } = await supabase.from("politica_comercial").delete().eq("id", p.id);
    if (error) { toast.error("Erro ao excluir: " + error.message); return; }
    if (p.pdf_url) await supabase.storage.from("documentos").remove([p.pdf_url]);
    toast.success("Política excluída.");
    carregar();
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const mostrandoForm = novoMode || !!editando;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" /> Política Comercial</h1>
          <p className="text-sm text-muted-foreground">Gerencie as políticas visíveis para todos os colaboradores.</p>
        </div>
        {!mostrandoForm && (
          <Button onClick={abrirNovo} className="gap-2">
            <Plus className="h-4 w-4" /> Adicionar política
          </Button>
        )}
      </div>

      {/* Lista de políticas existentes */}
      {lista.length === 0 && !mostrandoForm && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            Nenhuma política cadastrada. Clique em "Adicionar política" para começar.
          </CardContent>
        </Card>
      )}

      {lista.map((p) => (
        <Card key={p.id} className={editando?.id === p.id ? "border-primary" : ""}>
          <CardContent className="py-4 flex items-center gap-4">
            <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{p.titulo}</p>
              <p className="text-xs text-muted-foreground">
                {p.pdf_url ? `PDF: ${nomePdf(p.pdf_url)}` : "Sem PDF"}
                {p.atualizado_em && ` · Atualizado em ${new Date(p.atualizado_em).toLocaleDateString("pt-BR")}`}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              {p.pdf_url && (
                <Button size="icon" variant="ghost" onClick={() => abrirPdf(p.pdf_url!)}>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
              <Button size="icon" variant="ghost" onClick={() => abrirEditar(p)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => excluir(p)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Formulário de criação/edição */}
      {mostrandoForm && (
        <Card className="border-primary">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {novoMode ? "Nova política" : `Editando: ${editando?.titulo}`}
            </CardTitle>
            <Button size="icon" variant="ghost" onClick={fecharForm}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input
                value={form.titulo}
                onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                placeholder="Ex: Política de Desconto Junho 2026"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Descrição (texto)</Label>
              <Textarea
                value={form.conteudo_html}
                onChange={(e) => setForm((f) => ({ ...f, conteudo_html: e.target.value }))}
                rows={8}
                className="font-mono text-sm"
                placeholder="Descreva a política (aceita HTML básico: <h2>, <p>, <ul><li>)..."
              />
            </div>

            <div className="space-y-2">
              <Label>PDF</Label>
              {form.pdf_url ? (
                <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="flex-1 text-sm truncate">{nomePdf(form.pdf_url)}</span>
                  <Button size="sm" variant="ghost" onClick={() => abrirPdf(form.pdf_url!)} className="gap-1">
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={removerPdfForm}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum PDF anexado.</p>
              )}
              <div className="flex items-center gap-3">
                <Input type="file" accept="application/pdf" ref={fileRef}
                  onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} className="hidden" />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-1.5">
                  <Upload className="h-4 w-4" />
                  {pdfFile ? pdfFile.name : form.pdf_url ? "Substituir PDF" : "Selecionar PDF"}
                </Button>
                {pdfFile && <span className="text-xs text-muted-foreground">{(pdfFile.size / 1024).toFixed(0)} KB</span>}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={fecharForm}>Cancelar</Button>
              <Button onClick={salvar} disabled={salvando} className="gap-2">
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                {novoMode ? "Criar política" : "Salvar alterações"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
