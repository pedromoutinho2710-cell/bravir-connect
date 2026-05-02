import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDate, formatCNPJ } from "@/lib/format";
import { Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  preco_apos_perfil: number;
  preco_apos_comercial: number;
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
  perfil_cliente: string;
  tabela_preco: string;
  cond_pagamento: string | null;
  agendamento: boolean;
  observacoes: string | null;
  razao_social: string;
  cnpj: string;
  cidade: string | null;
  uf: string | null;
  comprador: string | null;
  nota_fiscal: string | null;
  nf_pdf_url: string | null;
  rastreio: string | null;
  obs_faturamento: string | null;
  itens: ItemDetalhe[];
  historico: HistoricoItem[];
  faturamentos: FaturamentoNF[];
};

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  em_cadastro: "Em cadastro",
  aguardando_faturamento: "Aguardando faturamento",
  pendente: "Pendente",
  em_faturamento: "Em faturamento",
  em_rota: "Em rota",
  faturado: "Faturado",
  entregue: "Entregue",
  revisao_necessaria: "Revisão necessária",
  devolvido: "Devolvido",
  cancelado: "Cancelado",
};

type Props = {
  pedidoId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export function PedidoDetalhesDialog({ pedidoId, open, onOpenChange }: Props) {
  const [pedido, setPedido] = useState<PedidoDetalhe | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !pedidoId) { setPedido(null); return; }
    setLoading(true);
    (async () => {
      const [pRes, hRes, fatRes] = await Promise.all([
        supabase
          .from("pedidos")
          .select(`
            numero_pedido, tipo, data_pedido, status, perfil_cliente, tabela_preco,
            cond_pagamento, agendamento, observacoes,
            nota_fiscal, nf_pdf_url, rastreio, obs_faturamento,
            clientes(razao_social, cnpj, cidade, uf, comprador),
            itens_pedido(
              quantidade, preco_unitario_bruto, preco_unitario_liquido,
              desconto_perfil, desconto_comercial, desconto_trade,
              preco_apos_perfil, preco_apos_comercial, preco_final, total_item,
              produtos(nome, codigo_jiva, marca)
            )
          `)
          .eq("id", pedidoId)
          .single(),
        supabase
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

      if (pRes.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = pRes.data as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cl = d.clientes as any;
        setPedido({
          numero_pedido: d.numero_pedido,
          tipo: d.tipo,
          data_pedido: d.data_pedido,
          status: d.status,
          perfil_cliente: d.perfil_cliente,
          tabela_preco: d.tabela_preco,
          cond_pagamento: d.cond_pagamento,
          agendamento: d.agendamento,
          observacoes: d.observacoes,
          razao_social: cl?.razao_social ?? "—",
          cnpj: cl?.cnpj ?? "—",
          cidade: cl?.cidade ?? null,
          uf: cl?.uf ?? null,
          comprador: cl?.comprador ?? null,
          nota_fiscal: d.nota_fiscal ?? null,
          nf_pdf_url: d.nf_pdf_url ?? null,
          rastreio: d.rastreio ?? null,
          obs_faturamento: d.obs_faturamento ?? null,
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
            preco_apos_perfil: Number(i.preco_apos_perfil ?? i.preco_unitario_liquido ?? 0),
            preco_apos_comercial: Number(i.preco_apos_comercial ?? i.preco_unitario_liquido ?? 0),
            preco_final: Number(i.preco_final ?? i.preco_unitario_liquido ?? 0),
            total: Number(i.total_item),
          })),
          historico: (hRes.data ?? []) as HistoricoItem[],
          faturamentos: (fatRes.data ?? []) as FaturamentoNF[],
        });
      }
    })().finally(() => setLoading(false));
  }, [open, pedidoId]);

  const totalGeral = pedido?.itens.reduce((s, i) => s + i.total, 0) ?? 0;

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
            {/* Cabeçalho do pedido */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-md border bg-muted/40 p-4 text-sm">
              <div><span className="text-muted-foreground">Cliente: </span><span className="font-medium">{pedido.razao_social}</span></div>
              <div><span className="text-muted-foreground">CNPJ: </span><span className="font-mono">{formatCNPJ(pedido.cnpj)}</span></div>
              <div><span className="text-muted-foreground">Cidade/UF: </span>{pedido.cidade && pedido.uf ? `${pedido.cidade}/${pedido.uf}` : "—"}</div>
              <div><span className="text-muted-foreground">Comprador: </span>{pedido.comprador || "—"}</div>
              <div><span className="text-muted-foreground">Tipo: </span>{pedido.tipo}</div>
              <div><span className="text-muted-foreground">Data: </span>{formatDate(pedido.data_pedido)}</div>
              <div><span className="text-muted-foreground">Tabela: </span>{pedido.tabela_preco}</div>
              <div><span className="text-muted-foreground">Perfil: </span>{pedido.perfil_cliente}</div>
              <div><span className="text-muted-foreground">Pagamento: </span>{pedido.cond_pagamento || "—"}</div>
              <div><span className="text-muted-foreground">Agendamento: </span>{pedido.agendamento ? "Sim" : "Não"}</div>
              {pedido.observacoes && (
                <div className="col-span-2"><span className="text-muted-foreground">Obs: </span>{pedido.observacoes}</div>
              )}
            </div>

            {/* Notas fiscais emitidas (new multi-NF model) */}
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

            {/* Legacy single-NF fallback for orders billed before multi-NF migration */}
            {pedido.faturamentos.length === 0 && (pedido.nota_fiscal || pedido.rastreio || pedido.obs_faturamento) && (
              <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm space-y-1.5">
                <div className="font-semibold text-green-800 mb-2">Informações de Faturamento</div>
                {pedido.nota_fiscal && (
                  <div className="flex items-center justify-between">
                    <span>
                      <span className="text-muted-foreground">NF: </span>
                      <span className="font-medium">{pedido.nota_fiscal}</span>
                    </span>
                    {pedido.nf_pdf_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={async () => {
                          const { data } = await supabase.storage
                            .from("notas_fiscais")
                            .createSignedUrl(pedido.nf_pdf_url!, 3600);
                          if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                        }}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Baixar NF
                      </Button>
                    )}
                  </div>
                )}
                {pedido.rastreio && (
                  <div><span className="text-muted-foreground">Rastreio: </span><span className="font-medium">{pedido.rastreio}</span></div>
                )}
                {pedido.obs_faturamento && (
                  <div><span className="text-muted-foreground">Obs faturamento: </span>{pedido.obs_faturamento}</div>
                )}
              </div>
            )}

            {/* Itens */}
            <div>
              <div className="font-semibold mb-2">Itens</div>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Produto</th>
                      <th className="text-right px-3 py-2 font-medium">Qtd</th>
                      <th className="text-right px-3 py-2 font-medium">P. Bruto</th>
                      <th className="text-right px-3 py-2 font-medium">Perf %</th>
                      <th className="text-right px-3 py-2 font-medium">Com %</th>
                      <th className="text-right px-3 py-2 font-medium">Trade %</th>
                      <th className="text-right px-3 py-2 font-medium">P. Final</th>
                      <th className="text-right px-3 py-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedido.itens.map((i, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="px-3 py-1.5">
                          <span className="font-mono text-muted-foreground">{i.codigo}</span>{" "}{i.nome}
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
                      <td colSpan={7} className="px-3 py-2 text-right font-bold">Total geral</td>
                      <td className="px-3 py-2 text-right font-bold">{formatBRL(totalGeral)}</td>
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
