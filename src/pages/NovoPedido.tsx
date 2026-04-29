import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Save, FileDown, Eye, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { onlyDigits, formatBRL, formatDate } from "@/lib/format";
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

export default function NovoPedido() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [cliente, setCliente] = useState<DadosCliente>(initialCliente);
  const [itens, setItens] = useState<ItemPedido[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [precos, setPrecos] = useState<Record<string, Record<string, number>>>({});
  const [descontos, setDescontos] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pedidoId, setPedidoId] = useState<string | null>(null);
  const autoSaveTimer = useRef<number | null>(null);

  // Carrega catálogo + restaura rascunho local
  useEffect(() => {
    (async () => {
      const [pRes, prRes, dRes] = await Promise.all([
        supabase.from("produtos").select("*").eq("ativo", true).order("marca").order("nome"),
        supabase.from("precos").select("*"),
        supabase.from("descontos").select("*"),
      ]);
      if (pRes.data) setProdutos(pRes.data as Produto[]);
      if (prRes.data) {
        const map: Record<string, Record<string, number>> = {};
        prRes.data.forEach((p) => {
          (map[p.produto_id] ||= {})[p.tabela] = Number(p.preco_bruto);
        });
        setPrecos(map);
      }
      if (dRes.data) {
        const map: Record<string, Record<string, number>> = {};
        dRes.data.forEach((d) => {
          (map[d.produto_id] ||= {})[d.perfil_cliente] = Number(d.percentual_desconto);
        });
        setDescontos(map);
      }

      // restaura rascunho
      try {
        const raw = localStorage.getItem(RASCUNHO_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.cliente) setCliente(saved.cliente);
          if (saved.itens) setItens(saved.itens);
          if (saved.pedidoId) setPedidoId(saved.pedidoId);
        }
      } catch {
        // ignore
      }
      setLoading(false);
    })();
  }, []);

  // Auto-save local a cada alteração
  useEffect(() => {
    if (loading) return;
    if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = window.setTimeout(() => {
      localStorage.setItem(RASCUNHO_KEY, JSON.stringify({ cliente, itens, pedidoId }));
    }, 500);
  }, [cliente, itens, pedidoId, loading]);

  const podeSalvar = useMemo(() => {
    return (
      onlyDigits(cliente.cnpj).length === 14 &&
      cliente.razao_social.trim().length > 0 &&
      cliente.perfil_cliente &&
      cliente.tabela_preco
    );
  }, [cliente]);

  const podeEnviar = podeSalvar && itens.length > 0;

  // Garante cliente cadastrado e devolve cliente_id
  const garantirCliente = async (): Promise<string | null> => {
    if (cliente.cliente_id) return cliente.cliente_id;
    const { data, error } = await supabase
      .from("clientes")
      .insert({
        cnpj: onlyDigits(cliente.cnpj),
        razao_social: cliente.razao_social,
        cidade: cliente.cidade || null,
        uf: cliente.uf || null,
        cep: onlyDigits(cliente.cep) || null,
        comprador: cliente.comprador || null,
      })
      .select("id")
      .single();
    if (error) {
      toast.error("Erro ao salvar cliente: " + error.message);
      return null;
    }
    setCliente((c) => ({ ...c, cliente_id: data.id }));
    return data.id;
  };

  const salvarPedido = async (status: "rascunho" | "aguardando_faturamento"): Promise<string | null> => {
    if (!user) return null;
    if (!podeSalvar) {
      toast.error("Preencha CNPJ, razão social, perfil e tabela de preço");
      return null;
    }
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
        toast.error("Erro ao atualizar: " + error.message);
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
        toast.error("Erro ao criar pedido: " + error.message);
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
          preco_unitario_liquido: i.preco_liquido,
          total_item: i.total,
        })),
      );
      if (error) {
        toast.error("Erro ao salvar itens: " + error.message);
        return null;
      }
    }
    return id;
  };

  const onSalvarRascunho = async () => {
    setSalvando(true);
    const id = await salvarPedido("rascunho");
    setSalvando(false);
    if (id) toast.success("Rascunho salvo");
  };

  const onEnviarFaturamento = async () => {
    if (!podeEnviar) {
      toast.error("Adicione ao menos um produto");
      return;
    }
    setEnviando(true);
    const id = await salvarPedido("aguardando_faturamento");
    setEnviando(false);
    if (id) {
      toast.success("Pedido enviado para faturamento");
      localStorage.removeItem(RASCUNHO_KEY);
      navigate("/meus-pedidos");
    }
  };

  const itensPdf: PdfItem[] = itens.map((i) => ({
    marca: i.marca,
    codigo: i.codigo,
    nome: i.nome,
    quantidade: i.quantidade,
    preco_bruto: i.preco_bruto,
    desconto_pct: i.desconto_pct,
    preco_liquido: i.preco_liquido,
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
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Novo Pedido</h1>
          <p className="text-sm text-muted-foreground">Preencha os dados do cliente, adicione produtos e envie para faturamento</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onSalvarRascunho} disabled={!podeSalvar || salvando}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar rascunho
          </Button>
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
                  <div className="bg-primary text-primary-foreground px-3 py-1.5 text-sm font-bold">{marca}</div>
                  <table className="w-full text-xs">
                    <tbody>
                      {lista.map((i) => (
                        <tr key={i.produto_id} className="border-b last:border-0">
                          <td className="px-3 py-1.5">
                            <span className="font-mono text-muted-foreground">{i.codigo}</span> {i.nome}
                          </td>
                          <td className="px-3 py-1.5 text-right">{i.quantidade}×</td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatBRL(i.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/50">
                        <td colSpan={2} className="px-3 py-1.5 text-right font-semibold">Subtotal</td>
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
