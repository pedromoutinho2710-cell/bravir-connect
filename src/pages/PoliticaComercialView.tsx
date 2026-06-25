import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, FileText, ExternalLink } from "lucide-react";

export default function PoliticaComercialView() {
  const [html, setHtml] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("politica_comercial")
        .select("conteudo_html, pdf_url")
        .limit(1)
        .maybeSingle();
      if (data) {
        setHtml(data.conteudo_html ?? "");
        setPdfUrl(data.pdf_url ?? null);
      }
      setLoading(false);
    })();
  }, []);

  const abrirPdf = async () => {
    if (!pdfUrl) return;
    const { data } = await supabase.storage.from("documentos").createSignedUrl(pdfUrl, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const semConteudo = !html?.trim() && !pdfUrl;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" /> Política Comercial</h1>
          <p className="text-sm text-muted-foreground">Diretrizes e regras comerciais da Bravir</p>
        </div>
        {pdfUrl && (
          <Button variant="outline" onClick={abrirPdf} className="gap-1.5 shrink-0">
            <ExternalLink className="h-4 w-4" />
            Abrir PDF
          </Button>
        )}
      </div>

      {semConteudo ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            A política comercial ainda não foi publicada.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            {html?.trim() ? (
              <div
                className="prose prose-sm max-w-none text-foreground [&>h2]:text-lg [&>h2]:font-semibold [&>h2]:mt-4 [&>p]:text-muted-foreground [&>ul]:list-disc [&>ul]:ml-4"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <p className="text-muted-foreground text-sm">Nenhum texto disponível. Consulte o PDF.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
