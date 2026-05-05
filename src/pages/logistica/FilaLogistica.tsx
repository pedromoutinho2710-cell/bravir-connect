// SQL necessário para RLS (rodar no Supabase antes de usar):
//
// CREATE POLICY "logistica_read_pedidos" ON pedidos
// FOR SELECT USING (
//   EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('logistica', 'admin'))
// );
//
// CREATE POLICY "logistica_update_pedidos" ON pedidos
// FOR UPDATE USING (
//   EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('logistica', 'admin'))
// );
//
// Certifique-se também de que o bucket "notas_fiscais" existe no Supabase Storage.

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatBRL, formatDate, formatCNPJ } from "@/lib/format";
import { BadgeNegativado } from "@/components/BadgeNegativado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  RefreshCw,
  FileText,
  Trash2,
  Eye,
  XCircle,
} from "lucide-react";

// ICMS padrão interno por UF (%)
const ICMS_UF: Record<string, number> = {
  AC: 19, AL: 19, AM: 20, AP: 18, BA: 20.5, CE: 20, DF: 20,
  ES: 17, GO: 19, MA: 22, MG: 20, MS: 17, MT: 17, PA: 19,
  PB: 20, PE: 20.5, PI: 21, PR: 19.5, RJ: 22, RN: 20, RO: 17.5,
  RR: 20, RS: 17, SC: 17, SE: 19, SP: 18, TO: 20,
};

const STATUS_LABEL: Record<string, string> = {
  aguardando_faturamento: "Aguardando",
  parcialmente_faturado: "Parc. pré-faturado",
};
const STATUS_COLOR: Record<string, string> = {
  aguardando_faturamento: "bg-yellow-100 text-yellow-800 border-yellow-300",
  parcialmente_faturado: "bg-teal-100 text-teal-800 border-teal-300",
};

type ItemPedido = {
  id: string;
  nome: string;
  codigo: string;
  cx_embarque: number;
  quantidade: number;
  qtd_faturada: number;
  peso_unitario: number;
  preco_bruto: number;
  preco_final: number;
  total: number;
};

type Pedido = {
  id: string;
  numero_pedido: number;
  data_pedido: string;
  status: string;
  cond_pagamento: string | null;
  observacoes: string | null;
  vendedor_id: string;
  cliente_id: string | null;
  razao_social: string;
  cnpj: string;
  cidade: string | null;
  uf: string | null;
  email_xml: string | null;
  negativado: boolean;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  codigo_parceiro: string | null;
  total: number;
  peso_total: number;
  itens: ItemPedido[];
};

