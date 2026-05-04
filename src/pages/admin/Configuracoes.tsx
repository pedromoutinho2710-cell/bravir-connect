// SQL necessário (rodar no Supabase):
// CREATE TABLE IF NOT EXISTS configuracoes (
//   key TEXT PRIMARY KEY,
//   value TEXT NOT NULL,
//   updated_at TIMESTAMPTZ DEFAULT now()
// );
// INSERT INTO configuracoes (key, value) VALUES ('bolsao_percentual', '1') ON CONFLICT (key) DO NOTHING;

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

export default function Configuracoes() {
  const [bolsaoPct, setBolsaoPct] = useState("1");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("configuracoes")
      .select("value")
      .eq("key", "bolsao_percentual")
      .maybeSingle()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }: { data: any }) => {
        if (data?.value) setBolsaoPct(String(data.value));
        setLoading(false);
      });
  }, []);

  const salvar = async () => {
    setSalvando(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("configuracoes")
      .upsert(
        { key: "bolsao_percentual", value: String(bolsaoPct), updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    setSalvando(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    toast.success("Configuração salva!");
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Parâmetros globais do sistema</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bolsão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bolsao-pct">Percentual de bolsão (%)</Label>
            <Input
              id="bolsao-pct"
              type="number"
              step={0.1}
              min={0}
              max={100}
              value={bolsaoPct}
              onChange={(e) => setBolsaoPct(e.target.value)}
              className="max-w-[140px]"
            />
            <p className="text-xs text-muted-foreground">
              Percentual aplicado sobre o valor líquido do pedido para calcular o bolsão gerado ao cliente.
            </p>
          </div>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
