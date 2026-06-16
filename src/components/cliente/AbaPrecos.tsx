import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, Plus, Trash2, Check, X, Search } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

// Uma linha = um produto da tabela de preço do cliente. O preço especial
// (precos_cliente_produto) pode ou não existir; quando existe, prevalece.
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

const precoFinalDe = (l: LinhaProduto) => l.precoEspecial ?? l.precoComCluster;

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

  // edição inline (chaveada por produtoId)
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editValor, setEditValor] = useState("");
  const [salvandoEdit, setSalvandoEdit] = useState(false);

  // exclusão (guarda a linha cujo preço especial será removido)
  const [excluirLinha, setExcluirLinha] = useState<LinhaProduto | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  // novo preço especial (modal de busca de produto avulso)
  const [novoOpen, setNovoOpen] = useState(false);
  const [buscaProduto, setBuscaProduto] = useState("");
  const [resultadosProduto, setResultadosProduto] = useState<ProdutoBusca[]>([]);
  const [buscandoProduto, setBuscandoProduto] = useState(false);
  const [produtoSelecionado, setProdutoSelecionado] = useState<ProdutoBusca | null>(null);
  const [novoPreco, setNovoPreco] = useState("");
  const [salvandoNovo, setSalvandoNovo] = useState(false);

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

    // 5) Preços especiais do cliente (acordo/histórico), chaveados por codigo_jiva.
    const especialMap: Record<string, { id: string; preco: number | null; origem: string }> = {};
    if (clienteCodigoParceiro) {
      const { data: especiais } = await supabase
        .from("precos_cliente_produto")
        .select("id, codigo_produto, preco_unitario, origem")
        .eq("codigo_parceiro", clienteCodigoParceiro);
      (especiais ?? []).forEach((e) => {
        if (e.codigo_produto != null) {
          especialMap[e.codigo_produto] = {
            id: e.id,
            preco: e.preco_unitario != null ? Number(e.preco_unitario) : null,
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

  const iniciarEdicao = (l: LinhaProduto) => {
    setEditandoId(l.produtoId);
    setEditValor(l.precoEspecial != null ? String(l.precoEspecial) : "");
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setEditValor("");
  };

  // Salva o preço especial inline: atualiza se já existe, cria (origem "acordo")
  // caso contrário. Exige código do parceiro para gravar.
  const salvarEdicao = async (l: LinhaProduto) => {
    if (!clienteCodigoParceiro) {
      toast.error("Cliente sem código de parceiro");
      return;
    }
    const valor = Number(editValor);
    if (!Number.isFinite(valor) || valor < 0) {
      toast.error("Informe um preço válido");
      return;
    }
    setSalvandoEdit(true);
    if (l.especialId) {
      const { error } = await supabase
        .from("precos_cliente_produto")
        .update({ preco_unitario: valor })
        .eq("id", l.especialId);
      setSalvandoEdit(false);
      if (error) {
        toast.error("Erro ao salvar: " + error.message);
        return;
      }
      setLinhas((prev) =>
        prev.map((x) => (x.produtoId === l.produtoId ? { ...x, precoEspecial: valor } : x)),
      );
    } else {
      const { data, error } = await supabase
        .from("precos_cliente_produto")
        .insert({
          codigo_parceiro: clienteCodigoParceiro,
          codigo_produto: l.codigo,
          preco_unitario: valor,
          origem: "acordo",
        })
        .select("id")
        .single();
      setSalvandoEdit(false);
      if (error) {
        toast.error("Erro ao salvar: " + error.message);
        return;
      }
      setLinhas((prev) =>
        prev.map((x) =>
          x.produtoId === l.produtoId
            ? { ...x, especialId: data.id, precoEspecial: valor, origem: "acordo" }
            : x,
        ),
      );
    }
    toast.success("Preço especial salvo");
    cancelarEdicao();
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
    toast.success("Preço especial excluído");
    setLinhas((prev) =>
      prev.map((x) =>
        x.produtoId === excluirLinha.produtoId
          ? { ...x, especialId: null, precoEspecial: null, origem: null }
          : x,
      ),
    );
    setExcluirLinha(null);
  };

  const buscarProdutos = async (termo: string) => {
    setBuscaProduto(termo);
    setProdutoSelecionado(null);
    const t = termo.trim();
    if (t.length < 2) {
      setResultadosProduto([]);
      return;
    }
    setBuscandoProduto(true);
    const { data } = await supabase
      .from("produtos")
      .select("id, codigo_jiva, nome, marca")
      .eq("disponivel", true)
      .or(`nome.ilike.%${t}%,codigo_jiva.ilike.%${t}%`)
      .limit(20);
    setResultadosProduto((data ?? []) as ProdutoBusca[]);
    setBuscandoProduto(false);
  };

  const abrirNovo = () => {
    setBuscaProduto("");
    setResultadosProduto([]);
    setProdutoSelecionado(null);
    setNovoPreco("");
    setNovoOpen(true);
  };

  const criarNovo = async () => {
    if (!clienteCodigoParceiro) {
      toast.error("Cliente sem código de parceiro");
      return;
    }
    if (!produtoSelecionado) {
      toast.error("Selecione um produto");
      return;
    }
    const valor = Number(novoPreco);
    if (!Number.isFinite(valor) || valor < 0) {
      toast.error("Informe um preço válido");
      return;
    }
    setSalvandoNovo(true);
    const { error } = await supabase.from("precos_cliente_produto").insert({
      codigo_parceiro: clienteCodigoParceiro,
      codigo_produto: produtoSelecionado.codigo_jiva,
      preco_unitario: valor,
      origem: "acordo",
    });
    setSalvandoNovo(false);
    if (error) {
      toast.error("Erro ao criar: " + error.message);
      return;
    }
    toast.success("Preço especial criado");
    setNovoOpen(false);
    carregar();
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Preços por produto</h3>
              <p className="text-xs text-muted-foreground">
                Todos os produtos da tabela {clienteTabela ? `"${clienteTabela}"` : ""} com o
                desconto do cluster aplicado. O preço especial (acordo) prevalece quando existe.
              </p>
            </div>
            <Button
              size="sm"
              onClick={abrirNovo}
              disabled={!clienteCodigoParceiro}
              title={!clienteCodigoParceiro ? "Cliente sem código de parceiro" : undefined}
            >
              <Plus className="h-4 w-4 mr-1" />
              Novo preço especial
            </Button>
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
                  possível criar ou editar preços especiais.
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
                        <th className="px-3 py-2 font-medium text-right">Preço especial</th>
                        <th className="px-3 py-2 font-medium text-right">Preço final</th>
                        <th className="px-3 py-2 font-medium text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhasFiltradas.map((l) => {
                        const emEdicao = editandoId === l.produtoId;
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
                              {emEdicao ? (
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={editValor}
                                  onChange={(e) => setEditValor(e.target.value)}
                                  className="h-8 w-28 ml-auto text-right"
                                  placeholder="Preço"
                                />
                              ) : l.precoEspecial != null ? (
                                <div className="flex items-center justify-end gap-2">
                                  {formatBRL(l.precoEspecial)}
                                  {l.origem === "acordo" ? (
                                    <Badge className="bg-green-100 text-green-800 border-green-300">
                                      Acordo
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="bg-gray-100 text-gray-600 border-gray-300"
                                    >
                                      Histórico
                                    </Badge>
                                  )}
                                </div>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold">
                              {formatBRL(precoFinalDe(l))}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-1">
                                {emEdicao ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => salvarEdicao(l)}
                                      disabled={salvandoEdit}
                                    >
                                      {salvandoEdit ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Check className="h-4 w-4 text-green-600" />
                                      )}
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={cancelarEdicao}>
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => iniciarEdicao(l)}
                                      disabled={!clienteCodigoParceiro}
                                      title={
                                        l.precoEspecial != null
                                          ? "Editar preço especial"
                                          : "Definir preço especial"
                                      }
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    {l.especialId && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setExcluirLinha(l)}
                                      >
                                        <Trash2 className="h-4 w-4 text-red-600" />
                                      </Button>
                                    )}
                                  </>
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

      {/* Modal: novo preço especial */}
      <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo preço especial</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Produto</Label>
              {produtoSelecionado ? (
                <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{produtoSelecionado.nome}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {produtoSelecionado.codigo_jiva}
                      {produtoSelecionado.marca ? ` · ${produtoSelecionado.marca}` : ""}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setProdutoSelecionado(null);
                      setBuscaProduto("");
                      setResultadosProduto([]);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nome ou código..."
                      value={buscaProduto}
                      onChange={(e) => buscarProdutos(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  {buscandoProduto ? (
                    <div className="flex justify-center py-3">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    </div>
                  ) : resultadosProduto.length > 0 ? (
                    <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
                      {resultadosProduto.map((prod) => (
                        <button
                          key={prod.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                          onClick={() => {
                            setProdutoSelecionado(prod);
                            setResultadosProduto([]);
                          }}
                        >
                          <div className="text-sm font-medium">{prod.nome}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {prod.codigo_jiva}
                            {prod.marca ? ` · ${prod.marca}` : ""}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : buscaProduto.trim().length >= 2 ? (
                    <p className="text-xs text-muted-foreground px-1">Nenhum produto encontrado.</p>
                  ) : null}
                </>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Preço (R$)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={novoPreco}
                onChange={(e) => setNovoPreco(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={criarNovo} disabled={salvandoNovo}>
              {salvandoNovo && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: excluir preço especial */}
      <AlertDialog open={!!excluirLinha} onOpenChange={(o) => !o && setExcluirLinha(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir preço especial?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. O preço especial será removido para este cliente — o produto
              volta a usar o preço de tabela com o desconto do cluster.
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
