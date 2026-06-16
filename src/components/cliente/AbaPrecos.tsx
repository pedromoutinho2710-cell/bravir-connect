import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Trash2, Search } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type Props = {
  clienteId: string;
  clienteCodigoParceiro: string | null;
  clienteTabela: string | null;
  clienteCluster: string | null;
  descontoAdicional: number | null;
};

// Uma linha = um produto da tabela de preço do cliente. O preço do cliente
// (precos_cliente_produto) pode ou não existir; quando existe, prevalece. O
// desconto do cliente (desconto_perfil, 0–100) é aplicado sobre o preço final.
type LinhaProduto = {
  produtoId: string;
  codigo: string;
  nome: string;
  marca: string | null;
  precoBruto: number;
  descontoCluster: number; // fração (0,25 = 25%)
  precoComCluster: number;
  especialId: string | null;
  precoEspecial: number | null;
  descontoPerfil: number | null; // percentual (0–100)
  origem: string | null;
};

type ProdutoBusca = {
  id: string;
  codigo_jiva: string;
  nome: string;
  marca: string | null;
};

const ORDEM_MARCAS = ["Bendita Cânfora", "Alivik", "Bravir", "Laby"];

const ordemMarca = (m: string | null) => {
  const i = ORDEM_MARCAS.indexOf(m ?? "");
  return i === -1 ? ORDEM_MARCAS.length : i;
};

// Preço final = (preço do cliente ou preço c/ cluster) com o desconto do
// cliente aplicado: base × (1 - desconto_perfil / 100).
const precoFinalDe = (l: LinhaProduto) => {
  const base = l.precoEspecial ?? l.precoComCluster;
  const desc = l.descontoPerfil ?? 0;
  return base * (1 - desc / 100);
};

