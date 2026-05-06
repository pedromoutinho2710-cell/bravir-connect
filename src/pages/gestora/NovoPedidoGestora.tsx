import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { onlyDigits, formatBRL, formatDate, formatCNPJ, formatCEP } from "@/lib/format";
import { gerarPedidoPDF, type PdfItem } from "@/lib/pdf";
import { gerarPedidoDocx } from "@/lib/docx";
import { SecaoCliente, type DadosCliente } from "@/components/pedido/SecaoCliente";
import { SecaoProdutos, type ItemPedido, type Produto } from "@/components/pedido/SecaoProdutos";
import { ResumoFinanceiro } from "@/components/pedido/ResumoFinanceiro";
import { FileDown, Eye, Send, Loader2, CalendarRange, RotateCcw, Users } from "lucide-react";

type Vendedor = { id: string; nome: string };
type Vigencia = { id: string; nome: string; created_at: string; desconto_livre: boolean };

const initialCliente: DadosCliente = {
  cnpj: "",
  razao_social: "",
  cidade: "",
  uf: "",
  cep: "",
  comprador: "",
  cluster: "",
  tabela_preco: "",
  tipo: "Pedido",
  cond_pagamento: "",
  agendamento: false,
  observacoes: "",
  codigo_cliente: "",
  aceita_saldo: true,
  ordem_compra: "",
  email_xml: "",
};

