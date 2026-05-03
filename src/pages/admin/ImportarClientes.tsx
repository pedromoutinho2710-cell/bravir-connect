import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Upload, Users, UserCheck, Award, ArrowLeft, ChevronRight } from "lucide-react";
import * as XLSX from "xlsx";
import { onlyDigits } from "@/lib/format";

type Etapa = "upload" | "mapear" | "importar" | "concluido";

type ClienteUpsert = {
  cnpj: string;
  razao_social: string;
  codigo_parceiro: string | null;
  nome_parceiro: string | null;
  rua: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  suframa: boolean;
  imposto: number | null;
  tabela_preco: string | null;
  vendedor_id: string | null;
  canal: string | null;
  status: string;
};

type LinhaRaw = {
  codigo_parceiro: string;
  vendedor_nome: string;
  cnpj: string;
  razao_social: string;
  nome_parceiro: string;
  rua: string;
  cidade: string;
  uf: string;
  cep: string;
  imposto: string;
  suframa: string;
};

type Vendedor = {
  id: string;
  full_name: string | null;
  email: string;
};

type MapeamentoEntry = { vendedor_id: string | null; canal: string | null };

const CANAIS_DIGITAIS = ["MARKETPLACE", "LOJA VIRTUAL", "SEM VENDEDOR", "DIRETO"];

