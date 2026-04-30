import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBRL, formatNum } from "@/lib/format";
import type { ItemPedido } from "./SecaoProdutos";

type Props = { itens: ItemPedido[] };

export function ResumoFinanceiro({ itens }: Props) {
  const qtdTotal = itens.reduce((s, i) => s + i.quantidade, 0);
  const pesoTotal = itens.reduce((s, i) => s + i.quantidade * i.peso_unitario, 0);
  const totalBruto = itens.reduce((s, i) => s + i.preco_bruto * i.quantidade, 0);
  const totalLiquido = itens.reduce((s, i) => s + i.total, 0);
  const descTotal = totalBruto - totalLiquido;

  const icms = totalLiquido * 0.12;
  const pis = totalLiquido * 0.0065;
  const cofins = totalLiquido * 0.03;
  const totalImp = totalLiquido + icms + pis + cofins;

  return (
    <Card className="bg-[#FFF7ED] border-orange-200">
      <CardHeader>
        <CardTitle>Resumo financeiro</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="sem">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="sem">Sem impostos</TabsTrigger>
            <TabsTrigger value="com">Com impostos</TabsTrigger>
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
            <Linha label="Total líquido" value={formatBRL(totalLiquido)} />
            <Linha label="ICMS (12%)" value={formatBRL(icms)} muted />
            <Linha label="PIS (0,65%)" value={formatBRL(pis)} muted />
            <Linha label="COFINS (3%)" value={formatBRL(cofins)} muted />
            <div className="my-2 border-t" />
            <Linha label="Total com impostos" value={formatBRL(totalImp)} bold />
            <p className="pt-2 text-xs text-muted-foreground">
              Estimativa — alíquotas variam por UF e NCM.
            </p>
          </TabsContent>
        </Tabs>
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
