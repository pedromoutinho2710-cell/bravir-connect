import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, ArrowLeft, Save } from "lucide-react";
import { formatBRL, formatCNPJ } from "@/lib/format";

type ItemEdit = {
  id: string;
  produto_id: string;
  nome: string;
  codigo: string;
  marca: string;
  cx_embarque: number;
  peso_unitario: number;
  quantidade: number;
  preco_bruto: number;
  desconto_perfil: number;
  desconto_comercial: number;
  desconto_trade: number;
  preco_final: number;
  total: number;
};

type PedidoEdit = {
  id: string;
  numero_pedido: number;
  status: string;
  tipo: string;
  cond_pagamento: string;
  observacoes: string;
  agendamento: boolean;
  cliente_id: string | null;
  razao_social: string;
  cnpj: string;
  cidade: string;
  uf: string;
  comprador: string;
  codigo_cliente: string;
  email_xml: string;
  cluster: string;
  tabela_preco: string;
  itens: ItemEdit[];
};

function recalcularItem(item: ItemEdit): ItemEdit {
  const preco_apos_perfil = item.preco_bruto * (1 - item.desconto_perfil);
  const preco_apos_comercial = preco_apos_perfil * (1 - item.desconto_comercial / 100);
  const preco_final = preco_apos_comercial * (1 - item.desconto_trade / 100);
  const total = preco_final * item.quantidade;
  return { ...item, preco_final, total };
}

