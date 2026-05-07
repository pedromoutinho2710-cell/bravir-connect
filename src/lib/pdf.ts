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
        `${(i.desconto_comercial * 100).toFixed(1)}%`,
        `${(i.desconto_trade * 100).toFixed(1)}%`,
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
  const ml = 5;
  const W = pageW - 2 * ml; // 287

  const n = (v?: string | null) => v || "—";
  const fR = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
  const fP = (v: number) => `${(Number(v) * 100).toFixed(1)}%`;
  const rowH = 7;
  const c3 = W / 3;
  const c2 = W / 2;

  // Cabeçalho verde
  doc.setFillColor(26, 107, 58);
  doc.rect(ml, 3, W, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const mesAno = new Date(d.data_pedido + "T12:00:00")
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    .toUpperCase();
  doc.text(`FORMULÁRIO DE PEDIDO — ${mesAno}`, pageW / 2, 8, { align: "center" });
  doc.setTextColor(0, 0, 0);

  let y = 12;

  // Helper: desenha célula com label (topo, pequeno, cinza) e valor (baixo, normal)
  function hcell(x: number, cy: number, w: number, label: string, value: string) {
    doc.setDrawColor(160);
    doc.rect(x, cy, w, rowH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.setTextColor(80);
    doc.text(label, x + 1, cy + 2.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(0);
    const maxW = w - 2;
    const truncated = doc.splitTextToSize(value, maxW)[0] ?? "";
    doc.text(truncated, x + 1, cy + rowH - 1.5);
  }

  // Row 1 — 3 colunas
  const dataPedido = new Date(d.data_pedido + "T12:00:00").toLocaleDateString("pt-BR");
  hcell(ml, y, c3, "DATA PEDIDO", dataPedido);
  hcell(ml + c3, y, c3, "CLIENTE", d.razao_social);
  hcell(ml + 2 * c3, y, c3, "CÓDIGO (SANKHYA)", n(d.codigo_cliente));
  y += rowH;

  // Row 2 — 3 colunas
  hcell(ml, y, c3, "PEDIDO", d.tipo);
  hcell(ml + c3, y, c3, "CNPJ", formatCNPJ(d.cnpj));
  hcell(ml + 2 * c3, y, c3, "COND. PAGAMENTO", n(d.cond_pagamento));
  y += rowH;

  // Row 3 — 3 colunas
  hcell(ml, y, c3, "BONIFICAÇÃO", "");
  hcell(ml + c3, y, c3, "CIDADE / UF", `${n(d.cidade)} - ${n(d.uf)}`);
  hcell(ml + 2 * c3, y, c3, "CEP", n(d.cep));
  y += rowH;

  // Row 4 — 3 colunas
  hcell(ml, y, c3, "Nº PEDIDO", String(d.numero_pedido));
  hcell(ml + c3, y, c3, "DESCONTO", "ESPECIAL");
  hcell(ml + 2 * c3, y, c3, "TABELA", n(d.tabela_preco));
  y += rowH;

  // Row 5 — 2 colunas
  hcell(ml, y, c2, "PERFIL DO CLIENTE", n(d.cluster));
  hcell(ml + c2, y, c2, "COMPRADOR", n(d.comprador));
  y += rowH;

  // Row 6 — 2 colunas
  hcell(ml, y, c2, "AGENDAMENTO", d.agendamento ? "Sim" : "Não");
  hcell(ml + c2, y, c2, "VENDEDOR", d.vendedor);
  y += rowH;

  // Row 7 — obs (largura total)
  hcell(ml, y, W, "OBSERVAÇÕES", n(d.observacoes));
  y += rowH;

  // Row 8 — email xml (largura total)
  hcell(ml, y, W, "EMAIL XML / BOLETO", n(d.email_xml));
  y += rowH;

  // Row 9 — título tabela
  doc.setFillColor(240, 240, 235);
  doc.rect(ml, y, W, 5, "F");
  doc.setDrawColor(160);
  doc.rect(ml, y, W, 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(30);
  doc.text("PREÇO LÍQUIDO SEM IMPOSTOS", pageW / 2, y + 3.5, { align: "center" });
  y += 5;

  // Tabela de itens
  const totalBruto = d.itens.reduce((s, i) => s + i.preco_bruto * i.quantidade, 0);
  const totalVolumes = d.itens.reduce((s, i) => s + Math.ceil(i.quantidade / (i.cx_embarque || 1)), 0);
  const pesoTotal = d.itens.reduce((s, i) => s + i.peso_unitario * i.quantidade, 0);

  const heads = [
    "#", "COD. JIVA", "CX EMB", "QTD PED",
    "DESCRIÇÃO DOS PRODUTOS",
    "PREÇO BRUTO\nS/ IMPOSTOS",
    "DESC%\nCLUSTER",
    "DESC%\nADICIONAL",
    "PREÇO LÍQ.\nS/ IMPOSTOS",
    "DESC%\nCAMPANHA",
    "PREÇO LÍQ.\nFINAL",
    "DESCONTO\nREAL",
    "TOTAL S/\nIMPOSTOS",
    "PESO",
    "TOTAL\nPESO",
    "QTD\nVOL",
  ];

  const rows = d.itens.map((i, idx) => {
    const descontoReal = (i.preco_bruto - i.preco_final) * i.quantidade;
    const qtdVol = Math.ceil(i.quantidade / (i.cx_embarque || 1));
    return [
      String(idx + 1),
      i.codigo_jiva,
      String(i.cx_embarque || "—"),
      String(i.quantidade),
      i.nome,
      fR(i.preco_bruto),
      fP(i.desconto_perfil),
      fP(i.desconto_comercial),
      fR(i.preco_apos_perfil),
      fP(i.desconto_trade),
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
    headStyles: { fillColor: [26, 107, 58], textColor: 255, fontStyle: "bold", fontSize: 6, cellPadding: 1.2, halign: "center", valign: "middle", minCellHeight: 8 },
    styles: { fontSize: 6.5, cellPadding: 1, overflow: "ellipsize" },
    columnStyles: {
      0:  { halign: "center", cellWidth: 5 },
      1:  { cellWidth: 16 },
      2:  { halign: "center", cellWidth: 11 },
      3:  { halign: "center", cellWidth: 12 },
      4:  { cellWidth: 52 },
      5:  { halign: "right", cellWidth: 17 },
      6:  { halign: "center", cellWidth: 12 },
      7:  { halign: "center", cellWidth: 12 },
      8:  { halign: "right", cellWidth: 17 },
      9:  { halign: "center", cellWidth: 12 },
      10: { halign: "right", cellWidth: 17 },
      11: { halign: "right", cellWidth: 15 },
      12: { halign: "right", cellWidth: 17 },
      13: { halign: "right", cellWidth: 10 },
      14: { halign: "right", cellWidth: 13 },
      15: { halign: "center", cellWidth: 10 },
    },
    margin: { left: ml, right: ml },
  });

  // @ts-expect-error lastAutoTable
  const finalY: number = doc.lastAutoTable.finalY + 3;

  // Rodapé — resumo
  const footRowH = 6;
  const fc1 = W / 4;

  // Linha totais
  doc.setDrawColor(120);
  doc.setFillColor(245, 245, 240);
  doc.rect(ml, finalY, W, footRowH, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(0);

  const summaryItems = [
    ["TOTAL BRUTO S/ IMPOSTOS:", fR(totalBruto)],
    ["TOTAL C/ DESCONTO:", fR(d.total)],
    ["QTD. VOLUMES:", String(totalVolumes)],
    ["PESO TOTAL:", `${pesoTotal.toFixed(2)} kg`],
  ];
  summaryItems.forEach(([label, value], idx) => {
    const x = ml + idx * fc1;
    doc.text(`${label} ${value}`, x + 1, finalY + footRowH - 1.5);
  });

  // Área reservada faturamento
  const resY = finalY + footRowH + 1;
  const resH = 8;
  doc.setFillColor(250, 250, 248);
  doc.rect(ml, resY, W, resH, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(80);
  doc.text("ÁREA RESERVADA FATURAMENTO:", ml + 1, resY + 3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text(
    `Nº PEDIDO: ___________    QTD VOLUMES: ___________    PESO: ___________    COTAÇÕES DE TRANSPORTE: ___________`,
    ml + 1,
    resY + 6.5,
  );

  // Rodapé páginas
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setTextColor(120);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text(
      `Bravir Group • ${d.vendedor} • Página ${i}/${pages}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 3,
      { align: "center" },
    );
  }

  return doc;
}
