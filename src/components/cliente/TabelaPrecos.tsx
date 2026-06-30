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
  clienteCodigoParceiro?: string | null;
  suframa: boolean | null;
};

type LinhaBase = {
  id: string;
  codigo_jiva: string;
  nome: string;
  cx_embarque: number;
  marca: string;
  ean: string | null;
  precoBruto: number;
  descontoCluster: number;
  ipi: number;
  st: number;
};

type LinhaProduto = LinhaBase & { precoFinal: number | null };

const ORDEM_MARCAS = ["Bendita Cânfora", "Alivik", "Bravir", "Laby"];
const VERDE = "FF006130";

export function TabelaPrecos({
  clienteId,
  clienteRazaoSocial,
  clienteCnpj,
  clienteCidade,
  clienteUf,
  clienteTabela,
  clienteCluster,
  clienteDescontoAdicional: _cda,
  clienteCodigoParceiro,
  suframa: _suframa,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [linhasBase, setLinhasBase] = useState<LinhaBase[]>([]);
  const [precosEspeciais, setPrecosEspeciais] = useState<Record<string, number>>({});
  const [descontoAplicado, setDescontoAplicado] = useState(0);
  const [descontoMaxCluster, setDescontoMaxCluster] = useState(0);
  const [descontoOverride, setDescontoOverride] = useState<Record<string, number>>({});
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
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const vigenciaId = vig?.id ?? null;

      const { data: prods } = await supabase
        .from("produtos")
        .select("id, codigo_jiva, nome, cx_embarque, marca, ean")
        .eq("ativo", true);

      const produtosRaw = (prods ?? []) as Array<{ id: string; codigo_jiva: string; nome: string; cx_embarque: number; marca: string; ean: string | null }>;

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

      const impostosMap: Record<string, { ipi: number; st: number }> = {};
      if (clienteUf && produtosRaw.length > 0) {
        const codigos = produtosRaw.map((p) => p.codigo_jiva);
        const { data: impostos } = await supabase
          .from("impostos_produto")
          .select("codigo_jiva, ipi, st")
          .in("codigo_jiva", codigos)
          .eq("uf", clienteUf);
        (impostos ?? []).forEach((imp) => {
          impostosMap[imp.codigo_jiva] = { ipi: Number(imp.ipi), st: Number(imp.st) };
        });
      }

      const descontosMap: Record<string, number> = {};
      if (clienteCluster) {
        const { data: descontos } = await supabase
          .from("descontos")
          .select("produto_id, percentual_desconto")
          .eq("perfil_cliente", clienteCluster);
        (descontos ?? []).forEach((d) => {
          if (d.produto_id) descontosMap[d.produto_id] = Number(d.percentual_desconto);
        });
      }

      const maxFrac = Object.values(descontosMap).reduce((m, v) => Math.max(m, v), 0);
      const maxPct = Math.round(maxFrac * 10000) / 100;

      const base: LinhaBase[] = produtosRaw.map((p) => ({
        id: p.id,
        codigo_jiva: p.codigo_jiva,
        nome: p.nome,
        cx_embarque: p.cx_embarque ?? 1,
        marca: p.marca ?? "",
        ean: p.ean ?? null,
        precoBruto: precosMap[p.id] ?? 0,
        descontoCluster: descontosMap[p.id] ?? 0,
        ipi: impostosMap[p.codigo_jiva]?.ipi ?? 0,
        st: impostosMap[p.codigo_jiva]?.st ?? 0,
      }));

      base.sort((a, b) => {
        const ia = ORDEM_MARCAS.indexOf(a.marca);
        const ib = ORDEM_MARCAS.indexOf(b.marca);
        const ra = ia === -1 ? ORDEM_MARCAS.length : ia;
        const rb = ib === -1 ? ORDEM_MARCAS.length : ib;
        if (ra !== rb) return ra - rb;
        if (a.marca !== b.marca) return a.marca.localeCompare(b.marca, "pt-BR");
        return a.nome.localeCompare(b.nome, "pt-BR");
      });

      if (!cancelado) {
        setLinhasBase(base);
        setDescontoMaxCluster(maxPct);
        setDescontoAplicado(maxPct);
        setDescontoOverride({});
        setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, [clienteTabela, clienteUf, clienteCluster, clienteCodigoParceiro]);

  useEffect(() => {
    if (linhasBase.length === 0) return;
    let cancelado = false;

    (async () => {
      let parceiro = clienteCodigoParceiro ?? "";
      if (!parceiro && clienteId) {
        const { data: cli } = await supabase
          .from("clientes")
          .select("codigo_parceiro")
          .eq("id", clienteId)
          .maybeSingle();
        parceiro = cli?.codigo_parceiro ?? "";
      }
      if (cancelado || !parceiro) return;

      const { data: especiais } = await supabase
        .from("precos_cliente_produto")
        .select("codigo_produto, preco_unitario")
        .eq("codigo_parceiro", parceiro);

      if (cancelado || !especiais || especiais.length === 0) return;

      const mapa: Record<string, number> = {};
      especiais.forEach((p) => {
        if (p.codigo_produto != null) mapa[p.codigo_produto] = Number(p.preco_unitario);
      });

      const novosEspeciais: Record<string, number> = {};
      linhasBase.forEach((l) => {
        const especial = l.codigo_jiva ? mapa[l.codigo_jiva] : undefined;
        if (especial !== undefined) novosEspeciais[l.id] = especial;
      });
      if (!cancelado) setPrecosEspeciais(novosEspeciais);
    })();
    return () => { cancelado = true; };
  }, [clienteCodigoParceiro, clienteId, linhasBase]);

  const linhas = useMemo<LinhaProduto[]>(() => {
    return linhasBase.map((l) => {
      if (l.precoBruto === 0) return { ...l, precoFinal: null };
      const overridePct = descontoOverride[l.id];
      const dPct = overridePct !== undefined ? overridePct : descontoAplicado;
      const dEfetivo = Math.min(dPct, l.descontoCluster * 100);
      const calculado = l.precoBruto * (1 - dEfetivo / 100);
      const especial = precosEspeciais[l.id] ?? null;
      const precoFinal = especial != null && especial > calculado ? especial : calculado;
      return { ...l, precoFinal };
    });
  }, [linhasBase, precosEspeciais, descontoAplicado, descontoOverride]);

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

  const totaisGerais = useMemo(() => {
    let semST = 0;
    let comST = 0;
    linhas.forEach((l) => {
      const qtd = qtds[l.id] ?? 0;
      if (l.precoFinal == null || qtd <= 0) return;
      const precoComIpi = l.precoFinal * (1 + l.ipi);
      const precoComIpiSt = precoComIpi * (1 + l.st);
      semST += l.precoFinal * qtd;
      comST += precoComIpiSt * qtd;
    });
    return { semST, comST };
  }, [linhas, qtds]);

  const exportar = async () => {
    setExportando(true);
    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet("Tabela de Preços");

      // 11 columns: Cód. Jiva, EAN, CX, Qtd, Descrição, Desc.%, Preço Líq., c/IPI, c/IPI+ST, Total s/ST, Total c/ST
      ws.columns = [
        { width: 14 },
        { width: 16 },
        { width: 10 },
        { width: 10 },
        { width: 40 },
        { width: 12 },
        { width: 18 },
        { width: 18 },
        { width: 18 },
        { width: 18 },
        { width: 18 },
      ];

      const response = await fetch("/bravir_logo.png");
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const imageId = workbook.addImage({ buffer: uint8Array as unknown as ExcelJS.Buffer, extension: "png" });
      ws.addImage(imageId, { tl: { col: 0, row: 0 }, br: { col: 4, row: 3 } });
      ws.getRow(1).height = 30;
      ws.getRow(2).height = 30;
      ws.getRow(3).height = 30;

      const agora = new Date();
      const mesAno = agora.toLocaleString("pt-BR", { month: "long", year: "numeric" }).toUpperCase();

      ws.mergeCells("A4:K4");
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
        ["DESCONTO APLICADO:", `${descontoAplicado.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`],
        ["DATA:", hoje],
      ];
      infoLinhas.forEach(([label, value], i) => {
        const row = 6 + i;
        const a = ws.getCell(`A${row}`);
        a.value = label;
        a.font = { bold: true };
        ws.getCell(`B${row}`).value = value;
      });

      const cabRow = 13;
      const cabecalhos = [
        "Cód. Jiva", "EAN", "CX de Embarque", "Qtd. Pedida",
        "Descrição do Produto", "Desc. %", "Preço Líq. s/ IPI", "Preço c/ IPI",
        "Preço c/ IPI+ST", "Total s/ ST", "Total c/ ST",
      ];
      cabecalhos.forEach((h, idx) => {
        const cell = ws.getCell(cabRow, idx + 1);
        cell.value = h;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
        cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
      });

      let r = cabRow + 1;
      const linhasProduto: number[] = [];
      grupos.forEach((g) => {
        const itensExportar = g.itens.map((it) => {
          const qtdBruta = qtds[it.id] ?? 0;
          const cx = it.cx_embarque > 0 ? it.cx_embarque : 1;
          const qtdExportada = qtdBruta > 0 ? Math.max(cx, Math.round(qtdBruta / cx) * cx) : 0;
          return { it, qtdExportada };
        });

        ws.mergeCells(`A${r}:K${r}`);
        const gc = ws.getCell(`A${r}`);
        gc.value = g.marca;
        gc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
        gc.font = { color: { argb: "FFFFFFFF" }, bold: true };
        gc.alignment = { horizontal: "left", vertical: "middle" };
        for (let c = 1; c <= 11; c++) {
          ws.getCell(r, c).border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
        }
        r++;

        itensExportar.forEach(({ it, qtdExportada: qtd }, idx) => {
          const precoLiq = it.precoFinal ?? 0;
          const precoComIpi = precoLiq * (1 + it.ipi);
          const precoComIpiSt = precoComIpi * (1 + it.st);
          const zebra = idx % 2 === 1;
          const fill = zebra ? "FFF2F2F2" : "FFFFFFFF";
          const rowNum = r;
          const descPct = descontoOverride[it.id] !== undefined
            ? descontoOverride[it.id]
            : descontoAplicado;

          const cells: Array<{ col: number; val: string | number | { formula: string }; fmt?: string; align?: "left" | "right" | "center" }> = [
            { col: 1, val: it.codigo_jiva, align: "left" },
            { col: 2, val: it.ean ?? "—", align: "center" },
            { col: 3, val: it.cx_embarque, align: "center" },
            { col: 4, val: qtd, align: "center" },
            { col: 5, val: it.nome, align: "left" },
            { col: 6, val: `${descPct.toFixed(2)}%`, align: "center" },
            { col: 7, val: precoLiq, fmt: '"R$"#,##0.00', align: "right" },
            { col: 8, val: precoComIpi, fmt: '"R$"#,##0.00', align: "right" },
            { col: 9, val: precoComIpiSt, fmt: '"R$"#,##0.00', align: "right" },
            { col: 10, val: { formula: `D${rowNum}*G${rowNum}` }, fmt: '"R$"#,##0.00', align: "right" },
            { col: 11, val: { formula: `D${rowNum}*I${rowNum}` }, fmt: '"R$"#,##0.00', align: "right" },
          ];
          cells.forEach(({ col, val, fmt, align }) => {
            const cell = ws.getCell(r, col);
            cell.value = val;
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
            if (fmt) cell.numFmt = fmt;
            cell.alignment = { horizontal: align ?? "left", vertical: "middle" };
            cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
          });
          linhasProduto.push(r);
          r++;
        });
      });

      const totalGeralRow = r;
      ws.mergeCells(`A${totalGeralRow}:I${totalGeralRow}`);
      const tg = ws.getCell(`A${totalGeralRow}`);
      tg.value = "TOTAL GERAL";
      tg.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
      tg.font = { color: { argb: "FFFFFFFF" }, bold: true };
      tg.alignment = { horizontal: "right", vertical: "middle" };

      const tgJ = ws.getCell(`J${totalGeralRow}`);
      const tgK = ws.getCell(`K${totalGeralRow}`);
      if (linhasProduto.length > 0) {
        tgJ.value = { formula: `SUM(${linhasProduto.map((n) => `J${n}`).join(",")})` };
        tgK.value = { formula: `SUM(${linhasProduto.map((n) => `K${n}`).join(",")})` };
      } else { tgJ.value = 0; tgK.value = 0; }
      [tgJ, tgK].forEach((cell) => {
        cell.numFmt = '"R$"#,##0.00';
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
        cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
        cell.alignment = { horizontal: "right", vertical: "middle" };
      });
      for (let c = 1; c <= 11; c++) {
        ws.getCell(totalGeralRow, c).border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
      }

      const dataStr = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
      const nomeArquivo = `Tabela_Precos_${clienteRazaoSocial.replace(/\s+/g, "")}_${dataStr}.xlsx`;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeArquivo;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Erro ao exportar: " + (e instanceof Error ? e.message : String(e)));
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
      {/* Controle de desconto + botão exportar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between rounded-lg border bg-muted/30 px-4 py-3">
        <div className="flex flex-col gap-1.5 flex-1 max-w-sm">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Desconto a aplicar</span>
            <span className="font-mono font-semibold text-primary">
              {descontoAplicado.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={descontoMaxCluster}
            step={0.5}
            value={descontoAplicado}
            onChange={(e) => setDescontoAplicado(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0%</span>
            <span>Máx. cluster: {descontoMaxCluster.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</span>
          </div>
        </div>
        <Button size="sm" onClick={exportar} disabled={exportando} className="shrink-0">
          {exportando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
          Exportar Tabela de Preços
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary text-primary-foreground">
              <th className="px-3 py-2 text-left font-semibold">Cód. Jiva</th>
              <th className="px-3 py-2 text-left font-semibold">EAN</th>
              <th className="px-3 py-2 text-left font-semibold">Descrição</th>
              <th className="px-3 py-2 text-center font-semibold">CX Embarque</th>
              <th className="px-3 py-2 text-center font-semibold">Desc. %</th>
              <th className="px-3 py-2 text-right font-semibold">Preço Líq. s/ IPI</th>
              <th className="px-3 py-2 text-right font-semibold">Preço c/ IPI</th>
              <th className="px-3 py-2 text-right font-semibold">Preço c/ IPI+ST</th>
              <th className="px-3 py-2 text-center font-semibold">Qtd.</th>
              <th className="px-3 py-2 text-right font-semibold">Total s/ ST</th>
              <th className="px-3 py-2 text-right font-semibold">Total c/ ST</th>
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
                descontoAplicado={descontoAplicado}
                descontoOverride={descontoOverride}
                onChangeOverride={(id, val) => setDescontoOverride((prev) => ({ ...prev, [id]: val }))}
                onResetOverride={(id) => setDescontoOverride((prev) => { const n = { ...prev }; delete n[id]; return n; })}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-primary text-primary-foreground">
              <td colSpan={9} className="px-3 py-2 text-right font-bold">
                Total Geral s/ ST
              </td>
              <td className="px-3 py-2 text-right font-bold">{formatBRL(totaisGerais.semST)}</td>
              <td className="px-3 py-2 text-right font-bold">—</td>
            </tr>
            <tr className="bg-primary text-primary-foreground">
              <td colSpan={9} className="px-3 py-2 text-right font-bold">
                Total Geral c/ ST
              </td>
              <td className="px-3 py-2 text-right font-bold">—</td>
              <td className="px-3 py-2 text-right font-bold">{formatBRL(totaisGerais.comST)}</td>
            </tr>
          </tfoot>
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
  descontoAplicado,
  descontoOverride,
  onChangeOverride,
  onResetOverride,
}: {
  marca: string;
  itens: LinhaProduto[];
  qtds: Record<string, number>;
  onChangeQtd: (id: string, v: string) => void;
  descontoAplicado: number;
  descontoOverride: Record<string, number>;
  onChangeOverride: (id: string, val: number) => void;
  onResetOverride: (id: string) => void;
}) {
  return (
    <>
      <tr className="bg-primary text-primary-foreground">
        <td colSpan={11} className="px-3 py-1.5 font-bold text-sm">
          {marca}
        </td>
      </tr>
      {itens.map((it, idx) => {
        const qtd = qtds[it.id] ?? 0;
        const precoLiq = it.precoFinal;
        const precoComIpi = precoLiq != null ? precoLiq * (1 + it.ipi) : null;
        const precoComIpiSt = precoComIpi != null ? precoComIpi * (1 + it.st) : null;
        const totalSemST = precoLiq != null ? precoLiq * qtd : 0;
        const totalComST = precoComIpiSt != null ? precoComIpiSt * qtd : 0;
        const temOverride = descontoOverride[it.id] !== undefined;
        const descExibido = temOverride ? descontoOverride[it.id] : descontoAplicado;
        const maxDesc = it.descontoCluster * 100;
        return (
          <tr key={it.id} className={idx % 2 === 1 ? "bg-muted/30" : undefined}>
            <td className="px-3 py-1.5 font-mono text-xs">{it.codigo_jiva}</td>
            <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{it.ean ?? "—"}</td>
            <td className="px-3 py-1.5">{it.nome}</td>
            <td className="px-3 py-1.5 text-center">{it.cx_embarque}</td>
            <td className="px-2 py-1.5 text-center">
              <div className="flex flex-col items-center gap-0.5">
                <Input
                  type="number" min={0} max={maxDesc} step={0.5}
                  value={parseFloat(descExibido.toFixed(2))}
                  onChange={(e) => {
                    const val = Math.min(maxDesc, Math.max(0, parseFloat(e.target.value) || 0));
                    onChangeOverride(it.id, val);
                  }}
                  onFocus={(e) => e.target.select()}
                  className={`h-7 w-16 text-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none${temOverride ? " border-primary ring-1 ring-primary/30" : ""}`}
                />
                {temOverride && (
                  <button type="button" onClick={() => onResetOverride(it.id)}
                    className="text-[9px] text-muted-foreground hover:text-primary leading-none">
                    ↺ global
                  </button>
                )}
              </div>
            </td>
            <td className="px-3 py-1.5 text-right">{precoLiq != null ? formatBRL(precoLiq) : "—"}</td>
            <td className="px-3 py-1.5 text-right">{precoComIpi != null ? formatBRL(precoComIpi) : "—"}</td>
            <td className="px-3 py-1.5 text-right">{precoComIpiSt != null ? formatBRL(precoComIpiSt) : "—"}</td>
            <td className="px-3 py-1.5 text-center">
              <Input
                type="number" min={0}
                value={qtd === 0 ? "" : qtd}
                onChange={(e) => onChangeQtd(it.id, e.target.value)}
                className="h-8 w-20 mx-auto text-center"
              />
            </td>
            <td className="px-3 py-1.5 text-right">
              {precoLiq != null && qtd > 0 ? formatBRL(totalSemST) : "—"}
            </td>
            <td className="px-3 py-1.5 text-right">
              {precoComIpiSt != null && qtd > 0 ? formatBRL(totalComST) : "—"}
            </td>
          </tr>
        );
      })}
    </>
  );
}
