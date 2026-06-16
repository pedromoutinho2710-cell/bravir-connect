import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";

type Linha = {
  produto_id: string;
  codigo_jiva: string;
  nome: string;
  marca: string | null;
  // desconto atual em pontos percentuais (ex: 25 para 0,25)
  descontoAtual: number;
  // novo desconto em pontos percentuais, como string editável
  novoValor: string;
};

// Compara dois percentuais com tolerância para evitar ruído de ponto flutuante.
function mudou(novo: string, atual: number): boolean {
  const n = Number(novo);
  if (!Number.isFinite(n)) return false;
  return Math.abs(n - atual) > 1e-9;
}

export function AbaDescontosCluster() {
  const [perfis, setPerfis] = useState<string[]>([]);
  const [perfilSel, setPerfilSel] = useState("");
  const [busca, setBusca] = useState("");
  const [aplicarValor, setAplicarValor] = useState("");

  const [loadingPerfis, setLoadingPerfis] = useState(true);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [linhas, setLinhas] = useState<Linha[]>([]);

  // Carrega perfis únicos da tabela descontos
  useEffect(() => {
    (async () => {
      setLoadingPerfis(true);
      const { data } = await supabase.from("descontos").select("perfil_cliente");
      const unicos = Array.from(
        new Set((data ?? []).map((d) => d.perfil_cliente).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b, "pt-BR"));
      setPerfis(unicos);
      setLoadingPerfis(false);
    })();
  }, []);

  const carregarDescontos = async (perfil: string) => {
    if (!perfil) {
      setLinhas([]);
      return;
    }
    setLoading(true);
    const { data: descontos, error } = await supabase
      .from("descontos")
      .select("produto_id, percentual_desconto")
      .eq("perfil_cliente", perfil);

    if (error) {
      toast.error("Erro ao carregar descontos: " + error.message);
      setLinhas([]);
      setLoading(false);
      return;
    }

    const rows = (descontos ?? []).filter((d) => d.produto_id);
    const ids = Array.from(new Set(rows.map((d) => d.produto_id as string)));

    const prodMap: Record<string, { codigo_jiva: string; nome: string; marca: string | null }> = {};
    for (let i = 0; i < ids.length; i += 200) {
      const { data: prods } = await supabase
        .from("produtos")
        .select("id, codigo_jiva, nome, marca")
        .in("id", ids.slice(i, i + 200));
      (prods ?? []).forEach((p) => {
        prodMap[p.id] = { codigo_jiva: p.codigo_jiva, nome: p.nome, marca: p.marca };
      });
    }

    const linhasNovas: Linha[] = rows.map((d) => {
      const prod = prodMap[d.produto_id as string];
      const atual = Number(d.percentual_desconto) * 100;
      return {
        produto_id: d.produto_id as string,
        codigo_jiva: prod?.codigo_jiva ?? "—",
        nome: prod?.nome ?? "—",
        marca: prod?.marca ?? null,
        descontoAtual: atual,
        novoValor: String(atual),
      };
    });

    linhasNovas.sort((a, b) => {
      const ma = a.marca ?? "";
      const mb = b.marca ?? "";
      if (ma !== mb) return ma.localeCompare(mb, "pt-BR");
      return a.nome.localeCompare(b.nome, "pt-BR");
    });

    setLinhas(linhasNovas);
    setLoading(false);
  };

  const onMudarPerfil = (perfil: string) => {
    setPerfilSel(perfil);
    setBusca("");
    setAplicarValor("");
    carregarDescontos(perfil);
  };

  const linhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return linhas;
    return linhas.filter(
      (l) =>
        l.nome.toLowerCase().includes(termo) ||
        l.codigo_jiva.toLowerCase().includes(termo) ||
        (l.marca ?? "").toLowerCase().includes(termo),
    );
  }, [linhas, busca]);

  const setNovoValor = (produto_id: string, valor: string) => {
    setLinhas((prev) =>
      prev.map((l) => (l.produto_id === produto_id ? { ...l, novoValor: valor } : l)),
    );
  };

  const aplicarATodos = () => {
    if (aplicarValor.trim() === "") {
      toast.error("Informe um percentual para aplicar");
      return;
    }
    const n = Number(aplicarValor);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      toast.error("Informe um percentual entre 0 e 100");
      return;
    }
    setLinhas((prev) => prev.map((l) => ({ ...l, novoValor: aplicarValor })));
  };

  const alteradas = useMemo(
    () => linhas.filter((l) => mudou(l.novoValor, l.descontoAtual)),
    [linhas],
  );

  const cancelar = () => {
    setLinhas((prev) => prev.map((l) => ({ ...l, novoValor: String(l.descontoAtual) })));
    setAplicarValor("");
  };

  const salvar = async () => {
    if (alteradas.length === 0) return;
    // Valida antes de salvar
    for (const l of alteradas) {
      const n = Number(l.novoValor);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        toast.error(`Valor inválido em ${l.nome} — use um percentual entre 0 e 100`);
        return;
      }
    }
    setSalvando(true);
    let erro = false;
    for (const l of alteradas) {
      const fracao = Number(l.novoValor) / 100;
      const { error } = await supabase
        .from("descontos")
        .update({ percentual_desconto: fracao })
        .eq("produto_id", l.produto_id)
        .eq("perfil_cliente", perfilSel);
      if (error) {
        erro = true;
        toast.error(`Erro ao salvar ${l.nome}: ${error.message}`);
        break;
      }
    }
    setSalvando(false);
    if (erro) return;
    toast.success(`${alteradas.length} desconto(s) atualizado(s)`);
    // Atualiza o "atual" para os novos valores salvos
    setLinhas((prev) =>
      prev.map((l) => {
        if (!mudou(l.novoValor, l.descontoAtual)) return l;
        const n = Number(l.novoValor);
        return { ...l, descontoAtual: n, novoValor: String(n) };
      }),
    );
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Cluster / Perfil</Label>
              {loadingPerfis ? (
                <div className="flex h-10 items-center">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
              ) : (
                <Select value={perfilSel} onValueChange={onMudarPerfil}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um cluster..." />
                  </SelectTrigger>
                  <SelectContent>
                    {perfis.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Buscar produto</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nome, código ou marca..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-8"
                  disabled={!perfilSel}
                />
              </div>
            </div>
          </div>

          {/* Aplicar em massa */}
          {perfilSel && (
            <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
              <div className="space-y-1.5">
                <Label>Aplicar a todos (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={aplicarValor}
                  onChange={(e) => setAplicarValor(e.target.value)}
                  className="w-32"
                />
              </div>
              <Button variant="outline" onClick={aplicarATodos} disabled={linhas.length === 0}>
                Aplicar a todos
              </Button>
              <p className="text-xs text-muted-foreground self-center">
                Preenche o campo de todos os produtos do cluster (não salva automaticamente).
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {!perfilSel ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Selecione um cluster para ver os descontos.
            </div>
          ) : loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : linhasFiltradas.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {linhas.length === 0
                ? "Nenhum produto com desconto para este cluster."
                : "Nenhum produto corresponde à busca."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead className="text-right">Desconto atual (%)</TableHead>
                  <TableHead className="text-right">Novo desconto (%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhasFiltradas.map((l) => {
                  const alterada = mudou(l.novoValor, l.descontoAtual);
                  return (
                    <TableRow key={l.produto_id}>
                      <TableCell className="font-mono text-xs">{l.codigo_jiva}</TableCell>
                      <TableCell>{l.nome}</TableCell>
                      <TableCell className="text-muted-foreground">{l.marca ?? "—"}</TableCell>
                      <TableCell className="text-right">{l.descontoAtual.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          value={l.novoValor}
                          onChange={(e) => setNovoValor(l.produto_id, e.target.value)}
                          className={`h-8 w-28 ml-auto text-right ${alterada ? "border-green-500 focus-visible:ring-green-500" : ""}`}
                        />
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
      {perfilSel && linhas.length > 0 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={cancelar} disabled={salvando || alteradas.length === 0}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || alteradas.length === 0}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salvar alterações ({alteradas.length} produto{alteradas.length === 1 ? "" : "s"})
          </Button>
        </div>
      )}
    </div>
  );
}
