import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { formatBRL, formatNum } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ItemPedido } from "./SecaoProdutos";

// Desconto à vista máximo permitido (%)
const MAX_DESCONTO_VISTA = 5;

type Props = {
  itens: ItemPedido[];
  uf: string;
  isPDF?: boolean;
  suframa?: boolean;
  tabela_preco?: string;
  clienteId?: string;
  tipoPedido?: string;
  descontoVista?: number;
  onDescontoVistaChange?: (value: number) => void;
};

function icmsPct(uf: string): number {
  if (uf === "MG") return 0.18;
  if (["SP", "RJ", "RS", "SC", "PR"].includes(uf)) return 0.12;
  return 0.07;
}

function resolveIcms(uf: string, suframa?: boolean, tabela_preco?: string): number {
  if (suframa) return 0;
  if (tabela_preco !== undefined) {
    if (tabela_preco === "7") return 0.07;
    if (tabela_preco === "12") return 0.12;
    if (tabela_preco === "18") return 0.18;
    return 0.12;
  }
  return icmsPct(uf);
}

export function ResumoFinanceiro({ itens, uf, isPDF = false, suframa, tabela_preco, clienteId, tipoPedido, descontoVista, onDescontoVistaChange }: Props) {
  const [bolsaoPct, setBolsaoPct] = useState(1.0);
  // Desconto à vista: controlado por prop quando informada; caso contrário, estado interno.
  const [descontoVistaInterno, setDescontoVistaInterno] = useState(0);
  const descontoVistaValor = descontoVista ?? descontoVistaInterno;

  const setDescontoVista = (raw: number) => {
    let valor = Number.isFinite(raw) ? Math.max(0, raw) : 0;
    if (valor > MAX_DESCONTO_VISTA) {
      valor = MAX_DESCONTO_VISTA;
      toast.warning(`Desconto à vista máximo é ${MAX_DESCONTO_VISTA}%.`);
    }
    if (onDescontoVistaChange) onDescontoVistaChange(valor);
    else setDescontoVistaInterno(valor);
  };
  // Saldo de bolsão do cliente (gerado - usado), usado em pedidos de bonificação
  const [saldoBolsaoCliente, setSaldoBolsaoCliente] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("configuracoes")
      .select("value")
      .eq("key", "bolsao_percentual")
      .maybeSingle()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }: { data: any }) => {
        if (data?.value) setBolsaoPct(Number(data.value));
      });
  }, []);

  useEffect(() => {
    if (tipoPedido !== "Bonificação" || !clienteId) {
      setSaldoBolsaoCliente(null);
      return;
    }
    supabase
      .from("bolsao")
      .select("tipo, valor")
      .eq("cliente_id", clienteId)
      .then(({ data }) => {
        if (!data) { setSaldoBolsaoCliente(null); return; }
        const saldo = data.reduce(
          (s, r) => s + (r.tipo === "usado" ? -Number(r.valor) : Number(r.valor)),
          0,
        );
        setSaldoBolsaoCliente(saldo);
      });
  }, [tipoPedido, clienteId]);

  const qtdTotal = itens.reduce((s, i) => s + i.quantidade, 0);
  const pesoTotal = itens.reduce((s, i) => s + i.quantidade * i.peso_unitario, 0);
  const totalBruto = itens.reduce((s, i) => s + i.preco_bruto * i.quantidade, 0);
  const totalLiquido = itens.reduce((s, i) => s + i.total, 0);
  const descTotal = totalBruto - totalLiquido;

  const pct = resolveIcms(uf, suframa, tabela_preco);
  const icmsValue = totalLiquido * pct;
  const totalComIcms = totalLiquido + icmsValue;

  const descontoVistaValueBRL = totalLiquido * (descontoVistaValor / 100);
  const totalComDescontoVista = totalLiquido - descontoVistaValueBRL;

  const bolsaoGerado = totalLiquido * (bolsaoPct / 100);
  const bolsaoGasto = itens.reduce((s, i) => s + (i.bolsao ?? 0), 0);
  const bolsaoSaldo = bolsaoGerado - bolsaoGasto;

  return (
    <Card className="bg-[#FFF7ED] border-orange-200">
      <CardHeader>
        <CardTitle>Resumo financeiro</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {tipoPedido === "Bonificação" && saldoBolsaoCliente !== null && saldoBolsaoCliente > 0 && (
          <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm">
            <div className="font-semibold text-green-800">
              Saldo de bolsão disponível: {formatBRL(saldoBolsaoCliente)}
            </div>
            {totalLiquido > saldoBolsaoCliente && (
              <div className="mt-1 font-medium text-red-600">
                Saldo insuficiente — faltam {formatBRL(totalLiquido - saldoBolsaoCliente)}
              </div>
            )}
          </div>
        )}
        <Tabs defaultValue="sem">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="sem">Sem impostos</TabsTrigger>
            <TabsTrigger value="com">Com ICMS</TabsTrigger>
          </TabsList>

          <TabsContent value="sem" className="space-y-2 pt-4">
            <Linha label="Total de itens" value={String(qtdTotal)} />
            <Linha label="Peso total (kg)" value={formatNum(pesoTotal, 3)} />
            <Linha label="Total bruto" value={formatBRL(totalBruto)} />
            <Linha label="Desconto total" value={`- ${formatBRL(descTotal)}`} muted />
            <div className="my-2 border-t" />
            <Linha label="Total líquido" value={formatBRL(totalLiquido)} bold />
          </TabsContent>

          <TabsContent value="com" className="space-y-2 pt-4">
            <Linha label="Subtotal s/ imposto" value={formatBRL(totalLiquido)} />
            <Linha
              label={suframa ? `ICMS — Suframa (isento)` : `ICMS ${uf || "—"} (${(pct * 100).toFixed(0)}%)`}
              value={suframa ? formatBRL(0) : `+ ${formatBRL(icmsValue)}`}
              muted
            />
            <div className="my-2 border-t" />
            <Linha label="Total c/ imposto" value={formatBRL(totalComIcms)} bold />
            <p className="pt-2 text-xs text-muted-foreground">
              Estimativa — alíquota varia por NCM. Selecione a UF do cliente para cálculo correto.
            </p>
          </TabsContent>
        </Tabs>

        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Desconto à vista (%)
            </label>
            {isPDF ? (
              <span className="text-sm font-medium">{formatNum(descontoVistaValor, 2)}%</span>
            ) : (
              <Input
                type="number"
                min={0}
                max={MAX_DESCONTO_VISTA}
                step={0.01}
                value={descontoVistaValor || ""}
                onChange={(e) => setDescontoVista(parseFloat(e.target.value) || 0)}
                onFocus={(e) => e.target.select()}
                placeholder="0"
                className="w-24 h-8 text-sm text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            )}
          </div>
          {descontoVistaValor > 0 && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Desconto à vista</span>
                <span className="font-medium text-red-600">- {formatBRL(descontoVistaValueBRL)}</span>
              </div>
              <div className="flex justify-between text-base font-bold">
                <span>Total com desconto à vista</span>
                <span className="text-green-700">{formatBRL(totalComDescontoVista)}</span>
              </div>
            </>
          )}
        </div>

        {!isPDF && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2 no-print">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Bolsão do pedido ({bolsaoPct}%)
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm text-center">
              <div>
                <div className="text-muted-foreground text-xs mb-0.5">Gerado</div>
                <div className="font-semibold">{formatBRL(bolsaoGerado)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs mb-0.5">Gasto</div>
                <div className="font-semibold">{formatBRL(bolsaoGasto)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs mb-0.5">Saldo</div>
                <div className={`font-semibold ${bolsaoSaldo < 0 ? "text-red-600" : "text-green-700"}`}>
                  {formatBRL(bolsaoSaldo)}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Linha({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? "text-base font-bold" : ""} ${muted ? "text-muted-foreground" : ""}`}>
      <span>{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
