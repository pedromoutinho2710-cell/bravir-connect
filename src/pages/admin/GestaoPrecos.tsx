import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Search, Upload, PowerOff, Power } from "lucide-react";

// Colunas de preço bruto editáveis — uma por tabela (região) de preço.
const COLUNAS_TABELA = [
  { key: "7", label: "Região 7" },
  { key: "12", label: "Região 12" },
  { key: "18", label: "Região 18" },
  { key: "suframa", label: "Suframa" },
] as const;

const TABELAS = COLUNAS_TABELA.map((c) => c.key);

// Clusters exibidos (só leitura), na ordem do PDF. `key` é o valor real de
// `descontos.perfil_cliente`; `abbr` é o rótulo curto mostrado no pill.
const CLUSTERS_EXIBICAO = [
  { key: "Varejo Alimentício", abbr: "Var. Alim" },
  { key: "Atacado Alimentício", abbr: "Atac. Alim" },
  { key: "Cash & Carry", abbr: "C&C" },
  { key: "Distribuidor Alimentício", abbr: "Dist. Alim" },
  { key: "Pequeno Varejo", abbr: "Var. Peq" },
  { key: "Médio Varejo", abbr: "Var. Méd" },
  { key: "Varejo Perfumaria", abbr: "Var. Perf" },
  { key: "Grande Varejo", abbr: "Var. Gde" },
  { key: "Atacado Generalista", abbr: "Atac. Ger" },
  { key: "Distribuidor Básico", abbr: "Dist. Base" },
  { key: "Distribuidor Foco", abbr: "Dist. Foco" },
  { key: "Distribuidor Parceiro", abbr: "Dist. Parc" },
] as const;

// Ordem de marcas: Bendita Cânfora, Alivik, Bravir, Laby — depois alfabético.
const ORDEM_MARCAS = ["Bendita Cânfora", "Alivik", "Bravir", "Laby"];
const ordemMarca = (m: string | null) => {
  const i = ORDEM_MARCAS.indexOf(m ?? "");
  return i === -1 ? ORDEM_MARCAS.length : i;
};

function marcaBadgeClass(marca: string | null): string {
  switch (marca) {
    case "Bendita Cânfora": return "bg-blue-100 text-blue-800";
    case "Laby": return "bg-green-100 text-green-800";
    case "Bravir": return "bg-amber-100 text-amber-800";
    default: return "bg-gray-100 text-gray-700";
  }
}

type Produto = {
  id: string;
  codigo_jiva: string;
  nome: string;
  marca: string | null;
  ativo: boolean;
  ean: string | null;
};

// produto_id → tabela → preço bruto (vigência ativa)
type PrecoMap = Record<string, Record<string, number>>;
// produto_id → tabela → valor editável (string)
type ValoresMap = Record<string, Record<string, string>>;
// produto_id → perfil_cliente → fração de desconto (0,37 = 37%)
type DescontoMap = Record<string, Record<string, number>>;

// Compara o valor editado com o original. Os preços têm muitas casas decimais
// (ex: 13,676120…) mas são exibidos com 2 casas; comparar contra o original
// arredondado evita marcar como "alterado" uma linha que ninguém tocou.
function precoMudou(raw: string | undefined, original: number | undefined): boolean {
  if (raw == null || raw === "") return false; // vazio → mantém o original ao salvar
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return false;
  if (original == null) return true;
  return Math.abs(n - Number(original.toFixed(2))) > 1e-9;
}

