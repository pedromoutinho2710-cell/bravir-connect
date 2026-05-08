import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDate, formatCNPJ } from "@/lib/format";
import { AlertCircle, Clock, Download, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { formatDistanceToNow, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

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
  nome: string;
  codigo: string;
  marca: string;
  quantidade: number;
  preco_bruto: number;
  desconto_perfil: number;
  desconto_comercial: number;
  desconto_trade: number;
  preco_final: number;
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
  responsavel_nome: string | null;
  itens: ItemDetalhe[];
  historico: HistoricoItem[];
  faturamentos: FaturamentoNF[];
};

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_faturamento: "Pré-faturamento",
  no_sankhya: "Aguardando faturamento",
  faturado: "Faturado",
  parcialmente_faturado: "Parc. faturado",
  com_problema: "Com problema",
  devolvido: "Devolvido",
  cancelado: "Cancelado",
  em_faturamento: "Em faturamento",
  em_cadastro: "Em cadastro",
  pendente: "Pendente",
  revisao_necessaria: "Revisão necessária",
  em_rota: "Em rota",
  entregue: "Entregue",
};

const STATUS_COLOR: Record<string, string> = {
  rascunho: "bg-gray-100 text-gray-600 border-gray-300",
  aguardando_faturamento: "bg-yellow-100 text-yellow-800 border-yellow-300",
  no_sankhya: "bg-blue-100 text-blue-800 border-blue-300",
  faturado: "bg-green-100 text-green-800 border-green-300",
  parcialmente_faturado: "bg-emerald-100 text-emerald-800 border-emerald-300",
  com_problema: "bg-red-100 text-red-800 border-red-300",
  devolvido: "bg-orange-100 text-orange-800 border-orange-300",
  cancelado: "bg-gray-800 text-gray-100 border-gray-700",
  em_faturamento: "bg-blue-100 text-blue-800 border-blue-300",
  em_cadastro: "bg-blue-100 text-blue-800 border-blue-300",
  pendente: "bg-orange-100 text-orange-800 border-orange-300",
  revisao_necessaria: "bg-red-100 text-red-800 border-red-300",
  em_rota: "bg-gray-700 text-gray-100 border-gray-800",
  entregue: "bg-lime-100 text-lime-800 border-lime-300",
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

export function PedidoDetalhesDialog({ pedidoId, open, onOpenChange, onCorrigir, onExcluir }: Props) {
  const [pedido, setPedido] = useState<PedidoDetalhe | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !pedidoId) { setPedido(null); return; }
    setLoading(true);
    (async () => {
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
          clientes(razao_social, cnpj, cidade, uf, comprador, telefone, codigo_parceiro, negativado),
          itens_pedido(
            quantidade,
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
        razao_social: cl?.razao_social ?? "—",
        cnpj: cl?.cnpj ?? "—",
        cidade: cl?.cidade ?? null,
        uf: cl?.uf ?? null,
        comprador: cl?.comprador ?? null,
        telefone: cl?.telefone ?? null,
        codigo_parceiro: cl?.codigo_parceiro ?? null,
        negativado: cl?.negativado ?? false,
        responsavel_nome: responsavelNome,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        itens: (d.itens_pedido ?? []).map((i: any) => ({
          nome: i.produtos?.nome ?? "—",
          codigo: i.produtos?.codigo_jiva ?? "—",
          marca: i.produtos?.marca ?? "—",
          quantidade: i.quantidade,
          preco_bruto: Number(i.preco_unitario_bruto),
          desconto_perfil: Number(i.desconto_perfil ?? 0),
          desconto_comercial: Number(i.desconto_comercial ?? 0),
          desconto_trade: Number(i.desconto_trade ?? 0),
          preco_final: Number(i.preco_final ?? 0),
          total: Number(i.total_item),
        })),
        historico: (hRes.data ?? []) as HistoricoItem[],
        faturamentos: (fatRes.data ?? []) as FaturamentoNF[],
      });
    })().finally(() => setLoading(false));
  }, [open, pedidoId]);

  const totalGeral = pedido?.itens.reduce((s, i) => s + i.total, 0) ?? 0;
  const etapa = pedido ? tempoNaEtapa(pedido.status_atualizado_em) : null;

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
                      <td colSpan={8} className="px-3 py-2 text-right font-bold">Total geral</td>
                      <td className="px-3 py-2 text-right font-bold text-green-700">{formatBRL(totalGeral)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

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
