import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatBRL, formatDate, formatCNPJ } from "./format";

export type PdfItem = {
  marca: string;
  codigo: string;
  nome: string;
  quantidade: number;
  preco_bruto: number;
  desconto_perfil: number;
  desconto_comercial: number;
  desconto_trade: number;
  preco_final: number;
  total: number;
};

export type PdfData = {
  numero?: number | string;
  data: Date;
  tipo: string;
  cliente: { cnpj: string; razao_social: string; cidade?: string; uf?: string; comprador?: string };
  cluster: string;
  tabela_preco: string;
  cond_pagamento?: string;
  agendamento: boolean;
  observacoes?: string;
  itens: PdfItem[];
  vendedor_email?: string;
};

export function gerarPedidoPDF(d: PdfData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  // Cabeçalho
  doc.setFillColor(26, 107, 58);
  doc.rect(0, 0, pageW, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Bravir Group", 14, 14);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${d.tipo} ${d.numero ? `#${d.numero}` : "(rascunho)"} • ${formatDate(d.data)}`,
    pageW - 14,
    14,
    { align: "right" },
  );

  doc.setTextColor(0, 0, 0);
  let y = 30;

  // Cliente
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Cliente", 14, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const clienteLinhas = [
    `CNPJ: ${formatCNPJ(d.cliente.cnpj)}`,
    `Razão Social: ${d.cliente.razao_social}`,
    `Cidade/UF: ${d.cliente.cidade ?? "-"}/${d.cliente.uf ?? "-"}`,
    `Comprador: ${d.cliente.comprador ?? "-"}`,
    `Pagamento: ${d.cond_pagamento || "-"} • Agendamento: ${d.agendamento ? "Sim" : "Não"}`,
  ];
  clienteLinhas.forEach((l) => {
    doc.text(l, 14, y);
    y += 4.5;
  });

  if (d.observacoes) {
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.text("Observações:", 14, y);
    y += 4.5;
    doc.setFont("helvetica", "normal");
    const wrapped = doc.splitTextToSize(d.observacoes, pageW - 28);
    doc.text(wrapped, 14, y);
    y += wrapped.length * 4.5;
  }
  y += 4;

  // Itens agrupados por marca
  const porMarca = d.itens.reduce<Record<string, PdfItem[]>>((acc, it) => {
    (acc[it.marca] ||= []).push(it);
    return acc;
  }, {});

  let totalGeral = 0;
  Object.entries(porMarca).forEach(([marca, itens]) => {
    const subtotal = itens.reduce((s, i) => s + i.total, 0);
    totalGeral += subtotal;

    autoTable(doc, {
      startY: y,
      head: [["Produto", "Qtd", "Desc. Perfil %", "Desc. Comercial %", "Desc. Trade %", "P. Final", "Total"]],
      body: itens.map((i) => [
        `${i.codigo} — ${i.nome}`,
        String(i.quantidade),
        `${(i.desconto_perfil * 100).toFixed(1)}%`,
        `${Number(i.desconto_comercial).toFixed(1)}%`,
        `${Number(i.desconto_trade).toFixed(1)}%`,
        formatBRL(i.preco_final),
        formatBRL(i.total),
      ]),
      foot: [["Subtotal " + marca, "", "", "", "", "", formatBRL(subtotal)]],
      theme: "grid",
      headStyles: { fillColor: [26, 107, 58], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [240, 240, 235], textColor: 30, fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 1.5 },
      columnStyles: {
        0: { cellWidth: 85 },
        1: { halign: "right", cellWidth: 12 },
        2: { halign: "right", cellWidth: 18 },
        3: { halign: "right", cellWidth: 18 },
        4: { halign: "right", cellWidth: 18 },
        5: { halign: "right", cellWidth: 20 },
        6: { halign: "right", cellWidth: 20 },
      },
    });
    // @ts-expect-error lastAutoTable
    y = doc.lastAutoTable.finalY + 4;
  });

  // Total geral
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setFillColor(26, 107, 58);
  doc.setTextColor(255, 255, 255);
  doc.rect(pageW - 84, y, 70, 9, "F");
  doc.text(`Total: ${formatBRL(totalGeral)}`, pageW - 16, y + 6, { align: "right" });

  // Rodapé
  doc.setTextColor(120);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.text(
      `Bravir Group • ${d.vendedor_email ?? ""} • Página ${i}/${pages}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" },
    );
  }

  return doc;
}

// ── Formulário PDF (formato antigo) ──────────────────────────────────────────

export type FormularioItem = {
  codigo_jiva: string;
  cx_embarque: number;
  quantidade: number;
  nome: string;
  preco_bruto: number;
  desconto_perfil: number;
  desconto_comercial: number;
  preco_apos_perfil: number;
  desconto_trade: number;
  preco_final: number;
  total_item: number;
  peso_unitario: number;
};

export type FormularioPdfData = {
  numero_pedido: number;
  tipo: string;
  data_pedido: string;
  razao_social: string;
  cnpj: string;
  codigo_cliente?: string | null;
  cond_pagamento?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  cluster: string;
  comprador?: string | null;
  agendamento: boolean;
  tabela_preco: string;
  observacoes?: string | null;
  email_xml?: string | null;
  vendedor: string;
  itens: FormularioItem[];
  total: number;
  peso_total: number;
};

export function gerarFormularioPDF(d: FormularioPdfData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth(); // 297
  const pageH = doc.internal.pageSize.getHeight(); // 210
  const ml = 5;
  const mr = 5;
  const W = pageW - ml - mr; // 287

  const n = (v?: string | null) => v || "—";
  const fR = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
  const fPDecimal = (v: number) => `${(v * 100).toFixed(1)}%`;
  const fPInt = (v: number) => `${Number(v).toFixed(1)}%`;

  const GREEN: [number, number, number] = [26, 107, 58];
  const rH = 6;   // altura padrão das linhas de cabeçalho
  const c3 = W / 3;
  const c2 = W / 2;

  // ── Helpers ─────────────────────────────────────────────────────────────

  // Célula com label pequeno (cinza, topo) + valor normal (baixo)
  function cell(x: number, cy: number, w: number, h: number, label: string, value: string) {
    doc.setDrawColor(160);
    doc.rect(x, cy, w, h);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.setTextColor(80);
    doc.text(label, x + 1, cy + 2.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(0);
    doc.text(doc.splitTextToSize(value, w - 2)[0] ?? "", x + 1, cy + h - 1.5);
  }

  // Célula dupla: dois pares label+valor empilhados
  function cell2(x: number, cy: number, w: number, h: number,
    label1: string, val1: string, label2: string, val2: string) {
    doc.setDrawColor(160);
    doc.rect(x, cy, w, h);
    const half = h / 2;
    doc.setFont("helvetica", "bold"); doc.setFontSize(5.5); doc.setTextColor(80);
    doc.text(label1, x + 1, cy + 2.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(0);
    doc.text(doc.splitTextToSize(val1, w - 2)[0] ?? "", x + 1, cy + half - 0.5);
    doc.setFont("helvetica", "bold"); doc.setFontSize(5.5); doc.setTextColor(80);
    doc.text(label2, x + 1, cy + half + 2.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(0);
    doc.text(doc.splitTextToSize(val2, w - 2)[0] ?? "", x + 1, cy + h - 1.5);
  }

  // Célula somente com texto centralizado (sem label)
  function cellCenter(x: number, cy: number, w: number, h: number, text: string) {
    doc.setDrawColor(160);
    doc.rect(x, cy, w, h);
    doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(60);
    doc.text(text, x + w / 2, cy + h / 2 + 1, { align: "center" });
  }

  let y = 2;

  // ── Linha 1: Título (verde) ──────────────────────────────────────────
  const mesAno = new Date(d.data_pedido + "T12:00:00")
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    .toUpperCase();
  doc.setFillColor(...GREEN);
  doc.rect(ml, y, W, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(`FORMULARIO DE PEDIDO - ${mesAno}`, pageW / 2, y + 5.5, { align: "center" });
  y += 8;

  // ── Linha 2: TABELA (fundo verde claro, alinhado à direita) ─────────
  doc.setFillColor(230, 245, 230);
  doc.rect(ml, y, W, 5, "F");
  doc.setDrawColor(160); doc.rect(ml, y, W, 5);
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(30, 80, 30);
  doc.text(`TABELA: ${n(d.tabela_preco)}`, ml + W - 2, y + 3.5, { align: "right" });
  y += 5;

  // ── Linha 3: DATA PEDIDO | CLIENTE | CÓDIGO ──────────────────────────
  doc.setTextColor(0);
  const dataPedido = new Date(d.data_pedido + "T12:00:00").toLocaleDateString("pt-BR");
  cell(ml, y, c3, rH, "DATA PEDIDO", dataPedido);
  cell(ml + c3, y, c3, rH, "CLIENTE", d.razao_social);
  cell(ml + 2 * c3, y, c3, rH, "CODIGO (SANKHYA)", n(d.codigo_cliente));
  y += rH;

  // ── Linha 4 (separador fino) ─────────────────────────────────────────
  doc.setDrawColor(200); doc.setLineWidth(0.1);
  doc.line(ml, y, ml + W, y);
  y += 2;

  // ── Linha 5: PEDIDO | CNPJ | COND. PAGAMENTO ────────────────────────
  cell(ml, y, c3, rH, "PEDIDO", d.tipo);
  cell(ml + c3, y, c3, rH, "CNPJ", formatCNPJ(d.cnpj));
  cell(ml + 2 * c3, y, c3, rH, "COND. PAGAMENTO", n(d.cond_pagamento));
  y += rH;

  // ── Linha 6: BONIFICAÇÃO | CIDADE/UF | CEP ──────────────────────────
  cell(ml, y, c3, rH, "BONIFICACAO", "");
  cell(ml + c3, y, c3, rH, "CIDADE / UF", `${n(d.cidade)} - ${n(d.uf)}`);
  cell(ml + 2 * c3, y, c3, rH, "CEP", n(d.cep));
  y += rH;

  // ── Linha 7: Nº PEDIDO | (vazio) | DESCONTO: ESPECIAL ───────────────
  cell(ml, y, c3, rH, "No PEDIDO", String(d.numero_pedido));
  doc.setDrawColor(160); doc.rect(ml + c3, y, c3, rH); // célula vazia
  cell(ml + 2 * c3, y, c3, rH, "DESCONTO", "ESPECIAL");
  y += rH;

  // ── Linha 8 (separador) ──────────────────────────────────────────────
  doc.setDrawColor(200);
  doc.line(ml, y, ml + W, y);
  y += 2;

  // ── Linhas 9-10: PERFIL | *DADOS AGENDAMENTO | COMPRADOR / VENDEDOR ─
  const dH = rH * 2; // altura dupla
  cell(ml, y, c3, dH, "PERFIL DO CLIENTE", n(d.cluster));
  cellCenter(ml + c3, y, c3, dH, "*DADOS P/ AGENDAMENTO:");
  cell2(ml + 2 * c3, y, c3, dH, "COMPRADOR", n(d.comprador), "VENDEDOR", d.vendedor);
  y += dH;

  // ── Linha 11 (separador) ─────────────────────────────────────────────
  doc.setDrawColor(200);
  doc.line(ml, y, ml + W, y);
  y += 1;

  // ── Linhas 12-13: AGENDAMENTO ────────────────────────────────────────
  const agH = rH + 2;
  cell(ml, y, c2, agH, "AGENDAMENTO", d.agendamento ? "(X) SIM" : "( ) SIM  (X) NAO");
  doc.setDrawColor(160); doc.rect(ml + c2, y, c2, agH); // célula vazia direita
  y += agH;

  // ── Linhas 14-15: OBSERVAÇÕES (largura total) ────────────────────────
  const obsH = rH + 2;
  doc.setDrawColor(160); doc.rect(ml, y, W, obsH);
  doc.setFont("helvetica", "bold"); doc.setFontSize(5.5); doc.setTextColor(80);
  doc.text("OBSERVACOES", ml + 1, y + 2.5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(0);
  doc.text(doc.splitTextToSize(n(d.observacoes), W - 2)[0] ?? "", ml + 1, y + obsH - 1.5);
  y += obsH;

  // ── Linha 16 (separador) ─────────────────────────────────────────────
  y += 1;

  // ── Linha 17: Atenção ────────────────────────────────────────────────
  doc.setFillColor(255, 255, 204);
  doc.rect(ml, y, W, 5, "F");
  doc.setDrawColor(160); doc.rect(ml, y, W, 5);
  doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(120, 0, 0);
  doc.text("*ATENCAO: FAVOR PREENCHER APENAS AS CELULAS EM VERDE", pageW / 2, y + 3.5, { align: "center" });
  y += 5;

  // ── Cálculos totais ──────────────────────────────────────────────────
  const totalBruto = d.itens.reduce((s, i) => s + i.preco_bruto * i.quantidade, 0);
  const totalVolumes = d.itens.reduce((s, i) => s + Math.ceil(i.quantidade / (i.cx_embarque || 1)), 0);
  const pesoTotal = d.itens.reduce((s, i) => s + i.peso_unitario * i.quantidade, 0);

  // ── Linha 18+: Tabela de itens ───────────────────────────────────────
  const heads = [
    "COD.\nJIVA",
    "CX DE\nEMBARQUE",
    "QTD\nPEDIDA",
    "DESCRICAO DOS PRODUTOS",
    "PRECO BRUTO\nS/ IMPOSTOS",
    "DESC%\nCLUSTER",
    "DESC%\nADICIONAL",
    "PRECO LIQ.\nS/ IMPOSTOS",
    "DESC%\nCAMPANHA",
    "PRECO\nLIQ. FINAL",
    "DESCONTO\nREAL",
    "TOTAL S/\nIMPOSTOS",
    "PESO",
    "TOTAL\nPESO",
    "QTD\nVOL",
  ];

  const rows = d.itens.map((i) => {
    const descontoReal = (i.preco_bruto - i.preco_final) * i.quantidade;
    const qtdVol = Math.ceil(i.quantidade / (i.cx_embarque || 1));
    return [
      i.codigo_jiva,
      String(i.cx_embarque || "—"),
      String(i.quantidade),
      i.nome,
      fR(i.preco_bruto),
      fPDecimal(i.desconto_perfil),
      fPInt(i.desconto_comercial),
      fR(i.preco_apos_perfil),
      fPInt(i.desconto_trade),
      fR(i.preco_final),
      fR(descontoReal),
      fR(i.total_item),
      i.peso_unitario > 0 ? i.peso_unitario.toFixed(3) : "—",
      i.peso_unitario > 0 ? (i.peso_unitario * i.quantidade).toFixed(2) : "—",
      String(qtdVol),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [heads],
    body: rows,
    theme: "grid",
    headStyles: {
      fillColor: GREEN,
      textColor: 255,
      fontStyle: "bold",
      fontSize: 6,
      cellPadding: 1,
      halign: "center",
      valign: "middle",
      minCellHeight: 8,
    },
    bodyStyles: { fontSize: 6.5, cellPadding: 1 },
    alternateRowStyles: { fillColor: [249, 249, 249] },
    styles: { overflow: "ellipsize", lineColor: [180, 180, 180], lineWidth: 0.2 },
    columnStyles: {
      0:  { cellWidth: 14, halign: "center" },
      1:  { cellWidth: 10, halign: "center" },
      2:  { cellWidth: 10, halign: "center" },
      3:  { cellWidth: 75 },
      4:  { cellWidth: 18, halign: "right" },
      5:  { cellWidth: 12, halign: "center" },
      6:  { cellWidth: 12, halign: "center" },
      7:  { cellWidth: 18, halign: "right" },
      8:  { cellWidth: 12, halign: "center" },
      9:  { cellWidth: 18, halign: "right" },
      10: { cellWidth: 16, halign: "right" },
      11: { cellWidth: 18, halign: "right" },
      12: { cellWidth: 10, halign: "right" },
      13: { cellWidth: 14, halign: "right" },
      14: { cellWidth: 10, halign: "center" },
    },
    margin: { left: ml, right: mr },
  });

  // @ts-expect-error lastAutoTable
  const finalY: number = doc.lastAutoTable.finalY + 2;

  // ── Rodapé: Área reservada faturamento ──────────────────────────────
  const resH = 6;
  doc.setFillColor(235, 245, 235);
  doc.rect(ml, finalY, W, resH, "F");
  doc.setDrawColor(120); doc.rect(ml, finalY, W, resH);
  doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(30, 80, 30);
  doc.text("*AREA RESERVADA PARA PREENCHIMENTO APENAS DO FATURAMENTO", ml + 1, finalY + 2.5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(0);
  doc.text(
    `No PEDIDO: ___________    QTD. VOLUMES: ${totalVolumes}    PESO: ${pesoTotal.toFixed(2)} kg    COTACOES DE TRANSPORTE: ___________`,
    ml + 1, finalY + resH - 1,
  );

  // ── Rodapé: Resumo final (cinza claro) ──────────────────────────────
  const sumY = finalY + resH + 1;
  const sumH = 6;
  doc.setFillColor(235, 235, 230);
  doc.rect(ml, sumY, W, sumH, "F");
  doc.setDrawColor(120); doc.rect(ml, sumY, W, sumH);
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(0);
  const sumW = W / 4;
  [
    `TOTAL S/ IMPOSTOS: ${fR(totalBruto)}`,
    `TOTAL C/ DESCONTO: ${fR(d.total)}`,
    `QTD. VOLUMES: ${totalVolumes}`,
    `PESO TOTAL: ${pesoTotal.toFixed(2)} kg`,
  ].forEach((text, idx) => {
    doc.text(text, ml + idx * sumW + 1, sumY + sumH - 1.5);
  });

  // ── Rodapé de páginas ────────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setTextColor(140); doc.setFont("helvetica", "normal"); doc.setFontSize(6);
    doc.text(
      `Bravir Group - ${d.vendedor} - Pag. ${i}/${pages}`,
      pageW / 2, pageH - 2, { align: "center" },
    );
  }

  return doc;
}
