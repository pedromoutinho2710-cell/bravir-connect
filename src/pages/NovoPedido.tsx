import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileDown, Eye, Send, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { onlyDigits, formatBRL, formatDate, formatCNPJ, formatCEP } from "@/lib/format";
import { gerarPedidoPDF, type PdfItem } from "@/lib/pdf";
import { SecaoCliente, type DadosCliente } from "@/components/pedido/SecaoCliente";
import { SecaoProdutos, type ItemPedido, type Produto } from "@/components/pedido/SecaoProdutos";
import { ResumoFinanceiro } from "@/components/pedido/ResumoFinanceiro";

const RASCUNHO_KEY = "bravir:rascunho-pedido";

const initialCliente: DadosCliente = {
  cnpj: "",
  razao_social: "",
  cidade: "",
  uf: "",
  cep: "",
  comprador: "",
  perfil_cliente: "",
  tabela_preco: "",
  tipo: "Pedido",
  cond_pagamento: "",
  agendamento: false,
  observacoes: "",
};

type DraftInfo = {
  id: string;
  numero_pedido: number;
  clienteNome: string;
  dataAtualizada: string;
  total: number;
};

export default function NovoPedido() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [cliente, setCliente] = useState<DadosCliente>(initialCliente);
  const [itens, setItens] = useState<ItemPedido[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [precos, setPrecos] = useState<Record<string, Record<string, number>>>({});
  const [descontos, setDescontos] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pedidoId, setPedidoId] = useState<string | null>(null);

  // Rascunho
  const [draftInfo, setDraftInfo] = useState<DraftInfo | null>(null);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [carregandoRascunho, setCarregandoRascunho] = useState(false);

  // Refs de timers
  const localSaveTimer = useRef<number | null>(null);
  const dbSaveTimer = useRef<number | null>(null);
  const dbSaveInProgress = useRef(false);

  // Ref "latest" para o auto-save de banco em segundo plano
  // (atualizado a cada render, evita closure stale)
  const doDbSaveRef = useRef<() => Promise<void>>(async () => {});

  // ── Carrega catálogo + verifica rascunho no banco ──────────────────────────
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

      const [pRes, prRes, dRes, rascunhoRes] = await Promise.all([
        prodQuery,
        supabase.from("precos").select("*"),
        supabase.from("descontos").select("*"),
        supabase
          .from("pedidos")
          .select("id, numero_pedido, created_at, clientes(razao_social), itens_pedido(total_item)")
          .eq("vendedor_id", user.id)
          .eq("status", "rascunho")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (pRes.data) setProdutos(pRes.data as Produto[]);
      if (prRes.data) {
        const map: Record<string, Record<string, number>> = {};
        prRes.data.forEach((p) => { (map[p.produto_id] ||= {})[p.tabela] = Number(p.preco_bruto); });
        setPrecos(map);
      }
      if (dRes.data) {
        const map: Record<string, Record<string, number>> = {};
        dRes.data.forEach((d) => { (map[d.produto_id] ||= {})[d.perfil_cliente] = Number(d.percentual_desconto); });
        setDescontos(map);
      }

      if (rascunhoRes.data) {
        // Rascunho no banco tem prioridade — mostra modal
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = rascunhoRes.data as any;
        setDraftInfo({
          id: r.id,
          numero_pedido: r.numero_pedido,
          clienteNome: r.clientes?.razao_social ?? "—",
          dataAtualizada: r.created_at,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          total: (r.itens_pedido ?? []).reduce((s: number, i: any) => s + Number(i.total_item), 0),
        });
        setShowDraftModal(true);
      } else {
        // Sem rascunho no banco — tenta restaurar localStorage
        try {
          const raw = localStorage.getItem(RASCUNHO_KEY);
          if (raw) {
            const saved = JSON.parse(raw);
            if (saved.cliente) setCliente(saved.cliente);
            if (saved.itens) setItens(saved.itens);
            if (saved.pedidoId) setPedidoId(saved.pedidoId);
          }
        } catch { /* ignore */ }
      }

      setLoading(false);
    })();
  }, [user]);

  // ── podeSalvar / podeEnviar ────────────────────────────────────────────────
  const podeSalvar = useMemo(() => (
    onlyDigits(cliente.cnpj).length === 14 &&
    cliente.razao_social.trim().length > 0 &&
    !!cliente.perfil_cliente &&
    !!cliente.tabela_preco
  ), [cliente]);

  const podeEnviar = podeSalvar && itens.length > 0;

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

    let id = pedidoId;
    if (id) {
      const { error } = await supabase
        .from("pedidos")
        .update({
          tipo: cliente.tipo,
          cliente_id,
          perfil_cliente: cliente.perfil_cliente,
          tabela_preco: cliente.tabela_preco,
          cond_pagamento: cliente.cond_pagamento || null,
          agendamento: cliente.agendamento,
          observacoes: cliente.observacoes || null,
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
          perfil_cliente: cliente.perfil_cliente,
          tabela_preco: cliente.tabela_preco,
          cond_pagamento: cliente.cond_pagamento || null,
          agendamento: cliente.agendamento,
          observacoes: cliente.observacoes || null,
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

  // ── Atualiza ref "latest" a cada render ────────────────────────────────────
  // (padrão latest-ref: evita closure stale no auto-save assíncrono)
  doDbSaveRef.current = async () => {
    if (!podeSalvar || dbSaveInProgress.current || showDraftModal) return;
    dbSaveInProgress.current = true;
    await salvarPedido("rascunho");
    dbSaveInProgress.current = false;
  };

  // ── Auto-save LOCAL (500ms) ────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    if (localSaveTimer.current) window.clearTimeout(localSaveTimer.current);
    localSaveTimer.current = window.setTimeout(() => {
      localStorage.setItem(RASCUNHO_KEY, JSON.stringify({ cliente, itens, pedidoId }));
    }, 500);
  }, [cliente, itens, pedidoId, loading]);

  // ── Auto-save BANCO em segundo plano (5s debounce) ─────────────────────────
  useEffect(() => {
    if (loading || showDraftModal) return;
    if (dbSaveTimer.current) window.clearTimeout(dbSaveTimer.current);
    dbSaveTimer.current = window.setTimeout(() => {
      doDbSaveRef.current();
    }, 5000);
  }, [cliente, itens, loading, showDraftModal]);

  // ── Continuar rascunho existente ───────────────────────────────────────────
  const continuarRascunho = async (id: string) => {
    setCarregandoRascunho(true);
    const { data, error } = await supabase
      .from("pedidos")
      .select(`
        id, tipo, cond_pagamento, agendamento, observacoes, perfil_cliente, tabela_preco,
        clientes(id, cnpj, razao_social, cidade, uf, cep, comprador),
        itens_pedido(produto_id, quantidade, preco_unitario_bruto, total_item,
          produtos(codigo_jiva, nome, marca, cx_embarque, peso_unitario))
      `)
      .eq("id", id)
      .single();

    if (error || !data) {
      toast.error("Não foi possível carregar o rascunho.");
      setCarregandoRascunho(false);
      setShowDraftModal(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cl = data.clientes as any;
    setCliente({
      cliente_id: cl.id,
      cnpj: formatCNPJ(cl.cnpj),
      razao_social: cl.razao_social,
      cidade: cl.cidade ?? "",
      uf: cl.uf ?? "",
      cep: cl.cep ? formatCEP(cl.cep) : "",
      comprador: cl.comprador ?? "",
      perfil_cliente: data.perfil_cliente,
      tabela_preco: data.tabela_preco,
      tipo: data.tipo,
      cond_pagamento: data.cond_pagamento ?? "",
      agendamento: data.agendamento,
      observacoes: data.observacoes ?? "",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setItens(((data.itens_pedido as any[]) ?? []).map((item) => {
      const p = item.produtos;
      const bruto = precos[item.produto_id]?.[data.tabela_preco] ?? Number(item.preco_unitario_bruto);
      const dPerfil = descontos[item.produto_id]?.[data.perfil_cliente] ?? Number(item.desconto_perfil) ?? 0;
      const dCom = Number(item.desconto_comercial) ?? 0;
      const dTrade = Number(item.desconto_trade) ?? 0;
      const apos_perfil = bruto * (1 - dPerfil / 100);
      const apos_comercial = apos_perfil * (1 - dCom / 100);
      const preco_final = apos_comercial * (1 - dTrade / 100);
      
      return {
        produto_id: item.produto_id,
        codigo: p.codigo_jiva,
        nome: p.nome,
        marca: p.marca,
        cx_embarque: p.cx_embarque,
        peso_unitario: Number(p.peso_unitario),
        quantidade: item.quantidade,
        preco_bruto: bruto,
        desconto_perfil: dPerfil,
        desconto_comercial: dCom,
        desconto_trade: dTrade,
        preco_apos_perfil: apos_perfil,
        preco_apos_comercial: apos_comercial,
        preco_final: preco_final,
        total: preco_final * item.quantidade,
      };
    }));

    setPedidoId(id);
    setCarregandoRascunho(false);
    setShowDraftModal(false);
    setDraftInfo(null);
  };

  // ── Descartar rascunho e começar do zero ───────────────────────────────────
  const descartarRascunho = async () => {
    if (draftInfo) {
      await supabase.from("pedidos").delete().eq("id", draftInfo.id);
    }
    localStorage.removeItem(RASCUNHO_KEY);
    setCliente(initialCliente);
    setItens([]);
    setPedidoId(null);
    setDraftInfo(null);
    setShowDraftModal(false);
  };

  // ── Enviar para faturamento ────────────────────────────────────────────────
  const onEnviarFaturamento = async () => {
    if (!podeEnviar) {
      toast.error("Adicione ao menos um produto antes de enviar.");
      return;
    }
    setEnviando(true);
    const id = await salvarPedido("aguardando_faturamento");
    setEnviando(false);
    if (id) {
      toast.success("Pedido enviado para faturamento!");
      localStorage.removeItem(RASCUNHO_KEY);
      navigate("/meus-pedidos");
    }
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
      perfil_cliente: cliente.perfil_cliente,
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

  const totalGeral = itens.reduce((s, i) => s + i.total, 0);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho + ações */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Novo Pedido</h1>
          <p className="text-sm text-muted-foreground">
            Preencha os dados do cliente, adicione produtos e envie para faturamento
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPreviewOpen(true)} disabled={itens.length === 0}>
            <Eye className="h-4 w-4" />
            Visualizar resumo
          </Button>
          <Button variant="outline" onClick={baixarPDF} disabled={itens.length === 0}>
            <FileDown className="h-4 w-4" />
            Baixar PDF
          </Button>
          <Button onClick={onEnviarFaturamento} disabled={!podeEnviar || enviando}>
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar para faturamento
          </Button>
        </div>
      </div>

      <SecaoCliente value={cliente} onChange={setCliente} vendedorId={user?.id ?? ""} />

      <SecaoProdutos
        produtos={produtos}
        precos={precos}
        descontos={descontos}
        tabelaPreco={cliente.tabela_preco}
        perfilCliente={cliente.perfil_cliente}
        itens={itens}
        onChange={setItens}
      />

      <ResumoFinanceiro itens={itens} />

      {/* Modal: rascunho encontrado no banco */}
      <Dialog open={showDraftModal}>
        <DialogContent
          className="sm:max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-amber-500" />
              Pedido não finalizado
            </DialogTitle>
            <DialogDescription>
              Você tem um rascunho salvo. Deseja continuar de onde parou?
            </DialogDescription>
          </DialogHeader>

          {draftInfo && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1.5">
              <div>
                <span className="text-muted-foreground">Cliente: </span>
                <span className="font-semibold">{draftInfo.clienteNome}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Salvo em: </span>
                {formatDate(draftInfo.dataAtualizada)}
              </div>
              {draftInfo.total > 0 && (
                <div>
                  <span className="text-muted-foreground">Total parcial: </span>
                  <span className="font-semibold">{formatBRL(draftInfo.total)}</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={descartarRascunho}
            >
              Começar novo
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={carregandoRascunho}
              onClick={() => draftInfo && continuarRascunho(draftInfo.id)}
            >
              {carregandoRascunho && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continuar de onde parou
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                {cliente.tipo} • Tabela {cliente.tabela_preco} • {cliente.perfil_cliente}
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
    </div>
  );
}
