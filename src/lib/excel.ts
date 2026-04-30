import ExcelJS from "exceljs";

export interface PedidoParaExcel {
  numero_pedido: number;
  data_pedido: string;
  cliente: {
    razao_social: string;
    cnpj: string;
    comprador: string;
    cidade: string;
    uf: string;
    cep: string;
  };
  vendedor: string;
  perfil: string;
  tabela_preco: string;
  cond_pagamento: string;
  agendamento: boolean;
  observacoes: string;
  itens: ItemExcel[];
}

export interface ItemExcel {
  codigo_jiva: string;
  cx_embarque: number;
  quantidade: number;
  nome: string;
  preco_bruto: number;
  desconto_perfil: number;
  desconto_comercial: number;
  desconto_trade: number;
  preco_apos_perfil: number;
  preco_apos_comercial: number;
  preco_final: number;
  total: number;
  peso_unitario: number;
  total_peso: number;
  qtd_volumes: number;
}

const GREEN_FILL = "FF1A6B3A"; // Verde padrao Bravir

export async function exportarPedidoExcel(pedido: PedidoParaExcel): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Pedido");

  // Configurar dimensoes de coluna
  ws.columns = [
    { key: "col1", width: 12 },   // Nº
    { key: "col2", width: 15 },   // COD. JIVA
    { key: "col3", width: 15 },   // CX EMBARQUE
    { key: "col4", width: 12 },   // QTD
    { key: "col5", width: 50 },   // DESCRIÇÃO
    { key: "col6", width: 15 },   // P. Bruto
    { key: "col7", width: 12 },   // %Cluster (Perfil)
    { key: "col8", width: 12 },   // %Comercial
    { key: "col9", width: 12 },   // %Trade
    { key: "col10", width: 15 },  // P. Líquido
    { key: "col11", width: 15 },  // Desconto Real R$
    { key: "col12", width: 15 },  // Total
    { key: "col13", width: 15 },  // Peso
    { key: "col14", width: 15 },  // Total Peso
    { key: "col15", width: 15 },  // Qtd Volume
  ];

  // Cabecalho mesclado
  ws.mergeCells("A1:O1");
  const headerCell = ws.getCell("A1");
  headerCell.value = `PEDIDO Nº ${pedido.numero_pedido}`;
  headerCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_FILL } };
  headerCell.alignment = { horizontal: "center", vertical: "center" };
  ws.getRow(1).height = 25;

  let row = 3;

  // Secao: DADOS DO PEDIDO
  ws.mergeCells(`A${row}:B${row}`);
  const secaoCell = ws.getCell(`A${row}`);
  secaoCell.value = "DATA PEDIDO";
  secaoCell.font = { bold: true, size: 11 };
  secaoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
  ws.getCell(`C${row}`).value = pedido.data_pedido;
  row++;

  // Cliente
  ws.mergeCells(`A${row}:B${row}`);
  ws.getCell(`A${row}`).value = "CLIENTE";
  ws.getCell(`A${row}`).font = { bold: true };
  ws.mergeCells(`C${row}:O${row}`);
  ws.getCell(`C${row}`).value = pedido.cliente.razao_social;
  row++;

  // CNPJ
  ws.mergeCells(`A${row}:B${row}`);
  ws.getCell(`A${row}`).value = "CNPJ";
  ws.getCell(`A${row}`).font = { bold: true };
  ws.getCell(`C${row}`).value = pedido.cliente.cnpj;
  ws.mergeCells(`D${row}:E${row}`);
  ws.getCell(`D${row}`).value = "COMPRADOR";
  ws.getCell(`D${row}`).font = { bold: true };
  ws.getCell(`F${row}`).value = pedido.cliente.comprador;
  row++;

  // Cidade/CEP
  ws.mergeCells(`A${row}:B${row}`);
  ws.getCell(`A${row}`).value = "CIDADE-UF";
  ws.getCell(`A${row}`).font = { bold: true };
  ws.getCell(`C${row}`).value = `${pedido.cliente.cidade}-${pedido.cliente.uf}`;
  ws.mergeCells(`D${row}:E${row}`);
  ws.getCell(`D${row}`).value = "CEP";
  ws.getCell(`D${row}`).font = { bold: true };
  ws.getCell(`F${row}`).value = pedido.cliente.cep;
  row++;

  // Perfil e Vendedor
  ws.mergeCells(`A${row}:B${row}`);
  ws.getCell(`A${row}`).value = "PERFIL";
  ws.getCell(`A${row}`).font = { bold: true };
  ws.getCell(`C${row}`).value = pedido.perfil;
  ws.mergeCells(`D${row}:E${row}`);
  ws.getCell(`D${row}`).value = "VENDEDOR";
  ws.getCell(`D${row}`).font = { bold: true };
  ws.getCell(`F${row}`).value = pedido.vendedor;
  row++;

  // Tabela de Preço e Agendamento
  ws.mergeCells(`A${row}:B${row}`);
  ws.getCell(`A${row}`).value = "TAB.PREÇO";
  ws.getCell(`A${row}`).font = { bold: true };
  ws.getCell(`C${row}`).value = pedido.tabela_preco;
  ws.mergeCells(`D${row}:E${row}`);
  ws.getCell(`D${row}`).value = "AGENDAMENTO";
  ws.getCell(`D${row}`).font = { bold: true };
  ws.getCell(`F${row}`).value = pedido.agendamento ? "Sim" : "Não";
  row++;

  // Cond. Pagamento e Observacoes
  ws.mergeCells(`A${row}:B${row}`);
  ws.getCell(`A${row}`).value = "COND.PAGTO";
  ws.getCell(`A${row}`).font = { bold: true };
  ws.mergeCells(`C${row}:O${row}`);
  ws.getCell(`C${row}`).value = pedido.cond_pagamento || "—";
  row++;

  if (pedido.observacoes) {
    ws.mergeCells(`A${row}:B${row}`);
    ws.getCell(`A${row}`).value = "OBSERVAÇÕES";
    ws.getCell(`A${row}`).font = { bold: true };
    ws.mergeCells(`C${row}:O${row}`);
    ws.getCell(`C${row}`).value = pedido.observacoes;
    ws.getCell(`C${row}`).alignment = { wrapText: true };
    row++;
  }

  row += 2;

  // Cabecalho da tabela de produtos
  const headerRow = row;
  const headerValues = [
    "Nº",
    "COD. JIVA",
    "CX EMBARQUE",
    "QTD",
    "DESCRIÇÃO",
    "P. Bruto",
    "%Cluster",
    "%Comercial",
    "%Trade",
    "P. Líquido",
    "Desconto Real R$",
    "Total",
    "Peso",
    "Total Peso",
    "Qtd Volume",
  ];

  const cells = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"];
  cells.forEach((col, idx) => {
    const cell = ws.getCell(`${col}${headerRow}`);
    cell.value = headerValues[idx];
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_FILL } };
    cell.alignment = { horizontal: "center", vertical: "center", wrapText: true };
  });
  ws.getRow(headerRow).height = 25;
  row++;

  // Dados dos produtos
  let totalGeral = 0;
  let pesoTotal = 0;
  let qtyVolumesTotal = 0;

  pedido.itens.forEach((item, idx) => {
    const desconto_real_rs = item.preco_bruto - item.preco_final;
    const itemRow = row + idx;

    ws.getCell(`A${itemRow}`).value = idx + 1;
    ws.getCell(`B${itemRow}`).value = item.codigo_jiva;
    ws.getCell(`C${itemRow}`).value = item.cx_embarque;
    ws.getCell(`D${itemRow}`).value = item.quantidade;
    ws.getCell(`E${itemRow}`).value = item.nome;
    ws.getCell(`F${itemRow}`).value = item.preco_bruto;
    ws.getCell(`G${itemRow}`).value = item.desconto_perfil;
    ws.getCell(`H${itemRow}`).value = item.desconto_comercial;
    ws.getCell(`I${itemRow}`).value = item.desconto_trade;
    ws.getCell(`J${itemRow}`).value = item.preco_final;
    ws.getCell(`K${itemRow}`).value = desconto_real_rs;
    ws.getCell(`L${itemRow}`).value = item.total;
    ws.getCell(`M${itemRow}`).value = item.peso_unitario;
    ws.getCell(`N${itemRow}`).value = item.total_peso;
    ws.getCell(`O${itemRow}`).value = item.qtd_volumes;

    // Linhas zebradas
    if (idx % 2 === 0) {
      cells.forEach((col) => {
        ws.getCell(`${col}${itemRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
      });
    }

    // Alinhar decimais a direita
    ["F", "J", "K", "L", "M", "N"].forEach((col) => {
      ws.getCell(`${col}${itemRow}`).alignment = { horizontal: "right" };
      ws.getCell(`${col}${itemRow}`).numFmt = "#,##0.00";
    });

    ["C", "D", "G", "H", "I", "O"].forEach((col) => {
      ws.getCell(`${col}${itemRow}`).alignment = { horizontal: "center" };
    });

    totalGeral += item.total;
    pesoTotal += item.total_peso;
    qtyVolumesTotal += item.qtd_volumes;
  });

  row += pedido.itens.length + 1;

  // Rodape com totais
  const totalRow = row;
  ws.mergeCells(`A${totalRow}:E${totalRow}`);
  ws.getCell(`A${totalRow}`).value = "TOTAL GERAL";
  ws.getCell(`A${totalRow}`).font = { bold: true, size: 12 };
  ws.getCell(`A${totalRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
  ws.getCell(`A${totalRow}`).alignment = { horizontal: "right" };

  ws.getCell(`L${totalRow}`).value = totalGeral;
  ws.getCell(`L${totalRow}`).font = { bold: true, size: 12 };
  ws.getCell(`L${totalRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
  ws.getCell(`L${totalRow}`).numFmt = "#,##0.00";
  ws.getCell(`L${totalRow}`).alignment = { horizontal: "right" };

  ws.getCell(`N${totalRow}`).value = pesoTotal;
  ws.getCell(`N${totalRow}`).font = { bold: true, size: 12 };
  ws.getCell(`N${totalRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
  ws.getCell(`N${totalRow}`).numFmt = "#,##0.00";
  ws.getCell(`N${totalRow}`).alignment = { horizontal: "right" };

  ws.getCell(`O${totalRow}`).value = qtyVolumesTotal;
  ws.getCell(`O${totalRow}`).font = { bold: true, size: 12 };
  ws.getCell(`O${totalRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
  ws.getCell(`O${totalRow}`).alignment = { horizontal: "center" };

  // Gerar arquivo
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Pedido_${pedido.numero_pedido}.xlsx`;
  link.click();
  window.URL.revokeObjectURL(url);
}

/**
 * Lê arquivo XLSX e extrai codigos JIVA da coluna COD. JIVA
 */
export async function lerPlanilhaImportacao(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const ws = workbook.worksheets[0];
  if (!ws) return [];

  const codigos: string[] = [];

  // Procura coluna "COD. JIVA" no cabecalho (primeira linha)
  let codigoColIdx = -1;
  ws.getRow(1).eachCell((cell, colIdx) => {
    if (cell.value?.toString().toUpperCase().includes("COD")) {
      codigoColIdx = colIdx;
    }
  });

  if (codigoColIdx < 0) return [];

  // Extrai codigos das linhas seguintes
  ws.eachRow((row, rowIdx) => {
    if (rowIdx === 1) return; // Pula cabecalho
    const cell = row.getCell(codigoColIdx);
    if (cell.value) {
      codigos.push(cell.value.toString().trim());
    }
  });

  return codigos;
}
