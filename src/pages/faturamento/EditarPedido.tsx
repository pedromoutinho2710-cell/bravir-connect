import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ArrowLeft, CalendarRange } from "lucide-react";
import { formatBRL, formatCNPJ, onlyDigits } from "@/lib/format";
import { SecaoCliente, type DadosCliente } from "@/components/pedido/SecaoCliente";
import { SecaoProdutos, type ItemPedido, type Produto } from "@/components/pedido/SecaoProdutos";
import { ResumoFinanceiro } from "@/components/pedido/ResumoFinanceiro";

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_faturamento: "Aguardando faturamento",
  no_sankhya: "No Sankhya",
  faturado: "Pré-faturado",
  parcialmente_faturado: "Parc. pré-faturado",
  com_problema: "Com problema",
  devolvido: "Devolvido",
  cancelado: "Cancelado",
  em_faturamento: "Em faturamento",
};

const STATUS_COLOR: Record<string, string> = {
  rascunho: "bg-gray-100 text-gray-700 border-gray-300",
  aguardando_faturamento: "bg-yellow-100 text-yellow-800 border-yellow-300",
  no_sankhya: "bg-blue-100 text-blue-800 border-blue-300",
  faturado: "bg-green-100 text-green-800 border-green-300",
  parcialmente_faturado: "bg-teal-100 text-teal-800 border-teal-300",
  com_problema: "bg-red-100 text-red-800 border-red-300",
  devolvido: "bg-orange-100 text-orange-800 border-orange-300",
  cancelado: "bg-gray-800 text-gray-100 border-gray-700",
  em_faturamento: "bg-blue-100 text-blue-800 border-blue-300",
};

const STATUS_TERMINAL = new Set(["faturado", "devolvido", "cancelado"]);

