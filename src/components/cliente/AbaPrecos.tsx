import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Search, Pencil, RotateCcw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type Props = {
  clienteId: string;
  clienteCodigoParceiro: string | null;
  clienteTabela: string | null;
  clienteCluster: string | null;
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

const fmtPct = (frac: number) =>
  `${(frac * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

const fmtPctNum = (pct: number) =>
  `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

// Preço final = (preço do cliente ou preço c/ cluster) com o desconto do
// cliente aplicado: base × (1 - desconto_perfil / 100).
const precoFinalDe = (l: LinhaProduto) => {
  const base = l.precoEspecial ?? l.precoComCluster;
  const desc = l.descontoPerfil ?? 0;
  return base * (1 - desc / 100);
};

export function AbaPrecos({
  clienteCodigoParceiro,
  clienteTabela,
  clienteCluster,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [linhas, setLinhas] = useState<LinhaProduto[]>([]);
  const [busca, setBusca] = useState("");

  // edição por linha — guarda o produtoId em edição e os rascunhos de preço/desconto.
  const [editId, setEditId] = useState<string | null>(null);
  const [editPreco, setEditPreco] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [restaurandoId, setRestaurandoId] = useState<string | null>(null);

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

    // 2-5) Preços brutos (precisa da vigência), produtos, descontos do cluster e
    // preços/descontos do cliente são independentes entre si — busca em paralelo.
    const [precosRes, prodsRes, descontosRes, especiaisRes] = await Promise.all([
      // 2) Preços brutos da tabela do cliente na vigência ativa.
      supabase
        .from("precos")
        .select("produto_id, preco_bruto")
        .eq("vigencia_id", vigenciaId)
        .eq("tabela", clienteTabela),
      // 3) Catálogo ativo. Inclui produtos sem estoque (disponivel = false) para
      // que a gestora consiga editar o preço deles — mesmo universo de produtos
      // usado no formulário de pedido (useNovoPedido carrega por ativo = true).
      supabase
        .from("produtos")
        .select("id, codigo_jiva, nome, marca")
        .eq("ativo", true),
      // 4) Desconto do cluster por produto. percentual_desconto é fração (0,25 = 25%).
      clienteCluster
        ? supabase
            .from("descontos")
            .select("produto_id, percentual_desconto")
            .eq("perfil_cliente", clienteCluster)
        : Promise.resolve({ data: [] }),
      // 5) Preços/descontos do cliente, chaveados por codigo_jiva.
      clienteCodigoParceiro
        ? supabase
            .from("precos_cliente_produto")
            .select("id, codigo_produto, preco_unitario, desconto_perfil, origem")
            .eq("codigo_parceiro", clienteCodigoParceiro)
        : Promise.resolve({ data: [] }),
    ]);

    const { data: precos, error: errPrecos } = precosRes;
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

    const produtos = (prodsRes.data ?? []) as ProdutoBusca[];

    const descontoMap: Record<string, number> = {};
    (descontosRes.data ?? []).forEach((d) => {
      if (d.produto_id) descontoMap[d.produto_id] = Number(d.percentual_desconto);
    });

    const especialMap: Record<
      string,
      { id: string; preco: number | null; desconto: number | null; origem: string }
    > = {};
    (especiaisRes.data ?? []).forEach((e) => {
      if (e.codigo_produto != null) {
        especialMap[e.codigo_produto] = {
          id: e.id,
          preco: e.preco_unitario != null ? Number(e.preco_unitario) : null,
          desconto: e.desconto_perfil != null ? Number(e.desconto_perfil) : null,
          origem: e.origem,
        };
      }
    });

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
    setEditId(null);
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

  const iniciarEdicao = (l: LinhaProduto) => {
    setEditId(l.produtoId);
    // pré-preenche com o valor do cliente se houver, senão com o valor de tabela/cluster.
    setEditPreco(l.precoEspecial != null ? String(l.precoEspecial) : String(l.precoBruto));
    setEditDesc(
      l.descontoPerfil != null
        ? String(l.descontoPerfil)
        : String(Number((l.descontoCluster * 100).toFixed(2))),
    );
  };

  const cancelarEdicao = () => setEditId(null);

  // Preço final em tempo real durante a edição: preço × (1 - desconto/100).
  const finalEmEdicao = () => {
    const preco = Number(editPreco);
    if (!Number.isFinite(preco)) return 0;
    const desc = Number(editDesc);
    const d = Number.isFinite(desc) ? desc : 0;
    return preco * (1 - d / 100);
  };

  // Salva o preço/desconto do cliente. Atualiza o registro se já existe; caso
  // contrário cria com origem "acordo". Chave: codigo_parceiro (já resolvido
  // como codigo_parceiro ?? codigo_cliente no call site) + codigo_produto.
  const salvar = async (l: LinhaProduto) => {
    if (!clienteCodigoParceiro) return;
    const preco = Number(editPreco);
    if (!Number.isFinite(preco) || preco < 0) {
      toast.error("Informe um preço válido");
      return;
    }
    const desc = Number(editDesc);
    if (!Number.isFinite(desc) || desc < 0 || desc > 100) {
      toast.error("Informe um desconto entre 0 e 100");
      return;
    }

    setSalvando(true);
    let novoId = l.especialId;
    let error;
    if (l.especialId) {
      ({ error } = await supabase
        .from("precos_cliente_produto")
        .update({ preco_unitario: preco, desconto_perfil: desc, origem: "acordo" })
        .eq("id", l.especialId));
    } else {
      const res = await supabase
        .from("precos_cliente_produto")
        .insert({
          codigo_parceiro: clienteCodigoParceiro,
          codigo_produto: l.codigo,
          preco_unitario: preco,
          desconto_perfil: desc,
          origem: "acordo",
        })
        .select("id")
        .single();
      error = res.error;
      novoId = res.data?.id ?? null;
    }
    setSalvando(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    setLinhas((prev) =>
      prev.map((x) =>
        x.produtoId === l.produtoId
          ? {
              ...x,
              especialId: novoId,
              precoEspecial: preco,
              descontoPerfil: desc,
              origem: "acordo",
            }
          : x,
      ),
    );
    setEditId(null);
    toast.success("Preço do cliente salvo");
  };

  // Remove o preço personalizado do cliente: apaga o registro em
  // precos_cliente_produto e devolve a linha ao preço de tabela + desconto do
  // cluster, limpando os campos do cliente localmente.
  const restaurar = async (l: LinhaProduto) => {
    if (!l.especialId) return;
    setRestaurandoId(l.produtoId);
    const { error } = await supabase
      .from("precos_cliente_produto")
      .delete()
      .eq("id", l.especialId);
    setRestaurandoId(null);
    if (error) {
      toast.error("Erro ao restaurar: " + error.message);
      return;
    }
    setLinhas((prev) =>
      prev.map((x) =>
        x.produtoId === l.produtoId
          ? {
              ...x,
              especialId: null,
              precoEspecial: null,
              descontoPerfil: null,
              origem: null,
            }
          : x,
      ),
    );
    toast.success("Preço restaurado para o valor original");
  };

  return (
    <div className="space-y-6">
      {/* Tabela de preços do cliente (todos os produtos) */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Preços por produto</h3>
            <p className="text-xs text-muted-foreground">
              Todos os produtos da tabela {clienteTabela ? `"${clienteTabela}"` : ""} com o
              desconto do cluster aplicado. Clique no lápis para editar o preço e o desconto do
              cliente em uma linha.
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
                        <th className="px-3 py-2 font-medium text-right">Preço final</th>
                        <th className="px-3 py-2 font-medium text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhasFiltradas.map((l) => {
                        const editando = editId === l.produtoId;
                        const personalizado = l.especialId != null;
                        const temPrecoCustom = l.precoEspecial != null;
                        const temDescCustom = l.descontoPerfil != null;
                        return (
                          <tr
                            key={l.produtoId}
                            className={editando ? "border-t bg-[#F0FBF7]" : "border-t"}
                          >
                            <td className="px-3 py-2 font-mono text-xs align-top">{l.codigo}</td>
                            <td className="px-3 py-2 align-top">
                              <div>{l.nome}</div>
                              {editando ? (
                                <span className="mt-1 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                                  editando
                                </span>
                              ) : (
                                personalizado && (
                                  <span className="mt-1 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                                    personalizado
                                  </span>
                                )
                              )}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground align-top">
                              {l.marca ?? "—"}
                            </td>

                            {/* Preço bruto */}
                            <td className="px-3 py-2 text-right align-top">
                              {editando ? (
                                <div className="flex flex-col items-end gap-1">
                                  <span className="text-xs text-muted-foreground">
                                    tabela: {formatBRL(l.precoBruto)}
                                  </span>
                                  <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={editPreco}
                                    disabled={salvando}
                                    onChange={(e) => setEditPreco(e.target.value)}
                                    className="h-8 w-28 text-right border-emerald-500 text-emerald-700 focus-visible:ring-emerald-500"
                                  />
                                </div>
                              ) : temPrecoCustom ? (
                                <div className="flex flex-col items-end">
                                  <span className="text-xs text-muted-foreground line-through">
                                    {formatBRL(l.precoBruto)}
                                  </span>
                                  <span className="font-medium text-emerald-700">
                                    {formatBRL(l.precoEspecial as number)}
                                  </span>
                                </div>
                              ) : (
                                formatBRL(l.precoBruto)
                              )}
                            </td>

                            {/* Desc. cluster */}
                            <td className="px-3 py-2 text-right align-top">
                              {editando ? (
                                <div className="flex flex-col items-end gap-1">
                                  <span className="text-xs text-muted-foreground">
                                    cluster: {fmtPct(l.descontoCluster)}
                                  </span>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step="0.01"
                                    value={editDesc}
                                    disabled={salvando}
                                    onChange={(e) => setEditDesc(e.target.value)}
                                    className="h-8 w-20 text-right border-emerald-500 text-emerald-700 focus-visible:ring-emerald-500"
                                  />
                                </div>
                              ) : temDescCustom ? (
                                <div className="flex flex-col items-end">
                                  <span className="text-xs text-muted-foreground line-through">
                                    {fmtPct(l.descontoCluster)}
                                  </span>
                                  <span className="font-medium text-emerald-700">
                                    {fmtPctNum(l.descontoPerfil as number)}
                                  </span>
                                </div>
                              ) : l.descontoCluster > 0 ? (
                                fmtPct(l.descontoCluster)
                              ) : (
                                "—"
                              )}
                            </td>

                            {/* Preço final */}
                            <td className="px-3 py-2 text-right align-top">
                              {editando ? (
                                <span className="text-base font-semibold text-emerald-700">
                                  {formatBRL(finalEmEdicao())}
                                </span>
                              ) : personalizado ? (
                                <span className="text-base font-semibold text-emerald-700">
                                  {formatBRL(precoFinalDe(l))}
                                </span>
                              ) : (
                                <span className="font-semibold">{formatBRL(precoFinalDe(l))}</span>
                              )}
                            </td>

                            {/* Ações */}
                            <td className="px-3 py-2 align-top">
                              {editando ? (
                                <div className="flex flex-col items-end gap-1.5">
                                  <Button
                                    size="sm"
                                    onClick={() => salvar(l)}
                                    disabled={salvando}
                                    className="w-24 bg-emerald-600 hover:bg-emerald-700"
                                  >
                                    {salvando && (
                                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    )}
                                    Salvar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={cancelarEdicao}
                                    disabled={salvando}
                                    className="w-24"
                                  >
                                    Cancelar
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => iniciarEdicao(l)}
                                    disabled={!clienteCodigoParceiro || editId != null}
                                    title="Editar preço e desconto do cliente"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  {personalizado && (
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          disabled={editId != null || restaurandoId != null}
                                          title="Restaurar preço original"
                                          className="text-destructive hover:text-destructive"
                                        >
                                          {restaurandoId === l.produtoId ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : (
                                            <RotateCcw className="h-4 w-4" />
                                          )}
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>
                                            Restaurar preço original?
                                          </AlertDialogTitle>
                                          <AlertDialogDescription>
                                            O preço personalizado será removido e o produto voltará
                                            a usar o preço da tabela e desconto do cluster.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => restaurar(l)}
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                          >
                                            Restaurar
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  )}
                                </div>
                              )}
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
    </div>
  );
}
