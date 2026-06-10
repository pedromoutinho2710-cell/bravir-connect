import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { formatBRL, formatDate } from "@/lib/format";
import { STATUS_LABEL, STATUS_COLOR } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Wallet,
  CheckCircle2,
  RefreshCw,
  Banknote,
  Undo2,
  Trash2,
  RotateCcw,
} from "lucide-react";

type PedidoVista = {
  id: string;
  numero_pedido: number;
  data_pedido: string;
  status: string;
  vendedor_id: string | null;
  razao_social: string;
  total: number;
  motivo: string | null;
};

const ABAS = [
  { key: "aguardando", label: "Aguardando pagamento", status: "aguardando_pagamento" },
  { key: "confirmados", label: "Confirmados", status: "pagamento_confirmado" },
  { key: "lixeira", label: "Lixeira", status: "cancelado" },
] as const;

export default function FilaFinanceiro() {
  const { user } = useAuth();
  const [pedidos, setPedidos] = useState<PedidoVista[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [abaAtiva, setAbaAtiva] = useState<string>("aguardando");
  const [busca, setBusca] = useState("");
  const [confirmar, setConfirmar] = useState<PedidoVista | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [devolver, setDevolver] = useState<PedidoVista | null>(null);
  const [motivo, setMotivo] = useState("");
  const [apagar, setApagar] = useState<PedidoVista | null>(null);
  const [acaoLoading, setAcaoLoading] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("pedidos")
      .select(`
        id, numero_pedido, data_pedido, status, vendedor_id, total, motivo,
        clientes(razao_social, nome_parceiro),
        itens_pedido(total_item)
      `)
      .eq("pagamento_vista", true)
      .in("status", ["aguardando_pagamento", "pagamento_confirmado", "cancelado"])
      .order("data_pedido", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar pedidos: " + error.message);
      setLoading(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped: PedidoVista[] = (data ?? []).map((p: any) => {
      const cl = p.clientes;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itens = (p.itens_pedido ?? []) as any[];
      const totalItens = itens.reduce((s, i) => s + Number(i.total_item ?? 0), 0);
      return {
        id: p.id,
        numero_pedido: p.numero_pedido,
        data_pedido: p.data_pedido,
        status: p.status,
        vendedor_id: p.vendedor_id ?? null,
        razao_social: cl?.nome_parceiro || cl?.razao_social || "—",
        total: totalItens > 0 ? totalItens : Number(p.total ?? 0),
        motivo: p.motivo ?? null,
      };
    });

    setPedidos(mapped);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    supabase.from("profiles").select("id, full_name, email").then(({ data }) => {
      if (!data) return;
      const map: Record<string, string> = {};
      data.forEach((p) => { map[p.id] = p.full_name || p.email || "—"; });
      setProfiles(map);
    });
  }, []);

  const confirmarRecebimento = async () => {
    if (!confirmar) return;
    setConfirmando(true);

    const { error: updErr } = await supabase
      .from("pedidos")
      .update({
        status: "pagamento_confirmado",
        status_atualizado_em: new Date().toISOString(),
      })
      .eq("id", confirmar.id);

    if (updErr) {
      toast.error("Erro ao confirmar recebimento: " + updErr.message);
      setConfirmando(false);
      return;
    }

    // Notificar a logística (1 notificação por usuário com role logistica)
    try {
      const { data: logRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "logistica");
      const logIds = (logRoles ?? []).map((r) => r.user_id);
      if (logIds.length > 0) {
        await supabase.from("notificacoes").insert(
          logIds.map((uid) => ({
            destinatario_id: uid,
            destinatario_role: "logistica",
            tipo: "pagamento_confirmado",
            pedido_id: confirmar.id,
            mensagem: `Pagamento confirmado — Pedido #${confirmar.numero_pedido} (${confirmar.razao_social}) liberado para despacho`,
          })),
        );
      }
    } catch { /* best-effort */ }

    toast.success(`Recebimento do pedido #${confirmar.numero_pedido} confirmado — logística notificada`);
    setConfirmar(null);
    setConfirmando(false);
    carregar();
  };

  // Devolver ao vendedor com motivo (mesmo campo `motivo` usado no faturamento)
  const confirmarDevolucao = async () => {
    if (!devolver || !motivo.trim()) { toast.error("Informe o motivo"); return; }
    setAcaoLoading(true);
    const { error } = await supabase
      .from("pedidos")
      .update({
        status: "devolvido",
        motivo: motivo.trim(),
        status_atualizado_em: new Date().toISOString(),
      })
      .eq("id", devolver.id);
    if (error) { setAcaoLoading(false); toast.error("Erro ao devolver: " + error.message); return; }

    if (devolver.vendedor_id) {
      await supabase.from("notificacoes").insert({
        destinatario_id: devolver.vendedor_id,
        destinatario_role: "vendedor",
        tipo: "pedido_devolvido",
        pedido_id: devolver.id,
        mensagem: `Pedido #${devolver.numero_pedido} devolvido: ${motivo.trim()}`,
      });
    }

    setAcaoLoading(false);
    toast.success(`Pedido #${devolver.numero_pedido} devolvido ao vendedor`);
    setDevolver(null);
    setMotivo("");
    carregar();
  };

  // Apagar → cancelado (vai para a Lixeira)
  const confirmarApagar = async () => {
    if (!apagar) return;
    setAcaoLoading(true);
    const { error } = await supabase
      .from("pedidos")
      .update({
        status: "cancelado",
        status_atualizado_em: new Date().toISOString(),
      })
      .eq("id", apagar.id);
    setAcaoLoading(false);
    if (error) { toast.error("Erro ao apagar: " + error.message); return; }
    toast.success(`Pedido #${apagar.numero_pedido} movido para a lixeira`);
    setApagar(null);
    carregar();
  };

  // Restaurar da lixeira → volta para aguardando_pagamento
  const restaurar = async (p: PedidoVista) => {
    setAcaoLoading(true);
    const { error } = await supabase
      .from("pedidos")
      .update({
        status: "aguardando_pagamento",
        motivo: null,
        status_atualizado_em: new Date().toISOString(),
      })
      .eq("id", p.id);
    setAcaoLoading(false);
    if (error) { toast.error("Erro ao restaurar: " + error.message); return; }
    toast.success(`Pedido #${p.numero_pedido} restaurado`);
    carregar();
  };

  const aba = ABAS.find((a) => a.key === abaAtiva) ?? ABAS[0];
  const lista = pedidos
    .filter((p) => p.status === aba.status)
    .filter((p) =>
      !busca.trim() ||
      p.razao_social.toLowerCase().includes(busca.trim().toLowerCase()) ||
      String(p.numero_pedido).includes(busca.trim()),
    );

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6 text-emerald-600" />
            Fila Financeiro — Pagamentos à Vista
          </h1>
          <p className="text-sm text-muted-foreground">
            Confirme o recebimento dos pedidos à vista para liberar o despacho pela logística.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Atualizar
        </Button>
      </div>

      <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
        <TabsList className="grid grid-cols-3 w-full max-w-xl">
          {ABAS.map((a) => {
            const count = pedidos.filter((p) => p.status === a.status).length;
            return (
              <TabsTrigger key={a.key} value={a.key} className="relative">
                {a.label}
                {count > 0 && (
                  <span className="ml-1.5 inline-flex items-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
                    {count}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <div className="mt-4">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por cliente ou nº do pedido..."
            className="max-w-sm"
          />
        </div>

        {ABAS.map((a) => (
          <TabsContent key={a.key} value={a.key} className="mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Carregando...
              </div>
            ) : lista.length === 0 ? (
              <div className="rounded-md border border-dashed py-16 text-center text-muted-foreground">
                {a.key === "aguardando" && "Nenhum pedido aguardando pagamento."}
                {a.key === "confirmados" && "Nenhum pedido confirmado."}
                {a.key === "lixeira" && "Nenhum pedido na lixeira."}
              </div>
            ) : (
              <div className="space-y-3">
                {lista.map((p) => (
                  <Card key={p.id}>
                    <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-sm">#{p.numero_pedido}</span>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[p.status] ?? "bg-gray-100 text-gray-700 border-gray-300"}`}>
                            {STATUS_LABEL[p.status] ?? p.status}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            <Banknote className="h-3 w-3" /> À VISTA
                          </span>
                        </div>
                        <div className="font-semibold">{p.razao_social}</div>
                        <div className="text-sm text-muted-foreground">
                          Vendedor: {p.vendedor_id ? (profiles[p.vendedor_id] ?? "—") : "—"} • {formatDate(p.data_pedido)}
                        </div>
                        {a.key === "lixeira" && p.motivo && (
                          <div className="text-xs text-amber-700">Motivo: {p.motivo}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Valor total</div>
                          <div className="text-lg font-bold text-emerald-700">{formatBRL(p.total)}</div>
                        </div>
                        {p.status === "aguardando_pagamento" && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button
                              className="bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => setConfirmar(p)}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1.5" />
                              Confirmar Recebimento
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => { setDevolver(p); setMotivo(""); }}
                            >
                              <Undo2 className="h-4 w-4 mr-1.5" />
                              Devolver
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => setApagar(p)}
                            >
                              <Trash2 className="h-4 w-4 mr-1.5" />
                              Apagar
                            </Button>
                          </div>
                        )}
                        {a.key === "lixeira" && (
                          <Button
                            variant="outline"
                            onClick={() => restaurar(p)}
                            disabled={acaoLoading}
                          >
                            <RotateCcw className="h-4 w-4 mr-1.5" />
                            Restaurar
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Dialog de confirmação de recebimento */}
      <Dialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar recebimento do pagamento</DialogTitle>
            <DialogDescription>
              {confirmar && (
                <>
                  Pedido <strong>#{confirmar.numero_pedido}</strong> — {confirmar.razao_social}
                  <br />
                  Valor: <strong>{formatBRL(confirmar.total)}</strong>
                  <br />
                  <br />
                  Ao confirmar, o pedido será liberado para despacho e a logística será notificada.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmar(null)} disabled={confirmando}>
              Cancelar
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={confirmarRecebimento} disabled={confirmando}>
              {confirmando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
              Confirmar Recebimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de devolução (motivo) */}
      <Dialog open={!!devolver} onOpenChange={(o) => !o && setDevolver(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Devolver pedido #{devolver?.numero_pedido} ao vendedor</DialogTitle>
            <DialogDescription>
              Informe o motivo da devolução. O vendedor será notificado.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Descreva o motivo…"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDevolver(null)} disabled={acaoLoading}>
              Voltar
            </Button>
            <Button onClick={confirmarDevolucao} disabled={acaoLoading || !motivo.trim()}>
              {acaoLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Undo2 className="h-4 w-4 mr-1.5" />}
              Devolver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de apagar (cancelar) */}
      <Dialog open={!!apagar} onOpenChange={(o) => !o && setApagar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar pedido #{apagar?.numero_pedido}?</DialogTitle>
            <DialogDescription>
              O pedido será cancelado e movido para a lixeira. Você pode restaurá-lo depois.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApagar(null)} disabled={acaoLoading}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarApagar} disabled={acaoLoading}>
              {acaoLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
              Apagar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
