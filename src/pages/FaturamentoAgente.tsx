import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatarMoeda, formatarData } from "@/lib/format";
import { Loader2, FileText, CheckCircle, AlertTriangle } from "lucide-react";

interface ItemPedido {
  id: string;
  sku: string;
  descricao: string;
  quantidade: number;
  quantidade_faturada: number;
  preco_unitario: number;
  desconto_percentual: number;
}

interface Pedido {
  id: string;
  status: string;
  cliente_id: string;
  clientes?: { razao_social: string };
  itens_pedido: ItemPedido[];
}

interface ItensFaturamento {
  item_pedido_id: string;
  sku: string;
  descricao: string;
  quantidade_faturada: number;
  preco_unitario: number;
}

interface ItemFilho {
  sku: string;
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  desconto_percentual: number;
}

export default function Faturamento() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [pedidoSelecionado, setPedidoSelecionado] = useState<Pedido | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [numeroNota, setNumeroNota] = useState("");
  const [dataEmissao, setDataEmissao] = useState("");
  const [arquivoPdf, setArquivoPdf] = useState<File | null>(null);
  const [quantidadesFaturadas, setQuantidadesFaturadas] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(false);

  // Buscar pedidos aguardando faturamento
  const { data: pedidos, isLoading } = useQuery({
    queryKey: ["pedidos-faturamento"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select(
          `id, status, cliente_id,
           clientes(razao_social),
           itens_pedido(id, sku, descricao, quantidade, quantidade_faturada, preco_unitario, desconto_percentual)`
        )
        .in("status", ["aguardando_faturamento", "faturado_parcial"])
        .order("criado_em", { ascending: false });

      if (error) throw error;
      return data as Pedido[];
    },
  });

  const abrirDialog = (pedido: Pedido) => {
    setPedidoSelecionado(pedido);
    setNumeroNota("");
    setDataEmissao("");
    setArquivoPdf(null);
    // Inicializar quantidades com saldo disponível
    const qtds: Record<string, number> = {};
    pedido.itens_pedido?.forEach((item) => {
      const saldo = item.quantidade - (item.quantidade_faturada ?? 0);
      qtds[item.id] = saldo > 0 ? saldo : 0;
    });
    setQuantidadesFaturadas(qtds);
    setDialogAberto(true);
  };

  const fecharDialog = () => {
    setDialogAberto(false);
    setPedidoSelecionado(null);
  };

  /**
   * Confirma o faturamento de forma atômica via Edge Function.
   * O upload do PDF é feito ANTES de chamar a transação no banco,
   * pois o storage não participa de transações Postgres.
   * Se o upload falhar, nada é gravado no banco.
   * Se a Edge Function falhar, o PDF já foi carregado — mas sem registro
   * no banco ele fica como orphan e pode ser limpo por job de manutenção.
   * Isso é muito preferível ao inverso (banco inconsistente).
   */
  const confirmarFaturamento = async () => {
    if (!pedidoSelecionado) return;

    if (!numeroNota.trim()) {
      toast({ title: "Número da nota obrigatório", variant: "destructive" });
      return;
    }
    if (!dataEmissao) {
      toast({ title: "Data de emissão obrigatória", variant: "destructive" });
      return;
    }

    const itensParaFaturar = pedidoSelecionado.itens_pedido?.filter(
      (item) => (quantidadesFaturadas[item.id] ?? 0) > 0
    );

    if (!itensParaFaturar?.length) {
      toast({
        title: "Nenhum item para faturar",
        description: "Informe ao menos uma quantidade maior que zero.",
        variant: "destructive",
      });
      return;
    }

    setCarregando(true);
    try {
      // ── Passo 1: Upload do PDF (fora da transação DB) ──
      let pdfUrl: string | null = null;
      if (arquivoPdf) {
        const nomeArquivo = `faturamentos/${pedidoSelecionado.id}/${Date.now()}_${arquivoPdf.name}`;
        const { error: uploadError } = await supabase.storage
          .from("documentos")
          .upload(nomeArquivo, arquivoPdf, { upsert: false });

        if (uploadError) {
          throw new Error(`Falha no upload do PDF: ${uploadError.message}`);
        }

        const { data: urlData } = supabase.storage
          .from("documentos")
          .getPublicUrl(nomeArquivo);
        pdfUrl = urlData.publicUrl;
      }

      // ── Passo 2: Montar payload ──
      const valorTotal = itensParaFaturar.reduce((acc, item) => {
        const qtd = quantidadesFaturadas[item.id] ?? 0;
        const desconto = item.desconto_percentual ?? 0;
        return acc + qtd * item.preco_unitario * (1 - desconto / 100);
      }, 0);

      const itens: ItensFaturamento[] = itensParaFaturar.map((item) => ({
        item_pedido_id: item.id,
        sku: item.sku,
        descricao: item.descricao,
        quantidade_faturada: quantidadesFaturadas[item.id],
        preco_unitario: item.preco_unitario,
      }));

      // Calcular itens com saldo para pedido filho
      const itensFilho: ItemFilho[] = (pedidoSelecionado.itens_pedido ?? []).reduce<ItemFilho[]>(
        (acc, item) => {
          const jaFaturado = (item.quantidade_faturada ?? 0) + (quantidadesFaturadas[item.id] ?? 0);
          const saldo = item.quantidade - jaFaturado;
          if (saldo > 0) {
            acc.push({
              sku: item.sku,
              descricao: item.descricao,
              quantidade: saldo,
              preco_unitario: item.preco_unitario,
              desconto_percentual: item.desconto_percentual ?? 0,
            });
          }
          return acc;
        },
        []
      );

      const criarPedidoFilho = itensFilho.length > 0;

      // ── Passo 3: Chamar Edge Function (transação atômica no banco) ──
      const { data: sessao } = await supabase.auth.getSession();
      const token = sessao?.session?.access_token;

      const { data: funcData, error: funcError } = await supabase.functions.invoke(
        "confirmar-faturamento",
        {
          body: {
            pedido_id: pedidoSelecionado.id,
            numero_nota: numeroNota.trim(),
            data_emissao: dataEmissao,
            valor_total: valorTotal,
            pdf_url: pdfUrl,
            itens,
            criar_pedido_filho: criarPedidoFilho,
            itens_filho: itensFilho,
          },
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      );

      if (funcError) {
        throw new Error(funcError.message ?? "Erro ao confirmar faturamento");
      }

      if (funcData?.error) {
        throw new Error(funcData.error);
      }

      toast({
        title: "Faturamento confirmado!",
        description: criarPedidoFilho
          ? "Pedido faturado parcialmente. Um pedido filho foi criado com o saldo restante."
          : "Pedido faturado com sucesso.",
      });

      queryClient.invalidateQueries({ queryKey: ["pedidos-faturamento"] });
      fecharDialog();
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : "Erro desconhecido";
      toast({
        title: "Erro ao confirmar faturamento",
        description: mensagem,
        variant: "destructive",
      });
    } finally {
      setCarregando(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <FileText className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Faturamento</h1>
      </div>

      {!pedidos?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mb-4" />
            <p className="text-lg font-medium">Nenhum pedido aguardando faturamento</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pedidos.map((pedido) => (
            <Card key={pedido.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {pedido.clientes?.razao_social ?? "Cliente não informado"}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        pedido.status === "faturado_parcial" ? "secondary" : "default"
                      }
                    >
                      {pedido.status === "faturado_parcial"
                        ? "Faturamento parcial"
                        : "Aguardando faturamento"}
                    </Badge>
                    <Button size="sm" onClick={() => abrirDialog(pedido)}>
                      Faturar
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{pedido.id}</p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">Faturado</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="text-right">Preço Unit.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pedido.itens_pedido?.map((item) => {
                      const saldo =
                        item.quantidade - (item.quantidade_faturada ?? 0);
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-xs">
                            {item.sku}
                          </TableCell>
                          <TableCell>{item.descricao}</TableCell>
                          <TableCell className="text-right">
                            {item.quantidade}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.quantidade_faturada ?? 0}
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={
                                saldo > 0
                                  ? "text-amber-600 font-medium"
                                  : "text-green-600"
                              }
                            >
                              {saldo}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatarMoeda(item.preco_unitario)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de confirmação de faturamento */}
      <Dialog open={dialogAberto} onOpenChange={(open) => !open && fecharDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Confirmar Faturamento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="numero-nota">Número da Nota *</Label>
                <Input
                  id="numero-nota"
                  placeholder="Ex.: 123456"
                  value={numeroNota}
                  onChange={(e) => setNumeroNota(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="data-emissao">Data de Emissão *</Label>
                <Input
                  id="data-emissao"
                  type="date"
                  value={dataEmissao}
                  onChange={(e) => setDataEmissao(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="pdf-nota">PDF da Nota (opcional)</Label>
              <Input
                id="pdf-nota"
                type="file"
                accept="application/pdf"
                onChange={(e) => setArquivoPdf(e.target.files?.[0] ?? null)}
              />
            </div>

            <Separator />

            <div>
              <p className="text-sm font-medium mb-2">Quantidades a faturar</p>
              {pedidoSelecionado?.status === "faturado_parcial" && (
                <div className="flex items-center gap-2 text-amber-600 text-sm mb-3">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Este pedido possui faturamento parcial anterior.</span>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="text-right">Qtd. a faturar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pedidoSelecionado?.itens_pedido?.map((item) => {
                    const saldo =
                      item.quantidade - (item.quantidade_faturada ?? 0);
                    if (saldo <= 0) return null;
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">
                          {item.sku}
                        </TableCell>
                        <TableCell>{item.descricao}</TableCell>
                        <TableCell className="text-right">{saldo}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            max={saldo}
                            className="w-24 text-right"
                            value={quantidadesFaturadas[item.id] ?? 0}
                            onChange={(e) =>
                              setQuantidadesFaturadas((prev) => ({
                                ...prev,
                                [item.id]: Math.min(
                                  Number(e.target.value),
                                  saldo
                                ),
                              }))
                            }
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Resumo do valor */}
            {pedidoSelecionado && (
              <div className="bg-muted rounded-md p-3 text-sm">
                <div className="flex justify-between font-medium">
                  <span>Total a faturar:</span>
                  <span>
                    {formatarMoeda(
                      (pedidoSelecionado.itens_pedido ?? []).reduce((acc, item) => {
                        const qtd = quantidadesFaturadas[item.id] ?? 0;
                        const desconto = item.desconto_percentual ?? 0;
                        return (
                          acc + qtd * item.preco_unitario * (1 - desconto / 100)
                        );
                      }, 0)
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={fecharDialog} disabled={carregando}>
              Cancelar
            </Button>
            <Button onClick={confirmarFaturamento} disabled={carregando}>
              {carregando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar faturamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
