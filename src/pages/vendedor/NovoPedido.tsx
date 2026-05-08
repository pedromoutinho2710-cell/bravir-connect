import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNovoPedido } from "@/hooks/useNovoPedido";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileDown, Eye, Send, Loader2, Save, CalendarRange, RotateCcw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatBRL, formatCNPJ, formatCEP } from "@/lib/format";
import { SecaoCliente } from "@/components/pedido/SecaoCliente";
import { SecaoProdutos, type ItemPedido } from "@/components/pedido/SecaoProdutos";
import { ResumoFinanceiro } from "@/components/pedido/ResumoFinanceiro";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export default function NovoPedido() {
  const { user } = useAuth();
  const location = useLocation();

  const [pedidoMinimo, setPedidoMinimo] = useState(5000);
  const [pedidoMinimoLoading, setPedidoMinimoLoading] = useState(true);

  const {
    cliente, setCliente,
    itens, setItens,
    vigenciaId, setVigenciaId,
    setPedidoId,
    previewOpen, setPreviewOpen,
    showLimpar, setShowLimpar,
    produtos,
    descontos,
    vigencias,
    loading: hookLoading,
    enviando,
    salvandoRascunho,
    camposObrigatoriosOk,
    podeSalvar,
    podeEnviar,
    totalGeral,
    descontoLivre,
    onEnviarFaturamento,
    salvarRascunhoManual,
    limparPedido,
    baixarPDF,
  } = useNovoPedido({ variant: "vendedor", navigateAfterEnviar: "/meus-pedidos" });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("pedido_minimo").eq("id", user.id).single();
      if (data?.pedido_minimo) setPedidoMinimo(data.pedido_minimo);
      setPedidoMinimoLoading(false);
    })();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hookLoading) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fc = (location.state as any)?.fromCliente;
    if (!fc) return;
    setCliente((c) => ({
      ...c,
      cliente_id: fc.cliente_id ?? undefined,
      cnpj: formatCNPJ(fc.cnpj ?? ""),
      razao_social: fc.razao_social ?? "",
      cidade: fc.cidade ?? "",
      uf: fc.uf ?? "",
      cep: fc.cep ? formatCEP(fc.cep) : "",
      comprador: fc.comprador ?? "",
      cluster: fc.cluster ?? "",
      tabela_preco: fc.tabela_preco ?? "",
    }));
  }, [hookLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hookLoading) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pedidoId = (location.state as any)?.pedidoId;
    if (!pedidoId) return;

    (async () => {
      const { data: ped } = await supabase
        .from("pedidos")
        .select("*, clientes(*), itens_pedido(*, produtos(*))")
        .eq("id", pedidoId)
        .single();
      if (!ped) return;

      const cl = ped.clientes as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      setCliente((c) => ({
        ...c,
        cliente_id: cl.id,
        cnpj: formatCNPJ(cl.cnpj ?? ""),
        razao_social: cl.razao_social ?? "",
        cidade: cl.cidade ?? "",
        uf: cl.uf ?? "",
        cep: cl.cep ? formatCEP(cl.cep) : "",
        comprador: ped.perfil_cliente ?? cl.comprador ?? "",
        cluster: cl.cluster ?? "",
        tabela_preco: cl.tabela_preco ?? "",
        cond_pagamento: ped.cond_pagamento ?? "",
        observacoes: ped.observacoes ?? "",
        agendamento: ped.agendamento ?? false,
        codigo_cliente: cl.codigo_parceiro ?? cl.codigo_cliente ?? "",
        aceita_saldo: cl.aceita_saldo ?? true,
        email_xml: cl.email ?? "",
        tipo: ped.tipo ?? "Pedido",
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itensRestaurados = ((ped.itens_pedido ?? []) as any[]).map((i) => ({
        produto_id: i.produto_id,
        codigo: i.produtos?.codigo_jiva ?? "",
        nome: i.produtos?.nome ?? "",
        marca: i.produtos?.marca ?? "",
        cx_embarque: i.produtos?.cx_embarque ?? 1,
        peso_unitario: Number(i.produtos?.peso_unitario ?? 0),
        quantidade: i.quantidade,
        preco_bruto: Number(i.preco_unitario_bruto),
        desconto_perfil: Number(i.desconto_perfil),
        desconto_comercial: Number(i.desconto_comercial),
        desconto_trade: Number(i.desconto_trade),
        preco_apos_perfil: Number(i.preco_apos_perfil),
        preco_apos_comercial: Number(i.preco_apos_comercial),
        preco_final: Number(i.preco_final),
        total: Number(i.total_item),
        bolsao: 0,
      }));
      setItens(itensRestaurados);

      setPedidoId(pedidoId);
      if (ped.vigencia_id) setVigenciaId(ped.vigencia_id);
    })();
  }, [hookLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const atingiuMinimo = totalGeral >= pedidoMinimo;
  const progresso = pedidoMinimo > 0 ? Math.min(100, (totalGeral / pedidoMinimo) * 100) : 100;
  const progressoColor = progresso >= 100 ? "bg-green-500" : progresso >= 70 ? "bg-yellow-400" : "bg-red-500";
  const progressoTextColor = progresso >= 100 ? "text-green-700" : progresso >= 70 ? "text-yellow-700" : "text-red-600";

  if (hookLoading || pedidoMinimoLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Novo Pedido</h1>
          <p className="text-sm text-muted-foreground">
            Preencha os dados do cliente, adicione produtos e envie para faturamento
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowLimpar(true)}
          disabled={itens.length === 0 && !cliente.razao_social}
          className="shrink-0"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Limpar pedido
        </Button>
      </div>

      <SecaoCliente value={cliente} onChange={setCliente} vendedorId={user?.id ?? ""} />

      {/* Seletor de vigência de preços — sempre visível após carregar */}
      <Card className="border-violet-200 bg-violet-50/40">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-4">
            <CalendarRange className="h-4 w-4 text-violet-600 shrink-0" />
            <Label className="font-semibold text-sm shrink-0">Tabela de preços</Label>
            {vigencias.length > 0 ? (
              <Select value={vigenciaId} onValueChange={setVigenciaId}>
                <SelectTrigger className="max-w-xs">
                  <SelectValue placeholder="Selecione a vigência" />
                </SelectTrigger>
                <SelectContent>
                  {vigencias.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-sm text-amber-700 font-medium">
                Nenhuma tabela de preços ativa. Cadastre uma em Administração → Tabelas de Preço.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <SecaoProdutos
        produtos={produtos}
        descontos={descontos}
        tabelaPreco={cliente.tabela_preco}
        perfilCliente={cliente.cluster}
        itens={itens}
        onChange={setItens}
        vendedorEmail={user?.email ?? ""}
        vigenciaId={vigenciaId}
        descontoLivre={descontoLivre}
        bloqueado={!camposObrigatoriosOk}
      />

      <ResumoFinanceiro itens={itens} uf={cliente.uf} />

      {/* Barra de pedido mínimo + ações — sticky no rodapé */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t z-10 -mx-4 px-4 py-3 space-y-3">
        {/* Progresso */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Pedido mínimo: {formatBRL(pedidoMinimo)}</span>
            <span className={`font-semibold ${progressoTextColor}`}>
              {formatBRL(totalGeral)}
              {!atingiuMinimo && ` — faltam ${formatBRL(pedidoMinimo - totalGeral)}`}
              {atingiuMinimo && " ✓"}
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${progressoColor}`}
              style={{ width: `${progresso}%` }}
            />
          </div>
        </div>

        {/* Botões */}
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="outline" onClick={() => setPreviewOpen(true)} disabled={itens.length === 0}>
            <Eye className="h-4 w-4" />
            Visualizar resumo
          </Button>
          <Button variant="outline" onClick={baixarPDF} disabled={itens.length === 0}>
            <FileDown className="h-4 w-4" />
            Baixar PDF
          </Button>
          <Button variant="outline" onClick={salvarRascunhoManual} disabled={!podeSalvar || salvandoRascunho}>
            {salvandoRascunho ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Rascunho
          </Button>
          <Button onClick={onEnviarFaturamento} disabled={!(podeEnviar && atingiuMinimo) || enviando}>
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar para faturamento
          </Button>
        </div>
      </div>

      {/* Modal: visualizar resumo */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Resumo do pedido</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div>
              <div className="font-semibold">{cliente.razao_social || "—"}</div>
              <div className="text-muted-foreground">
                CNPJ {cliente.cnpj} • {cliente.cidade || "—"}/{cliente.uf || "—"}
              </div>
              <div className="text-muted-foreground">
                {cliente.tipo} • Tabela {cliente.tabela_preco} • {cliente.cluster}
              </div>
            </div>
            {Object.entries(
              itens.reduce<Record<string, ItemPedido[]>>((a, i) => {
                (a[i.marca] ||= []).push(i);
                return a;
              }, {}),
            ).map(([marca, lista]) => {
              const sub = lista.reduce((s, i) => s + i.total, 0);
              return (
                <div key={marca} className="rounded-md border">
                  <div className="bg-primary text-primary-foreground px-3 py-1.5 text-sm font-bold">
                    {marca}
                  </div>
                  <table className="w-full text-xs">
                    <tbody>
                      {lista.map((i) => (
                        <tr key={i.produto_id} className="border-b last:border-0">
                          <td className="px-3 py-1.5">
                            <span className="font-mono text-muted-foreground">{i.codigo}</span>{" "}
                            {i.nome}
                          </td>
                          <td className="px-3 py-1.5 text-right">{i.quantidade}×</td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatBRL(i.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/50">
                        <td colSpan={2} className="px-3 py-1.5 text-right font-semibold">
                          Subtotal
                        </td>
                        <td className="px-3 py-1.5 text-right font-bold">{formatBRL(sub)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })}
            <div className="flex justify-between rounded-md bg-primary/10 p-3 text-base font-bold">
              <span>Total geral</span>
              <span>{formatBRL(totalGeral)}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: confirmar limpeza */}
      <AlertDialog open={showLimpar} onOpenChange={setShowLimpar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os itens e dados do cliente serão removidos. A vigência selecionada será mantida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={limparPedido}
            >
              Limpar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
