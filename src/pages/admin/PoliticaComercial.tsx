import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, FileText, Upload, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function PoliticaComercial() {
  const [id, setId] = useState<string | null>(null);
  const [html, setHtml] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("politica_comercial")
        .select("id, conteudo_html, pdf_url")
        .limit(1)
        .maybeSingle();
      if (data) {
        setId(data.id);
        setHtml(data.conteudo_html ?? "");
        setPdfUrl(data.pdf_url ?? null);
      }
      setLoading(false);
    })();
  }, []);

  const salvar = async () => {
    setSalvando(true);
    let novoPdfUrl = pdfUrl;

    if (pdfFile) {
      const path = `politica/${Date.now()}_${pdfFile.name}`;
      const { data: upData, error: upErr } = await supabase.storage
        .from("documentos")
        .upload(path, pdfFile, { upsert: true });
      if (upErr) {
        toast.error("Erro ao enviar PDF: " + upErr.message);
        setSalvando(false);
        return;
      }
      novoPdfUrl = upData?.path ?? null;
    }

    const { error } = await (supabase as any)
      .from("politica_comercial")
      .update({
        conteudo_html: html,
        pdf_url: novoPdfUrl,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", id);

    setSalvando(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    setPdfUrl(novoPdfUrl);
    setPdfFile(null);
    toast.success("Política comercial salva");
  };

  const abrirPdf = async () => {
    if (!pdfUrl) return;
    const { data } = await supabase.storage.from("documentos").createSignedUrl(pdfUrl, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" /> Política Comercial</h1>
        <p className="text-sm text-muted-foreground">Edite o conteúdo e/ou anexe o PDF da política. Todos os colaboradores podem visualizar.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Conteúdo (texto)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Label>Texto da política</Label>
          <Textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            rows={16}
            className="font-mono text-sm"
            placeholder="Cole aqui o texto da política comercial (aceita HTML básico para formatação)..."
          />
          <p className="text-xs text-muted-foreground">Dica: use &lt;h2&gt;, &lt;p&gt;, &lt;ul&gt;&lt;li&gt; para formatar o texto.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">PDF anexo</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {pdfUrl && (
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">PDF atual:</span>
              <Button size="sm" variant="link" onClick={abrirPdf} className="p-0 h-auto gap-1">
                Visualizar PDF <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Input
              type="file"
              accept="application/pdf"
              ref={fileRef}
              onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-1.5">
              <Upload className="h-4 w-4" />
              {pdfFile ? pdfFile.name : "Selecionar PDF"}
            </Button>
            {pdfFile && (
              <span className="text-xs text-muted-foreground">{(pdfFile.size / 1024).toFixed(0)} KB</span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={salvando} className="gap-2">
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar política
        </Button>
      </div>
    </div>
  );
}