// O PostgREST limita cada resposta a 1000 linhas por padrão. Pagina via .range()
// até esgotar para garantir que TODOS os preços/produtos/descontos sejam lidos —
// crucial porque qualquer preço não-lido seria descartado da nova vigência ao salvar.
async function carregarTudo<T>(
  pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const TAM = 1000;
  const todas: T[] = [];
  for (let de = 0; ; de += TAM) {
    const { data, error } = await pagina(de, de + TAM - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    todas.push(...data);
    if (data.length < TAM) break;
  }
  return todas;
}

export default function GestaoPrecos() {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [vigenciaAtiva, setVigenciaAtiva] = useState<{ id: string; nome: string } | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [precoOriginal, setPrecoOriginal] = useState<PrecoMap>({});
  const [valores, setValores] = useState<ValoresMap>({});
  const [descontos, setDescontos] = useState<DescontoMap>({});

  const [busca, setBusca] = useState("");
  const [marcaSel, setMarcaSel] = useState("todas");
  const [statusSel, setStatusSel] = useState("ativos");
  const [eanMap, setEanMap] = useState<Record<string, string>>({});

  const carregar = async () => {
    setCarregando(true);

    // Vigência ativa mais recente.
    const { data: vig } = await supabase
      .from("tabelas_vigencia")
      .select("id, nome")
      .eq("ativa", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!vig) {
      setVigenciaAtiva(null);
      setProdutos([]);
      setCarregando(false);
      return;
    }
    setVigenciaAtiva({ id: vig.id, nome: vig.nome });

    try {
      // Produtos (todos — o filtro de status é aplicado localmente).
      const prods = await carregarTudo<{ id: string; codigo_jiva: string; nome: string; marca: string | null; ativo: boolean | null; ean: string | null }>(
        (de, ate) => supabase.from("produtos").select("id, codigo_jiva, nome, marca, ativo, ean").range(de, ate),
      );

      const produtosLista: Produto[] = prods.map((p) => ({
        id: p.id,
        codigo_jiva: p.codigo_jiva,
        nome: p.nome,
        marca: p.marca,
        ativo: p.ativo !== false,
        ean: p.ean,
      }));

      produtosLista.sort((a, b) => {
        const om = ordemMarca(a.marca) - ordemMarca(b.marca);
        if (om !== 0) return om;
        return a.nome.localeCompare(b.nome, "pt-BR");
      });

      // Preços da vigência ativa.
      const precos = await carregarTudo<{ produto_id: string | null; tabela: string | null; preco_bruto: number }>(
        (de, ate) => supabase.from("precos").select("produto_id, tabela, preco_bruto").eq("vigencia_id", vig.id).range(de, ate),
      );

      const original: PrecoMap = {};
      precos.forEach((p) => {
        if (!p.produto_id || !p.tabela) return;
        (original[p.produto_id] ??= {})[p.tabela] = Number(p.preco_bruto);
      });

      // Inicializa os valores editáveis com 2 casas decimais.
      const init: ValoresMap = {};
      for (const [prodId, porTabela] of Object.entries(original)) {
        const linha: Record<string, string> = {};
        for (const t of TABELAS) {
          if (porTabela[t] != null) linha[t] = porTabela[t].toFixed(2);
        }
        init[prodId] = linha;
      }

      // Descontos por cluster (só leitura).
      const descs = await carregarTudo<{ produto_id: string | null; perfil_cliente: string; percentual_desconto: number }>(
        (de, ate) => supabase.from("descontos").select("produto_id, perfil_cliente, percentual_desconto").range(de, ate),
      );

      const descMap: DescontoMap = {};
      descs.forEach((d) => {
        if (!d.produto_id) return;
        (descMap[d.produto_id] ??= {})[d.perfil_cliente] = Number(d.percentual_desconto);
      });

      setProdutos(produtosLista);
      setPrecoOriginal(original);
      setValores(init);
      setDescontos(descMap);
      const initEan: Record<string, string> = {};
      produtosLista.forEach((p) => { initEan[p.id] = p.ean ?? ""; });
      setEanMap(initEan);
    } catch (e) {
      toast.error("Erro ao carregar dados: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const setValor = (produtoId: string, tabela: string, valor: string) => {
    setValores((prev) => ({
      ...prev,
      [produtoId]: { ...(prev[produtoId] ?? {}), [tabela]: valor },
    }));
  };

  const salvarEan = async (produtoId: string) => {
    const ean = eanMap[produtoId]?.trim() || null;
    const { error } = await supabase.from("produtos").update({ ean }).eq("id", produtoId);
    if (error) toast.error("Erro ao salvar EAN: " + error.message);
    else toast.success("EAN salvo");
  };

  const [toggling, setToggling] = useState<string | null>(null);

  const toggleAtivo = async (p: Produto) => {
    setToggling(p.id);
    const novoAtivo = !p.ativo;
    const { error } = await supabase.from("produtos").update({ ativo: novoAtivo }).eq("id", p.id);
    if (error) {
      toast.error("Erro ao atualizar status: " + error.message);
    } else {
      setProdutos((prev) => prev.map((x) => x.id === p.id ? { ...x, ativo: novoAtivo } : x));
      toast.success(`${p.nome} marcado como ${novoAtivo ? "ativo" : "inativo"}`);
    }
    setToggling(null);
  };

  const importarEanRef = useRef<HTMLInputElement>(null);
  const [importando, setImportando] = useState(false);

  const importarEanPlanilha = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportando(true);
    try {
      const ExcelJS = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      const buf = await file.arrayBuffer();
      await wb.xlsx.load(buf);
      const ws = wb.worksheets[0];

      // Detecta índices das colunas COD/codigo_jiva e EAN (linha 1 = header)
      const header: string[] = [];
      ws.getRow(1).eachCell((cell) => { header.push(String(cell.value ?? "").toLowerCase().trim()); });
      const colCod = header.findIndex((h) => h.includes("cod") || h.includes("codigo") || h.includes("código"));
      const colEan = header.findIndex((h) => h.includes("ean"));
      if (colCod === -1 || colEan === -1) {
        toast.error("Planilha precisa ter colunas com 'COD' (ou 'código') e 'EAN'");
        setImportando(false);
        if (importarEanRef.current) importarEanRef.current.value = "";
        return;
      }

      // Monta mapa codigo_jiva → ean
      const mapa: Record<string, string> = {};
      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const cod = String(row.getCell(colCod + 1).value ?? "").trim();
        const ean = String(row.getCell(colEan + 1).value ?? "").trim();
        if (cod && ean) mapa[cod] = ean;
      });

      const entradas = Object.entries(mapa);
      if (entradas.length === 0) { toast.error("Nenhum EAN encontrado na planilha"); setImportando(false); return; }

      // Atualiza em lotes de 50
      let ok = 0; let err = 0;
      for (let i = 0; i < entradas.length; i += 50) {
        const lote = entradas.slice(i, i + 50);
        await Promise.all(lote.map(async ([cod, ean]) => {
          const { error } = await supabase.from("produtos").update({ ean }).eq("codigo_jiva", cod);
          if (error) err++; else ok++;
        }));
      }

      // Atualiza eanMap local
      const novoEan = { ...eanMap };
      produtos.forEach((p) => { if (mapa[p.codigo_jiva]) novoEan[p.id] = mapa[p.codigo_jiva]; });
      setEanMap(novoEan);

      toast.success(`${ok} EANs importados com sucesso${err > 0 ? ` (${err} com erro)` : ""}`);
    } catch (ex) {
      toast.error("Erro ao ler planilha: " + String(ex));
    }
    setImportando(false);
    if (importarEanRef.current) importarEanRef.current.value = "";
  };

  const produtoAlterado = (id: string): boolean =>
    TABELAS.some((t) => precoMudou(valores[id]?.[t], precoOriginal[id]?.[t]));

  const idsAlterados = useMemo(
    () => produtos.filter((p) => produtoAlterado(p.id)).map((p) => p.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [produtos, valores, precoOriginal],
  );

  const marcasDisponiveis = useMemo(() => {
    const set = new Set(produtos.map((p) => p.marca).filter((m): m is string => !!m));
    return Array.from(set).sort((a, b) => ordemMarca(a) - ordemMarca(b) || a.localeCompare(b, "pt-BR"));
  }, [produtos]);

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      if (marcaSel !== "todas" && p.marca !== marcaSel) return false;
      if (statusSel === "ativos" && !p.ativo) return false;
      if (statusSel === "inativos" && p.ativo) return false;
      if (termo && !p.nome.toLowerCase().includes(termo) && !p.codigo_jiva.toLowerCase().includes(termo)) {
        return false;
      }
      return true;
    });
  }, [produtos, busca, marcaSel, statusSel]);

  const descartar = () => {
    // Restaura os valores editáveis a partir dos preços originais.
    const init: ValoresMap = {};
    for (const [prodId, porTabela] of Object.entries(precoOriginal)) {
      const linha: Record<string, string> = {};
      for (const t of TABELAS) {
        if (porTabela[t] != null) linha[t] = porTabela[t].toFixed(2);
      }
      init[prodId] = linha;
    }
    setValores(init);
  };

  const salvar = async () => {
    if (!vigenciaAtiva) return;
    if (idsAlterados.length === 0) {
      toast.error("Nenhuma alteração para salvar");
      return;
    }

    // Valida os valores dos produtos alterados.
    for (const id of idsAlterados) {
      const prod = produtos.find((p) => p.id === id);
      for (const t of TABELAS) {
        const raw = valores[id]?.[t];
        if (raw == null || raw === "") continue;
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) {
          const col = COLUNAS_TABELA.find((c) => c.key === t)?.label ?? t;
          toast.error(`Valor inválido em ${prod?.nome ?? id} (${col})`);
          return;
        }
      }
    }

    setSalvando(true);

    const hoje = new Date();
    const dataStr = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;

    // Cria a nova vigência inativa primeiro, popula os preços e só então troca o
    // flag ativo. Assim a vigência ativa nunca fica sem preços durante o save.
    const { data: novaVig, error: vigErr } = await supabase
      .from("tabelas_vigencia")
      .insert({ nome: `Atualização ${dataStr}`, ativa: false })
      .select("id")
      .single();

    if (vigErr || !novaVig) {
      setSalvando(false);
      toast.error("Erro ao criar vigência: " + (vigErr?.message ?? "desconhecido"));
      return;
    }
    const novaVigId = novaVig.id;

    // Monta o conjunto completo de preços: produtos alterados usam o novo valor,
    // os demais copiam o preço da vigência anterior (continuidade).
    type PrecoInsert = { produto_id: string; tabela: string; preco_bruto: number; vigencia_id: string };
    const inserts: PrecoInsert[] = [];
    for (const prod of produtos) {
      for (const t of TABELAS) {
        const original = precoOriginal[prod.id]?.[t];
        const raw = valores[prod.id]?.[t];
        // Linha alterada → novo valor; caso contrário copia o preço exato (com
        // todas as casas) da vigência anterior, sem arredondar.
        const num = precoMudou(raw, original) ? Number(raw) : (original ?? null);
        if (num != null && Number.isFinite(num) && num > 0) {
          inserts.push({ produto_id: prod.id, tabela: t, preco_bruto: num, vigencia_id: novaVigId });
        }
      }
    }

    // Insere em lotes de 500.
    let erro = false;
    for (let i = 0; i < inserts.length; i += 500) {
      const { error } = await supabase.from("precos").insert(inserts.slice(i, i + 500));
      if (error) { erro = true; toast.error("Erro ao salvar preços: " + error.message); break; }
    }

    if (erro) {
      // Rollback: remove os preços inseridos e a vigência órfã.
      await supabase.from("precos").delete().eq("vigencia_id", novaVigId);
      await supabase.from("tabelas_vigencia").delete().eq("id", novaVigId);
      setSalvando(false);
      return;
    }

    // Ativa a nova vigência (já com preços) e inativa a anterior.
    const { error: ativaErr } = await supabase
      .from("tabelas_vigencia")
      .update({ ativa: true })
      .eq("id", novaVigId);
    if (ativaErr) {
      await supabase.from("precos").delete().eq("vigencia_id", novaVigId);
      await supabase.from("tabelas_vigencia").delete().eq("id", novaVigId);
      setSalvando(false);
      toast.error("Erro ao ativar vigência: " + ativaErr.message);
      return;
    }
    // Inativa toda vigência ativa que não seja a nova (robusto a estados com mais
    // de uma ativa). Falha aqui é não-fatal — a nova já está ativa e é a mais
    // recente — mas o admin precisa saber para corrigir manualmente.
    const { error: inativaErr } = await supabase
      .from("tabelas_vigencia")
      .update({ ativa: false })
      .eq("ativa", true)
      .neq("id", novaVigId);

    setSalvando(false);
    if (inativaErr) {
      toast.warning(
        "Nova vigência ativada, mas a anterior continua marcada como ativa. " +
          "Inative-a em “Tabelas de Preço”. (" + inativaErr.message + ")",
      );
    } else {
      toast.success(`Nova vigência criada com ${idsAlterados.length} produto(s) alterado(s)`);
    }
    await carregar();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Gestão de preços</h1>
          <p className="text-sm text-muted-foreground">
            Edite o preço bruto por produto e região. Só afeta pedidos novos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {vigenciaAtiva && (
            <Badge className="bg-green-100 text-green-800 border-green-300">
              Vigência ativa: {vigenciaAtiva.nome}
            </Badge>
          )}
          <input ref={importarEanRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importarEanPlanilha} />
          <Button variant="outline" size="sm" disabled={importando} onClick={() => importarEanRef.current?.click()}>
            {importando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
            Importar EANs
          </Button>
        </div>
      </div>

      {/* Toolbar de filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="relative sm:col-span-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou código…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={marcaSel} onValueChange={setMarcaSel}>
              <SelectTrigger><SelectValue placeholder="Marca" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as marcas</SelectItem>
                {marcasDisponiveis.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusSel} onValueChange={setStatusSel}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ativos">Ativos</SelectItem>
                <SelectItem value="inativos">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de preços */}
      <Card>
        <CardContent className="p-0">
          {carregando ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !vigenciaAtiva ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma vigência ativa encontrada. Importe uma tabela em “Tabelas de Preço” primeiro.
            </div>
          ) : produtosFiltrados.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhum produto corresponde aos filtros.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>EAN</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Marca</TableHead>
                  {COLUNAS_TABELA.map((c) => (
                    <TableHead key={c.key} className="text-right">{c.label}</TableHead>
                  ))}
                  <TableHead>Descontos por cluster</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {produtosFiltrados.map((p) => {
                  const alterado = produtoAlterado(p.id);
                  return (
                    <TableRow key={p.id} className={alterado ? "bg-blue-50 hover:bg-blue-50" : undefined}>
                      <TableCell className="font-mono text-xs">{p.codigo_jiva}</TableCell>
                      <TableCell>
                        <Input
                          type="text"
                          maxLength={14}
                          value={eanMap[p.id] ?? ""}
                          onChange={(e) => setEanMap((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          onBlur={() => salvarEan(p.id)}
                          placeholder="EAN"
                          className="h-8 w-36 font-mono text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{p.nome}</span>
                          <Badge
                            variant="outline"
                            className={p.ativo
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : "border-gray-300 bg-gray-100 text-gray-500"}
                          >
                            {p.ativo ? "Ativo" : "Inativo"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className={`${marcaBadgeClass(p.marca)} border-transparent`}>
                            {p.marca ?? "—"}
                          </Badge>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0"
                            title={p.ativo ? "Desativar produto" : "Ativar produto"}
                            disabled={toggling === p.id}
                            onClick={() => toggleAtivo(p)}
                          >
                            {toggling === p.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : p.ativo
                                ? <PowerOff className="h-3.5 w-3.5 text-gray-400" />
                                : <Power className="h-3.5 w-3.5 text-emerald-600" />}
                          </Button>
                        </div>
                      </TableCell>
                      {COLUNAS_TABELA.map((c) => (
                        <TableCell key={c.key} className="text-right">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={valores[p.id]?.[c.key] ?? ""}
                            onChange={(e) => setValor(p.id, c.key, e.target.value)}
                            className="h-8 w-24 ml-auto text-right"
                          />
                        </TableCell>
                      ))}
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {CLUSTERS_EXIBICAO.map((cl) => {
                            const frac = descontos[p.id]?.[cl.key] ?? 0;
                            const pct = frac * 100;
                            const zero = pct <= 0;
                            return (
                              <span
                                key={cl.key}
                                className={`rounded px-1.5 py-0.5 text-[10px] leading-tight ${
                                  zero ? "bg-gray-100 text-gray-500" : "bg-emerald-100 text-emerald-800"
                                }`}
                                title={`${cl.key} — ${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
                              >
                                {cl.abbr} {pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                              </span>
                            );
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Rodapé de ações */}
      {!carregando && vigenciaAtiva && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {idsAlterados.length} produto{idsAlterados.length === 1 ? "" : "s"} alterado{idsAlterados.length === 1 ? "" : "s"}
            {" · "}Nova vigência será criada ao salvar
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={descartar} disabled={salvando || idsAlterados.length === 0}>
              Descartar
            </Button>
            <Button onClick={salvar} disabled={salvando || idsAlterados.length === 0}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar nova vigência
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
