import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatCNPJ } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Download } from "lucide-react";
import { toast } from "sonner";

type Props = {
  clienteId: string;
  clienteRazaoSocial: string;
  clienteCnpj: string;
  clienteCidade: string | null;
  clienteUf: string | null;
  clienteTabela: string | null;
  clienteCluster: string | null;
  clienteDescontoAdicional: number | null;
};

type Produto = {
  id: string;
  codigo_jiva: string;
  nome: string;
  cx_embarque: number;
  marca: string;
};

type LinhaProduto = Produto & {
  precoFinal: number | null;
};

const ORDEM_MARCAS = ["Bendita Cânfora", "Alivik", "Bravir", "Laby"];
const VERDE = "FF1A5C2A";
const VERDE_HEX = "#1A5C2A";

export function TabelaPrecos({
  clienteId,
  clienteRazaoSocial,
  clienteCnpj,
  clienteCidade,
  clienteUf,
  clienteTabela,
  clienteCluster,
  clienteDescontoAdicional,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [linhas, setLinhas] = useState<LinhaProduto[]>([]);
  const [qtds, setQtds] = useState<Record<string, number>>({});
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoading(true);

      const { data: vig } = await supabase
        .from("tabelas_vigencia")
        .select("id")
        .eq("ativa", true)
        .ilike("nome", "%Junho%")
        .limit(1)
        .maybeSingle();

      const vigenciaId = vig?.id ?? null;

      const { data: prods } = await supabase
        .from("produtos")
        .select("id, codigo_jiva, nome, cx_embarque, marca")
        .eq("ativo", true);

      const produtos = (prods ?? []) as Produto[];

      const precosMap: Record<string, number> = {};
      if (vigenciaId && clienteTabela) {
        const { data: precos } = await supabase
          .from("precos")
          .select("produto_id, preco_bruto")
          .eq("vigencia_id", vigenciaId)
          .eq("tabela", clienteTabela);
        (precos ?? []).forEach((p) => {
          precosMap[p.produto_id] = Number(p.preco_bruto);
        });
      }

      const descontosMap: Record<string, number> = {};
      if (clienteCluster) {
        const { data: descs } = await supabase
          .from("descontos")
          .select("produto_id, percentual_desconto")
          .eq("cluster", clienteCluster);
        (descs ?? []).forEach((d) => {
          descontosMap[d.produto_id] = Number(d.percentual_desconto);
        });
      }

      const { data: itens } = await supabase
        .from("itens_pedido")
        .select("produto_id, preco_final, pedidos!inner(cliente_id)")
        .eq("pedidos.cliente_id", clienteId);

      const historicoMap: Record<string, number> = {};
      ((itens ?? []) as unknown as { produto_id: string; preco_final: number | null }[]).forEach((i) => {
        if (i.preco_final == null) return;
        const v = Number(i.preco_final);
        if (!Number.isFinite(v) || v <= 0) return;
        if (historicoMap[i.produto_id] == null || v < historicoMap[i.produto_id]) {
          historicoMap[i.produto_id] = v;
        }
      });

      const calculadas: LinhaProduto[] = produtos.map((p) => {
        const bruto = precosMap[p.id] ?? 0;
        const descCluster = descontosMap[p.id] ?? 0;
        let precoCluster = bruto * (1 - descCluster);
        if (clienteDescontoAdicional != null) {
          precoCluster = precoCluster * (1 - clienteDescontoAdicional);
        }
        const precoHist = historicoMap[p.id] ?? Infinity;
        const precoFinal = Math.min(precoCluster || Infinity, precoHist);
        return {
          ...p,
          precoFinal: precoFinal === Infinity || precoFinal === 0 ? null : precoFinal,
        };
      });

      calculadas.sort((a, b) => {
        const ia = ORDEM_MARCAS.indexOf(a.marca);
        const ib = ORDEM_MARCAS.indexOf(b.marca);
        const ra = ia === -1 ? ORDEM_MARCAS.length : ia;
        const rb = ib === -1 ? ORDEM_MARCAS.length : ib;
        if (ra !== rb) return ra - rb;
        if (a.marca !== b.marca) return a.marca.localeCompare(b.marca, "pt-BR");
        return a.nome.localeCompare(b.nome, "pt-BR");
      });

      if (!cancelado) {
        setLinhas(calculadas);
        setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [clienteId, clienteTabela, clienteCluster, clienteDescontoAdicional]);

  const grupos = useMemo(() => {
    const map: Record<string, LinhaProduto[]> = {};
    linhas.forEach((l) => {
      if (!map[l.marca]) map[l.marca] = [];
      map[l.marca].push(l);
    });
    const marcas = Object.keys(map).sort((a, b) => {
      const ia = ORDEM_MARCAS.indexOf(a);
      const ib = ORDEM_MARCAS.indexOf(b);
      const ra = ia === -1 ? ORDEM_MARCAS.length : ia;
      const rb = ib === -1 ? ORDEM_MARCAS.length : ib;
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b, "pt-BR");
    });
    return marcas.map((m) => ({ marca: m, itens: map[m] }));
  }, [linhas]);

  const setQtd = (id: string, v: string) => {
    const n = Number(v);
    setQtds((prev) => ({ ...prev, [id]: Number.isFinite(n) && n >= 0 ? n : 0 }));
  };

  const exportar = async () => {
    setExportando(true);
    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet("Tabela de Preços");

      ws.columns = [
        { width: 15 },
        { width: 15 },
        { width: 15 },
        { width: 40 },
        { width: 18 },
        { width: 18 },
      ];

      const response = await fetch("/bravir_logo.png");
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const imageId = workbook.addImage({ buffer: uint8Array as unknown as ExcelJS.Buffer, extension: "png" });
      ws.addImage(imageId, { tl: { col: 0, row: 0 }, br: { col: 3, row: 3 } });
      ws.getRow(1).height = 30;
      ws.getRow(2).height = 30;
      ws.getRow(3).height = 30;

      const agora = new Date();
      const mesAno = agora
        .toLocaleString("pt-BR", { month: "long", year: "numeric" })
        .toUpperCase();

      ws.mergeCells("A4:F4");
      const tituloCell = ws.getCell("A4");
      tituloCell.value = `TABELA DE PREÇOS — ${mesAno}`;
      tituloCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
      tituloCell.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 14 };
      tituloCell.alignment = { horizontal: "center", vertical: "middle" };
      ws.getRow(4).height = 24;

      const cidadeUf = [clienteCidade, clienteUf].filter(Boolean).join(" / ") || "—";
      const hoje = `${String(agora.getDate()).padStart(2, "0")}/${String(agora.getMonth() + 1).padStart(2, "0")}/${agora.getFullYear()}`;
      const infoLinhas: [string, string][] = [
        ["CLIENTE:", clienteRazaoSocial],
        ["CNPJ:", formatCNPJ(clienteCnpj)],
        ["CIDADE / UF:", cidadeUf],
        ["TABELA:", clienteTabela ?? "—"],
        ["DATA:", hoje],
      ];
      infoLinhas.forEach(([label, value], i) => {
        const row = 6 + i;
        const a = ws.getCell(`A${row}`);
        a.value = label;
        a.font = { bold: true };
        ws.getCell(`B${row}`).value = value;
      });

      const cabRow = 12;
      const cabecalhos = [
        "Cód. Jiva",
        "CX de Embarque",
        "Qtd. Pedida",
        "Descrição do Produto",
        "Preço Unitário",
        "Total",
      ];
      cabecalhos.forEach((h, idx) => {
        const cell = ws.getCell(cabRow, idx + 1);
        cell.value = h;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
        cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
        };
      });

      let r = cabRow + 1;
      const dadosInicio = r;
      grupos.forEach((g) => {
        ws.mergeCells(`A${r}:F${r}`);
        const gc = ws.getCell(`A${r}`);
        gc.value = g.marca;
        gc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
        gc.font = { color: { argb: "FFFFFFFF" }, bold: true };
        gc.alignment = { horizontal: "left", vertical: "middle" };
        for (let c = 1; c <= 6; c++) {
          ws.getCell(r, c).border = {
            top: { style: "thin" },
            bottom: { style: "thin" },
            left: { style: "thin" },
            right: { style: "thin" },
          };
        }
        r++;

        g.itens.forEach((it, idx) => {
          const qtd = qtds[it.id] ?? 0;
          const preco = it.precoFinal ?? 0;
          const total = preco * qtd;
          const zebra = idx % 2 === 1;
          const fill = zebra ? "FFF2F2F2" : "FFFFFFFF";

          const cells: Array<{ col: number; val: string | number; fmt?: string; align?: "left" | "right" | "center" }> = [
            { col: 1, val: it.codigo_jiva, align: "left" },
            { col: 2, val: it.cx_embarque, align: "center" },
            { col: 3, val: qtd, align: "center" },
            { col: 4, val: it.nome, align: "left" },
            { col: 5, val: preco, fmt: '"R$"#,##0.00', align: "right" },
            { col: 6, val: total, fmt: '"R$"#,##0.00', align: "right" },
          ];
          cells.forEach(({ col, val, fmt, align }) => {
            const cell = ws.getCell(r, col);
            cell.value = val;
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
            if (fmt) cell.numFmt = fmt;
            cell.alignment = { horizontal: align ?? "left", vertical: "middle" };
            cell.border = {
              top: { style: "thin" },
              bottom: { style: "thin" },
              left: { style: "thin" },
              right: { style: "thin" },
            };
          });
          r++;
        });
      });

      const dadosFim = r - 1;
      const totalGeralRow = r;
      ws.mergeCells(`A${totalGeralRow}:E${totalGeralRow}`);
      const tg = ws.getCell(`A${totalGeralRow}`);
      tg.value = "TOTAL GERAL";
      tg.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
      tg.font = { color: { argb: "FFFFFFFF" }, bold: true };
      tg.alignment = { horizontal: "right", vertical: "middle" };
      const tgVal = ws.getCell(`F${totalGeralRow}`);
      tgVal.value = dadosFim >= dadosInicio ? { formula: `SUM(F${dadosInicio}:F${dadosFim})` } : 0;
      tgVal.numFmt = '"R$"#,##0.00';
      tgVal.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
      tgVal.font = { color: { argb: "FFFFFFFF" }, bold: true };
      tgVal.alignment = { horizontal: "right", vertical: "middle" };
      for (let c = 1; c <= 6; c++) {
        ws.getCell(totalGeralRow, c).border = {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
        };
      }

      const dataStr = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
      const nomeArquivo = `Tabela_Precos_${clienteRazaoSocial.replace(/\s+/g, "")}_${dataStr}.xlsx`;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeArquivo;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro ao exportar: " + msg);
    } finally {
      setExportando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={exportar} disabled={exportando}>
          {exportando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
          Exportar Tabela de Preços
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: VERDE_HEX }} className="text-white">
              <th className="px-3 py-2 text-left font-semibold">Cód. Jiva</th>
              <th className="px-3 py-2 text-left font-semibold">Descrição</th>
              <th className="px-3 py-2 text-center font-semibold">CX Embarque</th>
              <th className="px-3 py-2 text-right font-semibold">Preço Unit.</th>
              <th className="px-3 py-2 text-center font-semibold">Qtd.</th>
              <th className="px-3 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <GrupoLinhas
                key={g.marca}
                marca={g.marca}
                itens={g.itens}
                qtds={qtds}
                onChangeQtd={setQtd}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GrupoLinhas({
  marca,
  itens,
  qtds,
  onChangeQtd,
}: {
  marca: string;
  itens: LinhaProduto[];
  qtds: Record<string, number>;
  onChangeQtd: (id: string, v: string) => void;
}) {
  return (
    <>
      <tr style={{ backgroundColor: VERDE_HEX }} className="text-white">
        <td colSpan={6} className="px-3 py-1.5 font-bold text-sm">
          {marca}
        </td>
      </tr>
      {itens.map((it, idx) => {
        const qtd = qtds[it.id] ?? 0;
        const preco = it.precoFinal;
        const total = preco != null ? preco * qtd : 0;
        return (
          <tr key={it.id} className={idx % 2 === 1 ? "bg-muted/30" : undefined}>
            <td className="px-3 py-1.5 font-mono text-xs">{it.codigo_jiva}</td>
            <td className="px-3 py-1.5">{it.nome}</td>
            <td className="px-3 py-1.5 text-center">{it.cx_embarque}</td>
            <td className="px-3 py-1.5 text-right">{preco != null ? formatBRL(preco) : "—"}</td>
            <td className="px-3 py-1.5 text-center">
              <Input
                type="number"
                min={0}
                value={qtd === 0 ? "" : qtd}
                onChange={(e) => onChangeQtd(it.id, e.target.value)}
                className="h-8 w-20 mx-auto text-center"
              />
            </td>
            <td className="px-3 py-1.5 text-right">
              {preco != null && qtd > 0 ? formatBRL(total) : "—"}
            </td>
          </tr>
        );
      })}
    </>
  );
}
