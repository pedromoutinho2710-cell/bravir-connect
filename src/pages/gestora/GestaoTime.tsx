import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Pencil } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const ANO = new Date().getFullYear();
const MES = new Date().getMonth() + 1;
const INICIO_MES = `${ANO}-${String(MES).padStart(2, "0")}-01`;
const FIM_MES = `${ANO}-${String(MES).padStart(2, "0")}-31`;

// Últimos 3 meses (inclusive o atual)
function ultimos3Meses() {
  const meses: { ano: number; mes: number; label: string }[] = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(ANO, MES - 1 - i, 1);
    meses.push({
      ano: d.getFullYear(),
      mes: d.getMonth() + 1,
      label: d.toLocaleDateString("pt-BR", { month: "short" }),
    });
  }
  return meses;
}
const MESES3 = ultimos3Meses();

type Vendedor = {
  id: string;
  nome: string;
  pedidosMes: number;
  totalMes: number;
  meta: number;
  pct: number;
  pedidoMinimo: number;
};

type PedidoHistorico = {
  id: string;
  numero_pedido: number;
  data_pedido: string;
  status: string;
  total: number;
  razao_social: string;
};

type ClienteCarteira = {
  id: string;
  razao_social: string;
};

type MesData = { label: string; realizado: number; meta: number };

type VendedorDetalhe = {
  pedidos: PedidoHistorico[];
  clientes: ClienteCarteira[];
  historico3Meses: MesData[];
};

function StatusBadge({ pct }: { pct: number }) {
  if (pct >= 100) return <Badge className="bg-green-100 text-green-800 border-green-300 text-xs">Atingiu</Badge>;
  if (pct >= 70) return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs">Em curso</Badge>;
  return <Badge className="bg-red-100 text-red-800 border-red-300 text-xs">Abaixo</Badge>;
}