export default function NovoPedidoGestora() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [representanteId, setRepresentanteId] = useState("");
  const [representantes, setRepresentantes] = useState<Vendedor[]>([]);

  const [cliente, setCliente] = useState<DadosCliente>(initialCliente);
  const [itens, setItens] = useState<ItemPedido[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [descontos, setDescontos] = useState<Record<string, Record<string, number>>>({});
  const [vigencias, setVigencias] = useState<Vigencia[]>([]);
  const [vigenciaId, setVigenciaId] = useState("");
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showLimpar, setShowLimpar] = useState(false);
  const [pedidoId, setPedidoId] = useState<string | null>(null);

  const prevVigenciaRef = useRef<string | null>(null);
  const pedidoEnviadoRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [formRes, dRes, vigRes, rolesRes] = await Promise.all([
        supabase.from("formularios").select("id, formulario_produtos(produto_id)").eq("padrao", true).eq("ativo", true).maybeSingle(),
        supabase.from("descontos").select("*"),
        supabase.from("tabelas_vigencia").select("id, nome, created_at, desconto_livre").eq("ativa", true).order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id").eq("role", "vendedor"),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fpIds: string[] = (formRes.data as any)?.formulario_produtos?.map((fp: { produto_id: string }) => fp.produto_id) ?? [];
      let prodQuery = supabase.from("produtos").select("*").eq("ativo", true).order("marca").order("nome");
      if (fpIds.length > 0) prodQuery = supabase.from("produtos").select("*").in("id", fpIds).order("marca").order("nome");
      const pRes = await prodQuery;
      if (pRes.data) setProdutos(pRes.data as Produto[]);

      if (dRes.data) {
        const map: Record<string, Record<string, number>> = {};
        dRes.data.forEach((d) => { (map[d.produto_id] ||= {})[d.perfil_cliente] = Number(d.percentual_desconto); });
        setDescontos(map);
      }

      if (vigRes.data && vigRes.data.length > 0) {
        setVigencias(vigRes.data as Vigencia[]);
        setVigenciaId(vigRes.data[0].id);
      }

      if (rolesRes.data && rolesRes.data.length > 0) {
        const ids = rolesRes.data.map((r) => r.user_id);
        const profRes = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
        if (profRes.data) {
          const lista: Vendedor[] = profRes.data
            .map((p) => ({ id: p.id, nome: p.full_name || p.email || "—" }))
            .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
          setRepresentantes(lista);
        }
      }

      setLoading(false);
    })();
  }, [user]);

  useEffect(() => {
    if (prevVigenciaRef.current === null) { prevVigenciaRef.current = vigenciaId; return; }
    if (prevVigenciaRef.current === vigenciaId) return;
    prevVigenciaRef.current = vigenciaId;
    if (!vigenciaId) return;
    setItens([]);
    toast.info("Tabela de preços alterada. Os produtos foram removidos.");
  }, [vigenciaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const podeSalvar = useMemo(() => (
    onlyDigits(cliente.cnpj).length === 14 &&
    cliente.razao_social.trim().length > 0 &&
    !!cliente.cluster &&
    !!cliente.tabela_preco &&
    !!representanteId
  ), [cliente, representanteId]);

  const totalGeral = itens.reduce((s, i) => s + i.total, 0);
  const podeEnviar = podeSalvar && itens.length > 0;

  const garantirCliente = async (): Promise<string | null> => {
    if (cliente.cliente_id) return cliente.cliente_id;
    const { data, error } = await supabase
      .from("clientes")
      .upsert(
        {
          cnpj: onlyDigits(cliente.cnpj),
          razao_social: cliente.razao_social,
          cidade: cliente.cidade || null,
          uf: cliente.uf || null,
          cep: onlyDigits(cliente.cep) || null,
          comprador: cliente.comprador || null,
          codigo_cliente: cliente.codigo_cliente || null,
          aceita_saldo: cliente.aceita_saldo,
        },
        { onConflict: "cnpj" },
      )
      .select("id")
      .single();
    if (error) { toast.error("Erro ao salvar cliente: " + error.message); return null; }
    setCliente((c) => ({ ...c, cliente_id: data.id }));
    return data.id;
  };

  const salvarPedido = async (): Promise<string | null> => {
    if (!user || !podeSalvar) return null;
    const cliente_id = await garantirCliente();
    if (!cliente_id) return null;

    const obsCompletas = [
      cliente.ordem_compra ? `OC: ${cliente.ordem_compra}` : "",
      cliente.observacoes,
    ].filter(Boolean).join("\n") || null;

    let id = pedidoId;
    if (id) {
      const { error } = await supabase.from("pedidos").update({
        tipo: cliente.tipo,
        cliente_id,
        perfil_cliente: cliente.cluster,
        tabela_preco: cliente.tabela_preco,
        cond_pagamento: cliente.cond_pagamento || null,
        agendamento: cliente.agendamento,
        observacoes: obsCompletas,
        vigencia_id: vigenciaId || null,
        status: "aguardando_faturamento",
        vendedor_id: representanteId,
      }).eq("id", id);
      if (error) { toast.error("Erro ao atualizar: " + error.message); return null; }
    } else {
      const { data, error } = await supabase.from("pedidos").insert({
        tipo: cliente.tipo,
        vendedor_id: representanteId,
        cliente_id,
        perfil_cliente: cliente.cluster,
        tabela_preco: cliente.tabela_preco,
        cond_pagamento: cliente.cond_pagamento || null,
        agendamento: cliente.agendamento,
        observacoes: obsCompletas,
        vigencia_id: vigenciaId || null,
        status: "aguardando_faturamento",
      }).select("id").single();
      if (error) { toast.error("Erro ao criar pedido: " + error.message); return null; }
      id = data.id;
      setPedidoId(id);
    }

    await supabase.from("itens_pedido").delete().eq("pedido_id", id);

    if (itens.length > 0) {
      const itemsPayload = itens.map((i) => ({
        pedido_id: id,
        produto_id: i.produto_id,
        quantidade: i.quantidade,
        preco_unitario_bruto: i.preco_bruto,
        preco_unitario_liquido: i.preco_final,
        desconto_comercial: i.desconto_comercial,
        desconto_trade: i.desconto_trade,
        desconto_perfil: i.desconto_perfil,
        preco_apos_perfil: i.preco_apos_perfil,
        preco_apos_comercial: i.preco_apos_comercial,
        preco_final: i.preco_final,
        total_item: i.total,
      }));
      const { error } = await supabase.from("itens_pedido").upsert(itemsPayload, { onConflict: "pedido_id,produto_id" });
      if (error) { toast.error("Erro ao salvar itens: " + error.message); return null; }
    }
    return id;
  };

  const onEnviarFaturamento = async () => {
    if (!podeEnviar) { toast.error("Preencha todos os campos obrigatórios e adicione produtos."); return; }
    if (!representanteId) { toast.error("Selecione o representante."); return; }
    setEnviando(true);

    if (pedidoId) {
      await supabase.from("itens_pedido").delete().eq("pedido_id", pedidoId);
    }

    const id = await salvarPedido();
    if (id) {
      try {
        const { data: pedData } = await supabase.from("pedidos").select("numero_pedido").eq("id", id).single();
        if (pedData) {
          const docxBlob = await gerarPedidoDocx({
            numero_pedido: pedData.numero_pedido,
            data_pedido: formatDate(new Date()),
            cliente: {
              razao_social: cliente.razao_social,
              cnpj: cliente.cnpj,
              comprador: cliente.comprador,
              cidade: cliente.cidade,
              uf: cliente.uf,
            },
            vendedor: representantes.find((r) => r.id === representanteId)?.nome ?? user?.email ?? "",
            cond_pagamento: cliente.cond_pagamento,
            observacoes: cliente.observacoes,
            itens: itens.map((i, idx) => ({
              numero: idx + 1,
              codigo_jiva: i.codigo,
              cx_embarque: i.cx_embarque,
              quantidade: i.quantidade,
              nome: i.nome,
              preco_bruto: i.preco_bruto,
              desconto_pct: i.desconto_perfil + i.desconto_comercial + i.desconto_trade,
              preco_liquido: i.preco_final,
              bolsao: i.bolsao,
              total: i.total,
              peso: i.peso_unitario,
              total_peso: i.peso_unitario * i.quantidade,
            })),
          });
          const docxBuffer = await docxBlob.arrayBuffer();
          const uint8 = new Uint8Array(docxBuffer);
          let binary = "";
          for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
          const docx_base64 = btoa(binary);
          const filename = `Pedido_${pedData.numero_pedido}.docx`;
          await supabase.functions.invoke("enviar-pedido-email", { body: { pedido_id: id, docx_base64, filename } });
        }
      } catch (err) {
        console.warn("Falha ao enviar email:", err);
        toast.warning("Pedido salvo, mas houve falha ao enviar o email de notificação.");
      }

      try {
        const { data: fatRoles } = await supabase.from("user_roles").select("user_id").eq("role", "faturamento");
        const fatIds = (fatRoles ?? []).map((r) => r.user_id);
        if (fatIds.length > 0) {
          const { data: pedData2 } = await supabase.from("pedidos").select("numero_pedido").eq("id", id).single();
          const numPed = pedData2?.numero_pedido ?? "";
          const nomeRep = representantes.find((r) => r.id === representanteId)?.nome ?? "Gestora";
          await supabase.from("notificacoes").insert(
            fatIds.map((uid: string) => ({
              destinatario_id: uid,
              destinatario_role: "faturamento",
              tipo: "novo_pedido",
              mensagem: `Novo pedido #${numPed} de ${nomeRep} (via Gestora)`,
            }))
          );
        }
      } catch { /* best-effort */ }

      pedidoEnviadoRef.current = true;
      toast.success("Pedido enviado para faturamento!");
      navigate("/gestora/pedidos");
    }
    setEnviando(false);
  };

  const limparPedido = () => {
    setItens([]);
    setCliente(initialCliente);
    setPedidoId(null);
    setRepresentanteId("");
    setShowLimpar(false);
  };

  const itensPdf: PdfItem[] = itens.map((i) => ({
    marca: i.marca,
    codigo: i.codigo,
    nome: i.nome,
    quantidade: i.quantidade,
    preco_bruto: i.preco_bruto,
    desconto_perfil: i.desconto_perfil,
    desconto_comercial: i.desconto_comercial,
    desconto_trade: i.desconto_trade,
    preco_final: i.preco_final,
    total: i.total,
  }));

  const baixarPDF = () => {
    const doc = gerarPedidoPDF({
      data: new Date(),
      tipo: cliente.tipo,
      cliente: { cnpj: cliente.cnpj, razao_social: cliente.razao_social, cidade: cliente.cidade, uf: cliente.uf, comprador: cliente.comprador },
      cluster: cliente.cluster,
      tabela_preco: cliente.tabela_preco,
      cond_pagamento: cliente.cond_pagamento,
      agendamento: cliente.agendamento,
      observacoes: cliente.observacoes,
      itens: itensPdf,
      vendedor_email: representantes.find((r) => r.id === representanteId)?.nome ?? user?.email,
    });
    const nomeArquivo = `pedido-${(cliente.razao_social || "rascunho").slice(0, 20)}-${formatDate(new Date()).replace(/\//g, "-")}.pdf`;
    doc.save(nomeArquivo);
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
        vendedorEmail={representantes.find((r) => r.id === representanteId)?.nome ?? user?.email ?? ""}
        vigenciaId={vigenciaId}
        descontoLivre={true}
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