export default function EditarPedidoFaturamento() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [pedido, setPedido] = useState<PedidoEdit | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("pedidos")
        .select(`
          id, numero_pedido, status, tipo, cond_pagamento, observacoes, agendamento,
          cliente_id, perfil_cliente, tabela_preco,
          clientes(razao_social, cnpj, cidade, uf, comprador, codigo_parceiro, codigo_cliente, email),
          itens_pedido(
            id, produto_id, quantidade,
            preco_unitario_bruto, desconto_perfil, desconto_comercial, desconto_trade,
            preco_final, total_item,
            produtos(id, nome, codigo_jiva, marca, cx_embarque, peso_unitario)
          )
        `)
        .eq("id", id)
        .maybeSingle();

      if (error || !data) {
        toast.error("Pedido não encontrado");
        navigate("/faturamento");
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = data as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cl = p.clientes as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itensList = (p.itens_pedido ?? []) as any[];

      setPedido({
        id: p.id,
        numero_pedido: p.numero_pedido,
        status: p.status,
        tipo: p.tipo ?? "Pedido",
        cond_pagamento: p.cond_pagamento ?? "",
        observacoes: p.observacoes ?? "",
        agendamento: p.agendamento ?? false,
        cliente_id: p.cliente_id ?? null,
        razao_social: cl?.razao_social ?? "—",
        cnpj: cl?.cnpj ?? "",
        cidade: cl?.cidade ?? "",
        uf: cl?.uf ?? "",
        comprador: cl?.comprador ?? "",
        codigo_cliente: cl?.codigo_parceiro ?? cl?.codigo_cliente ?? "",
        email_xml: cl?.email ?? "",
        cluster: p.perfil_cliente ?? "",
        tabela_preco: p.tabela_preco ?? "",
        itens: itensList.map((i) => ({
          id: i.id,
          produto_id: i.produto_id,
          nome: i.produtos?.nome ?? "—",
          codigo: i.produtos?.codigo_jiva ?? "—",
          marca: i.produtos?.marca ?? "—",
          cx_embarque: Number(i.produtos?.cx_embarque ?? 1),
          peso_unitario: Number(i.produtos?.peso_unitario ?? 0),
          quantidade: Number(i.quantidade),
          preco_bruto: Number(i.preco_unitario_bruto ?? 0),
          desconto_perfil: Number(i.desconto_perfil ?? 0),
          desconto_comercial: Number(i.desconto_comercial ?? 0),
          desconto_trade: Number(i.desconto_trade ?? 0),
          preco_final: Number(i.preco_final ?? 0),
          total: Number(i.total_item ?? 0),
        })),
      });

      setLoading(false);
    })();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function atualizarItem(index: number, campo: keyof ItemEdit, valor: number) {
    if (!pedido) return;
    const novosItens = pedido.itens.map((item, i) => {
      if (i !== index) return item;
      return recalcularItem({ ...item, [campo]: valor });
    });
    setPedido({ ...pedido, itens: novosItens });
  }

  const salvar = async () => {
    if (!pedido) return;
    setSalvando(true);

    const { error: pedErr } = await supabase
      .from("pedidos")
      .update({
        tipo: pedido.tipo,
        cond_pagamento: pedido.cond_pagamento || null,
        observacoes: pedido.observacoes || null,
        agendamento: pedido.agendamento,
      })
      .eq("id", pedido.id);

    if (pedErr) {
      toast.error("Erro ao atualizar pedido: " + pedErr.message);
      setSalvando(false);
      return;
    }

    for (const item of pedido.itens) {
      const { error: itemErr } = await supabase
        .from("itens_pedido")
        .update({
          quantidade: item.quantidade,
          preco_unitario_bruto: item.preco_bruto,
          desconto_perfil: item.desconto_perfil,
          desconto_comercial: item.desconto_comercial,
          desconto_trade: item.desconto_trade,
          preco_final: item.preco_final,
          preco_unitario_liquido: item.preco_final,
          total_item: item.total,
        })
        .eq("id", item.id);

      if (itemErr) {
        toast.error("Erro ao atualizar item: " + itemErr.message);
        setSalvando(false);
        return;
      }
    }

    toast.success("Pedido atualizado!");
    navigate("/faturamento");
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!pedido) return null;

  const totalGeral = pedido.itens.reduce((s, i) => s + i.total, 0);

  return (
    <div className="space-y-6 pb-32">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => navigate("/faturamento")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>
        <h1 className="text-2xl font-bold">Editar Pedido #{pedido.numero_pedido}</h1>
      </div>

      {/* Dados do cliente — somente leitura */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dados do cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
            <div><span className="text-muted-foreground">Razão Social:</span> <span className="font-medium">{pedido.razao_social}</span></div>
            <div><span className="text-muted-foreground">CNPJ:</span> {pedido.cnpj ? formatCNPJ(pedido.cnpj) : "—"}</div>
            <div><span className="text-muted-foreground">Cidade/UF:</span> {[pedido.cidade, pedido.uf].filter(Boolean).join(" / ") || "—"}</div>
            <div><span className="text-muted-foreground">Comprador:</span> {pedido.comprador || "—"}</div>
            <div><span className="text-muted-foreground">Cluster:</span> {pedido.cluster || "—"}</div>
            <div><span className="text-muted-foreground">Tabela de preço:</span> {pedido.tabela_preco || "—"}</div>
            {pedido.codigo_cliente && (
              <div><span className="text-muted-foreground">Código Sankhya:</span> {pedido.codigo_cliente}</div>
            )}
            {pedido.email_xml && (
              <div className="col-span-2"><span className="text-muted-foreground">Email XML:</span> {pedido.email_xml}</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dados do pedido — editável */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dados do pedido</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={pedido.tipo} onValueChange={(v) => setPedido({ ...pedido, tipo: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pedido">Pedido</SelectItem>
                  <SelectItem value="Bonificação">Bonificação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Condição de pagamento</Label>
              <Input
                value={pedido.cond_pagamento}
                onChange={(e) => setPedido({ ...pedido, cond_pagamento: e.target.value })}
                placeholder="Ex: 30/60/90 DDL"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="agendamento"
              checked={pedido.agendamento}
              onCheckedChange={(v) => setPedido({ ...pedido, agendamento: v })}
            />
            <Label htmlFor="agendamento" className="cursor-pointer">Agendamento</Label>
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea
              rows={3}
              value={pedido.observacoes}
              onChange={(e) => setPedido({ ...pedido, observacoes: e.target.value })}
              placeholder="Informações adicionais…"
            />
          </div>
        </CardContent>
      </Card>

      {/* Produtos — editável */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Produtos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-2 font-medium">Produto</th>
                  <th className="text-center px-3 py-2 font-medium w-24">Qtd</th>
                  <th className="text-center px-3 py-2 font-medium w-32">Desc. Cluster%</th>
                  <th className="text-center px-3 py-2 font-medium w-32">Desc. Comercial%</th>
                  <th className="text-center px-3 py-2 font-medium w-28">Desc. Trade%</th>
                  <th className="text-right px-3 py-2 font-medium w-28">Preço Final</th>
                  <th className="text-right px-4 py-2 font-medium w-28">Total</th>
                </tr>
              </thead>
              <tbody>
                {pedido.itens.map((item, idx) => (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <div className="font-medium">{item.nome}</div>
                      <div className="text-xs text-muted-foreground font-mono">{item.codigo} · {item.marca}</div>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={1}
                        value={item.quantidade}
                        onChange={(e) => atualizarItem(idx, "quantidade", Math.max(1, Number(e.target.value) || 1))}
                        className="h-7 w-20 text-sm text-center mx-auto block"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        value={+(item.desconto_perfil * 100).toFixed(4)}
                        onChange={(e) => atualizarItem(idx, "desconto_perfil", (Number(e.target.value) || 0) / 100)}
                        className="h-7 w-24 text-sm text-center mx-auto block"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={item.desconto_comercial}
                        onChange={(e) => atualizarItem(idx, "desconto_comercial", Number(e.target.value) || 0)}
                        className="h-7 w-24 text-sm text-center mx-auto block"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={item.desconto_trade}
                        onChange={(e) => atualizarItem(idx, "desconto_trade", Number(e.target.value) || 0)}
                        className="h-7 w-24 text-sm text-center mx-auto block"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{formatBRL(item.preco_final)}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatBRL(item.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30">
                  <td colSpan={6} className="px-4 py-2 text-right text-sm font-semibold">Total geral</td>
                  <td className="px-4 py-2 text-right font-bold text-green-700">{formatBRL(totalGeral)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Footer sticky */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t z-10 -mx-4 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <span className="font-semibold text-lg">{formatBRL(totalGeral)}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/faturamento")}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar alterações
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
