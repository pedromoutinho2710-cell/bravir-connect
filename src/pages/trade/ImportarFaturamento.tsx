import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Upload, Download, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { formatBRL, formatDate } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";

type Etapa = "upload" | "preview" | "importando" | "concluido";

type LinhaSankhya = {
  numero_nota: string;
  numero_pedido_crm: string | null;
  tipo_operacao: string | null;
  data_faturamento: string | null;
  codigo_parceiro: string | null;
  nome_parceiro: string | null;
  grupo_cliente: string | null;
  segmento: string | null;
  cidade: string | null;
  uf: string | null;
  codigo_produto: string | null;
  descricao_produto: string | null;
  quantidade: number | null;
  valor_total_itens: number | null;
  valor_liquido: number | null;
  valor_st: number | null;
  base_st: number | null;
  aliq_ipi: number | null;
  ipi: number | null;
  valor_fem: number | null;
  valor_destaque: number | null;
  controle: string | null;
  cod_grupo: string | null;
  grupo: string | null;
  nome_vendedor: string | null;
  razao_social_empresa: string | null;
  tipo_negociacao: string | null;
  recebimento_pedido: string | null;
};

function normalizar(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function parseNumero(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim();
  if (!s) return null;
  const limpo = s.replace(/[R$\s]/gi, "").replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

function parseData(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = raw * 86400000;
    return new Date(epoch.getTime() + ms).toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (!s) return null;
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    const [, d, m, y] = br;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const dt = new Date(s);
  return Number.isFinite(dt.getTime()) ? dt.toISOString().slice(0, 10) : null;
}

type ColunaKey =
  | "numero_nota" | "numero_pedido_crm" | "tipo_operacao" | "data_faturamento"
  | "codigo_parceiro" | "nome_parceiro" | "grupo_segmento" | "grupo_cliente" | "segmento"
  | "cidade_uf" | "cidade" | "uf"
  | "codigo_produto" | "descricao_produto" | "quantidade"
  | "valor_total_itens" | "valor_liquido" | "valor_st" | "base_st"
  | "aliq_ipi" | "ipi" | "valor_fem" | "valor_destaque"
  | "controle" | "cod_grupo" | "grupo" | "nome_vendedor"
  | "razao_social_empresa" | "tipo_negociacao" | "recebimento_pedido";

function detectarColuna(header: string): ColunaKey | null {
  const n = normalizar(header);
  if (!n) return null;
  if (n.includes("numero") && n.includes("nota")) return "numero_nota";
  if (n === "nota" || n.includes("nº nota") || n.includes("n nota")) return "numero_nota";
  if (n.includes("pedido") && n.includes("crm")) return "numero_pedido_crm";
  if (n.includes("tipo") && n.includes("operacao")) return "tipo_operacao";
  if (n.includes("data") && n.includes("faturamento")) return "data_faturamento";
  if (n.includes("recebimento") && n.includes("pedido")) return "recebimento_pedido";
  if (n.includes("codigo") && n.includes("parceiro")) return "codigo_parceiro";
  if (n.includes("nome") && n.includes("parceiro")) return "nome_parceiro";
  if (n.includes("grupo") && n.includes("cliente") && n.includes("segmento")) return "grupo_segmento";
  if (n.includes("grupo") && n.includes("cliente")) return "grupo_cliente";
  if (n === "segmento") return "segmento";
  if (n.includes("cidade") && n.includes("uf")) return "cidade_uf";
  if (n === "cidade") return "cidade";
  if (n === "uf" || n === "estado") return "uf";
  if (n.includes("codigo") && n.includes("produto")) return "codigo_produto";
  if (n.includes("descricao") && n.includes("produto")) return "descricao_produto";
  if (n.includes("quantidade")) return "quantidade";
  if (n.includes("valor") && n.includes("total") && n.includes("liquido")) return "valor_liquido";
  if (n.includes("vlr") && n.includes("total") && n.includes("liquido")) return "valor_liquido";
  if (n.includes("valor") && n.includes("liquido")) return "valor_liquido";
  if (n.includes("valor") && n.includes("total") && n.includes("item")) return "valor_total_itens";
  if (n === "valor st" || (n.includes("valor") && n.includes("st") && !n.includes("base"))) return "valor_st";
  if (n.includes("base") && n.includes("st")) return "base_st";
  if (n.includes("aliq") && n.includes("ipi")) return "aliq_ipi";
  if (n === "ipi") return "ipi";
  if (n.includes("valor") && n.includes("fem")) return "valor_fem";
  if (n.includes("valor") && n.includes("destaque")) return "valor_destaque";
  if (n === "controle") return "controle";
  if (n.includes("cod") && n.includes("grupo")) return "cod_grupo";
  if (n === "grupo") return "grupo";
  if (n.includes("nome") && n.includes("vendedor")) return "nome_vendedor";
  if (n.includes("razao") && n.includes("empresa")) return "razao_social_empresa";
  if (n.includes("tipo") && n.includes("negociacao")) return "tipo_negociacao";
  return null;
}

function mapearLinha(
  row: Record<string, unknown>,
  mapeamento: Map<string, ColunaKey>,
): LinhaSankhya | null {
  const get = (key: ColunaKey): unknown => {
    for (const [h, k] of mapeamento) if (k === key) return row[h];
    return "";
  };

  const numero_nota = String(get("numero_nota") ?? "").trim();
  if (!numero_nota) return null;

  // "Número Pedido CRM" pode vir como inteiro, "-" ou vazio → trata "-"/vazio como null
  const crmRaw = String(get("numero_pedido_crm") ?? "").trim();
  const numero_pedido_crm = crmRaw && crmRaw !== "-" ? crmRaw : null;

  let grupo_cliente: string | null = (String(get("grupo_cliente") ?? "").trim() || null);
  let segmento: string | null = (String(get("segmento") ?? "").trim() || null);
  const gs = String(get("grupo_segmento") ?? "").trim();
  if (gs && (!grupo_cliente || !segmento)) {
    const [g, s] = gs.split("/").map((x) => x.trim());
    if (!grupo_cliente) grupo_cliente = g || null;
    if (!segmento) segmento = s || null;
  }

  let cidade: string | null = (String(get("cidade") ?? "").trim() || null);
  let uf: string | null = (String(get("uf") ?? "").trim() || null);
  const cu = String(get("cidade_uf") ?? "").trim();
  if (cu && (!cidade || !uf)) {
    const [c, u] = cu.split("/").map((x) => x.trim());
    if (!cidade) cidade = c || null;
    if (!uf) uf = u || null;
  }

  return {
    numero_nota,
    numero_pedido_crm,
    tipo_operacao: String(get("tipo_operacao") ?? "").trim() || null,
    data_faturamento: parseData(get("data_faturamento")),
    codigo_parceiro: String(get("codigo_parceiro") ?? "").trim() || null,
    nome_parceiro: String(get("nome_parceiro") ?? "").trim() || null,
    grupo_cliente,
    segmento,
    cidade,
    uf,
    codigo_produto: String(get("codigo_produto") ?? "").trim() || null,
    descricao_produto: String(get("descricao_produto") ?? "").trim() || null,
    quantidade: parseNumero(get("quantidade")),
    valor_total_itens: parseNumero(get("valor_total_itens")),
    valor_liquido: parseNumero(get("valor_liquido")),
    valor_st: parseNumero(get("valor_st")),
    base_st: parseNumero(get("base_st")),
    aliq_ipi: parseNumero(get("aliq_ipi")),
    ipi: parseNumero(get("ipi")),
    valor_fem: parseNumero(get("valor_fem")),
    valor_destaque: parseNumero(get("valor_destaque")),
    controle: String(get("controle") ?? "").trim() || null,
    cod_grupo: String(get("cod_grupo") ?? "").trim() || null,
    grupo: String(get("grupo") ?? "").trim() || null,
    nome_vendedor: String(get("nome_vendedor") ?? "").trim() || null,
    razao_social_empresa: String(get("razao_social_empresa") ?? "").trim() || null,
    tipo_negociacao: String(get("tipo_negociacao") ?? "").trim() || null,
    recebimento_pedido: parseData(get("recebimento_pedido")),
  };
}

export default function ImportarFaturamento() {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const rowsBrutasRef = useRef<Record<string, unknown>[]>([]);
  const mapeamentoRef = useRef<Map<string, ColunaKey>>(new Map());
  const [etapa, setEtapa] = useState<Etapa>("upload");
  const [previa, setPrevia] = useState<LinhaSankhya[]>([]);
  const [totalLinhas, setTotalLinhas] = useState(0);
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });
  const [vinculando, setVinculando] = useState(false);
  const [resultado, setResultado] = useState({
    inseridos: 0,
    duplicados: 0,
    pedidosAtualizados: 0,
    pedidosNaoEncontrados: 0,
  });

  const baixarModelo = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      [
        "Número da Nota", "Número Pedido CRM", "Tipo de Operação", "Data do Faturamento",
        "Código do Parceiro", "Nome do Parceiro",
        "Grupo Cliente / Segmento", "Cidade / UF",
        "Código do Produto", "Descrição do Produto",
        "Quantidade total de itens", "Valor Total dos Itens",
        "Vlr Total Liquido Itens",
        "Valor ST", "Base ST", "Aliq. IPI", "IPI", "Valor FEM", "Valor Destaque",
        "Controle", "Cód. Grupo", "Grupo", "Nome do Vendedor",
        "Razão Social da Empresa", "Tipo de Negociação", "Recebimento do Pedido",
      ],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Faturamento Sankhya");
    XLSX.writeFile(wb, "modelo-importar-faturamento-sankhya.xlsx");
  };

  const handleArquivo = async (file: File) => {
    setProcessando(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true });
      if (rows.length === 0) {
        toast.error("Planilha vazia");
        setProcessando(false);
        return;
      }

      const headers = Object.keys(rows[0]);
      const mapeamento = new Map<string, ColunaKey>();
      for (const h of headers) {
        const tipo = detectarColuna(h);
        if (tipo && !Array.from(mapeamento.values()).includes(tipo)) {
          mapeamento.set(h, tipo);
        }
      }

      if (!Array.from(mapeamento.values()).includes("numero_nota")) {
        toast.error("Não encontrei a coluna 'Número da Nota' na planilha");
        setProcessando(false);
        return;
      }

      const previaParsed: LinhaSankhya[] = [];
      for (let i = 0; i < rows.length && previaParsed.length < 10; i++) {
        const linha = mapearLinha(rows[i], mapeamento);
        if (linha) previaParsed.push(linha);
      }

      if (previaParsed.length === 0) {
        toast.error("Nenhuma linha com Número da Nota válido encontrada");
        setProcessando(false);
        return;
      }

      rowsBrutasRef.current = rows;
      mapeamentoRef.current = mapeamento;
      setPrevia(previaParsed);
      setTotalLinhas(rows.length);
      setEtapa("preview");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao ler planilha");
    } finally {
      setProcessando(false);
    }
  };

  const confirmar = async () => {
    const rows = rowsBrutasRef.current;
    const mapeamento = mapeamentoRef.current;
    if (rows.length === 0) return;

    setEtapa("importando");
    setVinculando(false);
    setProgresso({ feitos: 0, total: rows.length });
    let inseridos = 0;
    let processadosTotal = 0;
    const todasLinhas: LinhaSankhya[] = [];

    const lote = 200;
    for (let i = 0; i < rows.length; i += lote) {
      const sliceRows = rows.slice(i, i + lote);
      const payload: (LinhaSankhya & { importado_por: string | null })[] = [];
      for (const r of sliceRows) {
        const linha = mapearLinha(r, mapeamento);
        if (linha) {
          todasLinhas.push(linha);
          payload.push({ ...linha, importado_por: user?.id ?? null });
        }
      }

      if (payload.length > 0) {
        // TODO: adicionar faturamentos_sankhya ao types.ts e remover o cast
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("faturamentos_sankhya")
          .upsert(payload, { onConflict: "numero_nota,codigo_produto", ignoreDuplicates: true })
          .select("id");
        if (error) {
          console.error(error);
          toast.error(`Erro no lote ${i / lote + 1}: ${error.message}`);
        } else {
          inseridos += (data ?? []).length;
        }
        processadosTotal += payload.length;
      }

      setProgresso({ feitos: Math.min(i + sliceRows.length, rows.length), total: rows.length });
      await new Promise((r) => setTimeout(r, 0));
    }

    const duplicados = processadosTotal - inseridos;
    if (!Array.from(mapeamento.values()).includes("numero_pedido_crm")) {
      toast.info("Coluna 'Número Pedido CRM' não encontrada — pedidos não foram vinculados.");
    }
    const { pedidosAtualizados, pedidosNaoEncontrados } = await vincularPedidos(todasLinhas);

    setResultado({ inseridos, duplicados, pedidosAtualizados, pedidosNaoEncontrados });
    setEtapa("concluido");
    toast.success(`${inseridos} registros importados, ${pedidosAtualizados} pedidos faturados`);
  };

  // Após importar o staging, vincula os registros aos pedidos do CRM:
  // agrupa por numero_pedido_crm, marca o pedido como faturado e registra a NF.
  const vincularPedidos = async (
    linhas: LinhaSankhya[],
  ): Promise<{ pedidosAtualizados: number; pedidosNaoEncontrados: number }> => {
    setVinculando(true);

    // Agrupa por numero_pedido_crm (já vem null para "-"/vazio). A chave é o
    // numero_pedido inteiro usado na tabela pedidos.
    type GrupoCrm = { notas: Set<string>; dataMax: string | null };
    const grupos = new Map<number, GrupoCrm>();
    for (const l of linhas) {
      if (!l.numero_pedido_crm) continue;
      const num = parseInt(l.numero_pedido_crm, 10);
      // numero_pedido é integer (int4) no banco: descarta NaN, não-positivos e
      // valores fora do range para não derrubar o lote inteiro do .in() abaixo.
      if (!Number.isInteger(num) || num < 1 || num > 2147483647) continue;
      let g = grupos.get(num);
      if (!g) {
        g = { notas: new Set(), dataMax: null };
        grupos.set(num, g);
      }
      if (l.numero_nota) g.notas.add(l.numero_nota);
      if (l.data_faturamento && (!g.dataMax || l.data_faturamento > g.dataMax)) {
        g.dataMax = l.data_faturamento;
      }
    }

    if (grupos.size === 0) return { pedidosAtualizados: 0, pedidosNaoEncontrados: 0 };

    const buscaLote = 200;
    const numeros = Array.from(grupos.keys());

    // Localiza os pedidos correspondentes (numero_pedido = numero_pedido_crm).
    const pedidoPorNumero = new Map<number, string>();
    for (let i = 0; i < numeros.length; i += buscaLote) {
      const fatia = numeros.slice(i, i + buscaLote);
      const { data, error } = await supabase
        .from("pedidos")
        .select("id, numero_pedido")
        .in("numero_pedido", fatia);
      if (error) {
        console.error(error);
        toast.error(`Erro ao buscar pedidos: ${error.message}`);
        continue;
      }
      for (const p of data ?? []) {
        if (p.numero_pedido != null) pedidoPorNumero.set(p.numero_pedido, p.id);
      }
    }

    // Pré-carrega faturamentos existentes (pedido_id + nota_fiscal) para ignorar
    // duplicatas sem depender de constraint única no banco.
    const fatExistentes = new Set<string>();
    const pedidoIds = Array.from(pedidoPorNumero.values());
    for (let i = 0; i < pedidoIds.length; i += buscaLote) {
      const fatia = pedidoIds.slice(i, i + buscaLote);
      const { data, error } = await supabase
        .from("faturamentos")
        .select("pedido_id, nota_fiscal")
        .in("pedido_id", fatia);
      if (error) {
        console.error(error);
        continue;
      }
      for (const f of data ?? []) fatExistentes.add(`${f.pedido_id}::${f.nota_fiscal ?? ""}`);
    }

    let pedidosNaoEncontrados = 0;
    const novosFaturamentos: { pedido_id: string; nota_fiscal: string; usuario_id: string | null }[] = [];

    for (const [num, g] of grupos) {
      const pedidoId = pedidoPorNumero.get(num);
      if (!pedidoId) {
        pedidosNaoEncontrados++;
        continue;
      }

      // De-dup: só envia notas que ainda não existem para o pedido.
      for (const nota of g.notas) {
        const chave = `${pedidoId}::${nota}`;
        if (fatExistentes.has(chave)) continue;
        fatExistentes.add(chave);
        novosFaturamentos.push({ pedido_id: pedidoId, nota_fiscal: nota, usuario_id: user?.id ?? null });
      }
    }

    // O UPDATE de pedidos e o INSERT de faturamentos são bloqueados por RLS para o
    // role trade; ambos rodam de uma vez via função SECURITY DEFINER vincular_pedidos_sankhya.
    // types.ts ainda não conhece a função — cast igual ao usado em faturamentos_sankhya.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcResult, error: rpcError } = await (supabase as any).rpc("vincular_pedidos_sankhya", {
      p_pedido_ids: pedidoIds,
      p_status: "faturado",
      p_faturamentos: novosFaturamentos,
    });
    if (rpcError) {
      console.error(rpcError);
      toast.error(`Erro ao vincular pedidos: ${rpcError.message}`);
      return { pedidosAtualizados: 0, pedidosNaoEncontrados };
    }

    const pedidosAtualizados = Number(rpcResult?.pedidos_atualizados ?? 0);
    const faturamentosInseridos = Number(rpcResult?.faturamentos_inseridos ?? 0);
    console.info(
      `Vinculação Sankhya: ${pedidosAtualizados} pedidos atualizados, ${faturamentosInseridos} faturamentos inseridos.`,
    );

    return { pedidosAtualizados, pedidosNaoEncontrados };
  };

  const reiniciar = () => {
    rowsBrutasRef.current = [];
    mapeamentoRef.current = new Map();
    setPrevia([]);
    setTotalLinhas(0);
    setResultado({ inseridos: 0, duplicados: 0, pedidosAtualizados: 0, pedidosNaoEncontrados: 0 });
    setProgresso({ feitos: 0, total: 0 });
    setVinculando(false);
    setEtapa("upload");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Importar Faturamento Sankhya</h1>
          <p className="text-sm text-muted-foreground">
            Suba o relatório Excel exportado do Sankhya. Duplicatas (mesma nota + produto) são ignoradas automaticamente.
          </p>
        </div>
        <Button variant="outline" onClick={baixarModelo}>
          <Download className="mr-2 h-4 w-4" /> Baixar modelo
        </Button>
      </div>

      {etapa === "upload" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 p-12">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground" />
            <p className="text-center text-sm text-muted-foreground">
              Arquivos aceitos: <strong>.xls</strong> e <strong>.xlsx</strong> com o layout padrão do Sankhya.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleArquivo(f);
              }}
            />
            <Button onClick={() => inputRef.current?.click()} disabled={processando}>
              {processando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {processando ? "Lendo planilha..." : "Selecionar planilha"}
            </Button>
          </CardContent>
        </Card>
      )}

      {etapa === "preview" && (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="flex flex-wrap gap-3">
                <Badge variant="outline">
                  {totalLinhas.toLocaleString("pt-BR")} linhas encontradas
                </Badge>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                  Primeiras 10 exibidas abaixo
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={reiniciar}>Cancelar</Button>
                <Button onClick={confirmar}>
                  Confirmar Importação ({totalLinhas.toLocaleString("pt-BR")})
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nota</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Cód. Parceiro</TableHead>
                    <TableHead>Nome Parceiro</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Valor Líquido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previa.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{l.numero_nota}</TableCell>
                      <TableCell className="text-xs">{l.data_faturamento ? formatDate(l.data_faturamento) : "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{l.codigo_parceiro ?? "—"}</TableCell>
                      <TableCell className="text-xs">{l.nome_parceiro ?? "—"}</TableCell>
                      <TableCell className="text-xs">{l.descricao_produto ?? l.codigo_produto ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs">{l.quantidade ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs">{l.valor_liquido != null ? formatBRL(l.valor_liquido) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {etapa === "importando" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 p-12">
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {vinculando
                ? "Vinculando pedidos do CRM e registrando notas fiscais..."
                : `Importando ${progresso.feitos.toLocaleString("pt-BR")} de ${progresso.total.toLocaleString("pt-BR")}...`}
            </p>
            <div className="h-2 w-full max-w-md overflow-hidden rounded bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${vinculando ? 100 : progresso.total > 0 ? (progresso.feitos / progresso.total) * 100 : 0}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {etapa === "concluido" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 p-12">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
            <div className="text-center">
              <p className="text-lg font-semibold">Importação concluída</p>
            </div>
            <div className="grid w-full max-w-md grid-cols-2 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold">{resultado.inseridos.toLocaleString("pt-BR")}</p>
                <p className="text-xs text-muted-foreground">registros importados</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold">{resultado.duplicados.toLocaleString("pt-BR")}</p>
                <p className="text-xs text-muted-foreground">já existiam (ignorados)</p>
              </div>
              <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{resultado.pedidosAtualizados.toLocaleString("pt-BR")}</p>
                <p className="text-xs text-green-700">pedidos faturados</p>
              </div>
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-center">
                <p className="text-2xl font-bold text-amber-700">{resultado.pedidosNaoEncontrados.toLocaleString("pt-BR")}</p>
                <p className="text-xs text-amber-700">não encontrados no CRM</p>
              </div>
            </div>
            <Button onClick={reiniciar}>Nova importação</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
