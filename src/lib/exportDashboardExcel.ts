import ExcelJS from "exceljs";
import { formatBRL, hojeISO } from "./format";
import { LOGO_B64 } from "./pdf";

// ── Tipos dos dados recebidos do Dashboard ───────────────────────────────────
type RankingVendedor = {
  vendedor_id: string;
  nome: string;
  faturamento: number;
  numPedidos: number;
  clientesAtivos: number;
  clientesCarteira: number;
  metaMes: number | null;
};

type RankingSku = {
  produto_id: string;
  codigo_jiva: string;
  nome: string;
  marca: string;
  quantidade: number;
};

type RankingSkuValor = {
  produto_id: string;
  codigo_jiva: string;
  nome: string;
  marca: string;
  valor: number;
};

type RankingCampanha = {
  vendedor_id: string;
  nome: string;
  fatCampanha: number;
  nivel: string | null;
  metaVendedor: number | null;
  categoriaInicial: string | null;
  nivelExibido: string | null;
};

export type DashboardExcelData = {
  periodo: string;
  dataInicio: string;
  dataFim: string;
  metaTotal: number;
  fatMesAtual: number;
  fatFaturadoPeriodo: number;
  pipelineTotal: number;
  kpis: {
    recebidos: number;
    agFaturamento: number;
    semEstoque: number;
    faturado: number;
    problemas: number;
  };
  ranking: RankingVendedor[];
  topSkus: RankingSku[];
  topSkusValor: RankingSkuValor[];
  fatMensal: { mes: string; valor: number }[];
  entradaMarca: Record<string, number>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  campanhaAtiva: any;
  rankingCampanha: RankingCampanha[];
  entradaCampanha: number;
  metaTotalCampanha: number;
};

// ── Estilo ───────────────────────────────────────────────────────────────────
const GREEN = "FF006130";
const GREEN_RED = "FFA32D2D";
const ROW_EVEN_FILL = "FFF0F7F3";
const BORDER_COLOR = "FFD0D0D0";

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: BORDER_COLOR } },
  left: { style: "thin", color: { argb: BORDER_COLOR } },
  bottom: { style: "thin", color: { argb: BORDER_COLOR } },
  right: { style: "thin", color: { argb: BORDER_COLOR } },
};

function formatPct(n: number): string {
  return `${(Number.isFinite(n) ? n : 0).toFixed(1).replace(".", ",")}%`;
}

function sectionTitle(ws: ExcelJS.Worksheet, rowNum: number, text: string) {
  const cell = ws.getCell(rowNum, 1);
  cell.value = text;
  cell.font = { name: "Calibri", size: 13, bold: true, color: { argb: GREEN } };
}

function headerRow(ws: ExcelJS.Worksheet, rowNum: number, headers: string[]) {
  const row = ws.getRow(rowNum);
  headers.forEach((h, i) => {
    const cell = row.getCell(i + 1);
    cell.value = h;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = thinBorder;
  });
  row.commit();
}

// Estiliza uma linha de dados (zebra + bordas). `rowIndex` (0-based) define a cor.
function styleDataRow(ws: ExcelJS.Worksheet, rowNum: number, colCount: number, rowIndex: number) {
  const even = rowIndex % 2 === 0;
  for (let c = 1; c <= colCount; c++) {
    const cell = ws.getCell(rowNum, c);
    if (even) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROW_EVEN_FILL } };
    }
    cell.border = thinBorder;
  }
}

function defaultWidths(ws: ExcelJS.Worksheet, count: number, width = 20) {
  for (let c = 1; c <= count; c++) ws.getColumn(c).width = width;
}

// Insere logo no topo da aba. Retorna a linha onde o título deve ser escrito.
function addLogo(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, imageId: number) {
  ws.addImage(imageId, {
    tl: { col: 0, row: 0 },
    ext: { width: 160, height: 50 },
  });
  void wb;
}

