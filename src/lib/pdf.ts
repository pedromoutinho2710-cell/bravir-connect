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
  const fH = 7; // altura padrão por campo

  // Paste Bravir logo base64 here to enable it
  const LOGO_B64 = "";

  // ── 3 colunas do cabeçalho ────────────────────────────────────────────────
  const cL = W * 0.25;  // ~71.75
  const cC = W * 0.45;  // ~129.15
  const cR = W * 0.30;  // ~86.10
  const xL = ml;
  const xC = ml + cL;
  const xR = ml + cL + cC;

  // ── Helpers ──────────────────────────────────────────────────────────────

  function dotLine(x: number, y: number, w: number) {
    doc.setDrawColor(180);
    doc.setLineDashPattern([0.5, 1], 0);
    doc.line(x, y, x + w, y);
    doc.setLineDashPattern([], 0);
    doc.setDrawColor(0);
  }

  // Imprime label (negrito pequeno) + valor + linha pontilhada embaixo; retorna próximo y
  function field(x: number, y: number, w: number, label: string, value: string, h = fH): number {
    doc.setFont("helvetica", "bold"); doc.setFontSize(5.5); doc.setTextColor(80);
    doc.text(label, x, y + 2.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(0);
    doc.text(doc.splitTextToSize(value, w - 1)[0] ?? "", x, y + h - 1.5);
    dotLine(x, y + h, w);
    return y + h + 1;
  }

  // ── Datas ────────────────────────────────────────────────────────────────
  const mesAno = new Date(d.data_pedido + "T12:00:00")
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    .toUpperCase();
  const dataPedido = new Date(d.data_pedido + "T12:00:00").toLocaleDateString("pt-BR");

  // ══════════════════════════════════════════════════════════════════════════
  // COLUNA ESQUERDA
  // ══════════════════════════════════════════════════════════════════════════
  let yL = 2;

  if (LOGO_B64) {
    doc.addImage(LOGO_B64, "PNG", xL, yL, 35, 14);
    yL += 16;
  } else {
    doc.setDrawColor(180); doc.rect(xL, yL, 35, 14);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(26, 107, 58);
    doc.text("BRAVIR GROUP", xL + 17.5, yL + 8.5, { align: "center" });
    yL += 16;
  }

  const pedidoTipo = d.tipo === "Bonificação" || d.tipo === "Bonificacao"
    ? "[ ] PEDIDO  [X] BONIFICACAO"
    : "[X] PEDIDO  [ ] BONIFICACAO";
  yL = field(xL, yL, cL, "DATA PEDIDO:", dataPedido);
  yL = field(xL, yL, cL, "PEDIDO:", pedidoTipo);
  yL = field(xL, yL, cL, "No PEDIDO:", String(d.numero_pedido));

  // ══════════════════════════════════════════════════════════════════════════
  // COLUNA CENTRAL
  // ══════════════════════════════════════════════════════════════════════════
  let yC = 2;

  // Título verde
  doc.setFillColor(...GREEN);
  doc.rect(xC, yC, cC, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text("FORMULARIO DE PEDIDO", xC + cC / 2, yC + 5.5, { align: "center" });
  yC += 9;

  // TABELA (verde claro)
  doc.setFillColor(230, 245, 230);
  doc.rect(xC, yC, cC, 5, "F");
  doc.setDrawColor(160); doc.rect(xC, yC, cC, 5);
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(30, 80, 30);
  doc.text(`TABELA: ${n(d.tabela_preco)}`, xC + cC - 2, yC + 3.5, { align: "right" });
  yC += 6;

  doc.setTextColor(0);
  yC = field(xC, yC, cC, "CLIENTE:", d.razao_social);
  yC = field(xC, yC, cC, "CNPJ:", formatCNPJ(d.cnpj));
  yC = field(xC, yC, cC, "CIDADE / UF:", `${n(d.cidade)} - ${n(d.uf)}`);

  doc.setFont("helvetica", "bold"); doc.setFontSize(5.5); doc.setTextColor(80);
  doc.text("*DADOS P/ AGENDAMENTO:", xC, yC + 2.5);
  yC += 4;

  yC = field(xC, yC, cC, "PERFIL DO CLIENTE:", n(d.cluster));

  const agendStr = d.agendamento ? "[X] SIM  [ ] NAO" : "[ ] SIM  [X] NAO";
  yC = field(xC, yC, cC, "AGENDAMENTO:", agendStr);

  doc.setFont("helvetica", "bold"); doc.setFontSize(5.5); doc.setTextColor(80);
  doc.text("OBSERVACOES:", xC, yC + 2.5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(0);
  doc.text(doc.splitTextToSize(n(d.observacoes), cC - 1)[0] ?? "", xC, yC + fH - 1.5);
  dotLine(xC, yC + fH, cC);
  yC += fH + 1;

  // ══════════════════════════════════════════════════════════════════════════
  // COLUNA DIREITA
  // ══════════════════════════════════════════════════════════════════════════
  let yR = 2;

  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(0);
  doc.text(mesAno, xR + cR, yR + 6, { align: "right" });
  yR += 9;

  yR = field(xR, yR, cR, "CODIGO:", n(d.codigo_cliente));
  yR = field(xR, yR, cR, "COND. PAGAMENTO:", n(d.cond_pagamento));
  yR = field(xR, yR, cR, "CEP:", n(d.cep));
  yR = field(xR, yR, cR, "DESCONTO:", "ESPECIAL");
  yR = field(xR, yR, cR, "COMPRADOR:", n(d.comprador));
  yR = field(xR, yR, cR, "VENDEDOR:", d.vendedor);
  yR = field(xR, yR, cR, "EMAIL:", n(d.email_xml));

  // ══════════════════════════════════════════════════════════════════════════
  // LINHA DE ATENÇÃO + TABELA
  // ══════════════════════════════════════════════════════════════════════════
  let y = Math.max(yL, yC, yR) + 3;

  doc.setFillColor(255, 255, 204);
  doc.rect(ml, y, W, 5, "F");
  doc.setDrawColor(160); doc.rect(ml, y, W, 5);
  doc.setFont("helvetica", "italic"); doc.setFontSize(6); doc.setTextColor(80, 80, 0);
  doc.text(
    "*ATENCAO: FAVOR PREENCHER APENAS AS CELULAS EM VERDE",
    pageW / 2, y + 3.5, { align: "center" },
  );
  y += 6;

  // ── Cálculos ─────────────────────────────────────────────────────────────
  const totalBruto = d.itens.reduce((s, i) => s + i.preco_bruto * i.quantidade, 0);
  const totalVolumes = d.itens.reduce((s, i) => s + Math.ceil(i.quantidade / (i.cx_embarque || 1)), 0);
  const pesoTotal = d.itens.reduce((s, i) => s + i.peso_unitario * i.quantidade, 0);

  // ── Tabela de itens ───────────────────────────────────────────────────────
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
    alternateRowStyles: { fillColor: [245, 245, 245] },
    styles: { overflow: "ellipsize", lineColor: [180, 180, 180], lineWidth: 0.2 },
    // Coluna QTD PEDIDA (índice 2) com fundo verde claro — simula campo editável
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 2) {
        data.cell.styles.fillColor = [214, 236, 210];
      }
    },
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

  // ── Área reservada faturamento ────────────────────────────────────────────
  const resH = 8;
  doc.setFillColor(235, 245, 235);
  doc.rect(ml, finalY, W, resH, "F");
  doc.setDrawColor(120); doc.rect(ml, finalY, W, resH);
  doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(30, 80, 30);
  doc.text("*AREA RESERVADA PARA PREENCHIMENTO APENAS DO FATURAMENTO", ml + 1, finalY + 2.5);
  const rfw = W / 3;
  const resLabels = ["No PEDIDO:", "QTD. VOLUMES:", "COTACOES DE TRANSPORTE:"];
  const resVals = ["___________", String(totalVolumes), "___________"];
  resLabels.forEach((lbl, idx) => {
    const rx = ml + idx * rfw + 1;
    doc.setFont("helvetica", "bold"); doc.setFontSize(5.5); doc.setTextColor(60);
    doc.text(`${lbl} ${resVals[idx]}`, rx, finalY + resH - 1.5);
  });

  // ── Resumo final ──────────────────────────────────────────────────────────
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

  // ── Rodapé de páginas ─────────────────────────────────────────────────────
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
