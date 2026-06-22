import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Palavras-chave que identificam SKUs/nomes da linha Bendita Cânfora.
 * Qualquer produto cujo nome ou SKU contenha uma dessas strings (case-insensitive)
 * é considerado da linha Cânfora.
 */
const CANFORA_KEYWORDS = ["canfora", "cânfora", "bendita canfora", "bendita cânfora"];

/**
 * Tipos/sufixos da linha Cânfora que aparecem sozinhos como nome do produto
 * e precisam receber o prefixo "Cânfora ".
 */
const CANFORA_TIPOS = ["tablete", "tabletes", "liquida", "líquida", "gel", "spray", "sache", "sachê"];

/**
 * Retorna verdadeiro se o texto fornecido pertence à linha Cânfora.
 */
function isCanfora(texto: string): boolean {
  const lower = texto.toLowerCase();
  return CANFORA_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Formata o nome de um produto para exibição no PDF.
 *
 * Regra principal: se o produto pertencer à linha Cânfora (detectado pelo nome
 * ou pelo SKU) e o nome exibido for apenas o tipo (ex.: "Tablete", "Líquida",
 * "Gel"), prefixa com "Cânfora " para que fique legível no PDF.
 *
 * @param nome  Nome/descrição do produto como vem do banco.
 * @param sku   Código SKU do produto (opcional, ajuda na detecção).
 */
export function formatarNomeProdutoPDF(nome: string, sku?: string): string {
  if (!nome) return nome;

  const textoParaDetectar = `${nome} ${sku ?? ""}`;

  if (!isCanfora(textoParaDetectar)) {
    return nome;
  }

  // Se o nome já contém "cânfora" ou "canfora", não precisa prefixar.
  if (isCanfora(nome)) {
    return nome;
  }

  // Verifica se o nome é apenas um dos tipos conhecidos (com possíveis variações).
  const nomeLower = nome.trim().toLowerCase();
  const eTipo = CANFORA_TIPOS.some(
    (tipo) => nomeLower === tipo || nomeLower.startsWith(tipo + " ") || nomeLower.startsWith(tipo + "-")
  );

  if (eTipo) {
    return `Cânfora ${nome.trim()}`;
  }

  return nome;
}

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

export interface ItemPedidoPDF {
  sku: string;
  nome: string;
  quantidade: number;
  preco_unitario: number;
  desconto?: number;
  total: number;
}

export interface DadosPropostaPDF {
  numeroPedido?: string | number;
  nomeCliente: string;
  cnpj?: string;
  vendedor?: string;
  dataEmissao?: string;
  validade?: string;
  condicaoPagamento?: string;
  observacoes?: string;
  itens: ItemPedidoPDF[];
  totalGeral: number;
  logoUrl?: string;
}

// ---------------------------------------------------------------------------
// Formatação de moeda
// ---------------------------------------------------------------------------

function formatBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ---------------------------------------------------------------------------
// Geração do PDF
// ---------------------------------------------------------------------------

export function gerarPropostaPDF(dados: DadosPropostaPDF): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const margemEsq = 14;
  const margemDir = 196;
  const larguraPagina = margemDir - margemEsq;
  let y = 14;

  // ---- Cabeçalho ----
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Bravir", margemEsq, y);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Proposta Comercial", margemDir, y, { align: "right" });
  y += 6;

  doc.setDrawColor(180);
  doc.line(margemEsq, y, margemDir, y);
  y += 8;

  // ---- Dados do cliente ----
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Cliente:", margemEsq, y);
  doc.setFont("helvetica", "normal");
  doc.text(dados.nomeCliente, margemEsq + 18, y);
  y += 6;

  if (dados.cnpj) {
    doc.setFont("helvetica", "bold");
    doc.text("CNPJ:", margemEsq, y);
    doc.setFont("helvetica", "normal");
    doc.text(dados.cnpj, margemEsq + 18, y);
    y += 6;
  }

  if (dados.vendedor) {
    doc.setFont("helvetica", "bold");
    doc.text("Vendedor:", margemEsq, y);
    doc.setFont("helvetica", "normal");
    doc.text(dados.vendedor, margemEsq + 22, y);
    y += 6;
  }

  if (dados.numeroPedido) {
    doc.setFont("helvetica", "bold");
    doc.text("Nº Pedido:", margemEsq, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(dados.numeroPedido), margemEsq + 24, y);
    y += 6;
  }

  const hoje = dados.dataEmissao ?? new Date().toLocaleDateString("pt-BR");
  doc.setFont("helvetica", "bold");
  doc.text("Emissão:", margemEsq, y);
  doc.setFont("helvetica", "normal");
  doc.text(hoje, margemEsq + 20, y);

  if (dados.validade) {
    doc.setFont("helvetica", "bold");
    doc.text("Validade:", margemEsq + 60, y);
    doc.setFont("helvetica", "normal");
    doc.text(dados.validade, margemEsq + 80, y);
  }
  y += 8;

  if (dados.condicaoPagamento) {
    doc.setFont("helvetica", "bold");
    doc.text("Pagamento:", margemEsq, y);
    doc.setFont("helvetica", "normal");
    doc.text(dados.condicaoPagamento, margemEsq + 26, y);
    y += 8;
  }

  doc.line(margemEsq, y, margemDir, y);
  y += 6;

  // ---- Tabela de itens ----
  const colunas = [
    { header: "SKU", dataKey: "sku" },
    { header: "Produto", dataKey: "nome" },
    { header: "Qtd", dataKey: "quantidade" },
    { header: "Preço Unit.", dataKey: "preco" },
    { header: "Desc.", dataKey: "desconto" },
    { header: "Total", dataKey: "total" },
  ];

  const linhas = dados.itens.map((item) => ({
    sku: item.sku,
    // ← aqui aplica a normalização do nome para a linha Cânfora
    nome: formatarNomeProdutoPDF(item.nome, item.sku),
    quantidade: item.quantidade,
    preco: formatBRL(item.preco_unitario),
    desconto: item.desconto ? `${item.desconto}%` : "-",
    total: formatBRL(item.total),
  }));

  autoTable(doc, {
    startY: y,
    head: [colunas.map((c) => c.header)],
    body: linhas.map((l) => colunas.map((c) => (l as Record<string, unknown>)[c.dataKey] as string)),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [30, 30, 80], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 70 },
      2: { cellWidth: 14, halign: "center" },
      3: { cellWidth: 28, halign: "right" },
      4: { cellWidth: 18, halign: "right" },
      5: { cellWidth: 28, halign: "right" },
    },
    margin: { left: margemEsq, right: 14 },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY: number = (doc as any).lastAutoTable?.finalY ?? y + 20;

  // ---- Total geral ----
  const totalY = finalY + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Total Geral:", margemDir - 50, totalY);
  doc.text(formatBRL(dados.totalGeral), margemDir, totalY, { align: "right" });

  // ---- Observações ----
  if (dados.observacoes) {
    const obsY = totalY + 10;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Observações:", margemEsq, obsY);
    doc.setFont("helvetica", "normal");
    const linhasObs = doc.splitTextToSize(dados.observacoes, larguraPagina);
    doc.text(linhasObs, margemEsq, obsY + 5);
  }

  // ---- Rodapé ----
  const pageCount: number = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150);
    doc.text(
      `Página ${i} de ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" }
    );
    doc.setTextColor(0);
  }

  doc.save(`proposta_${dados.nomeCliente.replace(/\s+/g, "_")}.pdf`);
}