export async function exportDashboardExcel(data: DashboardExcelData) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Bravir Connect";

  const imageId = wb.addImage({ base64: LOGO_B64, extension: "png" });

  const periodoLabel = `Período: ${data.dataInicio} a ${data.dataFim}`;

  // ── ABA 1: Resumo ──────────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Resumo");
    defaultWidths(ws, 6);
    addLogo(wb, ws, imageId);

    ws.mergeCells("A3:F3");
    const titulo = ws.getCell("A3");
    titulo.value = "DASHBOARD BRAVIR";
    titulo.font = { name: "Calibri", size: 16, bold: true, color: { argb: GREEN } };

    const sub = ws.getCell("A4");
    sub.value = periodoLabel;
    sub.font = { name: "Calibri", size: 11, color: { argb: "FF808080" } };

    // Fluxo de metas
    sectionTitle(ws, 6, "FLUXO DE METAS");
    headerRow(ws, 7, [
      "Meta de Entrada",
      "Entrada de Pedidos",
      "% da Meta",
      "Total Faturado",
      "% Faturado",
      "Total a Faturar",
    ]);
    const entradaPct = data.metaTotal > 0 ? (data.fatMesAtual / data.metaTotal) * 100 : 0;
    const faturadoPct = data.metaTotal > 0 ? (data.fatFaturadoPeriodo / data.metaTotal) * 100 : 0;
    const fluxoRow = ws.getRow(8);
    fluxoRow.getCell(1).value = formatBRL(data.metaTotal);
    fluxoRow.getCell(2).value = formatBRL(data.fatMesAtual);
    fluxoRow.getCell(3).value = formatPct(entradaPct);
    fluxoRow.getCell(4).value = formatBRL(data.fatFaturadoPeriodo);
    fluxoRow.getCell(5).value = formatPct(faturadoPct);
    fluxoRow.getCell(6).value = formatBRL(data.pipelineTotal);
    fluxoRow.commit();
    styleDataRow(ws, 8, 6, 0);

    // KPIs
    sectionTitle(ws, 10, "KPIs DO PERÍODO");
    headerRow(ws, 11, [
      "Pedidos Recebidos",
      "Ag. Faturamento",
      "Sem Estoque",
      "Faturado",
      "Problemas",
    ]);
    const kpiRow = ws.getRow(12);
    kpiRow.getCell(1).value = data.kpis.recebidos;
    kpiRow.getCell(2).value = data.kpis.agFaturamento;
    kpiRow.getCell(3).value = data.kpis.semEstoque;
    kpiRow.getCell(4).value = data.kpis.faturado;
    kpiRow.getCell(5).value = data.kpis.problemas;
    kpiRow.commit();
    styleDataRow(ws, 12, 5, 0);
  }

  // ── ABA 2: Ranking Vendedores ──────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Ranking Vendedores");
    defaultWidths(ws, 8);
    addLogo(wb, ws, imageId);

    const titulo = ws.getCell("A2");
    titulo.value = "RANKING DE VENDEDORES";
    titulo.font = { name: "Calibri", size: 16, bold: true, color: { argb: GREEN } };

    const sub = ws.getCell("A3");
    sub.value = periodoLabel;
    sub.font = { name: "Calibri", size: 11, color: { argb: "FF808080" } };

    headerRow(ws, 5, [
      "#",
      "Vendedor",
      "Pedidos",
      "Clientes Ativos",
      "Carteira",
      "Meta (R$)",
      "Realizado (R$)",
      "% da Meta",
    ]);

    data.ranking.forEach((r, i) => {
      const rowNum = 6 + i;
      const row = ws.getRow(rowNum);
      const pct = r.metaMes && r.metaMes > 0 ? (r.faturamento / r.metaMes) * 100 : 0;
      row.getCell(1).value = i + 1;
      row.getCell(2).value = r.nome;
      row.getCell(3).value = r.numPedidos;
      row.getCell(4).value = r.clientesAtivos;
      row.getCell(5).value = r.clientesCarteira;
      row.getCell(6).value = r.metaMes != null ? formatBRL(r.metaMes) : "—";
      row.getCell(7).value = formatBRL(r.faturamento);
      row.getCell(8).value = r.metaMes != null ? formatPct(pct) : "—";
      row.commit();
      styleDataRow(ws, rowNum, 8, i);

      // Cor condicional na % da meta
      if (r.metaMes != null) {
        const pctCell = ws.getCell(rowNum, 8);
        if (pct >= 100) pctCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: GREEN } };
        else if (pct < 70) pctCell.font = { name: "Calibri", size: 11, color: { argb: GREEN_RED } };
      }
    });
  }

  // ── ABA 3: Ranking Produtos ────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Ranking Produtos");
    defaultWidths(ws, 5);
    ws.getColumn(3).width = 40; // Produto
    addLogo(wb, ws, imageId);

    const titulo = ws.getCell("A2");
    titulo.value = "RANKING DE PRODUTOS";
    titulo.font = { name: "Calibri", size: 16, bold: true, color: { argb: GREEN } };

    // Por quantidade
    sectionTitle(ws, 4, "POR QUANTIDADE");
    headerRow(ws, 5, ["#", "Código", "Produto", "Marca", "Quantidade"]);
    data.topSkus.forEach((s, i) => {
      const rowNum = 6 + i;
      const row = ws.getRow(rowNum);
      row.getCell(1).value = i + 1;
      row.getCell(2).value = s.codigo_jiva;
      row.getCell(3).value = s.nome;
      row.getCell(4).value = s.marca;
      row.getCell(5).value = s.quantidade;
      row.commit();
      styleDataRow(ws, rowNum, 5, i);
    });

    // Por valor
    const valorTituloRow = 6 + data.topSkus.length + 2;
    sectionTitle(ws, valorTituloRow, "POR VALOR");
    headerRow(ws, valorTituloRow + 1, ["#", "Código", "Produto", "Marca", "Valor (R$)"]);
    data.topSkusValor.forEach((s, i) => {
      const rowNum = valorTituloRow + 2 + i;
      const row = ws.getRow(rowNum);
      row.getCell(1).value = i + 1;
      row.getCell(2).value = s.codigo_jiva;
      row.getCell(3).value = s.nome;
      row.getCell(4).value = s.marca;
      row.getCell(5).value = formatBRL(s.valor);
      row.commit();
      styleDataRow(ws, rowNum, 5, i);
    });
  }

  // ── ABA 4: Faturamento Mensal ──────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Faturamento Mensal");
    defaultWidths(ws, 2, 28);
    addLogo(wb, ws, imageId);

    const titulo = ws.getCell("A2");
    titulo.value = "FATURAMENTO MENSAL — ÚLTIMOS 6 MESES";
    titulo.font = { name: "Calibri", size: 16, bold: true, color: { argb: GREEN } };

    headerRow(ws, 4, ["Mês", "Valor Faturado (R$)"]);
    let total = 0;
    data.fatMensal.forEach((m, i) => {
      const rowNum = 5 + i;
      const row = ws.getRow(rowNum);
      row.getCell(1).value = m.mes;
      row.getCell(2).value = formatBRL(m.valor);
      row.commit();
      styleDataRow(ws, rowNum, 2, i);
      total += m.valor;
    });

    const totalRowNum = 5 + data.fatMensal.length + 1;
    const totalRow = ws.getRow(totalRowNum);
    const cTotal = totalRow.getCell(1);
    cTotal.value = "Total";
    cTotal.font = { name: "Calibri", size: 11, bold: true };
    const cVal = totalRow.getCell(2);
    cVal.value = formatBRL(total);
    cVal.font = { name: "Calibri", size: 11, bold: true };
    totalRow.commit();
  }

  // ── ABA 5: Entrada por Marca ───────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Entrada por Marca");
    defaultWidths(ws, 3);
    addLogo(wb, ws, imageId);

    const titulo = ws.getCell("A2");
    titulo.value = "ENTRADA POR MARCA";
    titulo.font = { name: "Calibri", size: 16, bold: true, color: { argb: GREEN } };

    const sub = ws.getCell("A4");
    sub.value = periodoLabel;
    sub.font = { name: "Calibri", size: 11, color: { argb: "FF808080" } };

    headerRow(ws, 5, ["Marca", "Valor (R$)", "% do Total"]);
    const marcas = Object.entries(data.entradaMarca).sort(([, a], [, b]) => b - a);
    const totalMarca = marcas.reduce((s, [, v]) => s + v, 0);
    marcas.forEach(([marca, valor], i) => {
      const rowNum = 6 + i;
      const row = ws.getRow(rowNum);
      row.getCell(1).value = marca;
      row.getCell(2).value = formatBRL(valor);
      row.getCell(3).value = formatPct(totalMarca > 0 ? (valor / totalMarca) * 100 : 0);
      row.commit();
      styleDataRow(ws, rowNum, 3, i);
    });
  }

  // ── ABA 6: Campanha ────────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Campanha");

    if (!data.campanhaAtiva) {
      const cell = ws.getCell("A1");
      cell.value = "Nenhuma campanha ativa no momento";
      cell.font = { name: "Calibri", size: 13, color: { argb: "FF808080" } };
    } else {
      defaultWidths(ws, 6);
      addLogo(wb, ws, imageId);

      const titulo = ws.getCell("A2");
      titulo.value = `CAMPANHA: ${data.campanhaAtiva.nome ?? ""}`;
      titulo.font = { name: "Calibri", size: 16, bold: true, color: { argb: GREEN } };

      const periodoCamp = ws.getCell("A3");
      periodoCamp.value = `Período da campanha: ${data.campanhaAtiva.data_inicio ?? "—"} a ${data.campanhaAtiva.data_fim ?? "—"}`;
      periodoCamp.font = { name: "Calibri", size: 11, color: { argb: "FF808080" } };

      const pctCamp = data.metaTotalCampanha > 0 ? (data.entradaCampanha / data.metaTotalCampanha) * 100 : 0;
      const meta = ws.getCell("A4");
      meta.value = `Meta total: ${formatBRL(data.metaTotalCampanha)} | Entrada: ${formatBRL(data.entradaCampanha)} | ${formatPct(pctCamp)} atingido`;
      meta.font = { name: "Calibri", size: 11, color: { argb: "FF808080" } };

      sectionTitle(ws, 6, "DESEMPENHO POR VENDEDOR");
      headerRow(ws, 7, [
        "Vendedor",
        "Realizado (R$)",
        "Meta (R$)",
        "% Atingido",
        "Nível",
        "Status",
      ]);
      data.rankingCampanha.forEach((r, i) => {
        const rowNum = 8 + i;
        const row = ws.getRow(rowNum);
        const pct = r.metaVendedor && r.metaVendedor > 0 ? (r.fatCampanha / r.metaVendedor) * 100 : 0;
        const status = r.metaVendedor == null
          ? "Sem meta"
          : r.fatCampanha >= r.metaVendedor
          ? "Meta atingida"
          : pct >= 70
          ? "Em linha"
          : "Abaixo";
        row.getCell(1).value = r.nome;
        row.getCell(2).value = formatBRL(r.fatCampanha);
        row.getCell(3).value = r.metaVendedor != null ? formatBRL(r.metaVendedor) : "—";
        row.getCell(4).value = r.metaVendedor != null ? formatPct(pct) : "—";
        row.getCell(5).value = r.nivelExibido ?? "—";
        row.getCell(6).value = status;
        row.commit();
        styleDataRow(ws, rowNum, 6, i);
      });
    }
  }

  // ── Download (alternativa nativa ao file-saver) ──────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dashboard_bravir_${hojeISO()}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
