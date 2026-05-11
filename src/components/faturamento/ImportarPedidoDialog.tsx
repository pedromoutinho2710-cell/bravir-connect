import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatBRL, formatCNPJ } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Upload, AlertCircle } from "lucide-react";

type ProdutoRow = {
  codigo_jiva: string;
  quantidade: number;
  preco_bruto: number;
  desconto_perfil: number;   // decimal, ex: 0.25
  desconto_comercial: number; // percentual, ex: 2
  desconto_trade: number;     // percentual, ex: 5
  // calculados
  preco_apos_perfil: number;
  preco_final: number;
  total: number;
  // resolvidos
  produto_id: string | null;
  nome: string;
};

type ClienteInfo = {
  id: string;
  razao_social: string;
  cnpj: string;
  cluster: string;
  vendedor_id: string;
};

type DadosExcel = {
  codigo_cliente: string;
  cond_pagamento: string;
  agendamento: boolean;
  observacoes: string;
  tabela_preco: string;
  produtos: ProdutoRow[];
};

function calcularLinhas(rows: ProdutoRow[]) {
  return rows.map((r) => {
    const preco_apos_perfil = r.preco_bruto * (1 - r.desconto_perfil - r.desconto_comercial / 100);
    const preco_final = preco_apos_perfil * (1 - r.desconto_trade / 100);
    return { ...r, preco_apos_perfil, preco_final, total: preco_final * r.quantidade };
  });
}

