import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { toast } from "sonner";
import { onlyDigits, formatBRL, formatDate, formatCNPJ, formatCEP } from "@/lib/format";
import { gerarPedidoPDF, type PdfItem } from "@/lib/pdf";
import { gerarPedidoDocx } from "@/lib/docx";
import { SecaoCliente, type DadosCliente } from "@/components/pedido/SecaoCliente";
import { SecaoProdutos, type ItemPedido, type Produto } from "@/components/pedido/SecaoProdutos";
import { ResumoFinanceiro } from "@/components/pedido/ResumoFinanceiro";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const RASCUNHO_KEY = "bravir:rascunho-pedido";

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


export default function NovoPedido() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isVendedorLivre = /pedro|julia|tamiris/i.test(user?.email ?? "");
  const pedidoMinimo = isVendedorLivre ? 3000 : 5000;

  const [cliente, setCliente] = useState<DadosCliente>(initialCliente);
  const [itens, setItens] = useState<ItemPedido[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [descontos, setDescontos] = useState<Record<string, Record<string, number>>>({});

  type Vigencia = { id: string; nome: string; created_at: string; desconto_livre: boolean };
  const [vigencias, setVigencias] = useState<Vigencia[]>([]);
  const [vigenciaId, setVigenciaId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [salvandoRascunho, setSalvandoRascunho] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pedidoId, setPedidoId] = useState<string | null>(null);

  const [showLimpar, setShowLimpar] = useState(false);

  // Refs de timers
  const localSaveTimer = useRef<number | null>(null);
  const pedidoEnviadoRef = useRef(false); // bloqueia auto-saves após envio bem-sucedido
  const prevVigenciaRef = useRef<string | null>(null); // detecta troca manual de vigência

  // ── Carrega catálogo ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      // Tenta carregar produtos via formulário padrão; fallback para todos ativos
      const formRes = await supabase
        .from("formularios")
        .select("id, formulario_produtos(produto_id)")
        .eq("padrao", true)
        .eq("ativo", true)
        .maybeSingle();

      let prodQuery = supabase.from("produtos").select("*").eq("ativo", true).order("marca").order("nome");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fpIds: string[] = (formRes.data as any)?.formulario_produtos?.map((fp: { produto_id: string }) => fp.produto_id) ?? [];
      if (fpIds.length > 0) {
        prodQuery = supabase.from("produtos").select("*").in("id", fpIds).order("marca").order("nome");
      }

      const [pRes, dRes, vigRes] = await Promise.all([
        prodQuery,
        supabase.from("descontos").select("*"),
        supabase
          .from("tabelas_vigencia")
          .select("id, nome, created_at, desconto_livre")
          .eq("ativa", true)
          .order("created_at", { ascending: false }),
      ]);

      if (pRes.data) setProdutos(pRes.data as Produto[]);
      if (dRes.data) {
        const map: Record<string, Record<string, number>> = {};
        dRes.data.forEach((d) => { (map[d.produto_id] ||= {})[d.perfil_cliente] = Number(d.percentual_desconto); });
        setDescontos(map);
      }
      console.log("vigencias:", vigRes.data, "error:", vigRes.error);
      if (vigRes.data && vigRes.data.length > 0) {
        setVigencias(vigRes.data as Vigencia[]);
        // Default: first = mais recente (ordered desc)
        setVigenciaId(vigRes.data[0].id);
      }

      // Restaura rascunho do localStorage silenciosamente
      try {
        const raw = localStorage.getItem(RASCUNHO_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.cliente) setCliente(saved.cliente);
          if (saved.itens) setItens(saved.itens);
          if (saved.pedidoId) setPedidoId(saved.pedidoId);
          if (saved.vigenciaId) setVigenciaId(saved.vigenciaId);
        }
      } catch { /* ignore */ }

      setLoading(false);
    })();
  }, [user]);

  // ── Pre-fill cliente a partir do detalhe do cliente ───────────────────────
  useEffect(() => {
    if (loading) return;
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
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── podeSalvar / podeEnviar ────────────────────────────────────────────────
  const podeSalvar = useMemo(() => (
    onlyDigits(cliente.cnpj).length === 14 &&
    cliente.razao_social.trim().length > 0 &&
    !!cliente.cluster &&
    !!cliente.tabela_preco
  ), [cliente]);

  const totalGeral = itens.reduce((s, i) => s + i.total, 0);
  const atingiuMinimo = totalGeral >= pedidoMinimo;
  const progresso = pedidoMinimo > 0 ? Math.min(100, (totalGeral / pedidoMinimo) * 100) : 100;
  const progressoColor = progresso >= 100 ? "bg-green-500" : progresso >= 70 ? "bg-yellow-400" : "bg-red-500";
  const progressoTextColor = progresso >= 100 ? "text-green-700" : progresso >= 70 ? "text-yellow-700" : "text-red-600";

  const podeEnviar = podeSalvar && itens.length > 0 && atingiuMinimo;

  // ── Garante cliente cadastrado ─────────────────────────────────────────────
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
    if (error) {
      toast.error("Erro ao salvar cliente: " + error.message);
      return null;
    }
    setCliente((c) => ({ ...c, cliente_id: data.id }));
    return data.id;
  };

  // ── Salva pedido no banco ──────────────────────────────────────────────────
  const salvarPedido = async (status: "rascunho" | "aguardando_faturamento"): Promise<string | null> => {
    if (!user || !podeSalvar) return null;
    const cliente_id = await garantirCliente();
    if (!cliente_id) return null;

    const obsCompletas = [
      cliente.ordem_compra ? `OC: ${cliente.ordem_compra}` : "",
      cliente.observacoes,
    ].filter(Boolean).join("\n") || null;

    let id = pedidoId;
    if (id) {
      const { error } = await supabase
        .from("pedidos")
        .update({
          tipo: cliente.tipo,
          cliente_id,
          perfil_cliente: cliente.cluster,
          tabela_preco: cliente.tabela_preco,
          cond_pagamento: cliente.cond_pagamento || null,
          agendamento: cliente.agendamento,
          observacoes: obsCompletas,
          vigencia_id: vigenciaId || null,
          status,
        })
        .eq("id", id);
      if (error) {
        if (status !== "rascunho") toast.error("Erro ao atualizar: " + error.message);
        return null;
      }
    } else {
      const { data, error } = await supabase
        .from("pedidos")
        .insert({
          tipo: cliente.tipo,
          vendedor_id: user.id,
          cliente_id,
          perfil_cliente: cliente.cluster,
          tabela_preco: cliente.tabela_preco,
          cond_pagamento: cliente.cond_pagamento || null,
          agendamento: cliente.agendamento,
          observacoes: obsCompletas,
          vigencia_id: vigenciaId || null,
          status,
        })
        .select("id")
        .single();
      if (error) {
        if (status !== "rascunho") toast.error("Erro ao criar pedido: " + error.message);
        return null;
      }
      id = data.id;
      setPedidoId(id);
    }

    // Substitui itens
    await supabase.from("itens_pedido").delete().eq("pedido_id", id);
    if (itens.length > 0) {
      const { error } = await supabase.from("itens_pedido").insert(
        itens.map((i) => ({
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
        })),
      );
      if (error) {
        if (status !== "rascunho") toast.error("Erro ao salvar itens: " + error.message);
        return null;
      }
    }
    return id;
  };

  // ── Reset itens ao trocar vigência ────────────────────────────────────────
  // prevVigenciaRef=null → primeiro disparo (carga inicial) → só grava, não limpa
  useEffect(() => {
    if (prevVigenciaRef.current === null) {
      prevVigenciaRef.current = vigenciaId;
      return;
    }
    if (prevVigenciaRef.current === vigenciaId) return;
    prevVigenciaRef.current = vigenciaId;
    if (!vigenciaId) return;
    setItens([]);
    toast.info("Tabela de preços alterada. Os produtos foram removidos.");
  }, [vigenciaId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save LOCAL (500ms) ────────────────────────────────────────────────
  useEffect(() => {
    if (loading || pedidoEnviadoRef.current) return;
    if (localSaveTimer.current) window.clearTimeout(localSaveTimer.current);
    localSaveTimer.current = window.setTimeout(() => {
      if (pedidoEnviadoRef.current) return;
      localStorage.setItem(RASCUNHO_KEY, JSON.stringify({ cliente, itens, pedidoId, vigenciaId }));
    }, 500);
  }, [cliente, itens, pedidoId, loading]);

  // ── Limpar pedido ─────────────────────────────────────────────────────────
  const limparPedido = () => {
    setItens([]);
    setCliente(initialCliente);
    setPedidoId(null);
    localStorage.removeItem(RASCUNHO_KEY);
    setShowLimpar(false);
  };

  // ── Salvar rascunho manualmente ────────────────────────────────────────────
  const salvarRascunhoManual = async () => {
    if (!podeSalvar) {
      toast.error("Preencha CNPJ, razão social, perfil e tabela de preço.");
      return;
    }
    setSalvandoRascunho(true);
    const id = await salvarPedido("rascunho");
    setSalvandoRascunho(false);
    if (id) toast.success("Rascunho salvo!");
  };

  // ── Enviar para faturamento ────────────────────────────────────────────────
  const onEnviarFaturamento = async () => {
    if (!podeEnviar) {
      toast.error("Adicione ao menos um produto antes de enviar.");
      return;
    }
    setEnviando(true);
    const id = await salvarPedido("aguardando_faturamento");
    if (id) {
      // Gera docx e envia email (best-effort)
      try {
        const { data: pedData } = await supabase
          .from("pedidos")
          .select("numero_pedido")
          .eq("id", id)
          .single();

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
            vendedor: user?.email ?? "",
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

          await supabase.functions.invoke("enviar-pedido-email", {
            body: { pedido_id: id, docx_base64, filename },
          });
        }
      } catch (err) {
        console.warn("Falha ao enviar email:", err);
        toast.warning("Pedido salvo, mas houve falha ao enviar o email de notificação.");
      }

      // Notificar todos os usuários de faturamento
      try {
        const { data: fatRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "faturamento");
        const fatIds = (fatRoles ?? []).map((r) => r.user_id);
        if (fatIds.length > 0) {
          const { data: pedData2 } = await supabase
            .from("pedidos")
            .select("numero_pedido")
            .eq("id", id)
            .single();
          const numPed = pedData2?.numero_pedido ?? "";
          const nomeVendedor = user?.email ?? "Vendedor";
          await supabase.from("notificacoes").insert(
            fatIds.map((uid: string) => ({
              destinatario_id: uid,
              destinatario_role: "faturamento",
              tipo: "novo_pedido",
              mensagem: `Novo pedido #${numPed} de ${nomeVendedor}`,
            }))
          );
        }
      } catch { /* best-effort */ }

      pedidoEnviadoRef.current = true;
      if (localSaveTimer.current) window.clearTimeout(localSaveTimer.current);
      if (dbSaveTimer.current) window.clearTimeout(dbSaveTimer.current);
      localStorage.removeItem(RASCUNHO_KEY);
      toast.success("Pedido enviado para faturamento!");
      navigate("/meus-pedidos");
    }
    setEnviando(false);
  };

  // ── PDF ────────────────────────────────────────────────────────────────────
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
      cliente: {
        cnpj: cliente.cnpj,
        razao_social: cliente.razao_social,
        cidade: cliente.cidade,
        uf: cliente.uf,
        comprador: cliente.comprador,
      },
      cluster: cliente.cluster,
      tabela_preco: cliente.tabela_preco,
      cond_pagamento: cliente.cond_pagamento,
      agendamento: cliente.agendamento,
      observacoes: cliente.observacoes,
      itens: itensPdf,
      vendedor_email: user?.email,
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
        descontoLivre={vigencias.find((v) => v.id === vigenciaId)?.desconto_livre ?? false}
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
          <Button onClick={onEnviarFaturamento} disabled={!podeEnviar || enviando}>
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
