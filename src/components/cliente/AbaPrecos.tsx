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
  descontoAdicional: number | null;
};

type PrecoEspecial = {
  id: string;
  codigo_produto: string | null;
  preco_unitario: number | null;
  origem: string;
  produtoNome: string | null;
};

type ProdutoBusca = {
  id: string;
  codigo_jiva: string;
  nome: string;
  marca: string | null;
};

export function AbaPrecos({ clienteId, clienteCodigoParceiro, descontoAdicional }: Props) {
  // BLOCO A — desconto adicional
  const [descontoLocal, setDescontoLocal] = useState<string>(
    descontoAdicional != null ? String(descontoAdicional) : "",
  );
  const [salvandoDesconto, setSalvandoDesconto] = useState(false);

  // BLOCO B — preços especiais
  const [loading, setLoading] = useState(true);
  const [precos, setPrecos] = useState<PrecoEspecial[]>([]);
  const [busca, setBusca] = useState("");

  // edição inline
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editValor, setEditValor] = useState("");
  const [salvandoEdit, setSalvandoEdit] = useState(false);

  // exclusão
  const [excluirId, setExcluirId] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  // novo preço especial
  const [novoOpen, setNovoOpen] = useState(false);
  const [buscaProduto, setBuscaProduto] = useState("");
  const [resultadosProduto, setResultadosProduto] = useState<ProdutoBusca[]>([]);
  const [buscandoProduto, setBuscandoProduto] = useState(false);
  const [produtoSelecionado, setProdutoSelecionado] = useState<ProdutoBusca | null>(null);
  const [novoPreco, setNovoPreco] = useState("");
  const [salvandoNovo, setSalvandoNovo] = useState(false);

  const carregarPrecos = async () => {
    if (!clienteCodigoParceiro) {
      setPrecos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: especiais, error } = await supabase
      .from("precos_cliente_produto")
      .select("id, codigo_produto, preco_unitario, origem")
      .eq("codigo_parceiro", clienteCodigoParceiro);

    if (error) {
      toast.error("Erro ao carregar preços: " + error.message);
      setPrecos([]);
      setLoading(false);
      return;
    }

    const linhas = especiais ?? [];
    const codigos = Array.from(
      new Set(linhas.map((p) => p.codigo_produto).filter((c): c is string => !!c)),
    );

    const nomesMap: Record<string, string> = {};
    if (codigos.length > 0) {
      const { data: prods } = await supabase
        .from("produtos")
        .select("codigo_jiva, nome")
        .in("codigo_jiva", codigos);
      (prods ?? []).forEach((p) => {
        nomesMap[p.codigo_jiva] = p.nome;
      });
    }

    setPrecos(
      linhas.map((p) => ({
        id: p.id,
        codigo_produto: p.codigo_produto,
        preco_unitario: p.preco_unitario,
        origem: p.origem,
        produtoNome: p.codigo_produto ? nomesMap[p.codigo_produto] ?? null : null,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    carregarPrecos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteCodigoParceiro]);

  const precosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return precos;
    return precos.filter(
      (p) =>
        (p.produtoNome ?? "").toLowerCase().includes(termo) ||
        (p.codigo_produto ?? "").toLowerCase().includes(termo),
    );
  }, [precos, busca]);

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

  const iniciarEdicao = (p: PrecoEspecial) => {
    setEditandoId(p.id);
    setEditValor(p.preco_unitario != null ? String(p.preco_unitario) : "");
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setEditValor("");
  };

  const salvarEdicao = async (id: string) => {
    const valor = Number(editValor);
    if (!Number.isFinite(valor) || valor < 0) {
      toast.error("Informe um preço válido");
      return;
    }
    setSalvandoEdit(true);
    const { error } = await supabase
      .from("precos_cliente_produto")
      .update({ preco_unitario: valor })
      .eq("id", id);
    setSalvandoEdit(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success("Preço atualizado");
    setPrecos((prev) => prev.map((p) => (p.id === id ? { ...p, preco_unitario: valor } : p)));
    cancelarEdicao();
  };

  const excluir = async () => {
    if (!excluirId) return;
    setExcluindo(true);
    const { error } = await supabase
      .from("precos_cliente_produto")
      .delete()
      .eq("id", excluirId);
    setExcluindo(false);
    if (error) {
      toast.error("Erro ao excluir: " + error.message);
      return;
    }
    toast.success("Preço especial excluído");
    setPrecos((prev) => prev.filter((p) => p.id !== excluirId));
    setExcluirId(null);
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
      .eq("ativo", true)
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
    carregarPrecos();
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

      {/* BLOCO B — Preços especiais por produto */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Preços especiais por produto</h3>
              <p className="text-xs text-muted-foreground">
                Preços negociados (acordo) prevalecem; histórico serve como piso.
              </p>
            </div>
            <Button size="sm" onClick={abrirNovo} disabled={!clienteCodigoParceiro}>
              <Plus className="h-4 w-4 mr-1" />
              Novo preço especial
            </Button>
          </div>

          {!clienteCodigoParceiro ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Código do parceiro não cadastrado — não é possível gerenciar preços especiais.
            </p>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou código do produto..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-8"
                />
              </div>

              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : precosFiltrados.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {precos.length === 0
                    ? "Nenhum preço especial cadastrado."
                    : "Nenhum preço corresponde à busca."}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-medium">Código</th>
                        <th className="px-3 py-2 font-medium">Produto</th>
                        <th className="px-3 py-2 font-medium text-right">Preço especial</th>
                        <th className="px-3 py-2 font-medium">Origem</th>
                        <th className="px-3 py-2 font-medium text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {precosFiltrados.map((p) => {
                        const emEdicao = editandoId === p.id;
                        return (
                          <tr key={p.id} className="border-t">
                            <td className="px-3 py-2 font-mono text-xs">{p.codigo_produto ?? "—"}</td>
                            <td className="px-3 py-2">{p.produtoNome ?? "—"}</td>
                            <td className="px-3 py-2 text-right">
                              {emEdicao ? (
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={editValor}
                                  onChange={(e) => setEditValor(e.target.value)}
                                  className="h-8 w-28 ml-auto text-right"
                                />
                              ) : p.preco_unitario != null ? (
                                formatBRL(p.preco_unitario)
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {p.origem === "acordo" ? (
                                <Badge className="bg-green-100 text-green-800 border-green-300">Acordo</Badge>
                              ) : (
                                <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300">
                                  Histórico
                                </Badge>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-1">
                                {emEdicao ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => salvarEdicao(p.id)}
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
                                    <Button size="sm" variant="ghost" onClick={() => iniciarEdicao(p)}>
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setExcluirId(p.id)}
                                    >
                                      <Trash2 className="h-4 w-4 text-red-600" />
                                    </Button>
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
      <AlertDialog open={!!excluirId} onOpenChange={(o) => !o && setExcluirId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir preço especial?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. O preço especial será removido para este cliente.
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
