import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Boxes, Search } from "lucide-react";
import { toast } from "sonner";

type Produto = {
  id: string;
  codigo_jiva: string;
  nome: string;
  marca: string;
  disponivel: boolean;
};

export default function GestaoEstoque() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [soIndisponiveis, setSoIndisponiveis] = useState(false);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("produtos")
          .select("id, codigo_jiva, nome, marca, disponivel")
          .eq("ativo", true)
          .order("nome", { ascending: true });
        if (error) throw error;
        setProdutos((data ?? []) as Produto[]);
      } catch {
        toast.error("Erro ao carregar produtos");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalIndisponiveis = useMemo(
    () => produtos.filter((p) => !p.disponivel).length,
    [produtos],
  );

  const produtosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      if (soIndisponiveis && p.disponivel) return false;
      if (!q) return true;
      return (
        p.nome.toLowerCase().includes(q) ||
        p.codigo_jiva.toLowerCase().includes(q)
      );
    });
  }, [produtos, busca, soIndisponiveis]);

  const toggleDisponivel = async (produto: Produto, novoValor: boolean) => {
    setSalvandoId(produto.id);
    // Atualização otimista
    setProdutos((prev) =>
      prev.map((p) => (p.id === produto.id ? { ...p, disponivel: novoValor } : p)),
    );
    try {
      const { error } = await supabase
        .from("produtos")
        .update({ disponivel: novoValor })
        .eq("id", produto.id);
      if (error) throw error;
      toast.success(
        novoValor
          ? `${produto.nome} marcado como disponível`
          : `${produto.nome} marcado como indisponível`,
      );
    } catch {
      // Reverte em caso de erro
      setProdutos((prev) =>
        prev.map((p) => (p.id === produto.id ? { ...p, disponivel: !novoValor } : p)),
      );
      toast.error("Erro ao atualizar disponibilidade");
    } finally {
      setSalvandoId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Boxes className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Gestão de Estoque</h1>
            <p className="text-sm text-muted-foreground">
              Controle de disponibilidade dos produtos
            </p>
          </div>
        </div>
        <Badge
          variant={totalIndisponiveis > 0 ? "destructive" : "secondary"}
          className="text-sm px-3 py-1"
        >
          {totalIndisponiveis} indisponíve{totalIndisponiveis === 1 ? "l" : "is"} de {produtos.length} totais
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Produtos</CardTitle>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou código..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <Switch checked={soIndisponiveis} onCheckedChange={setSoIndisponiveis} />
              Mostrar só indisponíveis
            </label>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : produtosFiltrados.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">
              Nenhum produto encontrado
            </p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead className="text-right w-32">Disponível</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {produtosFiltrados.map((p) => (
                    <TableRow key={p.id} className={!p.disponivel ? "bg-red-50/40" : ""}>
                      <TableCell className="font-mono text-sm">{p.codigo_jiva}</TableCell>
                      <TableCell className="text-sm font-medium">{p.nome}</TableCell>
                      <TableCell className="text-sm">
                        <Badge variant="outline">{p.marca}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-2">
                          {salvandoId === p.id && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          )}
                          <Switch
                            checked={p.disponivel}
                            disabled={salvandoId === p.id}
                            onCheckedChange={(v) => toggleDisponivel(p, v)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-sm text-muted-foreground mt-3">
            {produtosFiltrados.length} produto(s) exibido(s)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
