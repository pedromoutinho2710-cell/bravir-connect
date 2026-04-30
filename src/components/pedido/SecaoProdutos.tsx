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
  const apos_perfil = bruto * (1 - dPerfil / 100);
  const apos_comercial = apos_perfil * (1 - dCom / 100);
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
  precos: Record<string, Record<string, number>>; // produto_id -> tabela -> preco
  descontos: Record<string, Record<string, number>>; // produto_id -> perfil -> pct
  tabelaPreco: string;
  perfilCliente: string;
  itens: ItemPedido[];
  onChange: (itens: ItemPedido[]) => void;
};

export function SecaoProdutos({
  produtos,
  precos,
  descontos,
  tabelaPreco,
  perfilCliente,
  itens,
  onChange,
}: Props) {
  const [busca, setBusca] = useState("");
  const [filtroMarca, setFiltroMarca] = useState<string>("Todas");

  const calcItem = (p: Produto, qtd: number): ItemPedido => {
    const bruto = precos[p.id]?.[tabelaPreco] ?? 0;
    const dPerfil = descontos[p.id]?.[perfilCliente] ?? 0;
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

  const remover = (produto_id: string) =>
    onChange(itens.filter((i) => i.produto_id !== produto_id));

  // Recalcula tudo se mudar tabela/perfil
  const itensRecalculados = useMemo(() => {
    return itens.map((i) => {
      const bruto = precos[i.produto_id]?.[tabelaPreco] ?? i.preco_bruto;
      const dPerfil = descontos[i.produto_id]?.[perfilCliente] ?? i.desconto_perfil;
      const precos_calc = calcularPrecos(bruto, dPerfil, i.desconto_comercial, i.desconto_trade, i.quantidade);
      
      return {
        ...i,
        preco_bruto: bruto,
        desconto_perfil: dPerfil,
        preco_apos_perfil: precos_calc.preco_apos_perfil,
        preco_apos_comercial: precos_calc.preco_apos_comercial,
        preco_final: precos_calc.preco_final,
        total: precos_calc.total,
      };
    });
  }, [itens, precos, descontos, tabelaPreco, perfilCliente]);

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
    <Card>
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
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Cx</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">P. Bruto</TableHead>
                  <TableHead className="text-right">Desc. Perfil %</TableHead>
                  <TableHead className="text-right">P. Após Perfil</TableHead>
                  <TableHead className="text-right">Desc. Comercial %</TableHead>
                  <TableHead className="text-right">P. Após Comercial</TableHead>
                  <TableHead className="text-right">Desc. Trade %</TableHead>
                  <TableHead className="text-right">P. Final</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itensRecalculados.map((i) => {
                  return (
                    <TableRow key={i.produto_id}>
                      <TableCell>
                        <div className="font-mono text-xs text-muted-foreground">{i.codigo}</div>
                        <div className="text-sm">{i.nome}</div>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{i.cx_embarque}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={1}
                          value={i.quantidade}
                          onChange={(e) => atualizarQtd(i.produto_id, Math.max(1, Number(e.target.value) || 1))}
                          className={cn("w-20 ml-auto")}
                        />
                      </TableCell>
                      <TableCell className="text-right text-sm">{formatBRL(i.preco_bruto)}</TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm">{i.desconto_perfil}%</TableCell>
                      <TableCell className="text-right text-sm">{formatBRL(i.preco_apos_perfil)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={i.desconto_comercial}
                          onChange={(e) => atualizarDesconto(i.produto_id, "comercial", Math.max(0, Number(e.target.value) || 0))}
                          className={cn("w-20 ml-auto")}
                          placeholder="0"
                        />
                      </TableCell>
                      <TableCell className="text-right text-sm">{formatBRL(i.preco_apos_comercial)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={i.desconto_trade}
                          onChange={(e) => atualizarDesconto(i.produto_id, "trade", Math.max(0, Number(e.target.value) || 0))}
                          className={cn("w-20 ml-auto")}
                          placeholder="0"
                        />
                      </TableCell>
                      <TableCell className="text-right font-semibold text-sm">{formatBRL(i.preco_final)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatBRL(i.total)}</TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => remover(i.produto_id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
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
