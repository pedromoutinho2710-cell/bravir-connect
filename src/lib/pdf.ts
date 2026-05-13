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
        `${(i.preco_bruto > 0 ? (1 - i.preco_final / i.preco_bruto) * 100 : 0).toFixed(2)}%`,
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
  qtd_faturada: number;
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
  const LOGO_B64 = "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5aNSZypZFnLugx314VxN836QUXMqP2Pnt69QeWnUOHpxo2mPNmcSWi0culqMg2Pm33st+N79660deVvzM343WDFgZxxM0Zm5F9BIaUOT7bAx8fp6cuy0dp6d2ujcjYlP63Oua5246xiX4WT7WubTtO0Lv1vUvlYZwBROuc16NROxs2NGlvuR1VrGcyLaS387NA9i1+y/bxpHf8LO2lvqCLfO6Y5YM8lb8e9hw7+RmJpw7GNZDWhLu6nnXcZsQATYik19r645x964nHeSWej9UTnVUp7RYPQ8zmOTzMHoc8yetxNT8f2qZb2Y2YAIYE19PSkaFxxjszOMzVHQ1ocmpLxYs8s4dBt0ZBVcNJidpzSu33umc3Rzrtpzf2ud9B2xbW31dj6+humACJAWFIF0YDWjoR3G58Xgqj/RxssRJehMrtnalxM+0+0LViE7+MagQq99KVNus97A+BxQSeD0PTCbnVT7QmonD43Fhlp2xSZLbYmNQmpP2OgXMxydu5E8SDtnA79N68yGMukQdvbe3sjua+mJz6x7qwG6/RpT2xPxw13PYKVRaE98rm+6nFvJM6qbORVpkyCHo8mFZzOfu7Bqvzku6fRkPDG0MbOFMy5f/9H2IInSm733wVRI+WKN4y+jOtabuZbHybWknX/6mgdJHZWp9FyXjz+LvUZs3Utt0k6l6E10kvOxk7aztfPBVFtryCpBETboaU/sc9iZEIiIsjwQX0LaV1qdse0L5TPdvjApP719uTrWmfp8/KzrwZYhIrYRhBTkun571WBZkRBC23noucvOFWpf/w/T38IYEbTeaAAAAABJRU5ErkJggg==";

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
    const precoLiqSImp = i.preco_apos_perfil ?? Math.round(i.preco_bruto * (1 - i.desconto_perfil - i.desconto_comercial / 100) * 100) / 100;
    const precoLiqFinal = i.preco_final;
    const descontoReal = ((i.preco_bruto - precoLiqFinal) / i.preco_bruto) * 100;
    const qtdVol = i.quantidade / (i.cx_embarque || 1);
    return [
      i.codigo_jiva,
      String(i.cx_embarque || "—"),
      String(i.quantidade),
      i.nome,
      fR(i.preco_bruto),
      fPDecimal(i.desconto_perfil),
      fPInt(i.desconto_comercial),
      fR(precoLiqSImp),
      fPInt(i.desconto_trade),
      fR(precoLiqFinal),
      `${descontoReal.toFixed(2)}%`,
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

  // ── Blocos lançados / saldo ───────────────────────────────────────────────
  const itensLancados = d.itens.filter((i) => (i.qtd_faturada ?? 0) > 0);
  if (itensLancados.length > 0) {
    let blockY = sumY + sumH + 5;

    doc.setFillColor(26, 107, 58);
    doc.rect(ml, blockY, W, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text("CADASTRADO NO SANKHYA", ml + W / 2, blockY + 4.2, { align: "center" });
    doc.setTextColor(0);
    blockY += 7;

    autoTable(doc, {
      startY: blockY,
      head: [["Código", "Produto", "Qtd Pedida", "Qtd Lançada", "Preço Final", "Total Lançado"]],
      body: itensLancados.map((i) => [
        i.codigo_jiva,
        i.nome,
        String(i.quantidade),
        String(i.qtd_faturada),
        fR(i.preco_final),
        fR(i.qtd_faturada * i.preco_final),
      ]),
      foot: [["", "", "", "", "Total Lançado", fR(itensLancados.reduce((s, i) => s + i.qtd_faturada * i.preco_final, 0))]],
      theme: "grid",
      headStyles: { fillColor: [26, 107, 58], textColor: 255, fontStyle: "bold", fontSize: 7 },
      footStyles: { fillColor: [240, 240, 235], textColor: 30, fontStyle: "bold", fontSize: 7 },
      bodyStyles: { fontSize: 7, cellPadding: 1.5 },
      styles: { overflow: "ellipsize", lineColor: [180, 180, 180], lineWidth: 0.2 },
      columnStyles: {
        0: { cellWidth: 20, halign: "center" },
        1: { cellWidth: 95 },
        2: { cellWidth: 22, halign: "right" },
        3: { cellWidth: 22, halign: "right" },
        4: { cellWidth: 25, halign: "right" },
        5: { cellWidth: 28, halign: "right" },
      },
      margin: { left: ml, right: mr },
    });
    // @ts-expect-error lastAutoTable
    blockY = doc.lastAutoTable.finalY + 5;

    const itensSaldo = d.itens.filter((i) => (i.qtd_faturada ?? 0) < i.quantidade);
    if (itensSaldo.length > 0) {
      doc.setFillColor(30, 30, 30);
      doc.rect(ml, blockY, W, 6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text("SALDO PENDENTE", ml + W / 2, blockY + 4.2, { align: "center" });
      doc.setTextColor(0);
      blockY += 7;

      autoTable(doc, {
        startY: blockY,
        head: [["Código", "Produto", "Qtd Pedida", "Qtd Lançada", "Saldo", "Preço Final", "Total Saldo"]],
        body: itensSaldo.map((i) => [
          i.codigo_jiva,
          i.nome,
          String(i.quantidade),
          String(i.qtd_faturada ?? 0),
          String(i.quantidade - (i.qtd_faturada ?? 0)),
          fR(i.preco_final),
          fR((i.quantidade - (i.qtd_faturada ?? 0)) * i.preco_final),
        ]),
        foot: [["", "", "", "", "", "Total Saldo", fR(itensSaldo.reduce((s, i) => s + (i.quantidade - (i.qtd_faturada ?? 0)) * i.preco_final, 0))]],
        theme: "grid",
        headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: "bold", fontSize: 7 },
        footStyles: { fillColor: [240, 240, 235], textColor: 30, fontStyle: "bold", fontSize: 7 },
        bodyStyles: { fontSize: 7, cellPadding: 1.5 },
        styles: { overflow: "ellipsize", lineColor: [180, 180, 180], lineWidth: 0.2 },
        columnStyles: {
          0: { cellWidth: 20, halign: "center" },
          1: { cellWidth: 82 },
          2: { cellWidth: 22, halign: "right" },
          3: { cellWidth: 22, halign: "right" },
          4: { cellWidth: 18, halign: "right" },
          5: { cellWidth: 25, halign: "right" },
          6: { cellWidth: 28, halign: "right" },
        },
        margin: { left: ml, right: mr },
      });
    }
  }

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
