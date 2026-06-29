/*
 * Gera public/iqvia_data.json a partir da planilha IQVIA (xlsx).
 *
 * Por que existe: a base IQVIA é uma planilha enorme (~150 MB, ~1,5 milhão de
 * linhas). O dashboard (src/pages/DadosIQVIA.tsx) NÃO lê a planilha; ele lê este
 * JSON pré-filtrado e pré-agregado. Sempre que a planilha for atualizada, rode
 * este script para regerar o JSON e faça commit do resultado.
 *
 * Uso:
 *   node tools/gen_iqvia_data.js "C:\\caminho\\para\\IQVIA BASE.xlsx"
 *   (sem argumento, usa o caminho padrão em Downloads)
 *
 * Requer a dependência `exceljs` (já presente no projeto). Leitura em streaming
 * para não estourar memória.
 *
 * Filtros aplicados (definidos com o negócio):
 *   - Alivik : Categoria ∈ {DOR E FEBRE, GRIPES E RESFRIADOS} e Tipo produto ∈ {INALADOR, POMADA} — todas as marcas (Alivik é destacada na tela)
 *   - Laby   : Categoria ∈ {CUIDADOS LABIOS/LABIAIS, PROTECAO SOLAR} — todas as marcas
 *   - Bendita: Marca = BENDITA CANFORA (BVR) — todas as apresentações (a tela filtra as 4 desejadas)
 *   Anos mantidos: 2024, 2025, 2026.
 *
 * Abas esperadas na planilha: "BD ALIVIK", "BASE LABY", "BASE BENDITA CANFORA".
 */
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

const FILE = process.argv[2] || "C:\\Users\\Pedro.Moutinho\\Downloads\\IQVIA BASE 2.xlsx";
const OUT = path.join(__dirname, "..", "public", "iqvia_data.json");
const GERADO_EM = process.argv[3] || "2026-06"; // AAAA-MM exibido no rodapé do dashboard

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
const MESES_PT = ["JANEIRO","FEVEREIRO","MARCO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"];
const mesIdx = (n) => MESES_PT.indexOf(norm(n));
const ANOS_OK = new Set([2024, 2025, 2026]);

const REGION_LABEL = { SUDESTE: "Sudeste", NORDESTE: "Nordeste", SUL: "Sul", CENTROOESTE: "Centro-Oeste", NORTE: "Norte" };
const regiaoCanon = (s) => { const k = norm(s).replace(/[^A-Z]/g, ""); return REGION_LABEL[k] || String(s ?? "").trim(); };

const cellText = (v) => {
  if (v == null) return "";
  if (typeof v === "object") {
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v.richText) return v.richText.map((t) => t.text).join("");
    return String(v.value ?? "");
  }
  return String(v);
};
const cellNum = (v) => {
  if (v == null || v === "") return 0;
  if (typeof v === "object") return Number(v.result ?? v.value ?? 0) || 0;
  return Number(v) || 0;
};
const r2 = (n) => Math.round(n * 100) / 100;

const makeAgg = () => new Map();
const addAgg = (map, keyParts, dims, u, f) => {
  const k = keyParts.join("|");
  let e = map.get(k);
  if (!e) { e = { ...dims, u: 0, f: 0 }; map.set(k, e); }
  e.u += u; e.f += f;
};
const finalizeAgg = (map) => [...map.values()].map((e) => ({ ...e, u: r2(e.u), f: r2(e.f) }));

const ALIVIK_OWN = norm("ALIVIK (BVR)");
const LABY_OWN = norm("LABY (BVR)");
const BENDITA_OWN = norm("BENDITA CANFORA (BVR)");
const LABY_CATS = new Set(["CUIDADOS LABIOS", "CUIDADOS LABIAIS", "PROTECAO SOLAR"]);
const ALIVIK_CATS = new Set(["DOR E FEBRE", "GRIPES E RESFRIADOS"]);
const ALIVIK_TIPOS = new Set(["INALADOR", "POMADA"]);

