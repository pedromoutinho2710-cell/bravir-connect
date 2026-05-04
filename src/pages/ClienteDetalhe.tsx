import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDate, formatCNPJ, formatCEP } from "@/lib/format";
import { AlertCircle, ArrowLeft, Building2, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { PedidoDetalhesDialog } from "@/components/pedido/PedidoDetalhesDialog";

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_faturamento: "Aguardando faturamento",
  no_sankhya: "Cadastrado no Sankhya",
  faturado: "Faturado",
  parcialmente_faturado: "Parc. faturado",
  com_problema: "Com problema",
  devolvido: "Devolvido",
  cancelado: "Cancelado",
  em_faturamento: "Em faturamento",
  em_cadastro: "Em cadastro",
  pendente: "Pendente",
  em_rota: "Em rota",
  entregue: "Entregue",
  revisao_necessaria: "Revisão necessária",
};

const STATUS_COLOR: Record<string, string> = {
  rascunho: "bg-gray-100 text-gray-600 border-gray-300",
  aguardando_faturamento: "bg-yellow-100 text-yellow-800 border-yellow-300",
  no_sankhya: "bg-blue-100 text-blue-800 border-blue-300",
  faturado: "bg-green-100 text-green-800 border-green-300",
  parcialmente_faturado: "bg-emerald-100 text-emerald-800 border-emerald-300",
  com_problema: "bg-red-100 text-red-800 border-red-300",
  devolvido: "bg-orange-100 text-orange-800 border-orange-300",
  cancelado: "bg-gray-800 text-gray-100 border-gray-700",
  em_faturamento: "bg-blue-100 text-blue-800 border-blue-300",
  em_cadastro: "bg-blue-100 text-blue-800 border-blue-300",
  pendente: "bg-orange-100 text-orange-800 border-orange-300",
  em_rota: "bg-gray-700 text-gray-100 border-gray-800",
  entregue: "bg-lime-100 text-lime-800 border-lime-300",
  revisao_necessaria: "bg-red-100 text-red-800 border-red-300",
};

type ClienteInfo = {
  id: string;
  razao_social: string;
  cnpj: string;
  codigo_parceiro: string | null;
  perfil_cliente: string | null;
  tabela_preco: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  telefone: string | null;
  email: string | null;
  comprador: string | null;
  negativado: boolean;
  aceita_saldo: boolean;
  suframa: string | null;
};

