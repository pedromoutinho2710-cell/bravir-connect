import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Trash2, Plus, Copy, Check, X } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";

type Produto = {
  id: string;
  nome: string;
  marca: string;
  codigo_jiva: string;
};

type ClienteSel = {
  id: string;
  razao_social: string;
  tabela_preco: string | null;
};

type ItemSim = {
  produto_id: string;
  nome: string;
  marca: string;
  custo: number;
  preco_revenda: number | "";
};

const TABELA_PADRAO = "7";

export default function CalculadoraMargem() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [vigenciaId, setVigenciaId] = useState<string | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [precos, setPrecos] = useState<{ produto_id: string; preco_bruto: number; tabela: string }[]>([]);

  // Cliente
  const [buscaCliente, setBuscaCliente] = useState("");
  const [resultadosCliente, setResultadosCliente] = useState<ClienteSel[]>([]);
  const [clienteSelecionado, setClienteSelecionado] = useState<ClienteSel | null>(null);

  // Produtos
  const [buscaProduto, setBuscaProduto] = useState("");
  const [itensSim, setItensSim] = useState<ItemSim[]>([]);

  // Link gerado
  const [linkGerado, setLinkGerado] = useState<string | null>(null);
  const [gerandoLink, setGerandoLink] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // TODO: quando existir coluna preco_revenda_sugerido em produtos,
  // pré-preencher o input com esse valor ao adicionar o produto

  useEffect(() => {
    (async () => {
      const vigRes = await supabase
        .from("tabelas_vigencia")
        .select("id, nome")
        .eq("ativa", true)
        .limit(1)
        .single();
      if (vigRes.error || !vigRes.data) {
        toast.error("Nenhuma vigência ativa encontrada.");
        setLoading(false);
        return;
      }
      const vigId = vigRes.data.id;
      setVigenciaId(vigId);

      const [pRes, prRes] = await Promise.all([
        supabase
          .from("produtos")
          .select("id, nome, marca, codigo_jiva")
          .eq("ativo", true)
          .order("marca")
          .order("nome"),
        supabase
          .from("precos")
          .select("produto_id, preco_bruto, tabela")
          .eq("vigencia_id", vigId),
      ]);

      if (pRes.data) setProdutos(pRes.data as Produto[]);
      if (prRes.data) setPrecos(prRes.data as { produto_id: string; preco_bruto: number; tabela: string }[]);
      setLoading(false);
    })();
  }, []);

  // Busca de clientes (debounced simples)
  useEffect(() => {
    const termo = buscaCliente.trim();
    if (!termo || clienteSelecionado) {
      setResultadosCliente([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("clientes")
        .select("id, razao_social, tabela_preco")
        .ilike("razao_social", `%${termo}%`)
        .limit(10);
      setResultadosCliente((data ?? []) as ClienteSel[]);
    }, 250);
    return () => clearTimeout(t);
  }, [buscaCliente, clienteSelecionado]);

  const tabelaAtual = clienteSelecionado?.tabela_preco?.trim() || TABELA_PADRAO;

  const precoPorProduto = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of precos) {
      if (p.tabela === tabelaAtual) map.set(p.produto_id, Number(p.preco_bruto));
    }
    return map;
  }, [precos, tabelaAtual]);

  // Recalcular custos quando trocar cliente/tabela
  useEffect(() => {
    setItensSim((prev) =>
      prev.map((it) => ({
        ...it,
        custo: precoPorProduto.get(it.produto_id) ?? it.custo,
      })),
    );
  }, [precoPorProduto]);

  const produtosFiltrados = useMemo(() => {
    const termo = buscaProduto.trim().toLowerCase();
    if (!termo) return [];
    return produtos
      .filter(
        (p) =>
          p.nome.toLowerCase().includes(termo) ||
          p.marca.toLowerCase().includes(termo) ||
          p.codigo_jiva.toLowerCase().includes(termo),
      )
      .slice(0, 12);
  }, [buscaProduto, produtos]);

  const adicionarProduto = (p: Produto) => {
    if (itensSim.some((it) => it.produto_id === p.id)) {
      toast.info("Produto já adicionado.");
      return;
    }
    const custo = precoPorProduto.get(p.id);
    if (custo == null) {
      toast.error(`Sem preço cadastrado para a tabela ${tabelaAtual}.`);
      return;
    }
    setItensSim((prev) => [
      ...prev,
      { produto_id: p.id, nome: p.nome, marca: p.marca, custo, preco_revenda: "" },
    ]);
    setBuscaProduto("");
  };

  const removerProduto = (produto_id: string) => {
    setItensSim((prev) => prev.filter((it) => it.produto_id !== produto_id));
  };

  const atualizarRevenda = (produto_id: string, valor: string) => {
    const num = valor === "" ? "" : Number(valor.replace(",", "."));
    setItensSim((prev) =>
      prev.map((it) =>
        it.produto_id === produto_id
          ? { ...it, preco_revenda: num === "" || isNaN(num as number) ? "" : (num as number) }
          : it,
      ),
    );
  };

  const selecionarCliente = (c: ClienteSel) => {
    setClienteSelecionado(c);
    setBuscaCliente(c.razao_social);
    setResultadosCliente([]);
  };

  const limparCliente = () => {
    setClienteSelecionado(null);
    setBuscaCliente("");
    setResultadosCliente([]);
  };

  const podeGerar = itensSim.some(
    (it) => typeof it.preco_revenda === "number" && it.preco_revenda > 0,
  );

  const gerarLink = async () => {
    if (!user) return;
    if (!podeGerar) {
      toast.error("Preencha o preço de revenda em ao menos 1 item.");
      return;
    }
    setGerandoLink(true);
    const itensPayload = itensSim
      .filter((it) => typeof it.preco_revenda === "number" && it.preco_revenda > 0)
      .map((it) => {
        const revenda = it.preco_revenda as number;
        const markup = it.custo > 0 ? ((revenda / it.custo) - 1) * 100 : 0;
        const margem = revenda > 0 ? ((revenda - it.custo) / revenda) * 100 : 0;
        return {
          produto_id: it.produto_id,
          nome: it.nome,
          custo: it.custo,
          preco_revenda: revenda,
          markup,
          margem,
        };
      });

    // simulacoes_margem ainda não consta em types.ts; cast localizado.
    const { data, error } = await (supabase as unknown as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => {
          select: (c: string) => { single: () => Promise<{ data: { token: string } | null; error: { message: string } | null }> };
        };
      };
    })
      .from("simulacoes_margem")
      .insert({
        vendedor_id: user.id,
        cliente_id: clienteSelecionado?.id ?? null,
        itens: JSON.stringify(itensPayload),
      })
      .select("token")
      .single();

    setGerandoLink(false);

    if (error || !data) {
      toast.error("Erro ao gerar link: " + (error?.message ?? "desconhecido"));
      return;
    }
    setLinkGerado(`${window.location.origin}/calc/${data.token}`);
    setCopiado(false);
    toast.success("Link gerado!");
  };

  const copiarLink = async () => {
    if (!linkGerado) return;
    await navigator.clipboard.writeText(linkGerado);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!vigenciaId) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Nenhuma vigência ativa. Fale com o admin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Calculadora de Margem</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monte uma simulação de markup e margem por produto e gere um link para enviar ao cliente.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cliente (opcional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {clienteSelecionado ? (
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
              <div className="text-sm">
                <div className="font-medium">{clienteSelecionado.razao_social}</div>
                <div className="text-xs text-muted-foreground">
                  Tabela: {clienteSelecionado.tabela_preco?.trim() || `${TABELA_PADRAO} (padrão)`}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={limparCliente}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <Input
                placeholder="Buscar cliente por razão social..."
                value={buscaCliente}
                onChange={(e) => setBuscaCliente(e.target.value)}
              />
              {resultadosCliente.length > 0 && (
                <div className="border rounded-md divide-y max-h-64 overflow-auto">
                  {resultadosCliente.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selecionarCliente(c)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                    >
                      <div className="font-medium">{c.razao_social}</div>
                      <div className="text-xs text-muted-foreground">
                        Tabela: {c.tabela_preco?.trim() || `${TABELA_PADRAO} (padrão)`}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Sem cliente, será usada a tabela <strong>{TABELA_PADRAO}</strong>.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adicionar produto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            placeholder="Buscar por nome, marca ou código..."
            value={buscaProduto}
            onChange={(e) => setBuscaProduto(e.target.value)}
          />
          {produtosFiltrados.length > 0 && (
            <div className="border rounded-md divide-y max-h-72 overflow-auto">
              {produtosFiltrados.map((p) => {
                const jaAdicionado = itensSim.some((it) => it.produto_id === p.id);
                const custo = precoPorProduto.get(p.id);
                return (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium">{p.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.marca} · {p.codigo_jiva} · {custo != null ? formatBRL(custo) : "sem preço"}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={jaAdicionado || custo == null}
                      onClick={() => adicionarProduto(p)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      {jaAdicionado ? "Adicionado" : "Adicionar"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Itens da simulação</CardTitle>
        </CardHeader>
        <CardContent>
          {itensSim.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum produto adicionado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Custo (R$)</TableHead>
                    <TableHead className="text-right">Preço revenda</TableHead>
                    <TableHead className="text-right">Markup</TableHead>
                    <TableHead className="text-right">Margem</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itensSim.map((it) => {
                    const revenda = typeof it.preco_revenda === "number" ? it.preco_revenda : null;
                    const temRevenda = revenda != null && revenda > 0;
                    const abaixoCusto = temRevenda && revenda! <= it.custo;
                    const markup = temRevenda && it.custo > 0 ? ((revenda! / it.custo) - 1) * 100 : null;
                    const margem = temRevenda ? ((revenda! - it.custo) / revenda!) * 100 : null;

                    const okStyleMarkup = { backgroundColor: "#f0f7f3", color: "#004d1a" };
                    const okStyleMargem = { backgroundColor: "#E6F1FB", color: "#185FA5" };
                    const errStyle = { backgroundColor: "#FCEBEB", color: "#A32D2D" };

                    return (
                      <TableRow key={it.produto_id}>
                        <TableCell>
                          <div className="font-medium text-sm">{it.nome}</div>
                          <div className="text-xs text-muted-foreground">{it.marca}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBRL(it.custo)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            inputMode="decimal"
                            type="number"
                            step="0.01"
                            min="0"
                            value={it.preco_revenda === "" ? "" : String(it.preco_revenda)}
                            onChange={(e) => atualizarRevenda(it.produto_id, e.target.value)}
                            className="text-right w-32 ml-auto"
                            placeholder="0,00"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {markup != null ? (
                            <Badge style={abaixoCusto ? errStyle : okStyleMarkup} className="font-medium">
                              {markup.toFixed(1)}%
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {margem != null ? (
                            <Badge style={abaixoCusto ? errStyle : okStyleMargem} className="font-medium">
                              {margem.toFixed(1)}%
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => removerProduto(it.produto_id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={gerarLink} disabled={!podeGerar || gerandoLink}>
              {gerandoLink && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Gerar link para cliente
            </Button>
            {linkGerado && (
              <Button variant="outline" onClick={copiarLink}>
                {copiado ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {copiado ? "Copiado!" : "Copiar link"}
              </Button>
            )}
          </div>
          {linkGerado && (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm break-all">
              {linkGerado}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