function normalizar(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function mapearCabecalho(val: string): keyof LinhaRaw | null {
  const n = normalizar(val);
  if (n.includes("codigo") && n.includes("parceiro")) return "codigo_parceiro";
  if (n.includes("novo") && n.includes("vendedor")) return "vendedor_nome";
  if (n === "cnpj" || n === "cpf" || n.includes("cnpj") || n.includes("cpf")) return "cnpj";
  if (n.includes("razao") || n.includes("social")) return "razao_social";
  if (n.includes("nome") && n.includes("parceiro")) return "nome_parceiro";
  if ((n.includes("nome") && n.includes("endereco")) || n.includes("logradouro") || n.includes("rua")) return "rua";
  if (n.includes("cidade") || (n.includes("nome") && n.includes("uf"))) return "cidade";
  if (n === "uf" || n === "estado") return "uf";
  if (n === "cep") return "cep";
  if (n.includes("imposto")) return "imposto";
  if (n.includes("suframa")) return "suframa";
  return null;
}

function resolverTabelaPreco(linha: LinhaRaw): string | null {
  if (normalizar(linha.suframa) === "sim") return "suframa";
  const imp = parseFloat(String(linha.imposto).replace(",", "."));
  if (!isNaN(imp)) {
    if (Math.abs(imp - 0.07) < 0.001) return "7%";
    if (Math.abs(imp - 0.12) < 0.001) return "12%";
    if (Math.abs(imp - 0.18) < 0.001) return "18%";
  }
  return null;
}

export default function ImportarClientes() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [etapa, setEtapa] = useState<Etapa>("upload");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [linhas, setLinhas] = useState<LinhaRaw[]>([]);
  const [erroHeader, setErroHeader] = useState<string | null>(null);

  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [mapeamento, setMapeamento] = useState<Record<string, MapeamentoEntry>>({});
  const [carregandoVendedores, setCarregandoVendedores] = useState(false);

  const [progresso, setProgresso] = useState(0);
  const [total, setTotal] = useState(0);
  const [resultados, setResultados] = useState<{ importados: number; descartados: number; erros: number } | null>(null);

  const handleFile = async (file: File) => {
    setArquivo(file);
    setErroHeader(null);
    setLinhas([]);

    let data: string;
    try {
      data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
        reader.readAsBinaryString(file);
      });
    } catch {
      toast.error("Não foi possível ler o arquivo. Verifique se está corrompido.");
      return;
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(data, { type: "binary", cellDates: false, raw: false });
    } catch {
      toast.error("Não foi possível ler o arquivo. Verifique se está corrompido.");
      return;
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) { toast.error("Planilha vazia ou inválida"); return; }

    const ws = workbook.Sheets[firstSheetName];
    const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: false, raw: false });

    // Detectar linha de cabeçalho
    let headerRowIdx = -1;
    const colMap: Partial<Record<keyof LinhaRaw, number>> = {};

    for (let rowIdx = 0; rowIdx < allRows.length; rowIdx++) {
      const row = allRows[rowIdx];
      let found = 0;
      const tmpMap: Partial<Record<keyof LinhaRaw, number>> = {};
      for (let colIdx = 0; colIdx < row.length; colIdx++) {
        const key = mapearCabecalho(String(row[colIdx] ?? ""));
        if (key) { tmpMap[key] = colIdx; found++; }
      }
      if (found >= 3) {
        Object.assign(colMap, tmpMap);
        headerRowIdx = rowIdx;
        break;
      }
    }

    if (headerRowIdx === -1) {
      setErroHeader("Não foi possível detectar o cabeçalho. Verifique se o arquivo é a planilha Sankhya.");
      return;
    }

    const obrigatorias: (keyof LinhaRaw)[] = ["cnpj", "razao_social"];
    const faltando = obrigatorias.filter((k) => colMap[k] === undefined);
    if (faltando.length > 0) {
      setErroHeader(`Colunas obrigatórias não encontradas: ${faltando.join(", ")}`);
      return;
    }

    const rows: LinhaRaw[] = [];
    for (let rowIdx = headerRowIdx + 1; rowIdx < allRows.length; rowIdx++) {
      const row = allRows[rowIdx];
      const cnpjVal = String(row[colMap.cnpj!] ?? "").trim();
      if (!cnpjVal) continue;

      const get = (k: keyof LinhaRaw) =>
        colMap[k] !== undefined ? String(row[colMap[k]!] ?? "").trim() : "";

      rows.push({
        codigo_parceiro: get("codigo_parceiro"),
        vendedor_nome: get("vendedor_nome"),
        cnpj: cnpjVal,
        razao_social: get("razao_social"),
        nome_parceiro: get("nome_parceiro"),
        rua: get("rua"),
        cidade: get("cidade"),
        uf: get("uf"),
        cep: get("cep"),
        imposto: get("imposto"),
        suframa: get("suframa"),
      });
    }

    setLinhas(rows);
  };

  useEffect(() => {
    if (etapa !== "mapear") return;
    setCarregandoVendedores(true);

    (async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["vendedor", "admin"]);

      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) { setVendedores([]); setCarregandoVendedores(false); return; }

      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email, ativo")
        .in("id", ids)
        .eq("ativo", true)
        .order("full_name");

      const lista: Vendedor[] = (profs ?? []).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
      }));
      setVendedores(lista);

      // Pré-mapear automaticamente
      const nomes = Array.from(new Set(linhas.map((l) => l.vendedor_nome).filter(Boolean)));
      const inicial: Record<string, MapeamentoEntry> = {};
      nomes.forEach((nome) => {
        if (CANAIS_DIGITAIS.includes(nome.toUpperCase())) {
          inicial[nome] = { vendedor_id: null, canal: nome.toUpperCase() };
          return;
        }
        const match = lista.find(
          (v) => normalizar(v.full_name ?? "") === normalizar(nome)
        );
        inicial[nome] = { vendedor_id: match?.id ?? null, canal: null };
      });
      setMapeamento(inicial);
    })().finally(() => setCarregandoVendedores(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapa]);

  const executarImportacao = async () => {
    setEtapa("importar");
    setProgresso(0);
    setTotal(linhas.length);

    let importados = 0;
    let descartados = 0;
    let erros = 0;

    const linhasValidas: ClienteUpsert[] = [];
    const linhasDescartadas: LinhaRaw[] = [];

    for (const linha of linhas) {
      const cnpj = onlyDigits(linha.cnpj);
      if (cnpj.length !== 11 && cnpj.length !== 14) {
        linhasDescartadas.push(linha);
        descartados++;
        continue;
      }

      const mEntry = mapeamento[linha.vendedor_nome] ?? { vendedor_id: null, canal: null };
      const suframa = normalizar(linha.suframa) === "sim";
      const imposto = parseFloat(String(linha.imposto).replace(",", ".")) || null;
      const tabela_preco = resolverTabelaPreco(linha);

      linhasValidas.push({
        cnpj,
        razao_social: linha.razao_social.trim() || "—",
        codigo_parceiro: linha.codigo_parceiro || null,
        nome_parceiro: linha.nome_parceiro || null,
        rua: linha.rua || null,
        cidade: linha.cidade || null,
        uf: linha.uf ? linha.uf.toUpperCase().slice(0, 2) : null,
        cep: linha.cep ? onlyDigits(linha.cep) : null,
        suframa,
        imposto,
        tabela_preco,
        vendedor_id: mEntry.vendedor_id,
        canal: mEntry.canal,
        status: "ativo",
      });
    }

    const LOTE = 50;
    for (let i = 0; i < linhasValidas.length; i += LOTE) {
      const lote = linhasValidas.slice(i, i + LOTE);
      const { error } = await supabase
        .from("clientes")
        .upsert(lote, { onConflict: "cnpj" });
      if (error) {
        erros += lote.length;
      } else {
        importados += lote.length;
      }
      setProgresso(i + lote.length);
    }

    setResultados({ importados, descartados, erros });
    setEtapa("concluido");
    toast.success(`${importados} clientes importados com sucesso!`);
  };

  const vendedoresUnicos = Array.from(new Set(linhas.map((l) => l.vendedor_nome).filter(Boolean)));
  const totalSuframa = linhas.filter((l) => normalizar(l.suframa) === "sim").length;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/clientes")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Importar Clientes</h1>
          <p className="text-sm text-muted-foreground">Importação em massa via planilha Sankhya (.xls ou .xlsx)</p>
        </div>
      </div>

      {/* Indicador de etapas */}
      <div className="flex items-center gap-2 text-sm">
        {(["upload", "mapear", "importar"] as const).map((e, idx) => {
          const labels = ["1. Upload", "2. Vendedores", "3. Importar"];
          const atual = etapa === e || (etapa === "concluido" && idx === 2);
          const passado = ["upload", "mapear", "importar", "concluido"].indexOf(etapa) > idx;
          return (
            <div key={e} className="flex items-center gap-1">
              {idx > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              <span className={`font-medium ${atual ? "text-primary" : passado ? "text-green-600" : "text-muted-foreground"}`}>
                {labels[idx]}
              </span>
            </div>
          );
        })}
      </div>

      {/* ETAPA 1 — Upload */}
      {etapa === "upload" && (
        <div className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <Button variant="outline" className="w-full h-20 text-base border-dashed" onClick={() => inputRef.current?.click()}>
            <Upload className="h-5 w-5 mr-2" />
            {arquivo ? arquivo.name : "Selecionar arquivo Excel (.xls ou .xlsx)"}
          </Button>

          {erroHeader && (
            <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {erroHeader}
            </div>
          )}

          {linhas.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="py-4 flex items-center gap-3">
                    <Users className="h-8 w-8 text-primary flex-shrink-0" />
                    <div>
                      <div className="text-2xl font-bold">{linhas.length}</div>
                      <div className="text-xs text-muted-foreground">Total de clientes</div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4 flex items-center gap-3">
                    <UserCheck className="h-8 w-8 text-blue-600 flex-shrink-0" />
                    <div>
                      <div className="text-2xl font-bold">{vendedoresUnicos.length}</div>
                      <div className="text-xs text-muted-foreground">Vendedores detectados</div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4 flex items-center gap-3">
                    <Award className="h-8 w-8 text-yellow-600 flex-shrink-0" />
                    <div>
                      <div className="text-2xl font-bold">{totalSuframa}</div>
                      <div className="text-xs text-muted-foreground">Com SUFRAMA</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Preview 10 primeiras linhas */}
              <div>
                <p className="text-sm font-medium mb-2">Preview (primeiras 10 linhas)</p>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>CNPJ</TableHead>
                        <TableHead>Razão Social</TableHead>
                        <TableHead>Cód. Parceiro</TableHead>
                        <TableHead>Vendedor</TableHead>
                        <TableHead>Cidade</TableHead>
                        <TableHead>UF</TableHead>
                        <TableHead>SUFRAMA</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linhas.slice(0, 10).map((l, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{l.cnpj}</TableCell>
                          <TableCell className="text-sm">{l.razao_social}</TableCell>
                          <TableCell className="font-mono text-xs">{l.codigo_parceiro || "—"}</TableCell>
                          <TableCell className="text-sm">{l.vendedor_nome || "—"}</TableCell>
                          <TableCell className="text-sm">{l.cidade || "—"}</TableCell>
                          <TableCell className="text-sm">{l.uf || "—"}</TableCell>
                          <TableCell>
                            {normalizar(l.suframa) === "sim"
                              ? <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs">Sim</Badge>
                              : <span className="text-xs text-muted-foreground">Não</span>
                            }
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <Button
                className="w-full"
                onClick={() => setEtapa("mapear")}
                disabled={!!erroHeader}
              >
                Avançar para mapeamento de vendedores
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </>
          )}
        </div>
      )}

      {/* ETAPA 2 — Mapeamento de vendedores */}
      {etapa === "mapear" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Associe cada nome de vendedor da planilha a um perfil do sistema. Canais digitais não têm vendedor físico.
          </p>

          {carregandoVendedores ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome na planilha</TableHead>
                    <TableHead>Qtd. clientes</TableHead>
                    <TableHead className="min-w-[260px]">Mapear para</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendedoresUnicos.map((nome) => {
                    const qtd = linhas.filter((l) => l.vendedor_nome === nome).length;
                    const isCanal = CANAIS_DIGITAIS.includes(nome.toUpperCase());
                    return (
                      <TableRow key={nome}>
                        <TableCell className="font-medium">{nome || <span className="text-muted-foreground italic">Sem nome</span>}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{qtd}</TableCell>
                        <TableCell>
                          {isCanal ? (
                            <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300">
                              Canal digital — sem vendedor físico
                            </Badge>
                          ) : (
                            <Select
                              value={mapeamento[nome]?.vendedor_id ?? "__nenhum__"}
                              onValueChange={(v) =>
                                setMapeamento((prev) => ({
                                  ...prev,
                                  [nome]: { vendedor_id: v === "__nenhum__" ? null : v, canal: null },
                                }))
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Selecionar vendedor..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__nenhum__">— Nenhum (deixar sem vendedor) —</SelectItem>
                                {vendedores.map((v) => (
                                  <SelectItem key={v.id} value={v.id}>
                                    {v.full_name || v.email}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setEtapa("upload")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>
            <Button className="flex-1" onClick={executarImportacao} disabled={carregandoVendedores}>
              Confirmar e importar {linhas.length} clientes
            </Button>
          </div>
        </div>
      )}

      {/* ETAPA 3 — Importação em andamento */}
      {etapa === "importar" && (
        <div className="space-y-4 py-8">
          <div className="text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
            <p className="text-lg font-medium">Importando clientes...</p>
            <p className="text-sm text-muted-foreground mt-1">
              {progresso} / {total}
            </p>
          </div>
          <Progress value={total > 0 ? (progresso / total) * 100 : 0} className="h-3" />
        </div>
      )}

      {/* ETAPA 4 — Concluído */}
      {etapa === "concluido" && resultados && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="py-4 text-center">
                <div className="text-3xl font-bold text-green-600">{resultados.importados}</div>
                <div className="text-xs text-muted-foreground mt-1">Importados / Atualizados</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <div className="text-3xl font-bold text-yellow-600">{resultados.descartados}</div>
                <div className="text-xs text-muted-foreground mt-1">Descartados (CNPJ inválido)</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <div className="text-3xl font-bold text-red-600">{resultados.erros}</div>
                <div className="text-xs text-muted-foreground mt-1">Erros</div>
              </CardContent>
            </Card>
          </div>

          <Button className="w-full" onClick={() => navigate("/admin/clientes")}>
            Voltar para clientes
          </Button>
        </div>
      )}
    </div>
  );
}