(async () => {
  if (!fs.existsSync(FILE)) { console.error("Planilha não encontrada:", FILE); process.exit(1); }
  console.log("Lendo:", FILE);
  const wb = new ExcelJS.stream.xlsx.WorkbookReader(FILE, {
    worksheets: "emit", sharedStrings: "cache", hyperlinks: "ignore", styles: "ignore",
  });

  const aliMarket = makeAgg(), aliOwnUF = makeAgg();
  const labMarket = makeAgg(), labOwnUF = makeAgg();
  const benRows = makeAgg();

  for await (const ws of wb) {
    const name = ws.name || "";
    const isAli = name === "BD ALIVIK", isLab = name === "BASE LABY", isBen = name === "BASE BENDITA CANFORA";
    let idx = {};
    const col = (names) => { for (const n of names) { const c = idx[norm(n)]; if (c) return c; } return null; };
    let cCat, cMarca, cApr, cAno, cMes, cUf, cReg, cUnid, cFat, cTipo;

    for await (const row of ws) {
      if (!(isAli || isLab || isBen)) break;
      const vals = row.values;
      if (row.number === 1) {
        idx = {};
        for (let i = 1; i < vals.length; i++) { const h = cellText(vals[i]).trim(); if (h) idx[norm(h)] = i; }
        cCat = col(["Categoria"]); cMarca = col(["Marca"]); cApr = col(["Apresentacao", "Apresentação"]);
        cAno = col(["Ano"]); cMes = col(["Mes Calendario", "Mês Calendário"]); cUf = col(["UF"]); cReg = col(["Regiao", "Região"]);
        cUnid = col(["Unidade"]); cFat = col(["Real CH"]); cTipo = col(["Tipo produto", "Tipo Produto"]);
        continue;
      }
      const ano = cAno ? Math.trunc(cellNum(vals[cAno])) : 0;
      if (!ANOS_OK.has(ano)) continue;
      const mi = cMes ? mesIdx(cellText(vals[cMes])) : -1;
      const uf = cUf ? cellText(vals[cUf]).trim().toUpperCase() : "";
      if (mi < 0 || !uf) continue;
      const reg = cReg ? regiaoCanon(cellText(vals[cReg])) : "";
      const unid = cUnid ? cellNum(vals[cUnid]) : 0;
      const fat = cFat ? cellNum(vals[cFat]) : 0;
      const marca = cMarca ? cellText(vals[cMarca]).trim() : "";
      const mN = norm(marca);

      if (isAli) {
        const cat = norm(cellText(vals[cCat]));
        const tipo = cTipo ? norm(cellText(vals[cTipo])) : "";
        if (!ALIVIK_CATS.has(cat) || !ALIVIK_TIPOS.has(tipo)) continue;
        addAgg(aliMarket, [mN, ano, mi, reg], { m: marca, a: ano, mi, r: reg }, unid, fat);
        if (mN === ALIVIK_OWN) addAgg(aliOwnUF, [ano, mi, uf, reg], { a: ano, mi, uf, r: reg }, unid, fat);
      } else if (isLab) {
        const cat = norm(cellText(vals[cCat]));
        if (!LABY_CATS.has(cat)) continue;
        addAgg(labMarket, [mN, ano, mi, reg], { m: marca, a: ano, mi, r: reg }, unid, fat);
        if (mN === LABY_OWN) addAgg(labOwnUF, [ano, mi, uf, reg], { a: ano, mi, uf, r: reg }, unid, fat);
      } else if (isBen) {
        if (mN !== BENDITA_OWN) continue;
        const apr = cApr ? cellText(vals[cApr]).trim() : "";
        addAgg(benRows, [norm(apr), ano, mi, uf, reg], { p: apr, a: ano, mi, uf, r: reg }, unid, fat);
      }
    }
    if (isAli || isLab || isBen) console.log("  [ok]", name);
  }

  const out = {
    alivik: { own: "ALIVIK (BVR)", market: finalizeAgg(aliMarket), ownUF: finalizeAgg(aliOwnUF) },
    laby: { own: "LABY (BVR)", market: finalizeAgg(labMarket), ownUF: finalizeAgg(labOwnUF) },
    bendita: { own: "BENDITA CANFORA (BVR)", rows: finalizeAgg(benRows) },
    geradoEm: GERADO_EM,
  };
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`\nSalvo: ${OUT} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
  console.log(`Alivik: ${out.alivik.market.length} market / ${out.alivik.ownUF.length} ownUF`);
  console.log(`Laby:   ${out.laby.market.length} market / ${out.laby.ownUF.length} ownUF`);
  console.log(`Bendita:${out.bendita.rows.length} rows`);
})().catch((e) => { console.error("ERRO:", e.stack || e.message); process.exit(1); });