export default function FilaLogistica() {
  const { user } = useAuth();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  // Dialog de detalhes / confirmação
  const [selecionado, setSelecionado] = useState<Pedido | null>(null);
  const [obsLogistica, setObsLogistica] = useState("");
  const [nfNumero, setNfNumero] = useState("");
  const [nfRastreio, setNfRastreio] = useState("");
  const [nfFile, setNfFile] = useState<File | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  // Dialog excluir
  const [excluirTarget, setExcluirTarget] = useState<Pedido | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("pedidos")
      .select(`
        id, numero_pedido, data_pedido, status, cond_pagamento, observacoes, vendedor_id, cliente_id,
        clientes(razao_social, cnpj, cidade, uf, email, negativado, cep, endereco, numero, complemento, bairro, codigo_parceiro),
        itens_pedido(
          id, quantidade, qtd_faturada, total_item, preco_final, preco_unitario_bruto,
          produtos(nome, codigo_jiva, cx_embarque, peso_unitario)
        )
      `)
      .in("status", ["aguardando_faturamento", "parcialmente_faturado"])
      .order("data_pedido", { ascending: true });

    if (error) { toast.error("Erro ao carregar pedidos"); setLoading(false); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped: Pedido[] = (data ?? []).map((p: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cl = p.clientes as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itensList = (p.itens_pedido ?? []) as any[];
      const total = itensList.reduce((s: number, i) => s + Number(i.total_item), 0);
      const pesoTotal = itensList.reduce(
        (s: number, i) => s + Number(i.produtos?.peso_unitario ?? 0) * Number(i.quantidade), 0
      );
      return {
        id: p.id,
        numero_pedido: p.numero_pedido,
        data_pedido: p.data_pedido,
        status: p.status,
        cond_pagamento: p.cond_pagamento,
        observacoes: p.observacoes,
        vendedor_id: p.vendedor_id,
        cliente_id: p.cliente_id ?? null,
        razao_social: cl?.razao_social ?? "—",
        cnpj: cl?.cnpj ?? "",
        cidade: cl?.cidade ?? null,
        uf: cl?.uf ?? null,
        email_xml: cl?.email ?? null,
        negativado: cl?.negativado ?? false,
        cep: cl?.cep ?? null,
        endereco: cl?.endereco ?? null,
        numero: cl?.numero ?? null,
        complemento: cl?.complemento ?? null,
        bairro: cl?.bairro ?? null,
        codigo_parceiro: cl?.codigo_parceiro ?? null,
        total,
        peso_total: pesoTotal,
        itens: itensList.map((i) => ({
          id: i.id,
          nome: i.produtos?.nome ?? "—",
          codigo: i.produtos?.codigo_jiva ?? "—",
          cx_embarque: Number(i.produtos?.cx_embarque ?? 1),
          quantidade: Number(i.quantidade),
          qtd_faturada: Number(i.qtd_faturada ?? 0),
          peso_unitario: Number(i.produtos?.peso_unitario ?? 0),
          preco_bruto: Number(i.preco_unitario_bruto ?? 0),
          preco_final: Number(i.preco_final ?? 0),
          total: Number(i.total_item),
        })),
      };
    });

    setPedidos(mapped);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    supabase.from("profiles").select("id, full_name, email").then(({ data }) => {
      if (!data) return;
      const map: Record<string, string> = {};
      data.forEach((p) => { map[p.id] = p.full_name || p.email || "—"; });
      setProfiles(map);
    });
  }, []);

  const abrirDialog = (p: Pedido) => {
    setSelecionado(p);
    setObsLogistica("");
    setNfNumero("");
    setNfRastreio("");
    setNfFile(null);
  };

  const confirmarFaturamento = async () => {
    if (!selecionado) return;
    setConfirmando(true);

    // Upload do arquivo da NF, se houver
    let nf_pdf_url: string | null = null;
    if (nfFile) {
      const suffix = nfNumero.trim() ? `_${nfNumero.trim()}` : "";
      const path = `${selecionado.id}/${Date.now()}${suffix}.pdf`;
      const { data: upData, error: upErr } = await supabase.storage
        .from("notas_fiscais")
        .upload(path, nfFile);
      if (upErr) {
        toast.error("Erro ao enviar arquivo da NF: " + upErr.message);
        setConfirmando(false);
        return;
      }
      nf_pdf_url = upData?.path ?? null;
    }

    // Atualizar status do pedido
    const { error: updErr } = await supabase
      .from("pedidos")
      .update({
        status: "faturado",
        faturado_em: new Date().toISOString(),
        status_atualizado_em: new Date().toISOString(),
      } as any)
      .eq("id", selecionado.id);

    if (updErr) {
      toast.error("Erro ao atualizar pedido: " + updErr.message);
      setConfirmando(false);
      return;
    }

    // Registrar faturamento com NF, rastreio e obs
    await supabase.from("faturamentos").insert({
      pedido_id: selecionado.id,
      nota_fiscal: nfNumero.trim() || null,
      nf_pdf_url,
      rastreio: nfRastreio.trim() || null,
      obs: obsLogistica.trim() || null,
      usuario_id: user?.id ?? null,
    } as any);

    // Notificar vendedor
    await supabase.from("notificacoes").insert({
      destinatario_id: selecionado.vendedor_id,
      destinatario_role: "vendedor",
      tipo: "pedido_faturado",
      mensagem: `Seu pedido #${selecionado.numero_pedido} foi faturado!${nfNumero.trim() ? ` NF: ${nfNumero.trim()}` : ""}`,
    } as any);

    // Notificar equipe de faturamento
    const { data: fatRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "faturamento");

    if (fatRoles && fatRoles.length > 0) {
      await supabase.from("notificacoes").insert(
        fatRoles.map((r) => ({
          destinatario_id: r.user_id,
          destinatario_role: "faturamento",
          tipo: "pedido_faturado",
          mensagem: `Pedido #${selecionado.numero_pedido} confirmado pela logística`,
        })) as any
      );
    }

    toast.success(`Pedido #${selecionado.numero_pedido} confirmado!`);
    setConfirmando(false);
    setSelecionado(null);
    carregar();
  };

  const excluirPedido = async () => {
    if (!excluirTarget) return;
    setExcluindo(true);
    const { error } = await supabase.from("pedidos").delete().eq("id", excluirTarget.id);
    setExcluindo(false);
    if (error) { toast.error("Erro ao excluir: " + error.message); return; }
    toast.success(`Pedido #${excluirTarget.numero_pedido} excluído`);
    setExcluirTarget(null);
    carregar();
  };

  // Gerar PDF para impressão
  const gerarPdf = (p: Pedido) => {
    const vendedor = profiles[p.vendedor_id] ?? "—";
    const icms = p.uf ? (ICMS_UF[p.uf] ?? null) : null;

    const linhas = p.itens.map((i) => {
      const precoBrutoFmt = formatBRL(i.preco_bruto);
      const precoLiqFmt = formatBRL(i.preco_final);
      const precoComIcms = icms != null ? formatBRL(i.preco_final / (1 - icms / 100)) : "—";
      const pesoTotal = (i.peso_unitario * i.quantidade).toFixed(2);
      return `
        <tr>
          <td>${i.codigo}</td>
          <td>${i.nome}</td>
          <td style="text-align:center">${i.cx_embarque}</td>
          <td style="text-align:center">${i.quantidade}</td>
          <td style="text-align:center">${i.qtd_faturada}</td>
          <td style="text-align:center">${pesoTotal} kg</td>
          <td style="text-align:right">${precoBrutoFmt}</td>
          <td style="text-align:right">${precoLiqFmt}</td>
          ${icms != null ? `<td style="text-align:right">${precoComIcms}</td>` : ""}
          <td style="text-align:right">${formatBRL(i.total)}</td>
        </tr>`;
    }).join("");

    const icmsHeader = icms != null ? `<th>Preço c/ ICMS (${icms}%)</th>` : "";

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>Pedido #${p.numero_pedido}</title>
      <style>
        body{font-family:sans-serif;font-size:11px;padding:20px;color:#111}
        h2{margin:0 0 4px;font-size:16px}
        p{margin:2px 0;color:#555}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        th,td{border:1px solid #ddd;padding:5px 8px}
        th{background:#f5f5f5;font-weight:600}
        .total{text-align:right;font-weight:bold;margin-top:10px;font-size:13px}
        .badge{display:inline-block;padding:2px 8px;border-radius:999px;background:#fef9c3;color:#854d0e;font-size:10px;font-weight:600;border:1px solid #fde047}
      </style>
      </head><body>
      <h2>Pedido #${p.numero_pedido} — ${p.razao_social}</h2>
      ${p.codigo_parceiro ? `<p>Cód. cliente: ${p.codigo_parceiro}</p>` : ""}
      <p>CNPJ: ${p.cnpj ? formatCNPJ(p.cnpj) : "—"} | Data: ${formatDate(p.data_pedido)} | Vendedor: ${vendedor}</p>
      <p>Cond. Pagamento: ${p.cond_pagamento ?? "—"} | Cidade/UF: ${[p.cidade, p.uf].filter(Boolean).join(" / ") || "—"}</p>
      ${(() => {
        const endParts = [
          [p.endereco, p.numero].filter(Boolean).join(", "),
          p.complemento,
          p.bairro,
          p.cep ? `CEP ${p.cep}` : null,
        ].filter(Boolean).join(" — ");
        return endParts ? `<p>Endereço: ${endParts}</p>` : "";
      })()}
      ${p.email_xml ? `<p>Email XML/Boleto: ${p.email_xml}</p>` : ""}
      ${icms != null ? `<p>ICMS interno ${p.uf}: <strong>${icms}%</strong></p>` : ""}
      ${p.negativado ? `<p><span class="badge">⚠ CLIENTE NEGATIVADO</span></p>` : ""}
      ${p.observacoes ? `<p>Obs: ${p.observacoes}</p>` : ""}
      <table>
        <thead><tr>
          <th>Código</th><th>Produto</th><th>Cx</th>
          <th>Qtd Pedida</th><th>Qtd Faturada</th><th>Peso Total</th>
          <th>Preço Bruto</th><th>Preço s/ Imposto</th>
          ${icmsHeader}
          <th>Total Item</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <p class="total">
        Peso total: ${p.peso_total.toFixed(2)} kg &nbsp;|&nbsp;
        Valor total s/ imposto: ${formatBRL(p.total)}
        ${icms != null ? ` &nbsp;|&nbsp; Valor c/ ICMS (${icms}%): ${formatBRL(p.total / (1 - icms / 100))}` : ""}
      </p>
      </body></html>`;

    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); win.print(); }
  };

  const icmsDoSelecionado = selecionado?.uf ? (ICMS_UF[selecionado.uf] ?? null) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fila de Pedidos — Logística</h1>
          <p className="text-sm text-muted-foreground">Pedidos aguardando confirmação de faturamento</p>
        </div>
        <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : pedidos.length === 0 ? (
        <div className="flex h-48 items-center justify-center">
          <p className="text-muted-foreground">Nenhum pedido aguardando faturamento</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28"># / Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Produtos</TableHead>
                <TableHead className="text-right">Peso Total</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pedidos.map((p) => (
                <TableRow key={p.id} className="hover:bg-muted/40">
                  <TableCell className="font-mono font-semibold text-sm">
                    <div>#{p.numero_pedido}</div>
                    <div className="text-xs font-normal text-muted-foreground">{formatDate(p.data_pedido)}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm flex items-center gap-1.5 flex-wrap">
                      {p.razao_social}
                      {p.negativado && <BadgeNegativado />}
                    </div>
                    {p.cnpj && <div className="text-xs font-mono text-muted-foreground">{formatCNPJ(p.cnpj)}</div>}
                    {(p.cidade || p.uf) && (
                      <div className="text-xs text-muted-foreground">{[p.cidade, p.uf].filter(Boolean).join(" / ")}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{profiles[p.vendedor_id] ?? "—"}</TableCell>
                  <TableCell>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {p.itens.slice(0, 3).map((i) => (
                        <div key={i.id} className="truncate max-w-[180px]">{i.nome}</div>
                      ))}
                      {p.itens.length > 3 && (
                        <div className="text-muted-foreground">+{p.itens.length - 3} produtos</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {p.peso_total > 0 ? `${p.peso_total.toFixed(1)} kg` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-bold text-sm text-green-700">
                    {formatBRL(p.total)}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[p.status] ?? "bg-gray-100 text-gray-700 border-gray-300"}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1.5">
                      {/* Ver detalhes + confirmar */}
                      <Button size="sm" onClick={() => abrirDialog(p)}>
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Ver detalhes
                      </Button>
                      {/* PDF */}
                      <Button size="sm" variant="outline" onClick={() => gerarPdf(p)} title="Exportar PDF">
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                      {/* Excluir */}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setExcluirTarget(p)}
                        title="Excluir pedido"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ─── Dialog de detalhes + confirmar faturamento ─── */}
      <Dialog open={!!selecionado} onOpenChange={(o) => !o && setSelecionado(null)}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          {selecionado && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Pedido #{selecionado.numero_pedido} — {selecionado.razao_social}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-5 py-2">

                {/* Dados do cliente */}
                <div className="rounded-md border bg-muted/30 p-4 space-y-1.5 text-sm">
                  <div className="font-semibold mb-2">Dados do cliente</div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {selecionado.codigo_parceiro && (
                      <div><span className="text-muted-foreground">Cód. cliente: </span>{selecionado.codigo_parceiro}</div>
                    )}
                    <div><span className="text-muted-foreground">CNPJ: </span>{selecionado.cnpj ? formatCNPJ(selecionado.cnpj) : "—"}</div>
                    <div><span className="text-muted-foreground">Cidade/UF: </span>{[selecionado.cidade, selecionado.uf].filter(Boolean).join(" / ") || "—"}</div>
                    {(selecionado.endereco || selecionado.bairro || selecionado.cep) && (
                      <div className="sm:col-span-2">
                        <span className="text-muted-foreground">Endereço: </span>
                        {[
                          [selecionado.endereco, selecionado.numero].filter(Boolean).join(", "),
                          selecionado.complemento,
                          selecionado.bairro,
                          selecionado.cep ? `CEP ${selecionado.cep}` : null,
                        ].filter(Boolean).join(" — ")}
                      </div>
                    )}
                    {selecionado.email_xml && (
                      <div className="sm:col-span-2"><span className="text-muted-foreground">Email XML/Boleto: </span>{selecionado.email_xml}</div>
                    )}
                    {selecionado.cond_pagamento && (
                      <div><span className="text-muted-foreground">Cond. Pagamento: </span>{selecionado.cond_pagamento}</div>
                    )}
                    {icmsDoSelecionado !== null && (
                      <div>
                        <span className="text-muted-foreground">ICMS interno {selecionado.uf}: </span>
                        <strong>{icmsDoSelecionado}%</strong>
                      </div>
                    )}
                    <div><span className="text-muted-foreground">Vendedor: </span>{profiles[selecionado.vendedor_id] ?? "—"}</div>
                    <div><span className="text-muted-foreground">Data do pedido: </span>{formatDate(selecionado.data_pedido)}</div>
                  </div>
                  {selecionado.negativado && (
                    <div className="pt-1"><BadgeNegativado /></div>
                  )}
                </div>

                {/* Tabela de produtos */}
                <div>
                  <div className="font-semibold mb-2 text-sm">Produtos</div>
                  <div className="rounded-md border overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left px-3 py-2">Produto</th>
                          <th className="text-center px-2 py-2 w-10">Cx</th>
                          <th className="text-center px-2 py-2 w-20">Qtd</th>
                          <th className="text-center px-2 py-2 w-24">Qtd Fat.</th>
                          <th className="text-center px-2 py-2 w-20">Peso Un.</th>
                          <th className="text-center px-2 py-2 w-24">Peso Total</th>
                          <th className="text-right px-2 py-2 w-28">Preço Bruto</th>
                          <th className="text-right px-2 py-2 w-28">Preço s/ Imp.</th>
                          {icmsDoSelecionado !== null && (
                            <th className="text-right px-2 py-2 w-32">Preço c/ ICMS ({icmsDoSelecionado}%)</th>
                          )}
                          <th className="text-right px-3 py-2 w-28">Total Item</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selecionado.itens.map((item) => {
                          const saldo = item.quantidade - item.qtd_faturada;
                          const pesoItem = item.peso_unitario * item.quantidade;
                          const precoComIcms = icmsDoSelecionado !== null
                            ? item.preco_final / (1 - icmsDoSelecionado / 100)
                            : null;
                          return (
                            <tr key={item.id} className="border-b last:border-0">
                              <td className="px-3 py-2">
                                <div className="font-medium">{item.nome}</div>
                                <div className="text-xs text-muted-foreground font-mono">{item.codigo}</div>
                              </td>
                              <td className="text-center px-2 py-2 text-muted-foreground">{item.cx_embarque}</td>
                              <td className="text-center px-2 py-2">{item.quantidade}</td>
                              <td className={`text-center px-2 py-2 font-medium ${saldo > 0 ? "text-amber-600" : "text-green-600"}`}>
                                {item.qtd_faturada}
                                {saldo > 0 && <div className="text-xs font-normal text-muted-foreground">falta {saldo}</div>}
                              </td>
                              <td className="text-center px-2 py-2 text-muted-foreground text-xs">{item.peso_unitario.toFixed(3)}</td>
                              <td className="text-center px-2 py-2 text-muted-foreground text-xs">{pesoItem.toFixed(2)} kg</td>
                              <td className="text-right px-2 py-2 text-muted-foreground text-xs">{formatBRL(item.preco_bruto)}</td>
                              <td className="text-right px-2 py-2 font-medium">{formatBRL(item.preco_final)}</td>
                              {icmsDoSelecionado !== null && (
                                <td className="text-right px-2 py-2 text-blue-700 font-medium">
                                  {precoComIcms !== null ? formatBRL(precoComIcms) : "—"}
                                </td>
                              )}
                              <td className="text-right px-3 py-2 font-semibold">{formatBRL(item.total)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Totais */}
                  <div className="flex justify-end gap-6 text-sm pt-3 pr-2 flex-wrap">
                    <span className="text-muted-foreground">
                      Peso total: <strong>{selecionado.peso_total.toFixed(2)} kg</strong>
                    </span>
                    <span className="text-muted-foreground">
                      Total s/ imposto: <strong className="text-green-700">{formatBRL(selecionado.total)}</strong>
                    </span>
                    {icmsDoSelecionado !== null && (
                      <span className="text-muted-foreground">
                        Total c/ ICMS ({icmsDoSelecionado}%): <strong className="text-blue-700">{formatBRL(selecionado.total / (1 - icmsDoSelecionado / 100))}</strong>
                      </span>
                    )}
                  </div>
                </div>

                {/* Observações do pedido */}
                {selecionado.observacoes && (
                  <div className="text-sm rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                    <span className="font-medium text-amber-900">Obs. do pedido: </span>
                    <span className="text-amber-800">{selecionado.observacoes}</span>
                  </div>
                )}

                {/* Campos de confirmação */}
                <div className="rounded-md border p-4 space-y-4">
                  <div className="font-semibold text-sm">Registrar faturamento</div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Número da NF</Label>
                      <Input
                        value={nfNumero}
                        onChange={(e) => setNfNumero(e.target.value)}
                        placeholder="Ex: 001234 (opcional)"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Código de rastreio</Label>
                      <Input
                        value={nfRastreio}
                        onChange={(e) => setNfRastreio(e.target.value)}
                        placeholder="Ex: BR123456789 (opcional)"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Arquivo da NF (PDF)</Label>
                    <Input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setNfFile(e.target.files?.[0] ?? null)}
                    />
                    {nfFile && (
                      <p className="text-xs text-muted-foreground">
                        Arquivo selecionado: {nfFile.name}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label>Observações da logística</Label>
                    <Textarea
                      rows={3}
                      value={obsLogistica}
                      onChange={(e) => setObsLogistica(e.target.value)}
                      placeholder="Transportadora, volumes, informações adicionais..."
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => gerarPdf(selecionado)}
                  title="Exportar PDF para impressão"
                >
                  <FileText className="h-4 w-4 mr-1" />
                  Exportar PDF
                </Button>
                <Button variant="outline" onClick={() => setSelecionado(null)}>
                  <XCircle className="h-4 w-4 mr-1" />
                  Fechar
                </Button>
                <Button onClick={confirmarFaturamento} disabled={confirmando}>
                  {confirmando
                    ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    : <CheckCircle2 className="h-4 w-4 mr-2" />
                  }
                  Confirmar faturamento
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Dialog de confirmação de exclusão ─── */}
      <Dialog open={!!excluirTarget} onOpenChange={(o) => !o && setExcluirTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir pedido #{excluirTarget?.numero_pedido}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Esta ação é irreversível. O pedido e todos os seus itens serão removidos permanentemente.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluirTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={excluirPedido} disabled={excluindo}>
              {excluindo && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Excluir permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
