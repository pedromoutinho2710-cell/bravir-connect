import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { MARCAS } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Produto = { id: string; nome: string; codigo_jiva: string; marca: string };
type ItemPedido = {
  produto_id: string;
  nome: string;
  quantidade: number;
  preco_unitario: number;
  desconto: number;
  total: number;
};

export default function NovoPedidoFaturamento() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── Modo cliente ────────────────────────────────────────────────
  const [modoCliente, setModoCliente] = useState<"cadastrado" | "nao_cadastrado">("cadastrado");
  const [clienteBusca, setClienteBusca] = useState("");
  const [clientesSugeridos, setClientesSugeridos] = useState<{ id: string; razao_social: string; nome_parceiro: string | null; cnpj: string }[]>([]);
  const [clienteId, setClienteId] = useState<string | null>(null);

  // Campos do cliente (preenchidos do DB ou livres)
  const [clienteRazaoSocial, setClienteRazaoSocial] = useState("");
  const [clienteCnpj, setClienteCnpj] = useState("");
  const [clienteCluster, setClienteCluster] = useState("");
  const [clienteTabelaPreco, setClienteTabelaPreco] = useState("");
  const [clienteCidade, setClienteCidade] = useState("");
  const [clienteUf, setClienteUf] = useState("");
  const [clienteCep, setClienteCep] = useState("");
  const [clienteComprador, setClienteComprador] = useState("");
  const [clienteEmailXml, setClienteEmailXml] = useState("");
  const [clienteCodigo, setClienteCodigo] = useState("");
  const [aceitaSaldo, setAceitaSaldo] = useState(true);

  // ── Campos do pedido ────────────────────────────────────────────
  const [vendedorNome, setVendedorNome] = useState("");
  const [condPagamento, setCondPagamento] = useState("");
  const [tipo, setTipo] = useState<"Pedido" | "Bonificação">("Pedido");
  const [ordemCompra, setOrdemCompra] = useState("");
  const [agendamento, setAgendamento] = useState(false);
  const [observacoes, setObservacoes] = useState("");

  // ── Produtos ────────────────────────────────────────────────────
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [produtoBusca, setProdutoBusca] = useState("");
  const [filtroMarca, setFiltroMarca] = useState<string>("Todas");
  const [itens, setItens] = useState<ItemPedido[]>([]);

  const [salvando, setSalvando] = useState(false);

  // Carrega todos os produtos ativos
  useEffect(() => {
    supabase
      .from("produtos")
      .select("id, nome, codigo_jiva, marca")
      .eq("ativo", true)
      .order("nome")
      .then(({ data }) => { if (data) setProdutos(data); });
  }, []);

  // Busca clientes (modo cadastrado)
  useEffect(() => {
    if (modoCliente !== "cadastrado" || clienteBusca.trim().length < 2) {
      setClientesSugeridos([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("clientes")
        .select("id, razao_social, nome_parceiro, cnpj")
        .or(`razao_social.ilike.%${clienteBusca}%,cnpj.ilike.%${clienteBusca}%`)
        .limit(8);
      if (data) setClientesSugeridos(data);
    }, 300);
    return () => clearTimeout(t);
  }, [clienteBusca, modoCliente]);

  // Ao selecionar cliente, busca dados completos
  async function selecionarCliente(c: { id: string; razao_social: string; nome_parceiro: string | null; cnpj: string }) {
    const { data } = await supabase
      .from("clientes")
      .select("id, razao_social, cnpj, cluster, tabela_preco, cidade, uf, cep, comprador, email, codigo_cliente, codigo_parceiro, aceita_saldo")
      .eq("id", c.id)
      .single();

    if (data) {
      setClienteId(data.id);
      setClienteRazaoSocial(data.razao_social ?? "");
      setClienteCnpj(data.cnpj ?? "");
      setClienteCluster(data.cluster ?? "");
      setClienteTabelaPreco(data.tabela_preco ?? "");
      setClienteCidade(data.cidade ?? "");
      setClienteUf(data.uf ?? "");
      setClienteCep(data.cep ?? "");
      setClienteComprador(data.comprador ?? "");
      setClienteEmailXml(data.email ?? "");
      setClienteCodigo(data.codigo_parceiro ?? data.codigo_cliente ?? "");
      setAceitaSaldo(data.aceita_saldo ?? true);
    }
    setClientesSugeridos([]);
    setClienteBusca("");
  }

  function limparCliente() {
    setClienteId(null);
    setClienteRazaoSocial("");
    setClienteCnpj("");
    setClienteCluster("");
    setClienteTabelaPreco("");
    setClienteCidade("");
    setClienteUf("");
    setClienteCep("");
    setClienteComprador("");
    setClienteEmailXml("");
    setClienteCodigo("");
    setAceitaSaldo(true);
    setClienteBusca("");
    setClientesSugeridos([]);
  }

  const produtosFiltrados = useMemo(() => {
    const q = produtoBusca.trim().toLowerCase();
    return produtos.filter((p) => {
      if (filtroMarca !== "Todas" && p.marca !== filtroMarca) return false;
      if (!q) return true;
      return p.nome.toLowerCase().includes(q) || p.codigo_jiva.toLowerCase().includes(q);
    });
  }, [produtos, produtoBusca, filtroMarca]);

  const produtosPorMarca = useMemo(() =>
    produtosFiltrados.reduce<Record<string, Produto[]>>((acc, p) => {
      (acc[p.marca] ||= []).push(p);
      return acc;
    }, {}),
  [produtosFiltrados]);

  const totalGeral = useMemo(() => itens.reduce((s, i) => s + i.total, 0), [itens]);

  function adicionarProduto(p: Produto) {
    if (itens.find((i) => i.produto_id === p.id)) { toast.info("Produto já adicionado"); return; }
    setItens((prev) => [
      ...prev,
      { produto_id: p.id, nome: `${p.codigo_jiva} — ${p.nome}`, quantidade: 1, preco_unitario: 0, desconto: 0, total: 0 },
    ]);
    setProdutoBusca("");
    setProdutosSugeridos([]);
  }

  function atualizarItem(idx: number, field: "quantidade" | "preco_unitario" | "desconto", val: number) {
    setItens((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const novo = { ...it, [field]: val };
        novo.total = novo.quantidade * novo.preco_unitario * (1 - novo.desconto / 100);
        return novo;
      })
    );
  }

  function removerItem(idx: number) {
    setItens((prev) => prev.filter((_, i) => i !== idx));
  }

  async function salvar() {
    if (itens.length === 0) { toast.error("Adicione ao menos um produto"); return; }
    if (!vendedorNome.trim()) { toast.error("Preencha o nome do vendedor"); return; }
    if (!condPagamento.trim()) { toast.error("Preencha a condição de pagamento"); return; }
    if (modoCliente === "cadastrado" && !clienteId) { toast.error("Selecione um cliente"); return; }
    if (modoCliente === "nao_cadastrado" && !clienteRazaoSocial.trim()) { toast.error("Preencha o nome do cliente"); return; }

    setSalvando(true);

    // Monta observacoes com prefixos
    const partes: string[] = [];
    if (modoCliente === "nao_cadastrado") partes.push(`[Cliente: ${clienteRazaoSocial.trim()}]`);
    partes.push(`[Vendedor: ${vendedorNome.trim()}]`);
    if (clienteEmailXml && modoCliente === "nao_cadastrado") partes.push(`[Email XML: ${clienteEmailXml}]`);
    if (observacoes.trim()) partes.push(observacoes.trim());
    const obsCompleta = partes.join(" ").trim() || null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pedidoPayload: any = {
      tipo,
      status: "pendente_sankhya",
      cliente_id: clienteId ?? null,
      vendedor_id: user?.id ?? null,
      responsavel_id: user?.id ?? null,
      cond_pagamento: condPagamento,
      observacoes: obsCompleta,
      data_pedido: new Date().toISOString().split("T")[0],
      perfil_cliente: clienteCluster || "",
      tabela_preco: clienteTabelaPreco || "",
      agendamento,
      ordem_compra: ordemCompra.trim() || null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pedido, error: pedidoErr } = await (supabase as any)
      .from("pedidos")
      .insert(pedidoPayload)
      .select("id")
      .single();

    if (pedidoErr || !pedido) {
      toast.error("Erro ao salvar pedido: " + (pedidoErr?.message ?? "Erro desconhecido"));
      setSalvando(false);
      return;
    }

    const itensPayload = itens.map((it) => ({
      pedido_id: pedido.id,
      produto_id: it.produto_id,
      quantidade: it.quantidade,
      preco_unitario_bruto: it.preco_unitario,
      preco_final: it.preco_unitario * (1 - it.desconto / 100),
      total_item: it.total,
      desconto_comercial: it.desconto,
      desconto_trade: 0,
    }));

    const { error: itensErr } = await supabase.from("itens_pedido").insert(itensPayload);

    if (itensErr) {
      toast.error("Pedido salvo mas erro nos itens: " + itensErr.message);
    } else {
      toast.success("Pedido salvo com sucesso!");
      navigate("/faturamento");
    }
    setSalvando(false);
  }

  const clienteSelecionado = modoCliente === "cadastrado" && clienteId !== null;

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold">Novo Pedido</h1>
        <p className="text-sm text-muted-foreground">Pedido livre — sem restrições de preço ou valor mínimo</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Coluna esquerda: dados ── */}
        <div className="space-y-4">

          {/* Cliente */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Toggle modo */}
              <div className="flex gap-2">
                <Button type="button" size="sm"
                  variant={modoCliente === "cadastrado" ? "default" : "outline"}
                  onClick={() => { setModoCliente("cadastrado"); limparCliente(); }}>
                  Cliente cadastrado
                </Button>
                <Button type="button" size="sm"
                  variant={modoCliente === "nao_cadastrado" ? "default" : "outline"}
                  onClick={() => { setModoCliente("nao_cadastrado"); limparCliente(); }}>
                  Não cadastrado
                </Button>
              </div>

              {/* Busca cliente cadastrado */}
              {modoCliente === "cadastrado" && !clienteSelecionado && (
                <div className="relative">
                  <Input
                    placeholder="Buscar por razão social ou CNPJ…"
                    value={clienteBusca}
                    onChange={(e) => setClienteBusca(e.target.value)}
                  />
                  {clientesSugeridos.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
                      {clientesSugeridos.map((c) => (
                        <button key={c.id} type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                          onClick={() => selecionarCliente(c)}>
                          <div className="font-medium">{c.nome_parceiro || c.razao_social}</div>
                          <div className="text-xs text-muted-foreground">{c.cnpj}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Banner cliente selecionado */}
              {modoCliente === "cadastrado" && clienteSelecionado && (
                <div className="flex items-center justify-between rounded-md border px-3 py-2 bg-muted/40">
                  <div>
                    <div className="text-sm font-medium">{clienteRazaoSocial}</div>
                    <div className="text-xs text-muted-foreground">{clienteCnpj}</div>
                  </div>
                  <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs"
                    onClick={limparCliente}>
                    Trocar
                  </Button>
                </div>
              )}

              {/* Campos de cliente — editáveis em ambos os modos */}
              <div className="grid grid-cols-2 gap-3">
                {modoCliente === "nao_cadastrado" && (
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Razão social / Nome *</Label>
                    <Input value={clienteRazaoSocial} onChange={(e) => setClienteRazaoSocial(e.target.value)}
                      placeholder="Nome do cliente" />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Cluster / Perfil</Label>
                  <Input value={clienteCluster} onChange={(e) => setClienteCluster(e.target.value)}
                    placeholder="Ex.: atacado_distribuidor" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tabela de preço</Label>
                  <Input value={clienteTabelaPreco} onChange={(e) => setClienteTabelaPreco(e.target.value)}
                    placeholder="Ex.: atacado" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cidade</Label>
                  <Input value={clienteCidade} onChange={(e) => setClienteCidade(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">UF</Label>
                  <Input value={clienteUf} onChange={(e) => setClienteUf(e.target.value)} maxLength={2} className="uppercase" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">CEP</Label>
                  <Input value={clienteCep} onChange={(e) => setClienteCep(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Comprador</Label>
                  <Input value={clienteComprador} onChange={(e) => setClienteComprador(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email XML / Boleto</Label>
                  <Input type="email" value={clienteEmailXml} onChange={(e) => setClienteEmailXml(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Código do cliente</Label>
                  <Input value={clienteCodigo} onChange={(e) => setClienteCodigo(e.target.value)} />
                </div>
              </div>

              {/* Toggles */}
              <div className="flex gap-6 pt-1">
                <div className="flex items-center gap-2">
                  <Switch id="agend" checked={agendamento} onCheckedChange={setAgendamento} />
                  <Label htmlFor="agend" className="text-xs cursor-pointer">Agendamento</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="saldo" checked={aceitaSaldo} onCheckedChange={setAceitaSaldo} />
                  <Label htmlFor="saldo" className="text-xs cursor-pointer">Aceita saldo</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dados do pedido */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Dados do Pedido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Vendedor *</Label>
                <Input placeholder="Nome do vendedor" value={vendedorNome}
                  onChange={(e) => setVendedorNome(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>Condição de pagamento *</Label>
                <Input placeholder="Ex.: 28/35/42 DDL" value={condPagamento}
                  onChange={(e) => setCondPagamento(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={tipo} onValueChange={(v) => setTipo(v as "Pedido" | "Bonificação")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pedido">Pedido</SelectItem>
                      <SelectItem value="Bonificação">Bonificação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Ordem de Compra</Label>
                  <Input placeholder="Nº OC" value={ordemCompra}
                    onChange={(e) => setOrdemCompra(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Observações</Label>
                <Textarea placeholder="Observações adicionais…" value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)} rows={3} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Coluna direita: produtos ── */}
        <Card className="bg-[#F0FDF4] border-green-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Produtos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Busca + filtro marca */}
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={produtoBusca}
                  onChange={(e) => setProdutoBusca(e.target.value)}
                  placeholder="Buscar por SKU ou nome…"
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {(["Todas", ...MARCAS] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setFiltroMarca(m)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      filtroMarca === m
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted"
                    )}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Lista scrollável de produtos */}
            <div className="space-y-4 max-h-80 overflow-y-auto rounded-md border p-3 bg-muted/20">
              {Object.keys(produtosPorMarca).length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-6">Nenhum produto encontrado</div>
              )}
              {Object.entries(produtosPorMarca).map(([marca, lista]) => (
                <div key={marca}>
                  <div className="mb-2 text-xs font-bold uppercase tracking-wider text-primary">{marca}</div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {lista.map((p) => {
                      const ja = itens.some((i) => i.produto_id === p.id);
                      return (
                        <div key={p.id}
                          className="flex items-center justify-between gap-2 rounded-md border bg-card p-2 text-sm">
                          <div className="min-w-0">
                            <div className="font-mono text-xs text-muted-foreground">{p.codigo_jiva}</div>
                            <div className="truncate text-xs">{p.nome}</div>
                          </div>
                          <Button type="button" size="sm"
                            variant={ja ? "secondary" : "default"}
                            disabled={ja}
                            onClick={() => adicionarProduto(p)}>
                            <Plus className="h-3 w-3" />
                            {ja ? "Adicionado" : "Adicionar"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Tabela de itens adicionados */}
            {itens.length > 0 && (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow style={{ backgroundColor: "#1a5c38" }} className="hover:bg-[#1a5c38]">
                      <TableHead className="text-white text-[11px] font-semibold py-2">Produto</TableHead>
                      <TableHead className="text-white text-[11px] font-semibold py-2 w-20">Qtd</TableHead>
                      <TableHead className="text-white text-[11px] font-semibold py-2 w-28">Preço unit.</TableHead>
                      <TableHead className="text-white text-[11px] font-semibold py-2 w-20">Desc %</TableHead>
                      <TableHead className="text-white text-[11px] font-semibold py-2 w-28 text-right">Total</TableHead>
                      <TableHead className="text-white w-10 py-2"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.map((it, idx) => (
                      <TableRow key={it.produto_id}
                        style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f8faf9" }}
                        className="hover:bg-green-50/70">
                        <TableCell className="py-2">
                          <div className="text-xs font-medium">{it.nome}</div>
                        </TableCell>
                        <TableCell className="py-2">
                          <Input type="number" min={1} value={it.quantidade}
                            className="h-7 w-16 text-xs"
                            onChange={(e) => atualizarItem(idx, "quantidade", Number(e.target.value) || 1)} />
                        </TableCell>
                        <TableCell className="py-2">
                          <Input type="number" min={0} step="0.01" value={it.preco_unitario}
                            className="h-7 w-24 text-xs"
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => atualizarItem(idx, "preco_unitario", Number(e.target.value) || 0)} />
                        </TableCell>
                        <TableCell className="py-2">
                          <Input type="number" min={0} max={100} value={it.desconto}
                            className="h-7 w-16 text-xs"
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => atualizarItem(idx, "desconto", Math.min(100, Number(e.target.value) || 0))} />
                        </TableCell>
                        <TableCell className="text-right font-bold text-sm py-2" style={{ color: "#1a5c38" }}>
                          {formatBRL(it.total)}
                        </TableCell>
                        <TableCell className="py-2">
                          <button type="button"
                            className="p-1 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                            onClick={() => removerItem(idx)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Rodapé sticky ── */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t -mx-4 px-4 py-3 flex items-center justify-between gap-4 z-10">
        <div className="text-sm">
          <span className="text-muted-foreground">Total geral: </span>
          <span className="text-xl font-bold text-green-700">{formatBRL(totalGeral)}</span>
        </div>
        <Button onClick={salvar} disabled={salvando} size="lg">
          {salvando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Salvar pedido
        </Button>
      </div>
    </div>
  );
}