const INITIAL_CLIENTE: DadosCliente = {
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

export default function EditarPedido() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [numeroPedido, setNumeroPedido] = useState<number>(0);
  const [statusPedido, setStatusPedido] = useState<string>("");
  const [vigenciaId, setVigenciaId] = useState<string>("");
  const [vigenciaNome, setVigenciaNome] = useState<string>("");
  const [descontoLivre, setDescontoLivre] = useState(false);

  const [cliente, setCliente] = useState<DadosCliente>(INITIAL_CLIENTE);
  const [itens, setItens] = useState<ItemPedido[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [descontos, setDescontos] = useState<Record<string, Record<string, number>>>({});

  // produto_id → { dbId: itens_pedido.id }
  const originalItemsRef = useRef<Map<string, { dbId: string }>>(new Map());
  // itens_pedido.id → qtd_faturada
  const itemQtdFaturadaRef = useRef<Map<string, number>>(new Map());
  // Set of itens_pedido.id that appear in itens_faturados
  const itensFaturadosSetRef = useRef<Set<string>>(new Set());
  // produto_id → { nome, codigo } for error messages
  const originalItemInfoRef = useRef<Map<string, { nome: string; codigo: string }>>(new Map());

  useEffect(() => {
    if (!id || !user) return;
    (async () => {
      setLoading(true);

      // Product catalog (same logic as useNovoPedido)
      const formRes = await supabase
        .from("formularios")
        .select("id, formulario_produtos(produto_id)")
        .eq("padrao", true)
        .eq("ativo", true)
        .maybeSingle();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fpIds: string[] = (formRes.data as any)?.formulario_produtos?.map(
        (fp: { produto_id: string }) => fp.produto_id,
      ) ?? [];

      let prodQuery = supabase.from("produtos").select("*").eq("ativo", true).order("marca").order("nome");
      if (fpIds.length > 0) {
        prodQuery = supabase.from("produtos").select("*").in("id", fpIds).order("marca").order("nome");
      }

      const [pedidoRes, prodsRes, descsRes, fatRes] = await Promise.all([
        supabase
          .from("pedidos")
          .select(`
            id, numero_pedido, tipo, status, cond_pagamento, observacoes, agendamento,
            cliente_id, vigencia_id, tabela_preco, perfil_cliente,
            clientes(id, razao_social, cnpj, cidade, uf, cep, comprador, cluster,
                     tabela_preco, codigo_cliente, codigo_parceiro, aceita_saldo, email),
            itens_pedido(
              id, produto_id, quantidade, qtd_faturada,
              preco_unitario_bruto, preco_unitario_liquido,
              desconto_perfil, desconto_comercial, desconto_trade,
              preco_apos_perfil, preco_apos_comercial, preco_final, total_item,
              produtos(id, codigo_jiva, nome, marca, cx_embarque, peso_unitario)
            )
          `)
          .eq("id", id)
          .maybeSingle(),
        prodQuery,
        supabase.from("descontos").select("*"),
        supabase.from("itens_faturados").select("item_pedido_id").eq("pedido_id", id),
      ]);

      if (pedidoRes.error || !pedidoRes.data) {
        setErro("Pedido não encontrado.");
        setLoading(false);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = pedidoRes.data as any;

      if (STATUS_TERMINAL.has(p.status)) {
        setErro(`Pedido com status "${STATUS_LABEL[p.status] ?? p.status}" não pode ser editado.`);
        setLoading(false);
        return;
      }

      setNumeroPedido(p.numero_pedido);
      setStatusPedido(p.status);

      // Load vigencia name + desconto_livre
      if (p.vigencia_id) {
        setVigenciaId(p.vigencia_id);
        const { data: vig } = await supabase
          .from("tabelas_vigencia")
          .select("nome, desconto_livre")
          .eq("id", p.vigencia_id)
          .maybeSingle();
        if (vig) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const vigData = vig as any;
          setVigenciaNome(vigData.nome ?? "");
          setDescontoLivre(vigData.desconto_livre ?? false);
        }
      }

      // Products + discounts
      if (prodsRes.data) setProdutos(prodsRes.data as Produto[]);
      if (descsRes.data) {
        const map: Record<string, Record<string, number>> = {};
        descsRes.data.forEach((d) => {
          (map[d.produto_id] ||= {})[d.perfil_cliente] = Number(d.percentual_desconto);
        });
        setDescontos(map);
      }

      // Build itens_faturados set
      const fatSet = new Set<string>(
        (fatRes.data ?? []).map((f: { item_pedido_id: string }) => f.item_pedido_id),
      );
      itensFaturadosSetRef.current = fatSet;

      // Map original items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itensList = (p.itens_pedido ?? []) as any[];
      const origMap = new Map<string, { dbId: string }>();
      const qtdFatMap = new Map<string, number>();
      const infoMap = new Map<string, { nome: string; codigo: string }>();

      const mappedItens: ItemPedido[] = itensList.map((item) => {
        origMap.set(item.produto_id, { dbId: item.id });
        qtdFatMap.set(item.id, Number(item.qtd_faturada ?? 0));
        infoMap.set(item.produto_id, {
          nome: item.produtos?.nome ?? item.produto_id,
          codigo: item.produtos?.codigo_jiva ?? "",
        });
        return {
          produto_id: item.produto_id,
          codigo: item.produtos?.codigo_jiva ?? "",
          nome: item.produtos?.nome ?? "",
          marca: item.produtos?.marca ?? "",
          cx_embarque: Number(item.produtos?.cx_embarque ?? 1),
          peso_unitario: Number(item.produtos?.peso_unitario ?? 0),
          quantidade: Number(item.quantidade),
          preco_bruto: Number(item.preco_unitario_bruto ?? 0),
          desconto_perfil: Number(item.desconto_perfil ?? 0),
          desconto_comercial: Number(item.desconto_comercial ?? 0),
          desconto_trade: Number(item.desconto_trade ?? 0),
          preco_apos_perfil: Number(item.preco_apos_perfil ?? 0),
          preco_apos_comercial: Number(item.preco_apos_comercial ?? 0),
          preco_final: Number(item.preco_final ?? item.preco_unitario_liquido ?? 0),
          total: Number(item.total_item ?? 0),
          bolsao: 0,
        };
      });

      originalItemsRef.current = origMap;
      itemQtdFaturadaRef.current = qtdFatMap;
      originalItemInfoRef.current = infoMap;
      setItens(mappedItens);

      // Build DadosCliente from order + client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cl = p.clientes as any;
      setCliente({
        cliente_id: cl?.id ?? undefined,
        cnpj: cl?.cnpj ? formatCNPJ(cl.cnpj) : "",
        razao_social: cl?.razao_social ?? "",
        cidade: cl?.cidade ?? "",
        uf: cl?.uf ?? "",
        cep: cl?.cep ?? "",
        comprador: cl?.comprador ?? "",
        cluster: p.perfil_cliente ?? cl?.cluster ?? "",
        tabela_preco: p.tabela_preco ?? cl?.tabela_preco ?? "",
        tipo: p.tipo ?? "Pedido",
        cond_pagamento: p.cond_pagamento ?? "",
        agendamento: p.agendamento ?? false,
        observacoes: p.observacoes ?? "",
        codigo_cliente: cl?.codigo_parceiro ?? cl?.codigo_cliente ?? "",
        aceita_saldo: cl?.aceita_saldo ?? true,
        ordem_compra: "",
        email_xml: cl?.email ?? "",
      });

      setLoading(false);
    })();
  }, [id, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = async () => {
    if (!id) return;

    // Validações
    if (!cliente.razao_social.trim()) {
      toast.error("Razão social é obrigatória.");
      return;
    }
    for (const item of itens) {
      if (item.quantidade <= 0) {
        toast.error(`Quantidade inválida para "${item.nome}".`);
        return;
      }
    }

    const origMap = originalItemsRef.current;
    const itensFatSet = itensFaturadosSetRef.current;
    const qtdFatMap = itemQtdFaturadaRef.current;
    const infoMap = originalItemInfoRef.current;

    // Verificar itens faturados com quantidade reduzida
    for (const item of itens) {
      const orig = origMap.get(item.produto_id);
      if (!orig) continue;
      if (itensFatSet.has(orig.dbId)) {
        const qtdFaturada = qtdFatMap.get(orig.dbId) ?? 0;
        if (item.quantidade < qtdFaturada) {
          toast.error(
            `Quantidade de "${item.nome}" não pode ser menor que a quantidade já faturada (${qtdFaturada}).`,
          );
          return;
        }
      }
    }

    // Verificar itens faturados removidos
    const currentProductIds = new Set(itens.map((i) => i.produto_id));
    for (const [prodId, { dbId }] of origMap.entries()) {
      if (!currentProductIds.has(prodId) && itensFatSet.has(dbId)) {
        const info = infoMap.get(prodId);
        const label = info
          ? `${info.nome}${info.codigo ? ` (${info.codigo})` : ""}`
          : prodId;
        toast.error(`Item já faturado não pode ser removido: ${label}.`);
        return;
      }
    }

    setSalvando(true);

    // a) UPDATE clientes
    if (cliente.cliente_id) {
      const { error: clErr } = await supabase
        .from("clientes")
        .update({
          razao_social: cliente.razao_social,
          comprador: cliente.comprador || null,
          cidade: cliente.cidade || null,
          uf: cliente.uf || null,
          cep: onlyDigits(cliente.cep) || null,
          email: cliente.email_xml.trim() || null,
          codigo_cliente: cliente.codigo_cliente || null,
          aceita_saldo: cliente.aceita_saldo,
        })
        .eq("id", cliente.cliente_id);

      if (clErr) {
        toast.error("Erro ao atualizar cliente: " + clErr.message);
        setSalvando(false);
        return;
      }
    }

    // b) UPDATE pedidos (sem tocar em status, responsavel_id, vigencia_id, etc.)
    const obsBase = cliente.observacoes || "";
    const observacoes = cliente.ordem_compra.trim()
      ? `OC: ${cliente.ordem_compra.trim()}\n${obsBase}`.trim()
      : obsBase || null;

    const { error: pedErr } = await supabase
      .from("pedidos")
      .update({
        tipo: cliente.tipo,
        cond_pagamento: cliente.cond_pagamento || null,
        observacoes: observacoes || null,
        agendamento: cliente.agendamento,
      })
      .eq("id", id);

    if (pedErr) {
      toast.error("Erro ao atualizar pedido: " + pedErr.message);
      setSalvando(false);
      return;
    }

    // c) Sincronizar itens_pedido
    const updatePromises: Promise<unknown>[] = [];
    const inserts: object[] = [];
    const deletedIds: string[] = [];

    for (const item of itens) {
      const orig = origMap.get(item.produto_id);
      if (orig) {
        updatePromises.push(
          supabase
            .from("itens_pedido")
            .update({
              quantidade: item.quantidade,
              preco_unitario_bruto: item.preco_bruto,
              preco_unitario_liquido: item.preco_final,
              desconto_perfil: item.desconto_perfil,
              desconto_comercial: item.desconto_comercial,
              desconto_trade: item.desconto_trade,
              preco_apos_perfil: item.preco_apos_perfil,
              preco_apos_comercial: item.preco_apos_comercial,
              preco_final: item.preco_final,
              total_item: item.total,
            })
            .eq("id", orig.dbId),
        );
      } else {
        inserts.push({
          pedido_id: id,
          produto_id: item.produto_id,
          quantidade: item.quantidade,
          preco_unitario_bruto: item.preco_bruto,
          preco_unitario_liquido: item.preco_final,
          desconto_perfil: item.desconto_perfil,
          desconto_comercial: item.desconto_comercial,
          desconto_trade: item.desconto_trade,
          preco_apos_perfil: item.preco_apos_perfil,
          preco_apos_comercial: item.preco_apos_comercial,
          preco_final: item.preco_final,
          total_item: item.total,
        });
      }
    }

    // Items removed from state that are NOT faturados (validated above)
    for (const [prodId, { dbId }] of origMap.entries()) {
      if (!currentProductIds.has(prodId)) {
        deletedIds.push(dbId);
      }
    }

    await Promise.all(updatePromises);

    if (inserts.length > 0) {
      const { error: insErr } = await supabase.from("itens_pedido").insert(inserts);
      if (insErr) {
        toast.error("Erro ao inserir itens: " + insErr.message);
        setSalvando(false);
        return;
      }
    }

    for (const dbId of deletedIds) {
      const { error: delErr } = await supabase.from("itens_pedido").delete().eq("id", dbId);
      if (delErr) {
        toast.error("Erro ao remover item: " + delErr.message);
        setSalvando(false);
        return;
      }
    }

    toast.success("Pedido atualizado");
    navigate("/faturamento");
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (erro) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-destructive font-medium">{erro}</p>
        <Button variant="outline" onClick={() => navigate("/faturamento")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>
    );
  }

  const totalGeral = itens.reduce((s, i) => s + i.total, 0);

  return (
    <div className="space-y-6 pb-32">
      {/* Cabeçalho */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => navigate("/faturamento")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>
        <div className="flex items-center gap-3 flex-1">
          <h1 className="text-2xl font-bold">Editar pedido #{numeroPedido}</h1>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              STATUS_COLOR[statusPedido] ?? "bg-gray-100 text-gray-800 border-gray-300"
            }`}
          >
            {STATUS_LABEL[statusPedido] ?? statusPedido}
          </span>
        </div>
      </div>

      <SecaoCliente
        value={cliente}
        onChange={setCliente}
        vendedorId={user?.id ?? ""}
        lockCNPJ
      />

      {/* Tabela de preços — read-only */}
      <Card className="border-violet-200 bg-violet-50/40">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-4">
            <CalendarRange className="h-4 w-4 text-violet-600 shrink-0" />
            <span className="text-sm font-semibold shrink-0">Tabela de preços:</span>
            <span className="text-sm">{vigenciaNome || "—"}</span>
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
        bloqueado={false}
      />

      <ResumoFinanceiro itens={itens} uf={cliente.uf} />

      {/* Footer sticky */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t z-10 -mx-4 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <span className="font-semibold text-lg">{formatBRL(totalGeral)}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/faturamento")}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar alterações
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
