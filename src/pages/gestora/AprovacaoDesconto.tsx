import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { formatBRL } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, CheckCircle, XCircle, Percent } from "lucide-react";
import { toast } from "sonner";

type ItemComDesconto = {
  produto_id: string;
  nome: string;
  codigo: string;
  quantidade: number;
  preco_bruto: number;
  desconto_perfil: number;
  desconto_comercial: number;
  preco_final: number;
  total_item: number;
};

type PedidoAprovacao = {
  id: string;
  numero_pedido: number;
  cliente_nome: string;
  vendedor_nome: string;
  total: number;
  created_at: string;
  itens: ItemComDesconto[];
};

export default function AprovacaoDesconto() {
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState<PedidoAprovacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState<string | null>(null);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("pedidos")
      .select(`
        id, numero_pedido, created_at, vendedor_id,
        clientes(razao_social, nome_parceiro),
        itens_pedido(produto_id, quantidade, preco_unitario_bruto, desconto_perfil, desconto_comercial, preco_final, total_item, produtos(nome, codigo_jiva))
      `)
      .eq("status", "aguardando_aprovacao_desconto")
      .order("created_at", { ascending: true });

    if (error) { toast.error("Erro ao carregar pedidos"); setLoading(false); return; }

    // Busca nomes dos vendedores separadamente (pedidos não tem FK formal p/ profiles)
    const vendedorIds = [...new Set((data ?? []).map((p: any) => p.vendedor_id).filter(Boolean))];
    const nomesPorId: Record<string, string> = {};
    if (vendedorIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", vendedorIds);
      (profs ?? []).forEach((pr: any) => { nomesPorId[pr.id] = pr.full_name; });
    }

    const lista: PedidoAprovacao[] = (data ?? []).map((p: any) => ({
      id: p.id,
      numero_pedido: p.numero_pedido,
      cliente_nome: p.clientes?.nome_parceiro || p.clientes?.razao_social || "—",
      vendedor_nome: (p.vendedor_id && nomesPorId[p.vendedor_id]) || "—",
      created_at: p.created_at,
      total: (p.itens_pedido ?? []).reduce((s: number, i: any) => s + Number(i.total_item ?? 0), 0),
      itens: (p.itens_pedido ?? [])
        .filter((i: any) => Number(i.desconto_comercial ?? 0) > 0)
        .map((i: any) => ({
          produto_id: i.produto_id,
          nome: i.produtos?.nome ?? "—",
          codigo: i.produtos?.codigo_jiva ?? "—",
          quantidade: i.quantidade,
          preco_bruto: Number(i.preco_unitario_bruto ?? 0),
          desconto_perfil: Number(i.desconto_perfil ?? 0) * 100,
          desconto_comercial: Number(i.desconto_comercial ?? 0),
          preco_final: Number(i.preco_final ?? 0),
          total_item: Number(i.total_item ?? 0),
        })),
    }));
    setPedidos(lista);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const aprovar = async (pedidoId: string, numeroPedido: number) => {
    setProcessando(pedidoId);
    const { error } = await supabase
      .from("pedidos")
      .update({ status: "aguardando_faturamento", data_pedido: new Date().toISOString().slice(0, 10) })
      .eq("id", pedidoId);
    if (error) { toast.error("Erro ao aprovar: " + error.message); setProcessando(null); return; }
    toast.success(`Pedido #${numeroPedido} aprovado e enviado para faturamento!`);
    setPedidos((prev) => prev.filter((p) => p.id !== pedidoId));
    setProcessando(null);
  };

  const reprovar = async (pedidoId: string, numeroPedido: number) => {
    setProcessando(pedidoId);
    const { error } = await supabase
      .from("pedidos")
      .update({ status: "rascunho" })
      .eq("id", pedidoId);
    if (error) { toast.error("Erro ao reprovar: " + error.message); setProcessando(null); return; }
    toast.info(`Pedido #${numeroPedido} reprovado e devolvido ao vendedor.`);
    setPedidos((prev) => prev.filter((p) => p.id !== pedidoId));
    setProcessando(null);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Percent className="h-6 w-6" /> Aprovação de Desconto Comercial</h1>
        <p className="text-sm text-muted-foreground">Pedidos aguardando aprovação de desconto comercial (% além do cluster)</p>
      </div>

      {pedidos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            Nenhum pedido aguardando aprovação de desconto.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pedidos.map((p) => (
            <Card key={p.id} className="border-purple-200 bg-purple-50/30">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Badge variant="outline" className="font-mono">#{p.numero_pedido}</Badge>
                      {p.cliente_nome}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Vendedor: <strong>{p.vendedor_nome}</strong> · {new Date(p.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <p className="text-sm font-semibold mt-1">Total do pedido: {formatBRL(p.total)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/pedido/${p.id}`)}
                    >
                      Ver pedido completo
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={processando === p.id}
                      onClick={() => reprovar(p.id, p.numero_pedido)}
                    >
                      {processando === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 mr-1" />}
                      Reprovar
                    </Button>
                    <Button
                      size="sm"
                      className="bg-green-700 hover:bg-green-800"
                      disabled={processando === p.id}
                      onClick={() => aprovar(p.id, p.numero_pedido)}
                    >
                      {processando === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                      Aprovar
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {p.itens.length > 0 && (
                <CardContent className="pt-0">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Itens com desconto comercial:</p>
                  <div className="overflow-x-auto rounded border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-purple-100/60">
                          <TableHead className="text-xs">Produto</TableHead>
                          <TableHead className="text-xs text-right">Qtd</TableHead>
                          <TableHead className="text-xs text-right">P. Bruto</TableHead>
                          <TableHead className="text-xs text-right">Desc. Cluster</TableHead>
                          <TableHead className="text-xs text-right text-purple-700 font-bold">Desc. Comercial</TableHead>
                          <TableHead className="text-xs text-right">P. Final</TableHead>
                          <TableHead className="text-xs text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {p.itens.map((it) => (
                          <TableRow key={it.produto_id}>
                            <TableCell className="text-xs">
                              <div className="font-mono text-[10px] text-muted-foreground">{it.codigo}</div>
                              <div>{it.nome}</div>
                            </TableCell>
                            <TableCell className="text-xs text-right">{it.quantidade}</TableCell>
                            <TableCell className="text-xs text-right">{formatBRL(it.preco_bruto)}</TableCell>
                            <TableCell className="text-xs text-right">{it.desconto_perfil.toFixed(2)}%</TableCell>
                            <TableCell className="text-xs text-right font-bold text-purple-700">{it.desconto_comercial.toFixed(2)}%</TableCell>
                            <TableCell className="text-xs text-right">{formatBRL(it.preco_final)}</TableCell>
                            <TableCell className="text-xs text-right font-semibold">{formatBRL(it.total_item)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
