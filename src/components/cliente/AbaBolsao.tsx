import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Wallet, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { toast } from "sonner";

type MovimentoBolsao = {
  id: string;
  created_at: string | null;
  pedido_id: string | null;
  numero_pedido: number | null;
  tipo: string;
  valor: number;
  descricao: string | null;
};

export function AbaBolsao({ clienteId }: { clienteId: string }) {
  const [movimentos, setMovimentos] = useState<MovimentoBolsao[]>([]);
  const [loading, setLoading] = useState(true);

  const [usarOpen, setUsarOpen] = useState(false);
  const [usarValor, setUsarValor] = useState("");
  const [usarDescricao, setUsarDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("bolsao")
      .select("id, created_at, pedido_id, tipo, valor, descricao, pedidos(numero_pedido)")
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar bolsão: " + error.message);
      setLoading(false);
      return;
    }

    setMovimentos(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).map((b: any) => ({
        id: b.id,
        created_at: b.created_at,
        pedido_id: b.pedido_id,
        numero_pedido: b.pedidos?.numero_pedido ?? null,
        tipo: b.tipo,
        valor: Number(b.valor),
        descricao: b.descricao,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    carregar();
  }, [clienteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const { gerado, usado, saldo } = useMemo(() => {
    let gerado = 0;
    let usado = 0;
    movimentos.forEach((m) => {
      if (m.tipo === "gerado") gerado += m.valor;
      else if (m.tipo === "usado") usado += m.valor;
    });
    return { gerado, usado, saldo: gerado - usado };
  }, [movimentos]);

  const usarBolsao = async () => {
    const valorNum = Number(usarValor.replace(",", "."));
    if (!valorNum || valorNum <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    if (valorNum > saldo) {
      toast.error("Valor maior que o saldo disponível");
      return;
    }
    setSalvando(true);
    const { error } = await supabase.from("bolsao").insert({
      cliente_id: clienteId,
      valor: valorNum,
      tipo: "usado",
      descricao: usarDescricao.trim() || null,
    });
    setSalvando(false);
    if (error) {
      toast.error("Erro ao usar bolsão: " + error.message);
      return;
    }
    toast.success("Bolsão utilizado");
    setUsarOpen(false);
    setUsarValor("");
    setUsarDescricao("");
    carregar();
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cards de saldo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-green-300 bg-green-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-800">Saldo atual</CardTitle>
            <Wallet className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{formatBRL(saldo)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total gerado</CardTitle>
            <ArrowDownCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(gerado)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total usado</CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(usado)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setUsarOpen(true)} disabled={saldo <= 0}>
          <Wallet className="h-4 w-4 mr-1" /> Usar bolsão
        </Button>
      </div>

      {/* Histórico */}
      {movimentos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhuma movimentação de bolsão registrada
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Descrição</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movimentos.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-sm">{m.created_at ? formatDate(m.created_at) : "—"}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {m.numero_pedido ? `#${m.numero_pedido}` : "—"}
                  </TableCell>
                  <TableCell>
                    {m.tipo === "gerado" ? (
                      <Badge className="bg-green-100 text-green-800 border-green-300">Gerado</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">Usado</Badge>
                    )}
                  </TableCell>
                  <TableCell className={`text-right font-semibold ${m.tipo === "gerado" ? "text-green-700" : "text-orange-700"}`}>
                    {m.tipo === "gerado" ? "+" : "−"}{formatBRL(m.valor)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.descricao ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modal: usar bolsão */}
      <Dialog open={usarOpen} onOpenChange={setUsarOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Usar bolsão</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Saldo disponível: <strong className="text-green-700">{formatBRL(saldo)}</strong>
            </p>
            <div className="space-y-1.5">
              <Label>Valor a usar (R$)</Label>
              <Input
                inputMode="decimal"
                value={usarValor}
                onChange={(e) => setUsarValor(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                rows={3}
                value={usarDescricao}
                onChange={(e) => setUsarDescricao(e.target.value)}
                placeholder="Ex.: bonificação aplicada no pedido..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUsarOpen(false)}>Cancelar</Button>
            <Button onClick={usarBolsao} disabled={salvando}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar uso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
