import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { onlyDigits, formatDate } from "@/lib/format";
import type { PdfItem } from "@/lib/pdf";
import type { DadosCliente } from "@/components/pedido/SecaoCliente";
import type { ItemPedido, Produto } from "@/components/pedido/SecaoProdutos";

// v2

export type Vigencia = {
  id: string;
  nome: string;
  created_at: string;
  desconto_livre: boolean;
};

export type NovoPedidoVariant = "vendedor" | "gestora";

export interface UseNovoPedidoOptions {
  variant: NovoPedidoVariant;
  /** For "gestora": id of selected representante. Ignored for "vendedor". */
  representanteId?: string;
  /** For "gestora": display name of the selected representante (looked up from representantes list). Ignored for "vendedor". */
  representanteNome?: string;
  /** For "gestora": setter so the hook can restore representanteId from localStorage rascunho. Ignored for "vendedor". */
  setRepresentanteId?: (id: string) => void;
  /** Path to navigate to after successful "Enviar para faturamento". */
  navigateAfterEnviar: string;
}

export const initialClienteNovoPedido: DadosCliente = {
  cnpj: "",
  razao_social: "",
  cidade: "",
  uf: "",
  cep: "",
  comprador: "",
  telefone: "",
  email: "",
  cluster: "",
  tabela_preco: "",
  tipo: "Pedido",
  cond_pagamento: "",
  pagamento_vista: false,
  agendamento: false,
  observacoes: "",
  codigo_cliente: "",
  aceita_saldo: true,
  ordem_compra: "",
  email_xml: "",
  desconto_vista: 0,
};

