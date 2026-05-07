import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNovoPedido } from "@/hooks/useNovoPedido";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { formatBRL, formatCNPJ } from "@/lib/format";
import { SecaoCliente } from "@/components/pedido/SecaoCliente";
import { SecaoProdutos } from "@/components/pedido/SecaoProdutos";
import { ResumoFinanceiro } from "@/components/pedido/ResumoFinanceiro";
import { FileDown, Eye, Send, Loader2, CalendarRange, RotateCcw, Users, Save } from "lucide-react";

type Vendedor = { id: string; nome: string };

export default function NovoPedidoGestora() {
  const { user } = useAuth();

  const [representanteId, setRepresentanteId] = useState("");
  const [representantes, setRepresentantes] = useState<Vendedor[]>([]);
  const [repsLoading, setRepsLoading] = useState(true);

  const representanteNome = representantes.find((r) => r.id === representanteId)?.nome;

  const {
    cliente, setCliente,
    itens, setItens,
    vigenciaId, setVigenciaId,
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
    vendedorDisplayName,
    onEnviarFaturamento,
    salvarRascunhoManual,
    limparPedido,
    baixarPDF,
  } = useNovoPedido({
    variant: "gestora",
    representanteId,
    representanteNome,
    setRepresentanteId,
    navigateAfterEnviar: "/gestora/pedidos",
  });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "vendedor");

      if (rolesData && rolesData.length > 0) {
        const ids = rolesData.map((r) => r.user_id);
        const { data: profData } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ids);
        if (profData) {
          const lista: Vendedor[] = profData
            .map((p) => ({ id: p.id, nome: p.full_name || p.email || "—" }))
            .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
          setRepresentantes(lista);
        }
      }
      setRepsLoading(false);
    })();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (hookLoading || repsLoading) {
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
          <p className="text-sm text-muted-foreground">Cria pedido em nome de um representante — entra direto em faturamento</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowLimpar(true)}
          disabled={itens.length === 0 && !cliente.razao_social}
          className="shrink-0"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Limpar
        </Button>
      </div>

      {/* Seletor de representante */}
      <Card className="border-blue-200 bg-blue-50/40">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-4">
            <Users className="h-4 w-4 text-blue-600 shrink-0" />
            <Label className="font-semibold text-sm shrink-0">Representante</Label>
            <Select value={representanteId} onValueChange={setRepresentanteId}>
              <SelectTrigger className="max-w-xs">
                <SelectValue placeholder="Selecione o representante..." />
              </SelectTrigger>
              <SelectContent>
                {representantes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <SecaoCliente value={cliente} onChange={setCliente} vendedorId={representanteId || (user?.id ?? "")} />

      {/* Seletor de vigência */}
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
                Nenhuma tabela de preços ativa.
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
        vendedorEmail={vendedorDisplayName}
        vigenciaId={vigenciaId}
        descontoLivre={descontoLivre}
        bloqueado={!camposObrigatoriosOk}
      />

      <ResumoFinanceiro itens={itens} uf={cliente.uf} />

      {/* Barra de ações */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t z-10 -mx-4 px-4 py-3">
        <div className="flex flex-wrap gap-2 justify-between items-center">
          <span className="text-sm font-semibold">
            Total: <span className="text-primary">{formatBRL(totalGeral)}</span>
          </span>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPreviewOpen(true)} disabled={itens.length === 0}>
              <Eye className="h-4 w-4" />
              Visualizar
            </Button>
            <Button variant="outline" onClick={baixarPDF} disabled={itens.length === 0}>
              <FileDown className="h-4 w-4" />
              PDF
            </Button>
            <Button variant="outline" onClick={salvarRascunhoManual} disabled={!podeSalvar || salvandoRascunho}>
              {salvandoRascunho ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar Rascunho
            </Button>
            <Button onClick={onEnviarFaturamento} disabled={!podeEnviar || enviando}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar para faturamento
            </Button>
          </div>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Resumo do Pedido</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div><strong>Representante:</strong> {representantes.find((r) => r.id === representanteId)?.nome ?? "—"}</div>
            <div><strong>Cliente:</strong> {cliente.razao_social} — {formatCNPJ(cliente.cnpj)}</div>
            <div><strong>Cluster:</strong> {cliente.cluster} | <strong>Tabela:</strong> {cliente.tabela_preco}</div>
            <div><strong>Total:</strong> {formatBRL(totalGeral)}</div>
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left">Produto</th>
                    <th className="p-2 text-right">Qtd</th>
                    <th className="p-2 text-right">Preço final</th>
                    <th className="p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((i) => (
                    <tr key={i.produto_id} className="border-t">
                      <td className="p-2">{i.nome}</td>
                      <td className="p-2 text-right">{i.quantidade}</td>
                      <td className="p-2 text-right">{formatBRL(i.preco_final)}</td>
                      <td className="p-2 text-right">{formatBRL(i.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog — Limpar */}
      <AlertDialog open={showLimpar} onOpenChange={setShowLimpar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os dados do pedido atual serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={limparPedido}>Limpar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
