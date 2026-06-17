import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, FileText, Search } from "lucide-react";

type NotaSistema = {
  id: string;
  data: string | null;
  numero_pedido: number | null;
  nota_fiscal: string | null;
  total: number | null;
  rastreio: string | null;
  obs: string | null;
  nf_pdf_url: string | null;
};

type LinhaSankhya = {
  id: string;
  numero_nota: string;
  data_faturamento: string | null;
  descricao_produto: string | null;
  codigo_produto: string | null;
  quantidade: number | null;
  valor_liquido: number | null;
  valor_bruto: number | null;
  canal: string | null;
  nome_vendedor: string | null;
  tipo_operacao: string | null;
};

function canalBadge(canal: string | null) {
  if (!canal) return null;
  const upper = canal.toUpperCase();
  const isMP = /\bMP\b|MERCADO/.test(upper);
  return (
    <Badge
      variant="outline"
      className={
        isMP
          ? "bg-yellow-100 text-yellow-800 border-yellow-300"
          : "bg-blue-100 text-blue-800 border-blue-300"
      }
    >
      {isMP ? "MP" : "BRAVIR"}
    </Badge>
  );
}

export function AbaHistoricoFaturamento({
  clienteId,
  codigoParceiro,
}: {
  clienteId: string;
  codigoParceiro: string | null;
}) {
  const [notas, setNotas] = useState<NotaSistema[]>([]);
  const [loadingNotas, setLoadingNotas] = useState(true);
  const [sankhya, setSankhya] = useState<LinhaSankhya[]>([]);
  const [loadingSankhya, setLoadingSankhya] = useState(false);
  const [buscaProduto, setBuscaProduto] = useState("");

  // SEÇÃO 1 — notas fiscais do sistema (faturamentos via JOIN com pedidos)
  useEffect(() => {
    if (!clienteId) return;
    let cancelado = false;
    setLoadingNotas(true);
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("faturamentos")
        .select(
          "id, nota_fiscal, nf_pdf_url, rastreio, obs, created_at, pedidos!inner(numero_pedido, data_pedido, total, cliente_id)"
        )
        .eq("pedidos.cliente_id", clienteId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (cancelado) return;
      if (error) {
        console.error(error);
        setNotas([]);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setNotas(((data ?? []) as any[]).map((f) => ({
          id: f.id,
          data: f.created_at ?? null,
          numero_pedido: f.pedidos?.numero_pedido ?? null,
          nota_fiscal: f.nota_fiscal ?? null,
          total: f.pedidos?.total ?? null,
          rastreio: f.rastreio ?? null,
          obs: f.obs ?? null,
          nf_pdf_url: f.nf_pdf_url ?? null,
        })));
      }
      setLoadingNotas(false);
    })();
    return () => { cancelado = true; };
  }, [clienteId]);

  // SEÇÃO 2 — histórico Sankhya (faturamentos_sankhya por codigo_parceiro)
  useEffect(() => {
    if (!codigoParceiro) { setSankhya([]); return; }
    let cancelado = false;
    setLoadingSankhya(true);
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("faturamentos_sankhya")
        .select(
          "id, numero_nota, data_faturamento, descricao_produto, codigo_produto, quantidade, valor_liquido, valor_bruto, canal, nome_vendedor, tipo_operacao"
        )
        .eq("codigo_parceiro", codigoParceiro)
        .order("data_faturamento", { ascending: false })
        .limit(1000);
      if (cancelado) return;
      if (error) {
        console.error(error);
        setSankhya([]);
      } else {
        setSankhya((data ?? []) as LinhaSankhya[]);
      }
      setLoadingSankhya(false);
    })();
    return () => { cancelado = true; };
  }, [codigoParceiro]);

  const sankhyaFiltrado = useMemo(() => {
    const termo = buscaProduto.trim().toLowerCase();
    if (!termo) return sankhya;
    return sankhya.filter((s) =>
      (s.descricao_produto ?? "").toLowerCase().includes(termo) ||
      (s.codigo_produto ?? "").toLowerCase().includes(termo)
    );
  }, [sankhya, buscaProduto]);

  const totalSankhya = useMemo(() => {
    return sankhyaFiltrado
      .filter((s) => !(s.tipo_operacao && /devolu/i.test(s.tipo_operacao)))
      .reduce((acc, s) => acc + Number(s.valor_liquido ?? 0), 0);
  }, [sankhyaFiltrado]);

  return (
    <div className="space-y-6">
      {/* SEÇÃO 1 — Notas fiscais do sistema */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Notas fiscais do sistema</h3>
        {loadingNotas ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : notas.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma nota fiscal registrada no sistema para este cliente.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium">Nº Pedido</th>
                    <th className="px-3 py-2 font-medium">Nota Fiscal</th>
                    <th className="px-3 py-2 font-medium text-right">Valor</th>
                    <th className="px-3 py-2 font-medium">Rastreio</th>
                    <th className="px-3 py-2 font-medium">PDF</th>
                    <th className="px-3 py-2 font-medium">Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {notas.map((n) => (
                    <tr key={n.id} className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap">{n.data ? formatDate(n.data) : "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{n.numero_pedido != null ? `#${n.numero_pedido}` : "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{n.nota_fiscal ?? "—"}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{n.total != null ? formatBRL(n.total) : "—"}</td>
                      <td className="px-3 py-2 text-xs">{n.rastreio ?? "—"}</td>
                      <td className="px-3 py-2">
                        {n.nf_pdf_url ? (
                          <Button asChild size="sm" variant="outline" className="h-7 px-2">
                            <a href={n.nf_pdf_url} target="_blank" rel="noopener noreferrer">
                              <FileText className="h-3.5 w-3.5" /> PDF
                            </a>
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs max-w-[200px] truncate" title={n.obs ?? undefined}>{n.obs ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* SEÇÃO 2 — Histórico Sankhya */}
      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold">Histórico Sankhya</h3>
          {codigoParceiro && sankhya.length > 0 && (
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={buscaProduto}
                onChange={(e) => setBuscaProduto(e.target.value)}
                placeholder="Buscar produto..."
                className="pl-8 h-9"
              />
            </div>
          )}
        </div>

        {!codigoParceiro ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Código do parceiro não cadastrado — não é possível carregar o histórico Sankhya.
            </CardContent>
          </Card>
        ) : loadingSankhya ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : sankhya.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhum faturamento Sankhya importado para este cliente.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Total líquido (excl. devoluções)</div>
                <div className="text-lg font-bold mt-0.5">{formatBRL(totalSankhya)}</div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Linhas exibidas</div>
                <div className="text-lg font-bold mt-0.5">{sankhyaFiltrado.length}</div>
              </div>
            </div>
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Data</th>
                      <th className="px-3 py-2 font-medium">Nº Nota</th>
                      <th className="px-3 py-2 font-medium">Produto</th>
                      <th className="px-3 py-2 font-medium text-right">Qtd</th>
                      <th className="px-3 py-2 font-medium text-right">Valor Líquido</th>
                      <th className="px-3 py-2 font-medium text-right">Valor Bruto</th>
                      <th className="px-3 py-2 font-medium">Canal</th>
                      <th className="px-3 py-2 font-medium">Vendedor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sankhyaFiltrado.map((s) => {
                      const isDev = !!(s.tipo_operacao && /devolu/i.test(s.tipo_operacao));
                      return (
                        <tr key={s.id} className={`border-t ${isDev ? "bg-red-50 text-red-700" : ""}`}>
                          <td className="px-3 py-2 whitespace-nowrap">{s.data_faturamento ? formatDate(s.data_faturamento) : "—"}</td>
                          <td className="px-3 py-2 font-mono text-xs">{s.numero_nota}</td>
                          <td className="px-3 py-2 text-xs">{s.descricao_produto ?? s.codigo_produto ?? "—"}</td>
                          <td className="px-3 py-2 text-right">{s.quantidade ?? "—"}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">{s.valor_liquido != null ? formatBRL(s.valor_liquido) : "—"}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">{s.valor_bruto != null ? formatBRL(s.valor_bruto) : "—"}</td>
                          <td className="px-3 py-2">{isDev ? <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300">Devolução</Badge> : canalBadge(s.canal)}</td>
                          <td className="px-3 py-2 text-xs">{s.nome_vendedor ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
