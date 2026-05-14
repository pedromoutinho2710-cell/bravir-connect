import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { formatBRL } from "@/lib/format";
import { toast } from "sonner";
import { Loader2, Save, Trash2 } from "lucide-react";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type Vendedor = { id: string; nome: string };
type MetasMap = Record<string, Record<number, number>>; // vendedor_id → mes → valor
type FaturadoMap = Record<string, Record<number, number>>; // vendedor_id → mes → total

const ANO = new Date().getFullYear();
const MES_ATUAL = new Date().getMonth() + 1;

export default function Metas() {
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [metas, setMetas] = useState<MetasMap>({});
  const [faturado, setFaturado] = useState<FaturadoMap>({});
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [excluindoVendedor, setExcluindoVendedor] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);

    const [rolesRes, profRes, metasRes, pedRes] = await Promise.all([
      supabase.from("user_roles").select("user_id").eq("role", "vendedor"),
      supabase.from("profiles").select("id, full_name, email"),
      supabase.from("metas").select("vendedor_id, mes, ano, valor_meta_reais").eq("ano", ANO),
      supabase
        .from("pedidos")
        .select("vendedor_id, data_pedido, itens_pedido(total_item)")
        .gte("data_pedido", `${ANO}-01-01`)
        .lte("data_pedido", `${ANO}-12-31`)
        .not("status", "in", '("rascunho","cancelado")'),
    ]);

    const vendedorIds = new Set((rolesRes.data ?? []).map((r) => r.user_id));
    const profMap: Record<string, string> = {};
    (profRes.data ?? []).forEach((p) => {
      profMap[p.id] = p.full_name || p.email;
    });

    const vends: Vendedor[] = Array.from(vendedorIds)
      .map((id) => ({ id, nome: profMap[id] ?? id }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    // Build metas map
    const metasM: MetasMap = {};
    vends.forEach((v) => { metasM[v.id] = {}; });
    (metasRes.data ?? []).forEach((m) => {
      if (!metasM[m.vendedor_id]) metasM[m.vendedor_id] = {};
      metasM[m.vendedor_id][m.mes] = Number(m.valor_meta_reais);
    });

    // Build faturado map
    const fatM: FaturadoMap = {};
    vends.forEach((v) => { fatM[v.id] = {}; });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pedRes.data ?? []).forEach((p: any) => {
      const vid = p.vendedor_id;
      if (!fatM[vid]) return;
      const mes = new Date(p.data_pedido + "T12:00:00").getMonth() + 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const total = (p.itens_pedido ?? []).reduce((s: number, i: any) => s + Number(i.total_item), 0);
      fatM[vid][mes] = (fatM[vid][mes] ?? 0) + total;
    });

    setVendedores(vends);
    setMetas(metasM);
    setFaturado(fatM);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const setMeta = (vendedorId: string, mes: number, valor: number) => {
    setMetas((prev) => ({
      ...prev,
      [vendedorId]: { ...(prev[vendedorId] ?? {}), [mes]: valor },
    }));
  };

  async function excluirVendedor(vendedorId: string) {
    const { error } = await supabase
      .from("metas")
      .delete()
      .eq("vendedor_id", vendedorId)
      .eq("ano", ANO);
    if (error) { toast.error("Erro ao excluir: " + error.message); return; }
    setVendedores(prev => prev.filter(v => v.id !== vendedorId));
    setMetas(prev => { const n = {...prev}; delete n[vendedorId]; return n; });
    setFaturado(prev => { const n = {...prev}; delete n[vendedorId]; return n; });
    toast.success("Vendedor removido das metas.");
    setExcluindoVendedor(null);
  }

  const salvarVendedor = async (vendedorId: string) => {
    setSalvando(vendedorId);
    const rows = Object.entries(metas[vendedorId] ?? {})
      .filter(([, v]) => v > 0)
      .map(([mes, valor]) => ({
        vendedor_id: vendedorId,
        mes: Number(mes),
        ano: ANO,
        valor_meta_reais: valor,
      }));

    if (rows.length === 0) {
      toast.info("Nenhuma meta preenchida para salvar");
      setSalvando(null);
      return;
    }

    const { error } = await supabase
      .from("metas")
      .upsert(rows, { onConflict: "vendedor_id,mes,ano" });

    setSalvando(null);
    if (error) { toast.error("Erro ao salvar metas: " + error.message); return; }
    toast.success("Metas salvas com sucesso");
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Metas dos Vendedores — {ANO}</h1>
        <p className="text-sm text-muted-foreground">Defina e acompanhe as metas mensais de cada vendedor</p>
      </div>

      {vendedores.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum vendedor cadastrado
          </CardContent>
        </Card>
      )}

      {vendedores.map((v) => {
        const metaAtual = metas[v.id]?.[MES_ATUAL] ?? 0;
        const fatAtual = faturado[v.id]?.[MES_ATUAL] ?? 0;
        const pct = metaAtual > 0 ? Math.min((fatAtual / metaAtual) * 100, 100) : 0;
        const barColor = pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-400" : "bg-red-500";

        return (
          <Card key={v.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-lg">{v.nome}</CardTitle>
                {metaAtual > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Mês atual: {formatBRL(fatAtual)} / {formatBRL(metaAtual)}</span>
                      <span className="font-medium">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 w-full max-w-xs rounded-full bg-muted">
                      <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => salvarVendedor(v.id)} disabled={salvando === v.id}>
                  {salvando === v.id
                    ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    : <Save className="h-4 w-4 mr-1" />}
                  Salvar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setExcluindoVendedor(v.id)}
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
                  const fatVal = faturado[v.id]?.[mes] ?? 0;
                  const isAtual = mes === MES_ATUAL;

                  return (
                    <div
                      key={mes}
                      className={`rounded-md border p-3 space-y-2 ${isAtual ? "border-primary/40 bg-primary/5" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${isAtual ? "text-primary" : ""}`}>
                          {nomeMes}
                        </span>
                        {fatVal > 0 && (
                          <span className="text-xs text-muted-foreground">{formatBRL(fatVal)}</span>
                        )}
                      </div>
                      <Input
                        type="number"
                        min={0}
                        step={1000}
                        value={metaVal || ""}
                        onChange={(e) => setMeta(v.id, mes, Number(e.target.value) || 0)}
                        placeholder="R$ 0"
                        className="h-8 text-sm"
                      />
                      {metaVal > 0 && fatVal > 0 && (
                        <div className="h-1.5 w-full rounded-full bg-muted">
                          <div
                            className={`h-1.5 rounded-full ${Math.min(fatVal / metaVal, 1) >= 0.8 ? "bg-green-500" : Math.min(fatVal / metaVal, 1) >= 0.5 ? "bg-yellow-400" : "bg-red-500"}`}
                            style={{ width: `${Math.min((fatVal / metaVal) * 100, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
      <AlertDialog open={!!excluindoVendedor} onOpenChange={(o) => { if (!o) setExcluindoVendedor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover vendedor das metas?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso vai apagar todas as metas de {vendedores.find(v => v.id === excluindoVendedor)?.nome} no ano {ANO}.{" "}
              O vendedor continuará no sistema, apenas sairá desta lista e da meta geral.
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
