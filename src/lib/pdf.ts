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
        `${i.desconto_perfil}%`,
        `${i.desconto_comercial}%`,
        `${i.desconto_trade}%`,
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
