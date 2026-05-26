import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, X, Copy, Check } from "lucide-react";

type Props = {
  pedidoId: string;
  pedidoNumero: number;
  clienteId: string;
  clienteNome: string;
  condPagamento: string | null;
  open: boolean;
  onClose: () => void;
};

type Produto = { id: string; nome: string; marca: string | null };

export function GerarPropostaDialog({
  pedidoId,
  pedidoNumero,
  clienteId,
  clienteNome,
  condPagamento,
  open,
  onClose,
}: Props) {
  const { user } = useAuth();
  const [validadeHoras, setValidadeHoras] = useState<24 | 48 | 72>(48);
  const [descontoAvista, setDescontoAvista] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<Produto[]>([]);
  const [produtoSelecionado, setProdutoSelecionado] = useState<Produto | null>(null);
  const [orderBumpDesconto, setOrderBumpDesconto] = useState("");
  const [orderBumpQtd, setOrderBumpQtd] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [linkGerado, setLinkGerado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!open) {
      setValidadeHoras(48);
      setDescontoAvista("");
      setMensagem("");
      setBusca("");
      setResultados([]);
      setProdutoSelecionado(null);
      setOrderBumpDesconto("");
      setOrderBumpQtd("");
      setLinkGerado(null);
      setCopiado(false);
    }
  }, [open]);

  useEffect(() => {
    if (produtoSelecionado) return;
    const termo = busca.trim();
    if (termo.length < 2) {
      setResultados([]);
      return;
    }
    const handler = setTimeout(async () => {
      const { data } = await supabase
        .from("produtos")
        .select("id, nome, marca")
        .eq("ativo", true)
        .ilike("nome", `%${termo}%`)
        .limit(8);
      setResultados((data ?? []) as Produto[]);
    }, 250);
    return () => clearTimeout(handler);
  }, [busca, produtoSelecionado]);

  const gerar = async () => {
    if (!user) return;
    setSalvando(true);
    try {
      const validade_em = new Date(Date.now() + validadeHoras * 60 * 60 * 1000).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("propostas" as any) as any)
        .insert({
          pedido_id: pedidoId,
          cliente_id: clienteId,
          vendedor_id: user.id,
          mensagem: mensagem.trim() || null,
          validade_em,
          desconto_avista: Number(descontoAvista) || 0,
          order_bump_produto_id: produtoSelecionado?.id || null,
          order_bump_desconto: Number(orderBumpDesconto) || 0,
          order_bump_quantidade: Number(orderBumpQtd) || 0,
          status: "pendente",
        })
        .select("token")
        .single();

      if (error) {
        toast.error("Erro ao gerar proposta");
        return;
      }
      const token = data?.token;
      if (!token) {
        toast.error("Token da proposta não retornado");
        return;
      }
      const link = `${window.location.origin}/proposta/${token}`;
      setLinkGerado(link);
      toast.success("Proposta gerada com sucesso!");
    } finally {
      setSalvando(false);
    }
  };

  const copiar = async () => {
    if (!linkGerado) return;
    try {
      await navigator.clipboard.writeText(linkGerado);
      setCopiado(true);
      toast.success("Link copiado");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerar proposta — Pedido #{pedidoNumero}</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {clienteNome}
            {condPagamento ? ` · ${condPagamento}` : ""}
          </p>
        </DialogHeader>

        {linkGerado ? (
          <div className="space-y-4">
            <div>
              <Label>Link da proposta</Label>
              <div className="flex gap-2 mt-1.5">
                <Input value={linkGerado} readOnly className="font-mono text-xs" />
                <Button type="button" variant="outline" onClick={copiar}>
                  {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>Fechar</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Validade</Label>
              <div className="flex gap-2 mt-1.5">
                {([24, 48, 72] as const).map((h) => (
                  <Button
                    key={h}
                    type="button"
                    variant={validadeHoras === h ? "default" : "outline"}
                    onClick={() => setValidadeHoras(h)}
                    className={validadeHoras === h ? "bg-[#004d1a] hover:bg-[#003d14] text-white" : ""}
                  >
                    {h}h
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="desconto-avista">Desconto à vista</Label>
              <div className="relative mt-1.5">
                <Input
                  id="desconto-avista"
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={descontoAvista}
                  onChange={(e) => setDescontoAvista(e.target.value)}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
            </div>

            <div>
              <Label htmlFor="mensagem">Mensagem personalizada</Label>
              <Textarea
                id="mensagem"
                placeholder="Ex: Oi João, segue proposta..."
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                className="mt-1.5"
                rows={3}
              />
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">Order bump (opcional)</p>

              <div className="relative">
                <Label>Produto</Label>
                {produtoSelecionado ? (
                  <div className="flex items-center justify-between gap-2 mt-1.5 rounded-md border bg-muted/50 px-3 py-2">
                    <div className="text-sm">
                      <div className="font-medium">{produtoSelecionado.nome}</div>
                      {produtoSelecionado.marca && (
                        <div className="text-xs text-muted-foreground">{produtoSelecionado.marca}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setProdutoSelecionado(null); setBusca(""); }}
                      className="p-1 hover:bg-muted rounded"
                      title="Limpar"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Input
                      placeholder="Buscar produto…"
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      className="mt-1.5"
                    />
                    {resultados.length > 0 && (
                      <div className="mt-1 rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
                        {resultados.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => { setProdutoSelecionado(p); setResultados([]); setBusca(""); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-accent border-b last:border-b-0"
                          >
                            <div className="font-medium">{p.nome}</div>
                            {p.marca && <div className="text-xs text-muted-foreground">{p.marca}</div>}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="ob-desconto">Desconto</Label>
                  <div className="relative mt-1.5">
                    <Input
                      id="ob-desconto"
                      type="number"
                      inputMode="decimal"
                      placeholder="0"
                      value={orderBumpDesconto}
                      onChange={(e) => setOrderBumpDesconto(e.target.value)}
                      className="pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                </div>
                <div>
                  <Label htmlFor="ob-qtd">Quantidade</Label>
                  <div className="relative mt-1.5">
                    <Input
                      id="ob-qtd"
                      type="number"
                      inputMode="numeric"
                      placeholder="0"
                      value={orderBumpQtd}
                      onChange={(e) => setOrderBumpQtd(e.target.value)}
                      className="pr-10"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">un</span>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={salvando}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={gerar}
                disabled={salvando}
                className="bg-[#004d1a] hover:bg-[#003d14] text-white"
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gerar proposta"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