function MiniBarChart({ data }: { data: MesData[] }) {
  const maxVal = Math.max(...data.flatMap((d) => [d.realizado, d.meta]), 1);
  return (
    <div className="flex items-end gap-3 h-24">
      {data.map((d) => (
        <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex items-end gap-0.5 h-16">
            {/* Barra meta */}
            <div
              className="flex-1 rounded-t bg-gray-200"
              style={{ height: `${(d.meta / maxVal) * 100}%` }}
              title={`Meta: ${formatBRL(d.meta)}`}
            />
            {/* Barra realizado */}
            <div
              className="flex-1 rounded-t"
              style={{
                height: `${(d.realizado / maxVal) * 100}%`,
                backgroundColor: d.realizado >= d.meta ? "#16a34a" : d.realizado >= d.meta * 0.7 ? "#ca8a04" : "#dc2626",
              }}
              title={`Realizado: ${formatBRL(d.realizado)}`}
            />
          </div>
          <span className="text-[10px] text-muted-foreground capitalize">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function GestaoTime() {
  const [loading, setLoading] = useState(true);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [selectedVendedor, setSelectedVendedor] = useState<Vendedor | null>(null);
  const [detalhe, setDetalhe] = useState<VendedorDetalhe | null>(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [editVendedor, setEditVendedor] = useState<Vendedor | null>(null);
  const [editPedidoMinimo, setEditPedidoMinimo] = useState(5000);
  const [salvandoMinimo, setSalvandoMinimo] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const [rolesRes, profRes, pedidosMesRes, metasRes] = await Promise.all([
        supabase.from("user_roles").select("user_id").eq("role", "vendedor"),
        supabase.from("profiles").select("id, full_name, email, pedido_minimo"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("pedidos")
          .select("id, vendedor_id, itens_pedido(total_item)")
          .gte("data_pedido", INICIO_MES)
          .lte("data_pedido", FIM_MES)
          .not("status", "in", '("rascunho","cancelado")'),
        supabase.from("metas").select("vendedor_id, mes, ano, valor_meta_reais").eq("mes", MES).eq("ano", ANO),
      ]);

      const profMap: Record<string, { nome: string; pedidoMinimo: number }> = {};
      (profRes.data ?? []).forEach((p: { id: string; full_name: string | null; email: string | null; pedido_minimo: number | null }) => {
        profMap[p.id] = {
          nome: p.full_name || p.email || p.id,
          pedidoMinimo: p.pedido_minimo ?? 5000,
        };
      });

      const metaMap: Record<string, number> = {};
      (metasRes.data ?? []).forEach((m: { vendedor_id: string; valor_meta_reais: number }) => {
        metaMap[m.vendedor_id] = Number(m.valor_meta_reais);
      });

      const totaisMap: Record<string, { pedidos: number; total: number }> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pedidosMesRes.data ?? []).forEach((p: any) => {
        const vid = p.vendedor_id;
        if (!vid) return;
        if (!totaisMap[vid]) totaisMap[vid] = { pedidos: 0, total: 0 };
        totaisMap[vid].pedidos += 1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p.itens_pedido ?? []).forEach((i: any) => {
          totaisMap[vid].total += Number(i.total_item ?? 0);
        });
      });

      const vends: Vendedor[] = (rolesRes.data ?? [])
        .map((r: { user_id: string }) => {
          const dados = totaisMap[r.user_id] ?? { pedidos: 0, total: 0 };
          const meta = metaMap[r.user_id] ?? 0;
          const prof = profMap[r.user_id];
          return {
            id: r.user_id,
            nome: prof?.nome ?? r.user_id,
            pedidosMes: dados.pedidos,
            totalMes: dados.total,
            meta,
            pct: meta > 0 ? (dados.total / meta) * 100 : 0,
            pedidoMinimo: prof?.pedidoMinimo ?? 5000,
          };
        })
        .sort((a: Vendedor, b: Vendedor) => b.totalMes - a.totalMes);

      setVendedores(vends);
      setLoading(false);
    };

    load();
  }, []);

  const salvarPedidoMinimo = async () => {
    if (!editVendedor) return;
    setSalvandoMinimo(true);
    const { error } = await supabase
      .from("profiles")
      .update({ pedido_minimo: editPedidoMinimo })
      .eq("id", editVendedor.id);
    setSalvandoMinimo(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    toast.success("Pedido mínimo atualizado!");
    setVendedores((prev) =>
      prev.map((v) => v.id === editVendedor.id ? { ...v, pedidoMinimo: editPedidoMinimo } : v)
    );
    setEditVendedor(null);
  };

  const abrirDetalhe = async (v: Vendedor) => {
    setSelectedVendedor(v);
    setDetalhe(null);
    setLoadingDetalhe(true);

    // Início de 3 meses atrás
    const inicio3Meses = `${MESES3[0].ano}-${String(MESES3[0].mes).padStart(2, "0")}-01`;

    const [pedidosRes, clientesRes, pedidos3MRes, metas3MRes] = await Promise.all([
      // Últimos 10 pedidos do vendedor
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("pedidos")
        .select("id, numero_pedido, data_pedido, status, clientes(razao_social), itens_pedido(total_item)")
        .eq("vendedor_id", v.id)
        .order("data_pedido", { ascending: false })
        .limit(10),

      // Clientes da carteira
      supabase
        .from("clientes")
        .select("id, razao_social")
        .eq("vendedor_id", v.id)
        .order("razao_social"),

      // Pedidos últimos 3 meses para o gráfico
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("pedidos")
        .select("data_pedido, itens_pedido(total_item)")
        .eq("vendedor_id", v.id)
        .gte("data_pedido", inicio3Meses)
        .not("status", "in", '("rascunho","cancelado")'),

      // Metas dos últimos 3 meses
      supabase
        .from("metas")
        .select("mes, ano, valor_meta_reais")
        .eq("vendedor_id", v.id)
        .in("mes", MESES3.map((m) => m.mes))
        .in("ano", [...new Set(MESES3.map((m) => m.ano))]),
    ]);

    // Mapear realizado por mês
    const realizadoMap: Record<string, number> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pedidos3MRes.data ?? []).forEach((p: any) => {
      const mesKey = p.data_pedido.slice(0, 7); // YYYY-MM
      if (!realizadoMap[mesKey]) realizadoMap[mesKey] = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p.itens_pedido ?? []).forEach((i: any) => {
        realizadoMap[mesKey] += Number(i.total_item ?? 0);
      });
    });

    const metaHistMap: Record<string, number> = {};
    (metas3MRes.data ?? []).forEach((m: { mes: number; ano: number; valor_meta_reais: number }) => {
      const key = `${m.ano}-${String(m.mes).padStart(2, "0")}`;
      metaHistMap[key] = Number(m.valor_meta_reais);
    });

    const historico3Meses: MesData[] = MESES3.map((m) => {
      const key = `${m.ano}-${String(m.mes).padStart(2, "0")}`;
      return {
        label: m.label,
        realizado: realizadoMap[key] ?? 0,
        meta: metaHistMap[key] ?? 0,
      };
    });

    // Processar pedidos histórico
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pedidos: PedidoHistorico[] = (pedidosRes.data ?? []).map((p: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const total = (p.itens_pedido ?? []).reduce((s: number, i: any) => s + Number(i.total_item ?? 0), 0);
      return {
        id: p.id,
        numero_pedido: p.numero_pedido,
        data_pedido: p.data_pedido,
        status: p.status,
        total,
        razao_social: p.clientes?.razao_social ?? "—",
      };
    });

    setDetalhe({
      pedidos,
      clientes: (clientesRes.data ?? []) as ClienteCarteira[],
      historico3Meses,
    });
    setLoadingDetalhe(false);
  };

  const inicialNome = (nome: string) => {
    const parts = nome.split(" ").filter(Boolean);
    if (parts.length === 0) return "?";
    return parts.length === 1 ? parts[0][0] : parts[0][0] + parts[parts.length - 1][0];
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gestão do Time</h1>
        <p className="text-sm text-muted-foreground">Desempenho individual dos vendedores no mês atual</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {vendedores.map((v) => (
          <div
            key={v.id}
            className="border rounded-xl p-5 bg-white shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => abrirDetalhe(v)}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm flex-shrink-0 uppercase">
                {inicialNome(v.nome)}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{v.nome}</div>
                <div className="text-xs text-muted-foreground">{v.pedidosMes} pedido{v.pedidosMes !== 1 ? "s" : ""} no mês</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total vendido</span>
                <span className="font-semibold">{formatBRL(v.totalMes)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Meta</span>
                <span className="text-muted-foreground">{v.meta > 0 ? formatBRL(v.meta) : "—"}</span>
              </div>

              {v.meta > 0 && (
                <>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{
                        width: `${Math.min(v.pct, 100)}%`,
                        backgroundColor: v.pct >= 100 ? "#16a34a" : v.pct >= 70 ? "#ca8a04" : "#dc2626",
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{v.pct.toFixed(0)}% atingido</span>
                    <StatusBadge pct={v.pct} />
                  </div>
                </>
              )}

              <div className="flex justify-between items-center text-sm mt-2 pt-2 border-t">
                <span className="text-muted-foreground">Pedido mínimo</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{formatBRL(v.pedidoMinimo)}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={(e) => { e.stopPropagation(); setEditVendedor(v); setEditPedidoMinimo(v.pedidoMinimo); }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Dialog de edição de pedido mínimo */}
      <Dialog open={!!editVendedor} onOpenChange={(o) => !o && setEditVendedor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pedido mínimo — {editVendedor?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Valor mínimo do pedido (R$)</Label>
            <Input
              type="number"
              min={0}
              value={editPedidoMinimo}
              onChange={(e) => setEditPedidoMinimo(Number(e.target.value))}
              placeholder="5000"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditVendedor(null)}>Cancelar</Button>
            <Button onClick={salvarPedidoMinimo} disabled={salvandoMinimo}>
              {salvandoMinimo && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sheet de detalhe */}
      <Sheet open={!!selectedVendedor} onOpenChange={(o) => !o && setSelectedVendedor(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selectedVendedor && (
            <>
              <SheetHeader className="mb-6">
                <SheetTitle className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm uppercase flex-shrink-0">
                    {inicialNome(selectedVendedor.nome)}
                  </div>
                  <div>
                    <div>{selectedVendedor.nome}</div>
                    <div className="text-sm font-normal text-muted-foreground">Vendedor</div>
                  </div>
                </SheetTitle>
              </SheetHeader>

              {loadingDetalhe ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : detalhe ? (
                <div className="space-y-8">

                  {/* Mini gráfico 3 meses */}
                  <div>
                    <h3 className="text-sm font-semibold mb-3">Meta vs Realizado — últimos 3 meses</h3>
                    <MiniBarChart data={detalhe.historico3Meses} />
                    <div className="flex gap-4 mt-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <div className="w-3 h-3 rounded bg-gray-200" /> Meta
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <div className="w-3 h-3 rounded bg-green-600" /> Realizado
                      </div>
                    </div>
                  </div>

                  {/* Últimos 10 pedidos */}
                  <div>
                    <h3 className="text-sm font-semibold mb-3">Últimos pedidos</h3>
                    {detalhe.pedidos.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum pedido encontrado.</p>
                    ) : (
                      <div className="space-y-2">
                        {detalhe.pedidos.map((p) => (
                          <div key={p.id} className="flex items-center justify-between text-sm border-b pb-2">
                            <div>
                              <span className="font-mono font-semibold">#{p.numero_pedido}</span>
                              <span className="text-muted-foreground ml-2 text-xs">{formatDate(p.data_pedido)}</span>
                              <div className="text-xs text-muted-foreground truncate max-w-[200px]">{p.razao_social}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold">{formatBRL(p.total)}</div>
                              <div className="text-xs text-muted-foreground capitalize">{p.status.replace(/_/g, " ")}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Carteira de clientes */}
                  <div>
                    <h3 className="text-sm font-semibold mb-3">
                      Carteira de clientes
                      <span className="ml-2 text-muted-foreground font-normal">({detalhe.clientes.length})</span>
                    </h3>
                    {detalhe.clientes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum cliente na carteira.</p>
                    ) : (
                      <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                        {detalhe.clientes.map((c) => (
                          <div key={c.id} className="text-sm py-1 border-b last:border-0">
                            {c.razao_social}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              ) : null}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