export function useNovoPedido(options: UseNovoPedidoOptions) {
  const { variant, representanteId, representanteNome, setRepresentanteId, navigateAfterEnviar } = options;
  const isGestora = variant === "gestora";

  const { user } = useAuth();
  const navigate = useNavigate();

  const rascunhoKey = isGestora
    ? `bravir:rascunho-gestora:${user?.id ?? "anonimo"}`
    : `bravir:rascunho-pedido:${user?.id ?? "anonimo"}`;

  const [cliente, setCliente] = useState<DadosCliente>(initialClienteNovoPedido);
  const [itens, setItens] = useState<ItemPedido[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [descontos, setDescontos] = useState<Record<string, Record<string, number>>>({});
  const [vigencias, setVigencias] = useState<Vigencia[]>([]);
  const [vigenciaId, setVigenciaId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [salvandoRascunho, setSalvandoRascunho] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pedidoId, setPedidoId] = useState<string | null>(null);
  const [showLimpar, setShowLimpar] = useState(false);

  const localSaveTimer = useRef<number | null>(null);
  const pedidoEnviadoRef = useRef(false);
  const prevVigenciaRef = useRef<string | null>(null);

  // Effect 1 — Load catalog + restore rascunho
  useEffect(() => {
    if (!user) return;
    (async () => {
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
        prodQuery = supabase.from("produtos").select("*").in("id", fpIds).eq("ativo", true).order("marca").order("nome");
      }

      const [pRes, dRes, vigRes] = await Promise.all([
        prodQuery,
        supabase.from("descontos").select("*").limit(2000),
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
      if (vigRes.data && vigRes.data.length > 0) {
        // Todas as vigências ativas ficam visíveis. Quem define o modo de preço
        // é o campo desconto_livre da vigência selecionada (ver `descontoLivre`
        // abaixo), dispensando whitelist de vendedores.
        const vigenciasAtivas = vigRes.data as Vigencia[];
        setVigencias(vigenciasAtivas);
        setVigenciaId(vigenciasAtivas[0].id);
      }

      // Restore rascunho silently
      try {
        const raw = localStorage.getItem(rascunhoKey);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.cliente) setCliente(saved.cliente);
          if (saved.itens) setItens(saved.itens);
          if (saved.pedidoId) setPedidoId(saved.pedidoId);
          if (saved.vigenciaId) setVigenciaId(saved.vigenciaId);
          if (isGestora && saved.representanteId && setRepresentanteId) {
            setRepresentanteId(saved.representanteId);
          }
        }
      } catch { /* ignore */ }

      setLoading(false);
    })();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 2 — Reset itens on vigência change
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

  // Effect 3 — Auto-save to localStorage (debounced 500ms)
  useEffect(() => {
    if (loading || pedidoEnviadoRef.current) return;
    if (localSaveTimer.current) window.clearTimeout(localSaveTimer.current);
    localSaveTimer.current = window.setTimeout(() => {
      if (pedidoEnviadoRef.current) return;
      const payload = isGestora
        ? { cliente, itens, pedidoId, vigenciaId, representanteId }
        : { cliente, itens, pedidoId, vigenciaId };
      localStorage.setItem(rascunhoKey, JSON.stringify(payload));
    }, 500);
  }, [cliente, itens, pedidoId, loading, representanteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 4 — Save imediato ao sair/trocar de aba
  useEffect(() => {
    const saveNow = () => {
      if (loading || pedidoEnviadoRef.current) return;
      const payload = isGestora
        ? { cliente, itens, pedidoId, vigenciaId, representanteId }
        : { cliente, itens, pedidoId, vigenciaId };
      localStorage.setItem(rascunhoKey, JSON.stringify(payload));
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") saveNow();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", saveNow);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", saveNow);
    };
  }, [cliente, itens, pedidoId, vigenciaId, representanteId, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const camposObrigatoriosOk = isGestora
    ? !!cliente.cond_pagamento.trim()
    : !!(
        (cliente.tipo === "Bonificação" || cliente.cond_pagamento.trim()) &&
        cliente.codigo_cliente.trim() &&
        cliente.comprador.trim()
      );

  const podeSalvar = useMemo(() => {
    const baseOk =
      onlyDigits(cliente.cnpj).length === 14 &&
      cliente.razao_social.trim().length > 0 &&
      !!cliente.cluster &&
      !!cliente.tabela_preco &&
      camposObrigatoriosOk;
    if (isGestora) return baseOk && !!representanteId;
    return baseOk;
  }, [cliente, camposObrigatoriosOk, isGestora, representanteId]);

  const totalGeral = itens.reduce((s, i) => s + i.total, 0);
  const podeEnviar = podeSalvar && itens.length > 0;
  // NOTE: podeEnviar here intentionally does NOT include the vendedor's pedido-mínimo check.
  // The vendedor page composes its own button-disabled state with `atingiuMinimo`.

  const descontoLivre = isGestora
    ? true
    : (vigencias.find((v) => v.id === vigenciaId)?.desconto_livre ?? false);

  const vendedorDisplayName = isGestora
    ? (representanteNome ?? user?.email ?? "")
    : (user?.email ?? "");

  const pedidoVendedorId = isGestora ? (representanteId ?? "") : (user?.id ?? "");

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
          telefone: cliente.telefone || null,
          email: cliente.email || null,
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

  const salvarPedido = async (
    status: "rascunho" | "pendente_sankhya",
  ): Promise<string | null> => {
    if (!user || !podeSalvar) return null;

    // Entrega agendada exige telefone e email do comprador.
    if (cliente.agendamento && (!cliente.telefone.trim() || !cliente.email.trim())) {
      toast.error("Telefone e email são obrigatórios para entrega agendada.");
      return null;
    }

    const cliente_id = await garantirCliente();
    if (!cliente_id) return null;

    // Completa a ficha do cliente já existente com dados do comprador que
    // estavam vazios no cadastro — sem sobrescrever valores já preenchidos.
    // (Clientes novos já são criados com esses dados em garantirCliente.)
    if (cliente.cliente_id) {
      const { data: clienteAtual } = await supabase
        .from("clientes")
        .select("comprador, telefone, email")
        .eq("id", cliente_id)
        .maybeSingle();
      if (clienteAtual) {
        const patch: Record<string, string> = {};
        if (!clienteAtual.comprador?.trim() && cliente.comprador.trim()) patch.comprador = cliente.comprador.trim();
        if (!clienteAtual.telefone?.trim() && cliente.telefone.trim()) patch.telefone = cliente.telefone.trim();
        if (!clienteAtual.email?.trim() && cliente.email.trim()) patch.email = cliente.email.trim();
        if (Object.keys(patch).length > 0) {
          await supabase.from("clientes").update(patch).eq("id", cliente_id);
        }
      }
    }

    const obsCompletas = cliente.observacoes || null;

    let id = pedidoId;
    if (id) {
      const updatePayload: Record<string, unknown> = {
        tipo: cliente.tipo,
        cliente_id,
        perfil_cliente: cliente.cluster,
        tabela_preco: cliente.tabela_preco,
        cond_pagamento: cliente.cond_pagamento || null,
        pagamento_vista: cliente.pagamento_vista,
        agendamento: cliente.agendamento,
        observacoes: obsCompletas,
        ordem_compra: cliente.ordem_compra || null,
        comprador: cliente.comprador || null,
        telefone: cliente.telefone || null,
        email: cliente.email || null,
        vigencia_id: vigenciaId || null,
        status,
      };
      updatePayload.vendedor_id = pedidoVendedorId;
      if (status === "pendente_sankhya") {
        updatePayload.data_pedido = new Date().toISOString().slice(0, 10);
      }
      const { error } = await supabase.from("pedidos").update(updatePayload).eq("id", id);
      if (error) {
        toast.error("Erro ao atualizar: " + error.message);
        return null;
      }
    } else {
      const { data, error } = await supabase
        .from("pedidos")
        .insert({
          tipo: cliente.tipo,
          vendedor_id: pedidoVendedorId,
          criado_por_id: user.id,
          cliente_id,
          perfil_cliente: cliente.cluster,
          tabela_preco: cliente.tabela_preco,
          cond_pagamento: cliente.cond_pagamento || null,
          pagamento_vista: cliente.pagamento_vista,
          agendamento: cliente.agendamento,
          observacoes: obsCompletas,
          ordem_compra: cliente.ordem_compra || null,
          comprador: cliente.comprador || null,
          telefone: cliente.telefone || null,
          email: cliente.email || null,
          vigencia_id: vigenciaId || null,
          status,
          ...(status === "pendente_sankhya"
            ? { data_pedido: new Date().toISOString().slice(0, 10) }
            : {}),
        })
        .select("id")
        .single();
      if (error) {
        toast.error("Erro ao criar pedido: " + error.message);
        return null;
      }
      id = data.id;
      setPedidoId(id);
    }

    // Persiste desconto à vista (coluna fora dos tipos gerados de pedidos).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("pedidos")
      .update({ desconto_vista: cliente.desconto_vista ?? 0 })
      .eq("id", id);

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
      const { error } = await supabase
        .from("itens_pedido")
        .insert(itemsPayload);
      if (error) {
        toast.error("Erro ao salvar itens: " + error.message);
        return null;
      }
    }
    return id;
  };

  const salvarRascunhoManual = async () => {
    if (!podeSalvar) {
      toast.error(
        isGestora
          ? "Preencha todos os campos obrigatórios antes de salvar."
          : "Preencha CNPJ, razão social, perfil e tabela de preço.",
      );
      return;
    }
    setSalvandoRascunho(true);
    const id = await salvarPedido("rascunho");
    setSalvandoRascunho(false);
    if (id) toast.success("Rascunho salvo!");
  };

  const onEnviarFaturamento = async () => {
    if (!podeEnviar) {
      toast.error(
        isGestora
          ? "Preencha todos os campos obrigatórios e adicione produtos."
          : "Adicione ao menos um produto antes de enviar.",
      );
      return;
    }
    if (isGestora && !representanteId) {
      toast.error("Selecione o representante.");
      return;
    }
    setEnviando(true);

    if (pedidoId) {
      await supabase.from("itens_pedido").delete().eq("pedido_id", pedidoId);
    }

    const id = await salvarPedido("pendente_sankhya");
    if (id) {
      // Sucesso do envio de email/notificações controla se reportamos o handoff
      // como 100% concluído. Em caso de falha mostramos um aviso (e não o toast
      // de sucesso), evitando a perda silenciosa de notificações.
      let emailOk = true;
      try {
        const { data: pedData } = await supabase
          .from("pedidos")
          .select("numero_pedido")
          .eq("id", id)
          .single();
        if (pedData) {
          const { gerarPedidoDocx } = await import("@/lib/docx");
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
            vendedor: vendedorDisplayName,
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
          const { error: emailError } = await supabase.functions.invoke("enviar-pedido-email", {
            body: { pedido_id: id, docx_base64, filename },
          });
          if (emailError) throw emailError;
        }
      } catch (err) {
        emailOk = false;
        console.warn("Falha ao enviar email:", err);
        toast.warning("Pedido salvo, mas houve falha ao enviar o email/notificações. Avise o faturamento.");
      }

      if (cliente.email_xml.trim()) {
        supabase
          .from("clientes")
          .update({ email: cliente.email_xml.trim() })
          .eq("cnpj", onlyDigits(cliente.cnpj))
          .then(() => {});
      }

      // Notificações (vendedor + faturamento) são criadas exclusivamente pela
      // Edge Function `enviar-pedido-email`, evitando duplicidade.

      // Pedido de bonificação: debita o valor do bolsão do cliente.
      if (cliente.tipo === "Bonificação") {
        try {
          const { data: pedBon } = await supabase
            .from("pedidos")
            .select("numero_pedido, cliente_id")
            .eq("id", id)
            .single();
          if (pedBon?.cliente_id) {
            // Idempotência: só debita se ainda não existe registro 'usado' para este pedido.
            const { data: jaUsado } = await supabase
              .from("bolsao")
              .select("id")
              .eq("pedido_id", id)
              .eq("tipo", "usado")
              .limit(1);
            if (!jaUsado || jaUsado.length === 0) {
              const { error: bolsaoErr } = await supabase.from("bolsao").insert({
                cliente_id: pedBon.cliente_id,
                pedido_id: id,
                valor: totalGeral,
                tipo: "usado",
                descricao: `Bonificação - Pedido #${pedBon.numero_pedido}`,
              });
              if (bolsaoErr) console.warn("Falha ao debitar bolsão:", bolsaoErr);
            }
          }
        } catch (err) {
          console.warn("Falha ao debitar bolsão:", err);
        }
      }

      pedidoEnviadoRef.current = true;
      if (localSaveTimer.current) window.clearTimeout(localSaveTimer.current);
      localStorage.removeItem(rascunhoKey);
      // Só reporta sucesso completo se o email/notificações foram entregues.
      // Em caso de falha o aviso já foi exibido acima — não sobrepõe com sucesso.
      if (emailOk) toast.success("Pedido enviado para faturamento!");
      navigate(navigateAfterEnviar);
    }
    setEnviando(false);
  };

  const limparPedido = () => {
    localStorage.removeItem(rascunhoKey);
    setItens([]);
    setCliente(initialClienteNovoPedido);
    setPedidoId(null);
    if (isGestora && setRepresentanteId) setRepresentanteId("");
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

  const baixarPDF = async () => {
    try {
      const { gerarPedidoPDF } = await import("@/lib/pdf");
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
        ordem_compra: cliente.ordem_compra || undefined,
        agendamento: cliente.agendamento,
        observacoes: cliente.observacoes,
        itens: itensPdf,
        vendedor_email: isGestora
          ? (representanteNome ?? user?.email)
          : user?.email,
      });
      const nomeArquivo = `pedido-${(cliente.razao_social || "rascunho").slice(0, 20)}-${formatDate(new Date()).replace(/\//g, "-")}.pdf`;
      doc.save(nomeArquivo);
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      toast.error("Erro ao gerar PDF. Verifique o console.");
    }
  };

  return {
    // Read-write state
    cliente, setCliente,
    itens, setItens,
    vigenciaId, setVigenciaId,
    pedidoId, setPedidoId,
    previewOpen, setPreviewOpen,
    showLimpar, setShowLimpar,
    // Read-only state
    produtos,
    descontos,
    vigencias,
    loading,
    enviando,
    salvandoRascunho,
    // Computed
    camposObrigatoriosOk,
    podeSalvar,
    podeEnviar,
    totalGeral,
    descontoLivre,
    vendedorDisplayName,
    // Actions
    onEnviarFaturamento,
    salvarRascunhoManual,
    limparPedido,
    baixarPDF,
  };
}
