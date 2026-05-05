import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Search } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { MARCAS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type Produto = {
  id: string;
  codigo_jiva: string;
  nome: string;
  marca: string;
  cx_embarque: number;
  peso_unitario: number;
};

export type ItemPedido = {
  produto_id: string;
  codigo: string;
  nome: string;
  marca: string;
  cx_embarque: number;
  peso_unitario: number;
  quantidade: number;
  preco_bruto: number;
  desconto_perfil: number;
  desconto_comercial: number;
  desconto_trade: number;
  preco_apos_perfil: number;
  preco_apos_comercial: number;
  preco_final: number;
  total: number;
  bolsao: number;
};

/**
 * Calcula precos com cascata de descontos (nunca soma)
 * Fluxo: bruto -> aplica desconto perfil -> aplica desc comercial -> aplica desc trade
 */
export function calcularPrecos(
  bruto: number,
  dPerfil: number = 0,
  dCom: number = 0,
  dTrade: number = 0,
  qtd: number = 1
) {
  const apos_perfil = bruto * (1 - dPerfil); // dPerfil é decimal (0.20 = 20%)
  const apos_comercial = apos_perfil * (1 - dCom / 100); // dCom é percentual (2.5 = 2.5%)
  const preco_final = apos_comercial * (1 - dTrade / 100);

  return {
    preco_apos_perfil: apos_perfil,
    preco_apos_comercial: apos_comercial,
    preco_final: preco_final,
    total: preco_final * qtd,
  };
}

type Props = {
  produtos: Produto[];
  descontos: Record<string, Record<string, number>>; // produto_id -> perfil -> pct
  tabelaPreco: string;
  perfilCliente: string;
  itens: ItemPedido[];
  onChange: (itens: ItemPedido[]) => void;
  vendedorEmail: string;
  vigenciaId: string;
  descontoLivre?: boolean;
};

export function SecaoProdutos({
  produtos,
  descontos,
  tabelaPreco,
  perfilCliente,
  itens,
  onChange,
  vendedorEmail,
  vigenciaId,
  descontoLivre = false,
}: Props) {
  const isVendedorLivre = /pedro|julia|tamiris/i.test(vendedorEmail);
  const [busca, setBusca] = useState("");
  const [precos, setPrecos] = useState<Record<string, Record<string, number>>>({});

  // Recarrega preços quando vigência muda
  useEffect(() => {
    if (!vigenciaId) { setPrecos({}); return; }
    supabase
      .from("precos")
      .select("produto_id, tabela, preco_bruto")
      .eq("vigencia_id", vigenciaId)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, Record<string, number>> = {};
        data.forEach((p) => { (map[p.produto_id] ||= {})[p.tabela] = Number(p.preco_bruto); });
        setPrecos(map);
      });
  }, [vigenciaId]);
  const [filtroMarca, setFiltroMarca] = useState<string>("Todas");

  const calcItem = (p: Produto, qtd: number): ItemPedido => {
    const bruto = precos[p.id]?.[tabelaPreco] ?? 0;
    const dPerfil = descontoLivre ? 0 : (descontos[p.id]?.[perfilCliente] ?? 0);
    const precos_calc = calcularPrecos(bruto, dPerfil, 0, 0, qtd);
    
    return {
      produto_id: p.id,
      codigo: p.codigo_jiva,
      nome: p.nome,
      marca: p.marca,
      cx_embarque: p.cx_embarque,
      peso_unitario: Number(p.peso_unitario),
      quantidade: qtd,
      preco_bruto: bruto,
      desconto_perfil: dPerfil,
      desconto_comercial: 0,
      desconto_trade: 0,
      preco_apos_perfil: precos_calc.preco_apos_perfil,
      preco_apos_comercial: precos_calc.preco_apos_comercial,
      preco_final: precos_calc.preco_final,
      total: precos_calc.total,
      bolsao: 0,
    };
  };

  const adicionar = (p: Produto) => {
    if (!tabelaPreco || !perfilCliente) {
      toast.error("Selecione perfil do cliente e tabela de preço primeiro");
      return;
    }
    if (itens.some((i) => i.produto_id === p.id)) {
      toast.warning("Produto já adicionado");
      return;
    }
    onChange([...itens, calcItem(p, p.cx_embarque)]);
  };

  const atualizarQtd = (produto_id: string, qtd: number) => {
    onChange(
      itens.map((i) => {
        if (i.produto_id !== produto_id) return i;
        const precos_calc = calcularPrecos(
          i.preco_bruto,
          i.desconto_perfil,
          i.desconto_comercial,
          i.desconto_trade,
          qtd
        );
        return {
          ...i,
          quantidade: qtd,
          preco_final: precos_calc.preco_final,
          total: precos_calc.total,
        };
      }),
    );
  };

  const atualizarDescontoPerfil = (produto_id: string, valor: number) => {
    onChange(
      itens.map((i) => {
        if (i.produto_id !== produto_id) return i;
        const precos_calc = calcularPrecos(i.preco_bruto, valor, 0, i.desconto_trade, i.quantidade);
        return {
          ...i,
          desconto_perfil: valor,
          preco_apos_perfil: precos_calc.preco_apos_perfil,
          preco_apos_comercial: precos_calc.preco_apos_comercial,
          preco_final: precos_calc.preco_final,
          total: precos_calc.total,
        };
      }),
    );
  };

  const atualizarDesconto = (produto_id: string, tipo: "comercial" | "trade", valor: number) => {
    onChange(
      itens.map((i) => {
        if (i.produto_id !== produto_id) return i;
        
        const novo_desc_com = tipo === "comercial" ? valor : i.desconto_comercial;
        const novo_desc_trade = tipo === "trade" ? valor : i.desconto_trade;
        
        const precos_calc = calcularPrecos(
          i.preco_bruto,
          i.desconto_perfil,
          novo_desc_com,
          novo_desc_trade,
          i.quantidade
        );
        
        return {
          ...i,
          desconto_comercial: novo_desc_com,
          desconto_trade: novo_desc_trade,
          preco_apos_perfil: precos_calc.preco_apos_perfil,
          preco_apos_comercial: precos_calc.preco_apos_comercial,
          preco_final: precos_calc.preco_final,
          total: precos_calc.total,
        };
      }),
    );
  };

  const atualizarBolsao = (produto_id: string, bolsao: number) => {
    onChange(itens.map((i) => i.produto_id !== produto_id ? i : { ...i, bolsao }));
  };

  const remover = (produto_id: string) =>
    onChange(itens.filter((i) => i.produto_id !== produto_id));

  // Recalcula tudo se mudar tabela/perfil
  const itensRecalculados = useMemo(() => {
    return itens.map((i) => {
      const bruto = precos[i.produto_id]?.[tabelaPreco] ?? i.preco_bruto;
      const dPerfil = descontoLivre
        ? i.desconto_perfil
        : (descontos[i.produto_id]?.[perfilCliente] ?? i.desconto_perfil);
      const dCom = descontoLivre ? 0 : i.desconto_comercial;
      const precos_calc = calcularPrecos(bruto, dPerfil, dCom, i.desconto_trade, i.quantidade);

      return {
        ...i,
        preco_bruto: bruto,
        desconto_perfil: dPerfil,
        desconto_comercial: dCom,
        preco_apos_perfil: precos_calc.preco_apos_perfil,
        preco_apos_comercial: precos_calc.preco_apos_comercial,
        preco_final: precos_calc.preco_final,
        total: precos_calc.total,
      };
    });
  }, [itens, precos, descontos, tabelaPreco, perfilCliente, descontoLivre]);

  // Sincroniza recálculo (apenas quando os números efetivamente mudam)
  useMemoEffect(itensRecalculados, itens, onChange);

  const produtosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      if (filtroMarca !== "Todas" && p.marca !== filtroMarca) return false;
      if (!q) return true;
      return (
        p.codigo_jiva.toLowerCase().includes(q) ||
        p.nome.toLowerCase().includes(q)
      );
    });
  }, [produtos, busca, filtroMarca]);

  const porMarca = useMemo(() => {
    return produtosFiltrados.reduce<Record<string, Produto[]>>((acc, p) => {
      (acc[p.marca] ||= []).push(p);
      return acc;
    }, {});
  }, [produtosFiltrados]);

  return (
    <Card className="bg-[#F0FDF4] border-green-200">
      <CardHeader>
        <CardTitle>Produtos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por SKU ou nome…"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(["Todas", ...MARCAS] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setFiltroMarca(m)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  filtroMarca === m
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-muted",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4 max-h-96 overflow-y-auto rounded-md border p-3 bg-muted/20">
          {Object.keys(porMarca).length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-6">Nenhum produto encontrado</div>
          )}
          {Object.entries(porMarca).map(([marca, lista]) => (
            <div key={marca}>
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-primary">{marca}</div>
              <div className="grid gap-2 md:grid-cols-2">
                {lista.map((p) => {
                  const ja = itens.some((i) => i.produto_id === p.id);
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded-md border bg-card p-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-muted-foreground">{p.codigo_jiva}</div>
                        <div className="truncate">{p.nome}</div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={ja ? "secondary" : "default"}
                        disabled={ja}
                        onClick={() => adicionar(p)}
                      >
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

        {itensRecalculados.length > 0 && (
          <div className="rounded-lg border overflow-x-auto shadow-sm">
            <Table>
              <TableHeader>
                <TableRow style={{ backgroundColor: '#1a5c38' }} className="hover:bg-[#1a5c38]">
                  <TableHead className="text-white text-[11px] font-semibold py-2">Produto</TableHead>
                  <TableHead className="text-white text-[11px] font-semibold py-2 text-right w-28">Qtd</TableHead>
                  <TableHead className="text-white text-[11px] font-semibold py-2 text-right">P. Bruto</TableHead>
                  <TableHead className="text-white text-[11px] font-semibold py-2 text-right" style={{ minWidth: 110 }}>Desc. %</TableHead>
                  <TableHead className="text-white text-[11px] font-semibold py-2 text-right">P. Líquido</TableHead>
                  {!descontoLivre && <TableHead className="text-white text-[11px] font-semibold py-2 text-right w-24">Com. %</TableHead>}
                  <TableHead className="text-white text-[11px] font-semibold py-2 text-right w-24">Trade %</TableHead>
                  <TableHead className="text-white text-[11px] font-semibold py-2 text-right">P. Final</TableHead>
                  <TableHead className="text-white text-[11px] font-semibold py-2 text-right">Total</TableHead>
                  <TableHead className="text-white w-8 py-2"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itensRecalculados.map((i, idx) => (
                  <TableRow
                    key={i.produto_id}
                    style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8faf9' }}
                    className="hover:bg-green-50/70 transition-colors"
                  >
                    {/* Produto */}
                    <TableCell className="py-2 align-top">
                      <div className="font-mono text-[10px] text-muted-foreground leading-none mb-0.5">{i.codigo}</div>
                      <div className="text-xs font-medium leading-snug">{i.nome}</div>
                    </TableCell>

                    {/* Quantidade */}
                    <TableCell className="text-right py-2 align-top">
                      {isVendedorLivre ? (
                        <Input
                          type="number" min={1}
                          value={i.quantidade}
                          onChange={(e) => atualizarQtd(i.produto_id, Math.max(1, Number(e.target.value) || 1))}
                          className={cn("w-16 ml-auto h-7 text-xs")}
                        />
                      ) : (
                        <div className="space-y-0.5">
                          <Input
                            type="number" min={1} step={1}
                            value={Math.round(i.quantidade / i.cx_embarque)}
                            onChange={(e) => {
                              const caixas = Math.max(1, Math.floor(Number(e.target.value) || 1));
                              atualizarQtd(i.produto_id, caixas * i.cx_embarque);
                            }}
                            className={cn("w-16 ml-auto h-7 text-xs")}
                          />
                          <div className="text-[10px] text-muted-foreground text-right leading-none">
                            Cx:{i.cx_embarque} · {i.quantidade}un
                          </div>
                        </div>
                      )}
                    </TableCell>

                    {/* P. Bruto */}
                    <TableCell className="text-right py-2 align-top">
                      <div className="text-xs font-medium">{formatBRL(i.preco_bruto)}</div>
                    </TableCell>

                    {/* Desc. % */}
                    <TableCell className="text-right py-2 align-top">
                      {descontoLivre ? (
                        <Input
                          type="number" min={0} max={100} step={0.1}
                          value={parseFloat((i.desconto_perfil * 100).toFixed(1))}
                          onChange={(e) => atualizarDescontoPerfil(i.produto_id, Math.min(1, Math.max(0, (parseFloat(e.target.value) || 0) / 100)))}
                          className={cn("w-24 ml-auto h-7 text-xs px-2 py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none")}
                          placeholder="0"
                        />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">{(i.desconto_perfil * 100).toFixed(1)}%</span>
                      )}
                    </TableCell>

                    {/* P. Líquido */}
                    <TableCell className="text-right text-xs py-2 align-top">{formatBRL(i.preco_apos_perfil)}</TableCell>

                    {/* Desc. Comercial */}
                    {!descontoLivre && (
                      <TableCell className="text-right py-2 align-top">
                        <Input
                          type="number" min={0} max={3} step={0.1}
                          value={i.desconto_comercial}
                          onChange={(e) => atualizarDesconto(i.produto_id, "comercial", Math.min(3, Math.max(0, parseFloat(e.target.value) || 0)))}
                          className={cn("w-24 ml-auto h-7 text-xs px-2 py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none")}
                          placeholder="0"
                        />
                        <div className="text-[9px] text-muted-foreground mt-0.5 text-right">máx 3%</div>
                      </TableCell>
                    )}

                    {/* Desc. Trade */}
                    <TableCell className="text-right py-2 align-top">
                      <Input
                        type="number" min={0} max={100} step={0.1}
                        value={i.desconto_trade}
                        onChange={(e) => atualizarDesconto(i.produto_id, "trade", Math.max(0, parseFloat(e.target.value) || 0))}
                        className={cn("w-24 ml-auto h-7 text-xs px-2 py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none")}
                        placeholder="0"
                      />
                    </TableCell>

                    {/* P. Final */}
                    <TableCell className="text-right py-2 align-top">
                      <span className="text-sm font-bold" style={{ color: '#1a5c38' }}>
                        {formatBRL(i.preco_final)}
                      </span>
                    </TableCell>

                    {/* Total */}
                    <TableCell className="text-right py-2 align-top">
                      <span className="text-sm font-bold" style={{ color: '#1a5c38' }}>
                        {formatBRL(i.total)}
                      </span>
                    </TableCell>

                    {/* Remover */}
                    <TableCell className="py-2 align-top">
                      <button
                        type="button"
                        onClick={() => remover(i.produto_id)}
                        className="p-1 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
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
  );
}

// helper: aplica recálculo apenas se houve mudança real
function useMemoEffect(novos: ItemPedido[], atuais: ItemPedido[], onChange: (i: ItemPedido[]) => void) {
  const ref = useRef<string>("");
  useEffect(() => {
    const sig = novos
      .map((i) => `${i.produto_id}:${i.preco_bruto}:${i.desconto_perfil}:${i.desconto_comercial}:${i.desconto_trade}:${i.quantidade}`)
      .join("|");
    const sigAtual = atuais
      .map((i) => `${i.produto_id}:${i.preco_bruto}:${i.desconto_perfil}:${i.desconto_comercial}:${i.desconto_trade}:${i.quantidade}`)
      .join("|");
    if (sig !== sigAtual && sig !== ref.current) {
      ref.current = sig;
      onChange(novos);
    }
  }, [novos, atuais, onChange]);
}
