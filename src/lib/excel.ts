import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import { STATUS_LABEL } from "@/lib/status";

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

const GREEN_FILL = "FF006130"; // Verde oficial Bravir (logo)

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

export interface ProdutoTabela {
  codigo_jiva: string;
  nome: string;
  marca: string;
  preco_7: number;
  preco_12: number;
  preco_18: number;
  preco_suframa: number;
}

export async function exportarTabelaPrecosExcel(produtos: ProdutoTabela[]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Tabela de Preços");

  ws.columns = [
    { key: "marca", width: 20 },
    { key: "codigo", width: 18 },
    { key: "nome", width: 50 },
    { key: "p7", width: 14 },
    { key: "p12", width: 14 },
    { key: "p18", width: 14 },
    { key: "psuframa", width: 14 },
  ];

  const headers = ["Marca", "COD. JIVA", "Descrição", "7%", "12%", "18%", "Suframa"];
  const cols = ["A", "B", "C", "D", "E", "F", "G"];

  ws.mergeCells("A1:G1");
  const title = ws.getCell("A1");
  title.value = "TABELA DE PREÇOS BRAVIR";
  title.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_FILL } };
  title.alignment = { horizontal: "center", vertical: "center" };
  ws.getRow(1).height = 28;

  cols.forEach((col, idx) => {
    const cell = ws.getCell(`${col}2`);
    cell.value = headers[idx];
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_FILL } };
    cell.alignment = { horizontal: "center" };
  });
  ws.getRow(2).height = 20;

  produtos.forEach((p, idx) => {
    const row = idx + 3;
    ws.getCell(`A${row}`).value = p.marca;
    ws.getCell(`B${row}`).value = p.codigo_jiva;
    ws.getCell(`C${row}`).value = p.nome;
    ws.getCell(`D${row}`).value = p.preco_7;
    ws.getCell(`E${row}`).value = p.preco_12;
    ws.getCell(`F${row}`).value = p.preco_18;
    ws.getCell(`G${row}`).value = p.preco_suframa;

    if (idx % 2 === 0) {
      cols.forEach((col) => {
        ws.getCell(`${col}${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
      });
    }
    ["D", "E", "F", "G"].forEach((col) => {
      ws.getCell(`${col}${row}`).numFmt = "#,##0.00";
      ws.getCell(`${col}${row}`).alignment = { horizontal: "right" };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Tabela_Precos_Bravir.xlsx`;
  link.click();
  window.URL.revokeObjectURL(url);
}

export interface BaseDadosRow {
  numero_pedido: number | null;
  data_pedido: string | null;
  vendedor: string;
  cliente: string;
  nome_fantasia: string;
  codigo_cliente: string;
  status: string;
  produto: string;
  marca: string;
  codigo_produto: string;
  quantidade: number;
  preco_unitario: number;
  total_item: number;
  total_pedido: number;
}

/**
 * Exporta a base de dados completa (pedidos x itens) para Excel.
 * Uma linha por item de pedido.
 */
export async function exportarBaseDadosExcel(
  rows: BaseDadosRow[],
  nomeArquivo: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Base de Dados");

  ws.columns = [
    { key: "numero_pedido", width: 12 },
    { key: "data_pedido", width: 14 },
    { key: "vendedor", width: 24 },
    { key: "cliente", width: 36 },
    { key: "nome_fantasia", width: 28 },
    { key: "codigo_cliente", width: 14 },
    { key: "status", width: 22 },
    { key: "produto", width: 44 },
    { key: "marca", width: 18 },
    { key: "codigo_produto", width: 16 },
    { key: "quantidade", width: 10 },
    { key: "preco_unitario", width: 14 },
    { key: "total_item", width: 14 },
    { key: "total_pedido", width: 16 },
  ];

  const headers = [
    "Nº Pedido",
    "Data",
    "Vendedor",
    "Cliente",
    "Nome Fantasia",
    "Cód. Cliente",
    "Status",
    "Produto",
    "Marca",
    "Cód. Produto",
    "Qtd",
    "Preço Unit.",
    "Total Item",
    "Total Pedido",
  ];
  const cols = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"];

  cols.forEach((col, idx) => {
    const cell = ws.getCell(`${col}1`);
    cell.value = headers[idx];
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_FILL } };
    cell.alignment = { horizontal: "center", vertical: "center", wrapText: true };
  });
  ws.getRow(1).height = 24;
  ws.views = [{ state: "frozen", ySplit: 1 }];

  rows.forEach((r, idx) => {
    const row = idx + 2;
    ws.getCell(`A${row}`).value = r.numero_pedido;
    ws.getCell(`B${row}`).value = r.data_pedido;
    ws.getCell(`C${row}`).value = r.vendedor;
    ws.getCell(`D${row}`).value = r.cliente;
    ws.getCell(`E${row}`).value = r.nome_fantasia;
    ws.getCell(`F${row}`).value = r.codigo_cliente;
    ws.getCell(`G${row}`).value = r.status;
    ws.getCell(`H${row}`).value = r.produto;
    ws.getCell(`I${row}`).value = r.marca;
    ws.getCell(`J${row}`).value = r.codigo_produto;
    ws.getCell(`K${row}`).value = r.quantidade;
    ws.getCell(`L${row}`).value = r.preco_unitario;
    ws.getCell(`M${row}`).value = r.total_item;
    ws.getCell(`N${row}`).value = r.total_pedido;

    if (idx % 2 === 0) {
      cols.forEach((col) => {
        ws.getCell(`${col}${row}`).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF5F5F5" },
        };
      });
    }

    ["L", "M", "N"].forEach((col) => {
      ws.getCell(`${col}${row}`).numFmt = "#,##0.00";
      ws.getCell(`${col}${row}`).alignment = { horizontal: "right" };
    });
    ws.getCell(`K${row}`).alignment = { horizontal: "center" };
  });

  ws.autoFilter = { from: "A1", to: `N${rows.length + 1}` };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  window.URL.revokeObjectURL(url);
}

type PedidoBase = {
  id: string;
  numero_pedido: number | null;
  data_pedido: string | null;
  status: string | null;
  total: number | null;
  cliente_id: string | null;
  vendedor_id: string | null;
};

type ItemComProduto = {
  pedido_id: string;
  quantidade: number | null;
  preco_final: number | null;
  total_item: number | null;
  produtos: { nome: string | null; codigo_jiva: string | null; marca: string | null } | null;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Busca a base de dados completa (pedidos x itens) usando queries separadas —
 * evita o erro 400 do PostgREST com joins aninhados — e gera o Excel.
 * Retorna o número de linhas exportadas (uma por item de pedido).
 */
export async function exportarBaseDadosCompleta(nomeArquivo: string): Promise<number> {
  // 1. Pedidos (paginado)
  const pedidos: PedidoBase[] = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("pedidos")
      .select("id, numero_pedido, data_pedido, status, total, cliente_id, vendedor_id")
      .is("deleted_at", null)
      .order("data_pedido", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as PedidoBase[];
    pedidos.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  if (pedidos.length === 0) return 0;

  // 2. Itens de pedido com produtos — em lotes de ids
  const itensPorPedido: Record<string, ItemComProduto[]> = {};
  for (const lote of chunk(pedidos.map((p) => p.id), 200)) {
    const { data, error } = await supabase
      .from("itens_pedido")
      .select("pedido_id, quantidade, preco_final, total_item, produtos(nome, codigo_jiva, marca)")
      .in("pedido_id", lote);
    if (error) throw error;
    for (const item of (data ?? []) as unknown as ItemComProduto[]) {
      if (!item.pedido_id) continue;
      if (!itensPorPedido[item.pedido_id]) itensPorPedido[item.pedido_id] = [];
      itensPorPedido[item.pedido_id].push(item);
    }
  }

  // 3. Clientes — em lotes de ids
  const clienteMap: Record<string, { razao_social: string | null; nome_parceiro: string | null; codigo_parceiro: string | null }> = {};
  const clienteIds = [...new Set(pedidos.map((p) => p.cliente_id).filter(Boolean) as string[])];
  for (const lote of chunk(clienteIds, 200)) {
    const { data, error } = await supabase
      .from("clientes")
      .select("id, razao_social, nome_parceiro, codigo_parceiro")
      .in("id", lote);
    if (error) throw error;
    for (const c of data ?? []) {
      clienteMap[c.id] = {
        razao_social: c.razao_social,
        nome_parceiro: c.nome_parceiro,
        codigo_parceiro: c.codigo_parceiro,
      };
    }
  }

  // 4. Profiles (vendedores) — em lotes de ids
  const vendedorMap: Record<string, string> = {};
  const vendedorIds = [...new Set(pedidos.map((p) => p.vendedor_id).filter(Boolean) as string[])];
  for (const lote of chunk(vendedorIds, 200)) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", lote);
    if (error) throw error;
    for (const v of data ?? []) {
      vendedorMap[v.id] = v.full_name ?? "";
    }
  }

  // 5. Junta tudo no client — uma linha por item de pedido
  const linhas: BaseDadosRow[] = [];
  for (const p of pedidos) {
    const cliente = p.cliente_id ? clienteMap[p.cliente_id] : null;
    const base = {
      numero_pedido: p.numero_pedido,
      data_pedido: p.data_pedido,
      vendedor: p.vendedor_id ? vendedorMap[p.vendedor_id] ?? "" : "",
      cliente: cliente?.razao_social ?? "",
      nome_fantasia: cliente?.nome_parceiro ?? "",
      codigo_cliente: cliente?.codigo_parceiro ?? "",
      status: p.status ? STATUS_LABEL[p.status] ?? p.status : "",
      total_pedido: p.total ?? 0,
    };
    for (const item of itensPorPedido[p.id] ?? []) {
      linhas.push({
        ...base,
        produto: item.produtos?.nome ?? "",
        marca: item.produtos?.marca ?? "",
        codigo_produto: item.produtos?.codigo_jiva ?? "",
        quantidade: item.quantidade ?? 0,
        preco_unitario: item.preco_final ?? 0,
        total_item: item.total_item ?? 0,
      });
    }
  }

  if (linhas.length === 0) return 0;

  await exportarBaseDadosExcel(linhas, nomeArquivo);
  return linhas.length;
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
