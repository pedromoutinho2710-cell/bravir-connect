import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDate, formatCNPJ } from "@/lib/format";
import { AlertCircle, CheckCircle2, Clock, Download, FileDown, PackageX, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { formatDistanceToNow, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { STATUS_LABEL, STATUS_COLOR } from "@/lib/status";

type HistoricoItem = {
  id: string;
  acao: string;
  status_anterior: string | null;
  status_novo: string;
  motivo: string | null;
  usuario_nome: string | null;
  usuario_email: string | null;
  created_at: string;
};

type ItemDetalhe = {
  produto_id: string;
  nome: string;
  codigo: string;
  marca: string;
  quantidade: number;
  qtd_faturada: number;
  preco_bruto: number;
  desconto_perfil: number;
  desconto_comercial: number;
  desconto_trade: number;
  preco_final: number;
  total: number;
};

type ItemFracionado = {
  produto_id: string;
  nome: string;
  codigo: string;
  qtd_pedida: number;
  saldo: number;
  total: number;
};

type FaturamentoNF = {
  id: string;
  nota_fiscal: string | null;
  nf_pdf_url: string | null;
  rastreio: string | null;
  obs: string | null;
  faturado_em: string;
};

type PedidoDetalhe = {
  numero_pedido: number;
  tipo: string;
  data_pedido: string;
  status: string;
  status_atualizado_em: string | null;
  cluster: string;
  tabela_preco: string;
  cond_pagamento: string | null;
  agendamento: boolean;
  observacoes: string | null;
  motivo: string | null;
  razao_social: string;
  cnpj: string;
  cidade: string | null;
  uf: string | null;
  comprador: string | null;
  telefone: string | null;
  codigo_parceiro: string | null;
  negativado: boolean;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  itens: ItemDetalhe[];
  historico: HistoricoItem[];
  faturamentos: FaturamentoNF[];
  fracionado: {
    pedidoFilhoId: string;
    itensSaldo: ItemFracionado[];
  } | null;
};

type Props = {
  pedidoId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCorrigir?: () => void;
  onExcluir?: () => void;
  onEditar?: () => void;
};

function tempoNaEtapa(dt: string | null): { texto: string; urgente: boolean } | null {
  if (!dt) return null;
  try {
    const d = new Date(dt);
    const horas = differenceInHours(new Date(), d);
    return {
      texto: formatDistanceToNow(d, { addSuffix: true, locale: ptBR }),
      urgente: horas >= 48,
    };
  } catch {
    return null;
  }
}

export function PedidoDetalhesDialog({ pedidoId, open, onOpenChange, onCorrigir, onExcluir, onEditar }: Props) {
  const [pedido, setPedido] = useState<PedidoDetalhe | null>(null);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    if (!pedidoId) return;
    setLoading(true);
    try {
      const pRes = await supabase
        .from("pedidos")
        .select(`
          id,
          numero_pedido,
          tipo,
          data_pedido,
          status,
          status_atualizado_em,
          perfil_cliente,
          tabela_preco,
          cond_pagamento,
          agendamento,
          observacoes,
          motivo,
          responsavel_id,
          cliente_id,
          vendedor_id,
          clientes(razao_social, nome_parceiro, cnpj, cidade, uf, comprador, telefone, codigo_parceiro, negativado),
          itens_pedido(
            produto_id,
            quantidade,
            qtd_faturada,
            preco_unitario_bruto,
            preco_final,
            total_item,
            desconto_perfil,
            desconto_comercial,
            desconto_trade,
            produtos(nome, codigo_jiva, marca)
          )
        `)
        .eq("id", pedidoId)
        .single();

      if (pRes.error || !pRes.data) {
        toast.error("Erro ao carregar pedido: " + (pRes.error?.message ?? "sem dados"));
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = pRes.data as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cl = d.clientes as any;

      // Busca paralela de histórico + faturamentos (falhas não bloqueiam o modal)
      const [hRes, fatRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("historico_status")
          .select("id, acao, status_anterior, status_novo, motivo, usuario_nome, usuario_email, created_at")
          .eq("pedido_id", pedidoId)
          .order("created_at", { ascending: true }),
        supabase
          .from("faturamentos")
          .select("id, nota_fiscal, nf_pdf_url, rastreio, obs, faturado_em")
          .eq("pedido_id", pedidoId)
          .order("faturado_em", { ascending: true }),
      ]);

      // Busca nome do responsável (falha tratada)
      let responsavelNome: string | null = null;
      if (d.responsavel_id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", d.responsavel_id)
          .maybeSingle();
        if (prof) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p = prof as any;
          responsavelNome = p.full_name ?? p.email ?? null;
        }
      }

      // Busca pedido filho fracionado (se houver)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filhoRes = await (supabase as any)
        .from("pedidos")
        .select(`
          id,
          itens_pedido(
            produto_id,
            quantidade,
            total_item,
            produtos(nome, codigo_jiva)
          )
        `)
        .eq("pedido_origem_id", pedidoId)
        .maybeSingle();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filho = (filhoRes && !filhoRes.error ? filhoRes.data : null) as any;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itensParent = (d.itens_pedido ?? []) as any[];
      const qtdPedidaByProd: Record<string, number> = {};
      itensParent.forEach((i) => {
        if (i.produto_id) qtdPedidaByProd[i.produto_id] = Number(i.quantidade);
      });

      let fracionado: PedidoDetalhe["fracionado"] = null;
      if (filho && Array.isArray(filho.itens_pedido) && filho.itens_pedido.length > 0) {
        fracionado = {
          pedidoFilhoId: filho.id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          itensSaldo: (filho.itens_pedido as any[]).map((i) => ({
            produto_id: i.produto_id,
            nome: i.produtos?.nome ?? "—",
            codigo: i.produtos?.codigo_jiva ?? "—",
            qtd_pedida: qtdPedidaByProd[i.produto_id] ?? Number(i.quantidade),
            saldo: Number(i.quantidade),
            total: Number(i.total_item),
          })),
        };
      }

      setPedido({
        numero_pedido: d.numero_pedido,
        tipo: d.tipo,
        data_pedido: d.data_pedido,
        status: d.status,
        status_atualizado_em: d.status_atualizado_em ?? null,
        cluster: d.perfil_cliente,
        tabela_preco: d.tabela_preco,
        cond_pagamento: d.cond_pagamento,
        agendamento: d.agendamento,
        observacoes: d.observacoes,
        motivo: d.motivo,
        razao_social: cl?.nome_parceiro || cl?.razao_social || "—",
        cnpj: cl?.cnpj ?? "—",
        cidade: cl?.cidade ?? null,
        uf: cl?.uf ?? null,
        comprador: cl?.comprador ?? null,
        telefone: cl?.telefone ?? null,
        codigo_parceiro: cl?.codigo_parceiro ?? null,
        negativado: cl?.negativado ?? false,
        responsavel_id: d.responsavel_id ?? null,
        responsavel_nome: responsavelNome,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        itens: (d.itens_pedido ?? []).map((i: any) => ({
          produto_id: i.produto_id,
          nome: i.produtos?.nome ?? "—",
          codigo: i.produtos?.codigo_jiva ?? "—",
          marca: i.produtos?.marca ?? "—",
          quantidade: i.quantidade,
          qtd_faturada: Number(i.qtd_faturada ?? 0),
          preco_bruto: Number(i.preco_unitario_bruto),
          desconto_perfil: Number(i.desconto_perfil ?? 0),
          desconto_comercial: Number(i.desconto_comercial ?? 0),
          desconto_trade: Number(i.desconto_trade ?? 0),
          preco_final: Number(i.preco_final ?? 0),
          total: Number(i.total_item),
        })),
        historico: (hRes.data ?? []) as HistoricoItem[],
        faturamentos: (fatRes.data ?? []) as FaturamentoNF[],
        fracionado,
      });
    } finally {
      setLoading(false);
    }
  }, [pedidoId]);

  useEffect(() => {
    if (!open || !pedidoId) { setPedido(null); return; }
    carregar();
  }, [open, pedidoId, carregar]);

  // Realtime: refetch quando o pedido (ou seu filho fracionado) muda
  useEffect(() => {
    if (!open || !pedidoId) return;
    const channel = supabase
      .channel(`pedido-detalhes-${pedidoId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos", filter: `id=eq.${pedidoId}` },
        () => { carregar(); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos", filter: `pedido_origem_id=eq.${pedidoId}` },
        () => { carregar(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, pedidoId, carregar]);

  const totalGeral = pedido?.itens.reduce((s, i) => s + i.total, 0) ?? 0;
  const etapa = pedido ? tempoNaEtapa(pedido.status_atualizado_em) : null;

  const baixarPDF = async () => {
    if (!pedido) return;
    try {
      const { gerarPedidoPDF } = await import("@/lib/pdf");
      const doc = gerarPedidoPDF({
        data: new Date(pedido.data_pedido + "T12:00:00"),
        tipo: pedido.tipo,
        cliente: {
          cnpj: pedido.cnpj,
          razao_social: pedido.razao_social,
          cidade: pedido.cidade ?? "",
          uf: pedido.uf ?? "",
          comprador: pedido.comprador ?? "",
        },
        cluster: pedido.cluster,
        tabela_preco: pedido.tabela_preco,
        cond_pagamento: pedido.cond_pagamento ?? "",
        agendamento: pedido.agendamento,
        observacoes: pedido.observacoes ?? "",
        itens: pedido.itens.map((i) => ({
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
        })),
      });
      const nome = `pedido-${pedido.numero_pedido}-${pedido.razao_social.slice(0, 20).replace(/\s/g, "-")}.pdf`;
      doc.save(nome);
    } catch {
      toast.error("Erro ao gerar PDF");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {pedido ? `Pedido #${pedido.numero_pedido} — ${pedido.razao_social}` : "Detalhes do pedido"}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {!loading && pedido && (
          <div className="space-y-5 text-sm">

            {/* Cabeçalho: status + tempo na etapa + responsável */}
            <div className="flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_COLOR[pedido.status] ?? "bg-gray-100 text-gray-700 border-gray-300"}`}>
                {STATUS_LABEL[pedido.status] ?? pedido.status}
              </span>

              {etapa && (
                <span className={`flex items-center gap-1 text-xs ${etapa.urgente ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
                  <Clock className="h-3 w-3" />
                  Neste status {etapa.texto}
                  {etapa.urgente && " ⚠"}
                </span>
              )}

              {pedido.responsavel_nome && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <User className="h-3 w-3" />
                  Assumido por <span className="font-medium text-foreground">{pedido.responsavel_nome}</span>
                </span>
              )}

              {pedido.motivo && (
                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                  {pedido.motivo}
                </span>
              )}

              {pedido && (
                <Button size="sm" variant="outline" onClick={baixarPDF}>
                  <FileDown className="h-3.5 w-3.5 mr-1" />
                  Baixar PDF
                </Button>
              )}

              {pedido.status === "devolvido" && onCorrigir && (
                <Button size="sm" variant="destructive" onClick={onCorrigir}>
                  Corrigir pedido
                </Button>
              )}

              {pedido.status === "devolvido" && onExcluir && (
                <Button size="sm" variant="outline" className="text-destructive border-destructive hover:bg-destructive/10" onClick={onExcluir}>
                  Excluir pedido
                </Button>
              )}

              {pedido.status === "pendente_sankhya" && pedido.responsavel_id === null && onEditar && (
                <Button size="sm" variant="outline" onClick={onEditar}>
                  Editar pedido
                </Button>
              )}
              {pedido.status === "pendente_sankhya" && pedido.responsavel_id !== null && (
                <div>
                  <Button size="sm" variant="outline" disabled>
                    Editar pedido
                  </Button>
                  <div className="text-xs text-muted-foreground mt-1">
                    Pedido assumido por {pedido.responsavel_nome ?? "faturamento"} — edição bloqueada.
                  </div>
                </div>
              )}
            </div>

            {/* Alerta negativado */}
            {pedido.negativado && (
              <div className="flex items-center gap-2 rounded-md border border-red-400 bg-red-50 p-3 text-sm text-red-800">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Cliente negativado
              </div>
            )}

            {/* Informações do pedido + cliente */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-md border bg-muted/40 p-4 text-sm">
              <div><span className="text-muted-foreground">Cliente: </span><span className="font-medium">{pedido.razao_social}</span></div>
              <div><span className="text-muted-foreground">CNPJ: </span><span className="font-mono">{formatCNPJ(pedido.cnpj)}</span></div>
              {pedido.codigo_parceiro && (
                <div><span className="text-muted-foreground">Cód. Sankhya: </span><span className="font-mono font-medium">{pedido.codigo_parceiro}</span></div>
              )}
              {pedido.telefone && (
                <div><span className="text-muted-foreground">Telefone: </span>{pedido.telefone}</div>
              )}
              <div><span className="text-muted-foreground">Cidade/UF: </span>{pedido.cidade && pedido.uf ? `${pedido.cidade}/${pedido.uf}` : "—"}</div>
              <div><span className="text-muted-foreground">Comprador: </span>{pedido.comprador || "—"}</div>
              <div><span className="text-muted-foreground">Tabela: </span>{pedido.tabela_preco}</div>
              <div><span className="text-muted-foreground">Perfil: </span>{pedido.cluster}</div>
              <div><span className="text-muted-foreground">Tipo: </span>{pedido.tipo}</div>
              <div><span className="text-muted-foreground">Data: </span>{formatDate(pedido.data_pedido)}</div>
              <div><span className="text-muted-foreground">Pagamento: </span>{pedido.cond_pagamento || "—"}</div>
              <div><span className="text-muted-foreground">Agendamento: </span>{pedido.agendamento ? "Sim" : "Não"}</div>
              {pedido.observacoes && (
                <div className="col-span-2"><span className="text-muted-foreground">Obs: </span>{pedido.observacoes}</div>
              )}
            </div>

            {/* Notas fiscais — vêm de faturamentos */}
            {pedido.faturamentos.length > 0 && (
              <div className="space-y-2">
                <div className="font-semibold">Notas Fiscais</div>
                {pedido.faturamentos.map((fat) => (
                  <div key={fat.id} className="rounded-md border border-green-200 bg-green-50 p-3 text-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        {fat.nota_fiscal && (
                          <span className="font-medium">NF {fat.nota_fiscal}</span>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {new Date(fat.faturado_em).toLocaleString("pt-BR")}
                        </div>
                        {fat.rastreio && (
                          <div><span className="text-muted-foreground">Rastreio: </span>{fat.rastreio}</div>
                        )}
                        {fat.obs && (
                          <div className="text-muted-foreground">{fat.obs}</div>
                        )}
                      </div>
                      {fat.nf_pdf_url && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs flex-shrink-0"
                          onClick={async () => {
                            const { data } = await supabase.storage
                              .from("notas_fiscais")
                              .createSignedUrl(fat.nf_pdf_url!, 3600);
                            if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                          }}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Baixar NF
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Itens */}
            {pedido.fracionado ? (
              <div className="space-y-4">
                {/* SEÇÃO VERDE — Cadastrado no Sankhya */}
                {(() => {
                  const verdes = pedido.itens.filter((i) => i.qtd_faturada > 0);
                  if (verdes.length === 0) return null;
                  const totalVerde = verdes.reduce(
                    (s, i) => s + i.preco_final * i.qtd_faturada,
                    0,
                  );
                  return (
                    <div
                      className="rounded-md border p-3"
                      style={{ background: "#E1F5EE", borderColor: "#5DCAA5" }}
                    >
                      <div className="flex items-center gap-2 font-semibold mb-2 text-green-800">
                        <CheckCircle2 className="h-4 w-4" />
                        Cadastrado no Sankhya
                      </div>
                      <div className="rounded-md border overflow-x-auto bg-white">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium">Produto</th>
                              <th className="text-left px-3 py-2 font-medium">Código</th>
                              <th className="text-right px-3 py-2 font-medium">Qtd Pedida</th>
                              <th className="text-right px-3 py-2 font-medium">Qtd Lançada</th>
                              <th className="text-right px-3 py-2 font-medium">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {verdes.map((i, idx) => (
                              <tr key={idx} className="border-t">
                                <td className="px-3 py-1.5">
                                  {i.nome}
                                  <div className="text-muted-foreground text-[10px]">{i.marca}</div>
                                </td>
                                <td className="px-3 py-1.5 font-mono text-muted-foreground whitespace-nowrap">{i.codigo}</td>
                                <td className="px-3 py-1.5 text-right">{i.quantidade}</td>
                                <td className="px-3 py-1.5 text-right font-medium">{i.qtd_faturada}</td>
                                <td className="px-3 py-1.5 text-right font-semibold">
                                  {formatBRL(i.preco_final * i.qtd_faturada)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t bg-green-50">
                              <td colSpan={4} className="px-3 py-2 text-right font-bold">Total lançado</td>
                              <td className="px-3 py-2 text-right font-bold text-green-700">
                                {formatBRL(totalVerde)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  );
                })()}

                {/* SEÇÃO VERMELHA — Sem estoque */}
                <div
                  className="rounded-md border p-3"
                  style={{ background: "#FCEBEB", borderColor: "#F09595" }}
                >
                  <div className="flex items-center gap-2 font-semibold mb-2 text-red-800">
                    <PackageX className="h-4 w-4" />
                    Sem estoque — aguardando reposição
                  </div>
                  <div className="rounded-md border overflow-x-auto bg-white">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Produto</th>
                          <th className="text-left px-3 py-2 font-medium">Código</th>
                          <th className="text-right px-3 py-2 font-medium">Qtd Pedida</th>
                          <th className="text-right px-3 py-2 font-medium">Saldo</th>
                          <th className="text-right px-3 py-2 font-medium">Total Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pedido.fracionado.itensSaldo.map((i, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="px-3 py-1.5">{i.nome}</td>
                            <td className="px-3 py-1.5 font-mono text-muted-foreground whitespace-nowrap">{i.codigo}</td>
                            <td className="px-3 py-1.5 text-right">{i.qtd_pedida}</td>
                            <td className="px-3 py-1.5 text-right font-medium">{i.saldo}</td>
                            <td className="px-3 py-1.5 text-right font-semibold">{formatBRL(i.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t bg-red-50">
                          <td colSpan={4} className="px-3 py-2 text-right font-bold">Total saldo</td>
                          <td className="px-3 py-2 text-right font-bold text-red-700">
                            {formatBRL(pedido.fracionado.itensSaldo.reduce((s, i) => s + i.total, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="font-semibold mb-2">Produtos</div>
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">SKU</th>
                        <th className="text-left px-3 py-2 font-medium">Produto</th>
                        <th className="text-right px-3 py-2 font-medium">Qtd</th>
                        <th className="text-right px-3 py-2 font-medium">P. Unit</th>
                        <th className="text-right px-3 py-2 font-medium">Unit c/ Desc</th>
                        <th className="text-right px-3 py-2 font-medium">Perf%</th>
                        <th className="text-right px-3 py-2 font-medium">Com%</th>
                        <th className="text-right px-3 py-2 font-medium">Trade%</th>
                        <th className="text-right px-3 py-2 font-medium">P. Final</th>
                        <th className="text-right px-3 py-2 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedido.itens.map((i, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="px-3 py-1.5 font-mono text-muted-foreground whitespace-nowrap">{i.codigo}</td>
                          <td className="px-3 py-1.5">
                            {i.nome}
                            <div className="text-muted-foreground text-[10px]">{i.marca}</div>
                          </td>
                          <td className="px-3 py-1.5 text-right">{i.quantidade}</td>
                          <td className="px-3 py-1.5 text-right">{formatBRL(i.preco_bruto)}</td>
                          <td className="px-3 py-1.5 text-right text-green-700 font-medium">{formatBRL(i.preco_final)}</td>
                          <td className="px-3 py-1.5 text-right text-muted-foreground">{i.desconto_perfil}%</td>
                          <td className="px-3 py-1.5 text-right text-muted-foreground">{i.desconto_comercial}%</td>
                          <td className="px-3 py-1.5 text-right text-muted-foreground">{i.desconto_trade}%</td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatBRL(i.preco_final)}</td>
                          <td className="px-3 py-1.5 text-right font-semibold">{formatBRL(i.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-primary/10">
                        <td colSpan={9} className="px-3 py-2 text-right font-bold">Total geral</td>
                        <td className="px-3 py-2 text-right font-bold text-green-700">{formatBRL(totalGeral)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Histórico */}
            {pedido.historico.length > 0 && (
              <div>
                <div className="font-semibold mb-3">Histórico</div>
                <ol className="relative border-l border-muted-foreground/30 space-y-4 ml-3">
                  {pedido.historico.map((h) => (
                    <li key={h.id} className="ml-4">
                      <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-white bg-primary" />
                      <div className="text-xs text-muted-foreground">
                        {formatDate(h.created_at)} · {new Date(h.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <div className="font-medium">
                        {h.acao}
                        {h.status_anterior && h.status_novo !== h.status_anterior && (
                          <span className="text-muted-foreground font-normal">
                            {" "}· {STATUS_LABEL[h.status_anterior] ?? h.status_anterior} → {STATUS_LABEL[h.status_novo] ?? h.status_novo}
                          </span>
                        )}
                      </div>
                      {h.usuario_nome && (
                        <div className="text-xs text-muted-foreground">{h.usuario_nome}</div>
                      )}
                      {h.motivo && (
                        <div className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1">{h.motivo}</div>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