export default function ImportarPedidoDialog({
  open, onOpenChange, onImportado,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImportado: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [dados, setDados] = useState<DadosExcel | null>(null);
  const [cliente, setCliente] = useState<ClienteInfo | null>(null);
  const [erroCliente, setErroCliente] = useState<string | null>(null);
  const [condPag, setCondPag] = useState("");
  const [obs, setObs] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  function reset() {
    setStep(1);
    setDados(null);
    setCliente(null);
    setErroCliente(null);
    setCondPag("");
    setObs("");
    setCarregando(false);
    setSalvando(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCarregando(true);
    setErroCliente(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // aoa = array of arrays, 0-indexed
      const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

      const cel = (row: number, col: number): string =>
        String(aoa[row]?.[col] ?? "").trim();

      const tabelaRaw = cel(1, 7); // H2
      const tabela_preco = (tabelaRaw.match(/\d+|suframa/i) ?? [""])[0].toLowerCase();
      const codigo_cliente = cel(2, 14); // O3
      const cond_pagamento = cel(4, 14); // O5

      // Agendamento: linha 12 (índice 11), coluna F (índice 5)
      const agendamento = cel(11, 5).toUpperCase().includes("SIM");

      const observacoes = cel(11, 12); // M12

      // Produtos: linha 19 em diante (índice 18)
      const rawProdutos: ProdutoRow[] = [];
      for (let i = 18; i < aoa.length; i++) {
        const row = aoa[i] as unknown[];
        const cod = String(row?.[2] ?? "").trim(); // C
        if (!cod) break;
        const quantidade = Number(row?.[5] ?? 0);   // F
        const preco_bruto = Number(row?.[8] ?? 0);  // I
        const dPerfilRaw = Number(row?.[9] ?? 0);   // J — decimal
        const dComRaw = Number(row?.[10] ?? 0);     // K — decimal → converter pra %
        const dTradeRaw = Number(row?.[12] ?? 0);   // M — decimal → converter pra %
        if (!quantidade || quantidade <= 0) continue;
        rawProdutos.push({
          codigo_jiva: cod,
          quantidade,
          preco_bruto,
          desconto_perfil: dPerfilRaw,
          desconto_comercial: dComRaw * 100,
          desconto_trade: dTradeRaw * 100,
          preco_apos_perfil: 0,
          preco_final: 0,
          total: 0,
          produto_id: null,
          nome: "",
        });
      }

      if (rawProdutos.length === 0) {
        toast.error("Nenhum produto encontrado na planilha.");
        return;
      }

      // Buscar produtos pelo codigo_jiva
      const codigos = rawProdutos.map((r) => r.codigo_jiva);
      const { data: prodData } = await supabase
        .from("produtos")
        .select("id, codigo_jiva, nome")
        .in("codigo_jiva", codigos);

      const prodMap: Record<string, { id: string; nome: string }> = {};
      (prodData ?? []).forEach((p) => { prodMap[p.codigo_jiva] = { id: p.id, nome: p.nome }; });

      const produtosResolvidos = calcularLinhas(
        rawProdutos.map((r) => ({
          ...r,
          produto_id: prodMap[r.codigo_jiva]?.id ?? null,
          nome: prodMap[r.codigo_jiva]?.nome ?? "— produto não encontrado —",
        }))
      );

      const dadosExtraidos: DadosExcel = {
        codigo_cliente,
        cond_pagamento,
        agendamento,
        observacoes,
        tabela_preco,
        produtos: produtosResolvidos,
      };

      // Buscar cliente
      if (!codigo_cliente) {
        setErroCliente("Código do cliente não encontrado na planilha (célula N4).");
        setDados(dadosExtraidos);
        setCondPag(cond_pagamento);
        setObs(observacoes);
        setStep(2);
        return;
      }

      const { data: clData } = await supabase
        .from("clientes")
        .select("id, razao_social, cnpj, cluster, vendedor_id")
        .eq("codigo_cliente", codigo_cliente)
        .maybeSingle();

      if (!clData) {
        setErroCliente(`Cliente com código "${codigo_cliente}" não encontrado. Cadastre antes de importar.`);
      } else {
        setCliente({ ...clData, cluster: clData.cluster ?? "" });
      }

      setDados(dadosExtraidos);
      setCondPag(cond_pagamento);
      setObs(observacoes);
      setStep(2);
    } catch {
      toast.error("Erro ao ler o arquivo. Verifique se é um .xlsx válido.");
    } finally {
      setCarregando(false);
    }
  }

  async function criarPedido() {
    if (!dados || !cliente) return;
    const produtosInvalidos = dados.produtos.filter((p) => !p.produto_id);
    if (produtosInvalidos.length > 0) {
      toast.error(`${produtosInvalidos.length} produto(s) não encontrado(s). Corrija antes de importar.`);
      return;
    }
    setSalvando(true);
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      const { data: pedData, error: pedErr } = await supabase
        .from("pedidos")
        .insert({
          cliente_id: cliente.id,
          vendedor_id: cliente.vendedor_id,
          status: "aguardando_faturamento",
          tipo: "Pedido",
          data_pedido: hoje,
          cond_pagamento: condPag || null,
          observacoes: obs || null,
          agendamento: dados.agendamento,
          vigencia_id: null,
          perfil_cliente: cliente.cluster,
          tabela_preco: dados.tabela_preco,
        })
        .select("id")
        .single();

      if (pedErr || !pedData) {
        toast.error("Erro ao criar pedido: " + pedErr?.message);
        return;
      }

      const itensPayload = dados.produtos.map((p) => ({
        pedido_id: pedData.id,
        produto_id: p.produto_id!,
        quantidade: p.quantidade,
        preco_unitario_bruto: p.preco_bruto,
        preco_unitario_liquido: p.preco_final,
        desconto_perfil: p.desconto_perfil,
        desconto_comercial: p.desconto_comercial,
        desconto_trade: p.desconto_trade,
        preco_apos_perfil: p.preco_apos_perfil,
        preco_apos_comercial: p.preco_apos_perfil,
        preco_final: p.preco_final,
        total_item: p.total,
      }));

      const { error: itErr } = await supabase.from("itens_pedido").insert(itensPayload);
      if (itErr) {
        toast.error("Erro ao inserir itens: " + itErr.message);
        return;
      }

      toast.success("Pedido importado com sucesso!");
      handleClose(false);
      onImportado();
    } finally {
      setSalvando(false);
    }
  }

  const totalPedido = dados?.produtos.reduce((s, p) => s + p.total, 0) ?? 0;
  const temInvalido = dados?.produtos.some((p) => !p.produto_id) ?? false;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Pedido via Excel</DialogTitle>
        </DialogHeader>

        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Selecione o arquivo .xlsx no formato do formulário de pedido Bravir.
            </p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="file-import">Arquivo Excel (.xlsx)</Label>
              <Input
                id="file-import"
                type="file"
                accept=".xlsx"
                ref={fileRef}
                onChange={handleFile}
                disabled={carregando}
              />
            </div>
            {carregando && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Lendo planilha…
              </div>
            )}
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && dados && (
          <div className="space-y-5 py-2">
            {/* Erro cliente */}
            {erroCliente && (
              <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                {erroCliente}
              </div>
            )}

            {/* Card cliente */}
            {cliente && (
              <div className="rounded-md border p-3 text-sm space-y-1">
                <div className="font-semibold">{cliente.razao_social}</div>
                <div className="text-muted-foreground">{formatCNPJ(cliente.cnpj)}</div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>Cluster: <span className="font-medium text-foreground">{cliente.cluster || "—"}</span></span>
                  <span>Tabela: <span className="font-medium text-foreground">{dados.tabela_preco || "—"}</span></span>
                  <span>Agendamento: <span className="font-medium text-foreground">{dados.agendamento ? "Sim" : "Não"}</span></span>
                </div>
              </div>
            )}

            {/* Campos editáveis */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Cond. Pagamento</Label>
                <Input value={condPag} onChange={(e) => setCondPag(e.target.value)} placeholder="Ex: 30/60/90 dias" />
              </div>
              <div className="space-y-1">
                <Label>Observações</Label>
                <Textarea
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  rows={2}
                  placeholder="Observações do pedido"
                />
              </div>
            </div>

            {/* Tabela produtos */}
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Bruto</TableHead>
                    <TableHead className="text-right">Cluster</TableHead>
                    <TableHead className="text-right">Adic.</TableHead>
                    <TableHead className="text-right">Trade</TableHead>
                    <TableHead className="text-right">Liq.</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.produtos.map((p, i) => (
                    <TableRow key={i} className={!p.produto_id ? "bg-red-50" : ""}>
                      <TableCell className="font-mono text-xs">{p.codigo_jiva}</TableCell>
                      <TableCell className={`text-xs ${!p.produto_id ? "text-red-700 font-medium" : ""}`}>
                        {p.nome}
                      </TableCell>
                      <TableCell className="text-right text-xs">{p.quantidade}</TableCell>
                      <TableCell className="text-right text-xs">{formatBRL(p.preco_bruto)}</TableCell>
                      <TableCell className="text-right text-xs">{(p.desconto_perfil * 100).toFixed(2)}%</TableCell>
                      <TableCell className="text-right text-xs">{p.desconto_comercial.toFixed(1)}%</TableCell>
                      <TableCell className="text-right text-xs">{p.desconto_trade.toFixed(1)}%</TableCell>
                      <TableCell className="text-right text-xs">{formatBRL(p.preco_final)}</TableCell>
                      <TableCell className="text-right text-xs font-medium">{formatBRL(p.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">{dados.produtos.length} iten(s)</span>
              <span className="font-bold">Total: {formatBRL(totalPedido)}</span>
            </div>

            {temInvalido && (
              <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                Alguns produtos (em vermelho) não foram encontrados pelo código Jiva. O pedido não pode ser criado até que todos os produtos sejam resolvidos.
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
          {step === 2 && (
            <Button
              onClick={criarPedido}
              disabled={salvando || !cliente || temInvalido}
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Criar Pedido
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
