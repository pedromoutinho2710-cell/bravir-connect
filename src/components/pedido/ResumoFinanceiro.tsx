import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBRL, formatNum } from "@/lib/format";
import type { ItemPedido } from "./SecaoProdutos";

type Props = {
  itens: ItemPedido[];
  uf: string;
  saldoBolsao?: number;
};

function icmsPct(uf: string): number {
  if (uf === "MG") return 0.18;
  if (["SP", "RJ", "RS", "SC", "PR"].includes(uf)) return 0.12;
  return 0.07;
}

export function ResumoFinanceiro({ itens, uf, saldoBolsao = 0 }: Props) {
  const qtdTotal = itens.reduce((s, i) => s + i.quantidade, 0);
  const pesoTotal = itens.reduce((s, i) => s + i.quantidade * i.peso_unitario, 0);
  const totalBruto = itens.reduce((s, i) => s + i.preco_bruto * i.quantidade, 0);
  const totalLiquido = itens.reduce((s, i) => s + i.total, 0);
  const descTotal = totalBruto - totalLiquido;

  const pct = icmsPct(uf);
  const icmsValue = totalLiquido * pct;
  const totalComIcms = totalLiquido + icmsValue;

  const bolsaoGasto = itens.reduce((s, i) => s + (i.bolsao ?? 0), 0);
  const bolsaoSaldo = saldoBolsao - bolsaoGasto;
  const mostrarBolsao = saldoBolsao > 0 || bolsaoGasto > 0;

  return (
    <Card className="bg-[#FFF7ED] border-orange-200">
      <CardHeader>
        <CardTitle>Resumo financeiro</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {saldoBolsao > 0 && (
          <div className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 font-medium">
            Cliente tem {formatBRL(saldoBolsao)} de bolsão disponível
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
              label={`ICMS ${uf || "—"} (${(pct * 100).toFixed(0)}%)`}
              value={`+ ${formatBRL(icmsValue)}`}
              muted
            />
            <div className="my-2 border-t" />
            <Linha label="Total c/ imposto" value={formatBRL(totalComIcms)} bold />
            <p className="pt-2 text-xs text-muted-foreground">
              Estimativa — alíquota varia por NCM. Selecione a UF do cliente para cálculo correto.
            </p>
          </TabsContent>
        </Tabs>

        {mostrarBolsao && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bolsão</div>
            <div className="grid grid-cols-3 gap-2 text-sm text-center">
              <div>
                <div className="text-muted-foreground text-xs mb-0.5">Gerado</div>
                <div className="font-semibold">{formatBRL(saldoBolsao)}</div>
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
