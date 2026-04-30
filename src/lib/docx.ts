import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  AlignmentType,
  WidthType,
  BorderStyle,
  HeadingLevel,
  ShadingType,
} from "docx";

export interface ItemDocx {
  numero: number;
  codigo_jiva: string;
  cx_embarque: number;
  quantidade: number;
  nome: string;
  preco_bruto: number;
  desconto_pct: number;
  preco_liquido: number;
  bolsao: number;
  total: number;
  peso: number;
  total_peso: number;
}

export interface PedidoParaDocx {
  numero_pedido: number;
  data_pedido: string;
  cliente: {
    razao_social: string;
    cnpj: string;
    comprador: string;
    cidade: string;
    uf: string;
  };
  vendedor: string;
  cond_pagamento: string;
  observacoes: string;
  itens: ItemDocx[];
}

const VERDE = "1A6B3A";
const BRANCO = "FFFFFF";

function cell(text: string, bold = false, shade = false): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold, size: 18 })],
        alignment: AlignmentType.CENTER,
      }),
    ],
    shading: shade ? { type: ShadingType.SOLID, color: VERDE, fill: VERDE } : undefined,
  });
}

function cellRight(text: string, bold = false): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold, size: 18 })],
        alignment: AlignmentType.RIGHT,
      }),
    ],
  });
}

function cellLeft(text: string, bold = false): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold, size: 18 })],
      }),
    ],
  });
}

function fmt(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function gerarPedidoDocx(pedido: PedidoParaDocx): Promise<Blob> {
  const totalGeral = pedido.itens.reduce((s, i) => s + i.total, 0);
  const pesoTotal = pedido.itens.reduce((s, i) => s + i.total_peso, 0);

  const headerBorder = {
    top: { style: BorderStyle.SINGLE, size: 1 },
    bottom: { style: BorderStyle.SINGLE, size: 1 },
    left: { style: BorderStyle.SINGLE, size: 1 },
    right: { style: BorderStyle.SINGLE, size: 1 },
  };

  // Tabela de itens
  const tableHeaders = new TableRow({
    children: [
      "Nº", "COD.JIVA", "CX EMBARQUE", "QTD", "DESCRIÇÃO",
      "PREÇO BRUTO", "DESC.%", "PREÇO LÍQUIDO", "BOLSÃO", "TOTAL", "PESO", "TOTAL PESO",
    ].map((h) => cell(h, true, true)),
    tableHeader: true,
  });

  const itemRows = pedido.itens.map(
    (i) =>
      new TableRow({
        children: [
          cell(String(i.numero)),
          cell(i.codigo_jiva),
          cell(String(i.cx_embarque)),
          cell(String(i.quantidade)),
          cellLeft(i.nome),
          cellRight(`R$ ${fmt(i.preco_bruto)}`),
          cellRight(`${i.desconto_pct}%`),
          cellRight(`R$ ${fmt(i.preco_liquido)}`),
          cellRight(String(i.bolsao)),
          cellRight(`R$ ${fmt(i.total)}`),
          cellRight(fmt(i.peso)),
          cellRight(fmt(i.total_peso)),
        ],
      }),
  );

  const totalRow = new TableRow({
    children: [
      new TableCell({
        columnSpan: 9,
        children: [new Paragraph({ children: [new TextRun({ text: "TOTAL GERAL", bold: true, size: 20 })], alignment: AlignmentType.RIGHT })],
      }),
      cellRight(`R$ ${fmt(totalGeral)}`, true),
      new TableCell({ children: [new Paragraph("")] }),
      cellRight(fmt(pesoTotal), true),
    ],
  });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun({ text: `PEDIDO Nº ${pedido.numero_pedido}`, bold: true, size: 32, color: BRANCO })],
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            shading: { type: ShadingType.SOLID, color: VERDE, fill: VERDE },
          }),
          new Paragraph({ text: "" }),

          // Info cabeçalho
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: headerBorder,
            rows: [
              new TableRow({
                children: [
                  cellLeft("DATA PEDIDO", true),
                  cellLeft(pedido.data_pedido),
                  cellLeft("CLIENTE", true),
                  cellLeft(pedido.cliente.razao_social),
                ],
              }),
              new TableRow({
                children: [
                  cellLeft("CNPJ", true),
                  cellLeft(pedido.cliente.cnpj),
                  cellLeft("COMPRADOR", true),
                  cellLeft(pedido.cliente.comprador),
                ],
              }),
              new TableRow({
                children: [
                  cellLeft("CIDADE/UF", true),
                  cellLeft(`${pedido.cliente.cidade}/${pedido.cliente.uf}`),
                  cellLeft("VENDEDOR", true),
                  cellLeft(pedido.vendedor),
                ],
              }),
              new TableRow({
                children: [
                  cellLeft("COND. PAGAMENTO", true),
                  cellLeft(pedido.cond_pagamento || "—"),
                  cellLeft("OBSERVAÇÕES", true),
                  cellLeft(pedido.observacoes || "—"),
                ],
              }),
            ],
          }),

          new Paragraph({ text: "" }),

          // Tabela de produtos
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [tableHeaders, ...itemRows, totalRow],
          }),
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}
