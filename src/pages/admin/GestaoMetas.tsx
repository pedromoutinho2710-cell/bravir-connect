import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatBRL } from "@/lib/format";
import { toast } from "sonner";
import { Loader2, Save, Trash2 } from "lucide-react";

function parseBRL(raw: string): number {
  // Remove pontos de milhar, troca vírgula decimal por ponto
  const clean = raw.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const ANO_ATUAL = new Date().getFullYear();
const ANOS = [-2, -1, 0, 1, 2].map((d) => ANO_ATUAL + d);

type Vendedor = { id: string; nome: string };
type MetasMap = Record<string, Record<number, number>>; // vendedor_id → mes → valor

export default function GestaoMetas() {
  const [ano, setAno] = useState(ANO_ATUAL);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [metas, setMetas] = useState<MetasMap>({});
  const [globais, setGlobais] = useState<Record<number, number>>({});
  const [globalIndisponivel, setGlobalIndisponivel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [salvandoGlobal, setSalvandoGlobal] = useState(false);
  const [excluindoVendedor, setExcluindoVendedor] = useState<string | null>(null);

  const carregar = useCallback(async (anoSel: number) => {
    setLoading(true);

    const [rolesRes, profRes, metasRes] = await Promise.all([
      supabase.from("user_roles").select("user_id").eq("role", "vendedor"),
      supabase.from("profiles").select("id, full_name, email"),
      supabase.from("metas").select("vendedor_id, mes, valor_meta_reais").eq("ano", anoSel),
    ]);

    const profMap: Record<string, string> = {};
    (profRes.data ?? []).forEach((p) => { profMap[p.id] = p.full_name || p.email; });

    // Build metas map e união de vendedores: role=vendedor + quem já tem meta no ano
    const metasM: MetasMap = {};
    const idsComMeta = new Set<string>();
    (metasRes.data ?? []).forEach((m) => {
      if (!m.vendedor_id) return;
      if (!metasM[m.vendedor_id]) metasM[m.vendedor_id] = {};
      metasM[m.vendedor_id][m.mes] = Number(m.valor_meta_reais);
      idsComMeta.add(m.vendedor_id);
    });

    const ids = new Set<string>([
      ...(rolesRes.data ?? []).map((r) => r.user_id),
      ...idsComMeta,
    ]);
    const vends: Vendedor[] = Array.from(ids)
      .map((id) => ({ id, nome: profMap[id] ?? id }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    vends.forEach((v) => { if (!metasM[v.id]) metasM[v.id] = {}; });

    // Meta global do mês (tabela pode não existir ainda — trata graciosamente)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gRes = await (supabase as any)
      .from("metas_globais")
      .select("mes, valor_meta_reais")
      .eq("ano", anoSel);
    const globaisM: Record<number, number> = {};
    if (gRes.error) {
      setGlobalIndisponivel(true);
    } else {
      setGlobalIndisponivel(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (gRes.data ?? []).forEach((g: any) => { globaisM[g.mes] = Number(g.valor_meta_reais); });
    }

    setVendedores(vends);
    setMetas(metasM);
    setGlobais(globaisM);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(ano); }, [carregar, ano]);

  const setMeta = (vendedorId: string, mes: number, valor: number) => {
    setMetas((prev) => ({
      ...prev,
      [vendedorId]: { ...(prev[vendedorId] ?? {}), [mes]: valor },
    }));
  };

  const salvarVendedor = async (vendedorId: string) => {
    setSalvando(vendedorId);
    const linhas = MESES.map((_, i) => i + 1).map((mes) => ({ mes, valor: metas[vendedorId]?.[mes] ?? 0 }));
    const toUpsert = linhas
      .filter((l) => l.valor > 0)
      .map((l) => ({ vendedor_id: vendedorId, mes: l.mes, ano, valor_meta_reais: l.valor }));
    const toDelete = linhas.filter((l) => l.valor <= 0).map((l) => l.mes);

    let erro: string | null = null;
    if (toUpsert.length) {
      const { error } = await supabase.from("metas").upsert(toUpsert, { onConflict: "vendedor_id,mes,ano" });
      if (error) erro = error.message;
    }
    if (!erro && toDelete.length) {
      const { error } = await supabase
        .from("metas").delete()
        .eq("vendedor_id", vendedorId).eq("ano", ano).in("mes", toDelete);
      if (error) erro = error.message;
    }

    setSalvando(null);
    if (erro) { toast.error("Erro ao salvar metas: " + erro); return; }
    toast.success("Metas salvas com sucesso");
  };

  const excluirVendedor = async (vendedorId: string) => {
    const { error } = await supabase
      .from("metas").delete()
      .eq("vendedor_id", vendedorId).eq("ano", ano);
    if (error) { toast.error("Erro ao excluir: " + error.message); return; }
    setMetas((prev) => ({ ...prev, [vendedorId]: {} }));
    toast.success("Metas do vendedor removidas neste ano.");
    setExcluindoVendedor(null);
  };

  const salvarGlobais = async () => {
    setSalvandoGlobal(true);
    const linhas = MESES.map((_, i) => i + 1).map((mes) => ({ mes, valor: globais[mes] ?? 0 }));
    const toUpsert = linhas.filter((l) => l.valor > 0).map((l) => ({ mes: l.mes, ano, valor_meta_reais: l.valor }));
    const toDelete = linhas.filter((l) => l.valor <= 0).map((l) => l.mes);

    let erro: string | null = null;
    if (toUpsert.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("metas_globais").upsert(toUpsert, { onConflict: "mes,ano" });
      if (error) erro = error.message;
    }
    if (!erro && toDelete.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("metas_globais").delete().eq("ano", ano).in("mes", toDelete);
      if (error) erro = error.message;
    }

    setSalvandoGlobal(false);
    if (erro) { toast.error("Erro ao salvar meta global: " + erro); return; }
    toast.success("Metas globais salvas com sucesso");
  };

  // Soma das metas dos vendedores por mês (para reconciliar com a meta global)
  const somaVendedoresMes = (mes: number) =>
    vendedores.reduce((s, v) => s + (metas[v.id]?.[mes] ?? 0), 0);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestão de Metas</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre, edite e exclua metas por vendedor e a meta total da empresa, por mês e ano
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Ano</span>
          <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ANOS.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="vendedor">
        <TabsList>
          <TabsTrigger value="vendedor">Meta por vendedor</TabsTrigger>
          <TabsTrigger value="global">Meta total do mês</TabsTrigger>
        </TabsList>

        {/* ───────── Meta por vendedor ───────── */}
        <TabsContent value="vendedor" className="space-y-4 mt-4">
          {vendedores.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhum vendedor encontrado
              </CardContent>
            </Card>
          ) : (
            vendedores.map((v) => (
              <Card key={v.id}>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-lg">{v.nome}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => salvarVendedor(v.id)} disabled={salvando === v.id}>
                      {salvando === v.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                      Salvar
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setExcluindoVendedor(v.id)}
                      title="Excluir metas deste vendedor no ano"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {MESES.map((nomeMes, idx) => {
                      const mes = idx + 1;
                      const metaVal = metas[v.id]?.[mes] ?? 0;
                      return (
                        <div key={mes} className="rounded-md border p-3 space-y-2">
                          <span className="text-sm font-medium">{nomeMes}</span>
                          <Input
                            type="text" inputMode="numeric"
                            value={metaVal ? metaVal.toLocaleString("pt-BR") : ""}
                            onChange={(e) => setMeta(v.id, mes, parseBRL(e.target.value))}
                            placeholder="R$ 0"
                            className="h-8 text-sm"
                          />
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ───────── Meta total do mês ───────── */}
        <TabsContent value="global" className="space-y-4 mt-4">
          {globalIndisponivel && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              A tabela <code>metas_globais</code> ainda não existe no banco. Rode a migration
              <code> supabase/migrations/20260602000001_metas_globais.sql</code> no SQL Editor para habilitar esta aba.
            </div>
          )}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-lg">Meta total da empresa — {ano}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Objetivo global do mês, independente de vendedor. Comparado com a soma das metas individuais.
                </p>
              </div>
              <Button size="sm" onClick={salvarGlobais} disabled={salvandoGlobal || globalIndisponivel}>
                {salvandoGlobal ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Salvar
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {MESES.map((nomeMes, idx) => {
                  const mes = idx + 1;
                  const globalVal = globais[mes] ?? 0;
                  const somaVend = somaVendedoresMes(mes);
                  const diff = globalVal - somaVend;
                  return (
                    <div key={mes} className="rounded-md border p-3 space-y-2">
                      <span className="text-sm font-medium">{nomeMes}</span>
                      <Input
                        type="text" inputMode="numeric"
                        value={globalVal ? globalVal.toLocaleString("pt-BR") : ""}
                        onChange={(e) => setGlobais((prev) => ({ ...prev, [mes]: parseBRL(e.target.value) }))}
                        placeholder="R$ 0"
                        className="h-8 text-sm"
                        disabled={globalIndisponivel}
                      />
                      <div className="text-[11px] text-muted-foreground">
                        Σ vendedores: {formatBRL(somaVend)}
                      </div>
                      {globalVal > 0 && (
                        <div className={`text-[11px] font-medium ${Math.abs(diff) < 0.005 ? "text-green-600" : diff > 0 ? "text-amber-600" : "text-red-600"}`}>
                          {Math.abs(diff) < 0.005 ? "Bate com a soma" : `${diff > 0 ? "Faltam" : "Excedem"} ${formatBRL(Math.abs(diff))}`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!excluindoVendedor} onOpenChange={(o) => { if (!o) setExcluindoVendedor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover metas do vendedor?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso apaga todas as metas de {vendedores.find((v) => v.id === excluindoVendedor)?.nome} no ano {ano}.
              O vendedor continua no sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (excluindoVendedor) excluirVendedor(excluindoVendedor); }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