export function AbaPrecos({
  clienteId,
  clienteCodigoParceiro,
  clienteTabela,
  clienteCluster,
  descontoAdicional,
}: Props) {
  // BLOCO A — desconto adicional
  const [descontoLocal, setDescontoLocal] = useState<string>(
    descontoAdicional != null ? String(descontoAdicional) : "",
  );
  const [salvandoDesconto, setSalvandoDesconto] = useState(false);

  // BLOCO B — todos os produtos da tabela do cliente
  const [loading, setLoading] = useState(true);
  const [linhas, setLinhas] = useState<LinhaProduto[]>([]);
  const [busca, setBusca] = useState("");

  // edição direta inline — rascunhos por produtoId enquanto o usuário digita.
  const [precoInput, setPrecoInput] = useState<Record<string, string>>({});
  const [descInput, setDescInput] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<Record<string, boolean>>({});

  // exclusão (guarda a linha cujo preço do cliente será removido)
  const [excluirLinha, setExcluirLinha] = useState<LinhaProduto | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = async () => {
    if (!clienteTabela) {
      setLinhas([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    // 1) Vigência ativa (mais recente).
    const { data: vig } = await supabase
      .from("tabelas_vigencia")
      .select("id")
      .eq("ativa", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const vigenciaId = vig?.id ?? null;

    if (!vigenciaId) {
      toast.error("Nenhuma tabela de preço vigente encontrada.");
      setLinhas([]);
      setLoading(false);
      return;
    }

    // 2) Preços brutos da tabela do cliente na vigência ativa.
    const { data: precos, error: errPrecos } = await supabase
      .from("precos")
      .select("produto_id, preco_bruto")
      .eq("vigencia_id", vigenciaId)
      .eq("tabela", clienteTabela);
    if (errPrecos) {
      toast.error("Erro ao carregar preços: " + errPrecos.message);
      setLinhas([]);
      setLoading(false);
      return;
    }
    const precoMap: Record<string, number> = {};
    (precos ?? []).forEach((p) => {
      if (p.produto_id) precoMap[p.produto_id] = Number(p.preco_bruto);
    });

    // 3) Produtos disponíveis (catálogo ativo).
    const { data: prods } = await supabase
      .from("produtos")
      .select("id, codigo_jiva, nome, marca")
      .eq("disponivel", true);
    const produtos = (prods ?? []) as ProdutoBusca[];

    // 4) Desconto do cluster por produto. percentual_desconto é fração (0,25 = 25%).
    const descontoMap: Record<string, number> = {};
    if (clienteCluster) {
      const { data: descontos } = await supabase
        .from("descontos")
        .select("produto_id, percentual_desconto")
        .eq("perfil_cliente", clienteCluster);
      (descontos ?? []).forEach((d) => {
        if (d.produto_id) descontoMap[d.produto_id] = Number(d.percentual_desconto);
      });
    }

    // 5) Preços/descontos do cliente, chaveados por codigo_jiva.
    const especialMap: Record<
      string,
      { id: string; preco: number | null; desconto: number | null; origem: string }
    > = {};
    if (clienteCodigoParceiro) {
      const { data: especiais } = await supabase
        .from("precos_cliente_produto")
        .select("id, codigo_produto, preco_unitario, desconto_perfil, origem")
        .eq("codigo_parceiro", clienteCodigoParceiro);
      (especiais ?? []).forEach((e) => {
        if (e.codigo_produto != null) {
          especialMap[e.codigo_produto] = {
            id: e.id,
            preco: e.preco_unitario != null ? Number(e.preco_unitario) : null,
            desconto: e.desconto_perfil != null ? Number(e.desconto_perfil) : null,
            origem: e.origem,
          };
        }
      });
    }

    // 6) Monta uma linha por produto que tem preço na tabela do cliente.
    const montadas: LinhaProduto[] = produtos
      .filter((p) => precoMap[p.id] != null)
      .map((p) => {
        const precoBruto = precoMap[p.id];
        const descontoCluster = descontoMap[p.id] ?? 0;
        const especial = especialMap[p.codigo_jiva];
        return {
          produtoId: p.id,
          codigo: p.codigo_jiva,
          nome: p.nome,
          marca: p.marca,
          precoBruto,
          descontoCluster,
          precoComCluster: precoBruto * (1 - descontoCluster),
          especialId: especial?.id ?? null,
          precoEspecial: especial?.preco ?? null,
          descontoPerfil: especial?.desconto ?? null,
          origem: especial?.origem ?? null,
        };
      });

    montadas.sort((a, b) => {
      const ra = ordemMarca(a.marca);
      const rb = ordemMarca(b.marca);
      if (ra !== rb) return ra - rb;
      const ma = a.marca ?? "";
      const mb = b.marca ?? "";
      if (ma !== mb) return ma.localeCompare(mb, "pt-BR");
      return a.nome.localeCompare(b.nome, "pt-BR");
    });

    setLinhas(montadas);
    setPrecoInput({});
    setDescInput({});
    setLoading(false);
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteTabela, clienteCluster, clienteCodigoParceiro]);

  const linhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return linhas;
    return linhas.filter(
      (l) =>
        l.nome.toLowerCase().includes(termo) ||
        l.codigo.toLowerCase().includes(termo) ||
        (l.marca ?? "").toLowerCase().includes(termo),
    );
  }, [linhas, busca]);

  const salvarDesconto = async () => {
    const valor = Number(descontoLocal);
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
      toast.error("Informe um valor entre 0 e 100");
      return;
    }
    setSalvandoDesconto(true);
    const { error } = await supabase
      .from("clientes")
      .update({ desconto_adicional: Math.round(valor) })
      .eq("id", clienteId);
    setSalvandoDesconto(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success("Desconto adicional salvo");
  };

  const limparRascunho = (
    setter: React.Dispatch<React.SetStateAction<Record<string, string>>>,
    id: string,
  ) => {
    setter((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // Salva o preço do cliente direto da tabela (onBlur / Enter). Atualiza se já
  // existe registro; cria (origem "acordo") caso contrário. Sem mudança ou
  // valor vazio: apenas descarta o rascunho.
  const salvarPreco = async (l: LinhaProduto, raw: string) => {
    if (!clienteCodigoParceiro) return;
    const trimmed = raw.trim();
    if (trimmed === "") {
      limparRascunho(setPrecoInput, l.produtoId);
      return;
    }
    const valor = Number(trimmed);
    if (!Number.isFinite(valor) || valor < 0) {
      toast.error("Informe um preço válido");
      return;
    }
    if (l.precoEspecial != null && valor === l.precoEspecial) {
      limparRascunho(setPrecoInput, l.produtoId);
      return;
    }

    const key = `${l.produtoId}:preco`;
    setSalvando((s) => ({ ...s, [key]: true }));
    let novoId = l.especialId;
    let error;
    if (l.especialId) {
      ({ error } = await supabase
        .from("precos_cliente_produto")
        .update({ preco_unitario: valor })
        .eq("id", l.especialId));
    } else {
      const res = await supabase
        .from("precos_cliente_produto")
        .insert({
          codigo_parceiro: clienteCodigoParceiro,
          codigo_produto: l.codigo,
          preco_unitario: valor,
          origem: "acordo",
        })
        .select("id")
        .single();
      error = res.error;
      novoId = res.data?.id ?? null;
    }
    setSalvando((s) => {
      const next = { ...s };
      delete next[key];
      return next;
    });
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    setLinhas((prev) =>
      prev.map((x) =>
        x.produtoId === l.produtoId
          ? { ...x, especialId: novoId, precoEspecial: valor, origem: x.origem ?? "acordo" }
          : x,
      ),
    );
    limparRascunho(setPrecoInput, l.produtoId);
    toast.success("Preço do cliente salvo");
  };

  // Salva o desconto do cliente (0–100) direto da tabela. Vazio remove o
  // desconto (null). Cria o registro com origem "acordo" se ainda não existir.
  const salvarDescontoPerfil = async (l: LinhaProduto, raw: string) => {
    if (!clienteCodigoParceiro) return;
    const trimmed = raw.trim();
    let valor: number | null;
    if (trimmed === "") {
      valor = null;
    } else {
      valor = Number(trimmed);
      if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
        toast.error("Informe um desconto entre 0 e 100");
        return;
      }
    }
    if (valor === (l.descontoPerfil ?? null)) {
      limparRascunho(setDescInput, l.produtoId);
      return;
    }
    // Nada a gravar: limpar um desconto inexistente sem registro.
    if (valor === null && !l.especialId) {
      limparRascunho(setDescInput, l.produtoId);
      return;
    }

    const key = `${l.produtoId}:desc`;
    setSalvando((s) => ({ ...s, [key]: true }));
    let novoId = l.especialId;
    let error;
    if (l.especialId) {
      ({ error } = await supabase
        .from("precos_cliente_produto")
        .update({ desconto_perfil: valor })
        .eq("id", l.especialId));
    } else {
      const res = await supabase
        .from("precos_cliente_produto")
        .insert({
          codigo_parceiro: clienteCodigoParceiro,
          codigo_produto: l.codigo,
          desconto_perfil: valor,
          origem: "acordo",
        })
        .select("id")
        .single();
      error = res.error;
      novoId = res.data?.id ?? null;
    }
    setSalvando((s) => {
      const next = { ...s };
      delete next[key];
      return next;
    });
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    setLinhas((prev) =>
      prev.map((x) =>
        x.produtoId === l.produtoId
          ? { ...x, especialId: novoId, descontoPerfil: valor, origem: x.origem ?? "acordo" }
          : x,
      ),
    );
    limparRascunho(setDescInput, l.produtoId);
    toast.success("Desconto do cliente salvo");
  };

  const excluir = async () => {
    if (!excluirLinha?.especialId) return;
    setExcluindo(true);
    const { error } = await supabase
      .from("precos_cliente_produto")
      .delete()
      .eq("id", excluirLinha.especialId);
    setExcluindo(false);
    if (error) {
      toast.error("Erro ao excluir: " + error.message);
      return;
    }
    toast.success("Preço do cliente excluído");
    setLinhas((prev) =>
      prev.map((x) =>
        x.produtoId === excluirLinha.produtoId
          ? { ...x, especialId: null, precoEspecial: null, descontoPerfil: null, origem: null }
          : x,
      ),
    );
    limparRascunho(setPrecoInput, excluirLinha.produtoId);
    limparRascunho(setDescInput, excluirLinha.produtoId);
    setExcluirLinha(null);
  };

  return (
    <div className="space-y-6">
      {/* BLOCO A — Desconto adicional */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Desconto adicional</h3>
            <p className="text-xs text-muted-foreground">
              Percentual extra (0 a 100%) aplicado para este cliente.
            </p>
          </div>
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label>Desconto (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={descontoLocal}
                onChange={(e) => setDescontoLocal(e.target.value)}
                className="w-32"
              />
            </div>
            <Button onClick={salvarDesconto} disabled={salvandoDesconto}>
              {salvandoDesconto && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* BLOCO B — Tabela de preços do cliente (todos os produtos) */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Preços por produto</h3>
            <p className="text-xs text-muted-foreground">
              Todos os produtos da tabela {clienteTabela ? `"${clienteTabela}"` : ""} com o
              desconto do cluster aplicado. Edite o preço e o desconto do cliente direto na
              tabela — as alterações são salvas automaticamente.
            </p>
          </div>

          {!clienteTabela ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Cliente sem tabela de preço cadastrada — não é possível exibir os preços.
            </p>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, código ou marca..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-8"
                />
              </div>

              {!clienteCodigoParceiro && (
                <p className="text-xs text-muted-foreground">
                  Código do parceiro não cadastrado — exibindo apenas os preços de tabela; não é
                  possível editar o preço ou o desconto do cliente.
                </p>
              )}

              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : linhasFiltradas.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {linhas.length === 0
                    ? "Nenhum produto com preço nesta tabela."
                    : "Nenhum produto corresponde à busca."}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-medium">Código</th>
                        <th className="px-3 py-2 font-medium">Produto</th>
                        <th className="px-3 py-2 font-medium">Marca</th>
                        <th className="px-3 py-2 font-medium text-right">Preço bruto</th>
                        <th className="px-3 py-2 font-medium text-right">Desc. cluster</th>
                        <th className="px-3 py-2 font-medium text-right">Preço c/ cluster</th>
                        <th className="px-3 py-2 font-medium text-right">Preço cliente</th>
                        <th className="px-3 py-2 font-medium text-right">Desc. cliente (%)</th>
                        <th className="px-3 py-2 font-medium text-right">Preço final</th>
                        <th className="px-3 py-2 font-medium text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhasFiltradas.map((l) => {
                        const salvandoPreco = salvando[`${l.produtoId}:preco`];
                        const salvandoDesc = salvando[`${l.produtoId}:desc`];
                        const precoVal =
                          precoInput[l.produtoId] ??
                          (l.precoEspecial != null ? String(l.precoEspecial) : "");
                        const descVal =
                          descInput[l.produtoId] ??
                          (l.descontoPerfil != null ? String(l.descontoPerfil) : "");
                        return (
                          <tr key={l.produtoId} className="border-t">
                            <td className="px-3 py-2 font-mono text-xs">{l.codigo}</td>
                            <td className="px-3 py-2">{l.nome}</td>
                            <td className="px-3 py-2 text-muted-foreground">{l.marca ?? "—"}</td>
                            <td className="px-3 py-2 text-right">{formatBRL(l.precoBruto)}</td>
                            <td className="px-3 py-2 text-right">
                              {l.descontoCluster > 0
                                ? `${(l.descontoCluster * 100).toLocaleString("pt-BR", {
                                    maximumFractionDigits: 2,
                                  })}%`
                                : "—"}
                            </td>
                            <td className="px-3 py-2 text-right">{formatBRL(l.precoComCluster)}</td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {salvandoPreco && (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                                )}
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={precoVal}
                                  disabled={!clienteCodigoParceiro || salvandoPreco}
                                  onChange={(e) =>
                                    setPrecoInput((p) => ({ ...p, [l.produtoId]: e.target.value }))
                                  }
                                  onBlur={(e) => salvarPreco(l, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") e.currentTarget.blur();
                                  }}
                                  className="h-8 w-28 ml-auto text-right"
                                  placeholder="—"
                                />
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {salvandoDesc && (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                                )}
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step="0.01"
                                  value={descVal}
                                  disabled={!clienteCodigoParceiro || salvandoDesc}
                                  onChange={(e) =>
                                    setDescInput((p) => ({ ...p, [l.produtoId]: e.target.value }))
                                  }
                                  onBlur={(e) => salvarDescontoPerfil(l, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") e.currentTarget.blur();
                                  }}
                                  className="h-8 w-20 ml-auto text-right"
                                  placeholder="—"
                                />
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-semibold">
                              {formatBRL(precoFinalDe(l))}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-1">
                                {l.especialId && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setExcluirLinha(l)}
                                    title="Remover preço/desconto do cliente"
                                  >
                                    <Trash2 className="h-4 w-4 text-red-600" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* AlertDialog: excluir preço/desconto do cliente */}
      <AlertDialog open={!!excluirLinha} onOpenChange={(o) => !o && setExcluirLinha(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover preço/desconto do cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. O preço e o desconto do cliente serão removidos para este
              produto — ele volta a usar o preço de tabela com o desconto do cluster.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={excluir}
              disabled={excluindo}
              className="bg-red-600 hover:bg-red-700"
            >
              {excluindo && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