type PedidoLinha = {
  id: string;
  numero_pedido: number;
  tipo: string;
  data_pedido: string;
  status: string;
  total: number;
  marcas: string[];
};

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${className ?? ""}`}>
      {children}
    </span>
  );
}

export default function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [cliente, setCliente] = useState<ClienteInfo | null>(null);
  const [pedidos, setPedidos] = useState<PedidoLinha[]>([]);
  const [loading, setLoading] = useState(true);

  const [detalhesId, setDetalhesId] = useState<string | null>(null);
  const [detalhesOpen, setDetalhesOpen] = useState(false);

  const [filtroStatus, setFiltroStatus] = useState<"todos" | "ativos" | "finalizados">("todos");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    (async () => {
      const [cRes, pRes] = await Promise.all([
        supabase
          .from("clientes")
          .select("id, razao_social, cnpj, codigo_parceiro, perfil_cliente, tabela_preco, cidade, uf, cep, rua, numero, bairro, telefone, email, comprador, negativado, aceita_saldo, suframa")
          .eq("id", id)
          .single(),
        supabase
          .from("pedidos")
          .select("id, numero_pedido, tipo, data_pedido, status, itens_pedido(total_item, produtos(marca))")
          .eq("cliente_id", id)
          .order("data_pedido", { ascending: false })
          .limit(100),
      ]);

      if (cRes.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = cRes.data as any;
        setCliente({
          id: c.id,
          razao_social: c.razao_social,
          cnpj: c.cnpj,
          codigo_parceiro: c.codigo_parceiro,
          perfil_cliente: c.perfil_cliente,
          tabela_preco: c.tabela_preco,
          cidade: c.cidade,
          uf: c.uf,
          cep: c.cep,
          rua: c.rua,
          numero: c.numero,
          bairro: c.bairro,
          telefone: c.telefone,
          email: c.email,
          comprador: c.comprador,
          negativado: c.negativado ?? false,
          aceita_saldo: c.aceita_saldo ?? false,
          suframa: c.suframa,
        });
      }

      if (pRes.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setPedidos((pRes.data as any[]).map((p) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const itens = (p.itens_pedido ?? []) as any[];
          const marcas = [...new Set(itens.map((i) => i.produtos?.marca).filter(Boolean))] as string[];
          return {
            id: p.id,
            numero_pedido: p.numero_pedido,
            tipo: p.tipo,
            data_pedido: p.data_pedido,
            status: p.status,
            total: itens.reduce((s: number, i) => s + Number(i.total_item), 0),
            marcas,
          };
        }));
      }
    })().finally(() => setLoading(false));
  }, [id]);

  const STATUS_ATIVOS = new Set(["aguardando_faturamento", "no_sankhya", "parcialmente_faturado", "com_problema", "em_faturamento", "rascunho"]);
  const STATUS_FINALIZADOS = new Set(["faturado", "devolvido", "cancelado", "entregue"]);

  const pedidosFiltrados = pedidos.filter((p) => {
    if (filtroStatus === "ativos") return STATUS_ATIVOS.has(p.status);
    if (filtroStatus === "finalizados") return STATUS_FINALIZADOS.has(p.status);
    return true;
  });

  const totalGeral = pedidos.filter((p) => p.status === "faturado").reduce((s, p) => s + p.total, 0);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <p className="text-muted-foreground">Cliente não encontrado.</p>
      </div>
    );
  }

  const enderecoPartes = [cliente.rua, cliente.numero ? `nº ${cliente.numero}` : null, cliente.bairro].filter(Boolean);
  const enderecoLinha = enderecoPartes.join(", ");

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <div>
          <h1 className="text-xl font-bold leading-tight">{cliente.razao_social}</h1>
          <p className="text-sm text-muted-foreground font-mono">{formatCNPJ(cliente.cnpj)}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* Coluna esquerda — ficha do cliente */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Ficha do cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow label="Razão social" value={cliente.razao_social} />
              <InfoRow label="CNPJ" value={formatCNPJ(cliente.cnpj)} />
              {cliente.codigo_parceiro && (
                <InfoRow label="Código Sankhya" value={cliente.codigo_parceiro} />
              )}
              <InfoRow label="Perfil" value={cliente.perfil_cliente} />
              <InfoRow label="Tabela de preço" value={cliente.tabela_preco} />
              <InfoRow label="Comprador" value={cliente.comprador} />

              {(cliente.cidade || cliente.uf) && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Localização
                  </span>
                  <span className="text-sm font-medium">
                    {[cliente.cidade, cliente.uf].filter(Boolean).join("/")}
                  </span>
                  {cliente.cep && (
                    <span className="text-xs text-muted-foreground">CEP {formatCEP(cliente.cep)}</span>
                  )}
                  {enderecoLinha && (
                    <span className="text-xs text-muted-foreground">{enderecoLinha}</span>
                  )}
                </div>
              )}

              {cliente.telefone && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Telefone
                  </span>
                  <span className="text-sm font-medium">{cliente.telefone}</span>
                </div>
              )}

              <InfoRow label="E-mail" value={cliente.email} />
              {cliente.suframa && <InfoRow label="Suframa" value={cliente.suframa} />}

              <div className="flex flex-wrap gap-1.5 pt-1">
                {cliente.negativado && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
                    <AlertCircle className="h-3 w-3" /> Negativado
                  </span>
                )}
                {cliente.aceita_saldo && (
                  <span className="inline-flex items-center rounded-full border border-green-300 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                    Aceita saldo
                  </span>
                )}
                {cliente.suframa && (
                  <span className="inline-flex items-center rounded-full border border-purple-300 bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                    Suframa
                  </span>
                )}
              </div>

              {totalGeral > 0 && (
                <div className="rounded-md border bg-muted/40 p-3 mt-2">
                  <div className="text-xs text-muted-foreground">Total faturado (histórico)</div>
                  <div className="text-lg font-bold text-green-700">{formatBRL(totalGeral)}</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Coluna direita — timeline de pedidos */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Pedidos</h2>
            <div className="flex gap-1">
              {(["todos", "ativos", "finalizados"] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filtroStatus === f ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setFiltroStatus(f)}
                >
                  {f === "todos" ? "Todos" : f === "ativos" ? "Em andamento" : "Finalizados"}
                </Button>
              ))}
            </div>
          </div>

          {pedidosFiltrados.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum pedido encontrado</p>
          ) : (
            <div className="space-y-2">
              {pedidosFiltrados.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full text-left rounded-md border bg-background p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => { setDetalhesId(p.id); setDetalhesOpen(true); }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-sm">#{p.numero_pedido}</span>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[p.status] ?? "bg-gray-100 text-gray-700 border-gray-300"}`}>
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(p.data_pedido)} · {p.tipo}
                        {p.marcas.length > 0 && ` · ${p.marcas.join(", ")}`}
                      </div>
                    </div>
                    <span className="font-semibold text-sm text-green-700 whitespace-nowrap">{formatBRL(p.total)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <PedidoDetalhesDialog
        pedidoId={detalhesId}
        open={detalhesOpen}
        onOpenChange={setDetalhesOpen}
      />
    </div>
  );
}
