import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, FileText, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

type Politica = {
  id: string;
  titulo: string;
  conteudo_html: string;
  pdf_url: string | null;
  atualizado_em: string | null;
  signedUrl?: string;
};

export default function PoliticaComercialView() {
  const [lista, setLista] = useState<Politica[]>([]);
  const [loading, setLoading] = useState(true);
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("politica_comercial")
        .select("id, titulo, conteudo_html, pdf_url, atualizado_em")
        .order("ordem", { ascending: true })
        .order("atualizado_em", { ascending: false });

      const politicas: Politica[] = await Promise.all(
        (data ?? []).map(async (p: Politica) => {
          if (!p.pdf_url) return p;
          const { data: signed } = await supabase.storage
            .from("documentos")
            .createSignedUrl(p.pdf_url, 3600);
          return { ...p, signedUrl: signed?.signedUrl };
        })
      );

      setLista(politicas);
      setLoading(false);
    })();
  }, []);

  const toggle = (id: string) =>
    setAbertas((prev) => ({ ...prev, [id]: !prev[id] }));

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" /> Política Comercial</h1>
        <p className="text-sm text-muted-foreground">Diretrizes e regras comerciais da Bravir</p>
      </div>

      {lista.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            A política comercial ainda não foi publicada.
          </CardContent>
        </Card>
      ) : (
        lista.map((p) => (
          <Card key={p.id}>
            <CardContent className="pt-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-base">{p.titulo}</h2>
                  {p.atualizado_em && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Atualizado em {new Date(p.atualizado_em).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
              </div>

              {p.conteudo_html?.trim() && (
                <div
                  className="prose prose-sm max-w-none text-foreground [&>h2]:text-base [&>h2]:font-semibold [&>h2]:mt-3 [&>p]:text-muted-foreground [&>ul]:list-disc [&>ul]:ml-4"
                  dangerouslySetInnerHTML={{ __html: p.conteudo_html }}
                />
              )}

              {p.signedUrl && (
                <>
                  <div className="flex items-center gap-2 pt-1 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => toggle(p.id)}
                    >
                      {abertas[p.id]
                        ? <><ChevronUp className="h-4 w-4" /> Fechar PDF</>
                        : <><ChevronDown className="h-4 w-4" /> Ver PDF da política</>
                      }
                    </Button>
                    {abertas[p.id] && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground"
                        onClick={() => window.open(p.signedUrl, "_blank")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Tela cheia
                      </Button>
                    )}
                  </div>

                  {abertas[p.id] && (
                    <iframe
                      src={`${p.signedUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                      title={p.titulo}
                      className="w-full rounded-lg"
                      style={{ height: 600, border: "none" }}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
