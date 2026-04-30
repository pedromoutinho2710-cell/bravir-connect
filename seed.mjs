// seed.mjs — popula produtos, precos e descontos no Supabase
// Executar: node seed.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// ── Lê .env ─────────────────────────────────────────────────────────────────
const env = {}
for (const line of readFileSync(new URL('./.env', import.meta.url), 'utf-8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const idx = t.indexOf('=')
  if (idx === -1) continue
  env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)

// ── Autenticação como admin ──────────────────────────────────────────────────
console.log('🔑 Autenticando como admin@bravir.com.br…')
const { error: authError } = await supabase.auth.signInWithPassword({
  email: 'admin@bravir.com.br',
  password: 'Bravir2026',
})
if (authError) {
  console.error('❌ Falha na autenticação:', authError.message)
  console.error('   → Certifique-se de ter criado o usuário admin no Supabase antes de rodar este script.')
  process.exit(1)
}
console.log('✅ Autenticado\n')

// ── Dados de produtos ────────────────────────────────────────────────────────
// [codigo_jiva, nome, marca, cx_embarque, peso_unitario, tab7, tab12, tab18, suframa]
const DADOS = [
  // BENDITA CÂNFORA
  ['1733',  'Gel Ative Bisnaga 80g',               'Bendita Cânfora', 24,  0.115, 13.68,  14.58,  15.83,  12.03],
  ['8',     'Gel Relaxante Bisnaga 80g',            'Bendita Cânfora', 24,  0.115, 13.68,  14.58,  15.83,  12.03],
  ['5936',  'Gel Relaxante Sachê 15g Disp c/10',   'Bendita Cânfora', 10,  0.260, 35.64,  37.99,  41.24,  31.36],
  ['11',    'Líquida Spray FR 100ml',               'Bendita Cânfora', 12,  0.123, 11.89,  12.67,  13.76,  10.46],
  ['16',    'Tablete Estojo 28g Disp c/16',         'Bendita Cânfora', 12,  0.500, 232.10, 246.84, 267.20, 204.25],
  ['4046',  'Tablete Pote c/30 x 0,75g',           'Bendita Cânfora', 24,  0.040, 13.87,  14.75,  15.97,  12.21],
  ['17',    'Tablete Pote c/200 x 0,75g',          'Bendita Cânfora', 30,  0.194, 63.09,  67.10,  72.63,  55.52],
  // BRAVIR
  ['3704',  'Aldermina Creme p/ Pés Bisn 80g',     'Bravir',           12,  0.143,  8.49,   9.06,   9.84,   7.47],
  ['1062',  'Alivik 12g Disp c/12un',              'Bravir',           24,  0.255, 53.55,  57.07,  61.96,  47.12],
  ['1718',  'Alivik 40g c/1un',                    'Bravir',           30,  0.064,  8.92,   9.50,  10.32,   7.85],
  ['1622',  'Arnica Gel Bisnaga 120g',             'Bravir',            6,  0.150,  7.73,   8.23,   8.94,   6.80],
  ['1623',  'Arnica Loção FR 240ml',               'Bravir',           16,  0.286, 10.70,  11.41,  12.38,   9.42],
  ['23',    'Óleo de Amêndoas FR 200ml',           'Bravir',           12,  0.221, 10.99,  11.72,  12.73,   9.67],
  ['4518',  'Óleo Mineral FR 200ml',               'Bravir',           12,  0.211, 14.27,  15.21,  16.51,  12.56],
  ['27',    "Pasta d'Água Bisnaga 80g",            'Bravir',           12,  0.099,  7.73,   8.23,   8.94,   6.80],
  // LABY
  ['33',    'Mant Cacau FPS8 Luxo Batom 3,3g Disp c/50',         'Laby', 18,  0.710, 84.14,  89.71,  97.45,  74.04],
  ['35',    'Mant Cacau FPS8 Push Pull 3,2g Pote c/50',          'Laby', 24,  0.200, 98.48, 105.01, 114.07,  86.67],
  ['6226',  'Mant Cacau FPS15 Líquida 10ml Disp c/24',           'Laby', 18,  0.300, 87.79,  93.61, 101.69,  77.26],
  ['3207',  'Hidrat FPS15 3,6g c/1',                             'Laby', 144, 0.024,  7.31,   7.79,   8.47,   6.43],
  ['3208',  'Hyaluronic FPS30 3,6g c/1',                         'Laby', 144, 0.024,  6.75,   7.19,   7.81,   5.94],
  ['4425',  'SOS Prot Sol Regenerador Labial FPS15 3,6g',        'Laby', 144, 0.024,  6.18,   6.59,   7.16,   5.44],
  ['4562',  'Corzinha FPS15 Vermelho Amor 3,6g',                 'Laby', 144, 0.024,  7.87,   8.39,   9.12,   6.93],
  ['4563',  'Corzinha FPS15 Violeta Magia 3,6g',                 'Laby', 144, 0.024,  7.87,   8.39,   9.12,   6.93],
  ['4059',  'Hidratante Labial Chicle Push Pull 3,2g Pote c/24', 'Laby',  24, 0.050, 79.23,  84.47,  91.77,  69.72],
  ['5309',  'Chicle Hidratante Labial Tutti Frutti 10g',         'Laby', 144, 0.024,  6.61,   7.04,   7.65,   5.81],
  ['5310',  'Chicle Hidratante Labial Morango 10g',              'Laby', 144, 0.024,  6.61,   7.04,   7.65,   5.81],
  ['38',    'Prot Sol Labial FPS15 Cereja Push Pull 3,2g',       'Laby', 144, 0.024,  5.62,   5.99,   6.51,   4.95],
  ['40',    'Prot Sol Labial FPS15 Menta Stick 4,5g',            'Laby', 144, 0.024,  7.87,   8.39,   9.12,   6.93],
  ['941',   'Prot Sol Labial FPS15 Morango Sensação Stick 4,5g', 'Laby', 144, 0.024,  7.87,   8.39,   9.12,   6.93],
  ['7410',  'Azedinha Hidratante Labial Morango 10g',            'Laby', 144, 0.024,  7.55,   8.05,   8.74,   6.64],
  ['7411',  'Azedinha Hidratante Labial Uva 10g',                'Laby', 144, 0.024,  7.55,   8.05,   8.74,   6.64],
  ['7414',  'Azedinha Prot Sol FPS8 Morango Pote c/30',          'Laby',  30, 0.050, 143.50, 153.01, 166.22, 126.28],
  ['7413',  'Chita Prot Sol FPS8 Abacaxi Pote c/30',             'Laby',  30, 0.050, 143.50, 153.01, 166.22, 126.28],
  ['7415',  'Lilith Prot Sol FPS8 Maçã Verde Pote c/30',         'Laby',  30, 0.050, 143.50, 153.01, 166.22, 126.28],
  ['8214',  'Azedinha Prot Sol FPS8 Morango Refil c/10',         'Laby',  10, 0.030,  35.87,  38.25,  41.55,  31.57],
  ['8216',  'Chita Prot Sol FPS8 Abacaxi Refil c/10',            'Laby',  10, 0.030,  35.87,  38.25,  41.55,  31.57],
  ['8215',  'Lilith Prot Sol FPS8 Maçã Verde Refil c/10',        'Laby',  10, 0.030,  35.87,  38.25,  41.55,  31.57],
  ['7412',  'Trio Azedinha/Lilith/Chita Pote c/3',               'Laby',   3, 0.050,  15.19,  16.19,  17.59,  13.36],
  ['7350',  'Lilith Lip Oil Magic Maçã Verde 4ml',               'Laby',   1, 0.030,  15.11,  16.11,  17.50,  13.29],
  ['7351',  'Lilith Lip Oil Magic Morango 4ml',                  'Laby',   1, 0.030,  15.11,  16.11,  17.50,  13.29],
  ['7352',  'Lip Oil Magic Tutti Frutti 4ml',                    'Laby',   1, 0.030,  15.11,  16.11,  17.50,  13.29],
  ['7353',  'Lip Oil Magic Cereja 4ml',                          'Laby',   1, 0.030,  15.11,  16.11,  17.50,  13.29],
]

// ── Descontos por perfil (nomes EXATOS de constants.ts) ─────────────────────
const DESCONTOS = [
  ['Varejo Alimentício',        0],
  ['Atacado Alimentício',       9],
  ['Cash & Carry',             16],
  ['Distribuidor Alimentício', 27],
  ['Varejo Ind. + Pequeno',     3],
  ['Varejo Rede Média e Grande',13],
  ['Varejo Perfumaria',        17],
  ['Varejo Abrafarma',         20],
  ['Atacado Generalista',      25],
  ['Atacado Distribuidor Base',28],
  ['Atacado Distribuidor Foco',33],
  ['Atacado Distribuidor Parceiro', 37],
]

// ── 1. Limpa tabelas (ordem: filhos antes dos pais) ─────────────────────────
console.log('🧹 Limpando tabelas existentes…')
await supabase.from('descontos').delete().neq('id', '00000000-0000-0000-0000-000000000000')
await supabase.from('precos').delete().neq('id', '00000000-0000-0000-0000-000000000000')
await supabase.from('produtos').delete().neq('id', '00000000-0000-0000-0000-000000000000')
console.log('✅ Tabelas limpas')

// ── 2. Inserir produtos ───────────────────────────────────────────────────────
console.log(`📦 Inserindo ${DADOS.length} produtos…`)
const { data: produtosInseridos, error: errProd } = await supabase
  .from('produtos')
  .insert(
    DADOS.map(([codigo_jiva, nome, marca, cx_embarque, peso_unitario]) => ({
      codigo_jiva: String(codigo_jiva),
      nome, marca, cx_embarque, peso_unitario, ativo: true,
    }))
  )
  .select('id, codigo_jiva')

if (errProd) { console.error('❌ Erro ao inserir produtos:', errProd.message); process.exit(1) }
console.log(`✅ ${produtosInseridos.length} produtos inseridos`)

// Monta mapa codigo_jiva → uuid
const idMap = {}
for (const p of produtosInseridos) idMap[p.codigo_jiva] = p.id

// ── 3. Inserir precos ────────────────────────────────────────────────────────
console.log('💰 Inserindo preços…')
const linhasPreco = []
for (const [codigo_jiva, , , , , tab7, tab12, tab18, suframa] of DADOS) {
  const produto_id = idMap[String(codigo_jiva)]
  if (!produto_id) continue
  linhasPreco.push(
    { produto_id, tabela: '7',       preco_bruto: tab7    },
    { produto_id, tabela: '12',      preco_bruto: tab12   },
    { produto_id, tabela: '18',      preco_bruto: tab18   },
    { produto_id, tabela: 'suframa', preco_bruto: suframa },
  )
}

const { error: errPreco } = await supabase.from('precos').insert(linhasPreco)
if (errPreco) { console.error('❌ Erro ao inserir preços:', errPreco.message); process.exit(1) }
console.log(`✅ ${linhasPreco.length} linhas de preço inseridas`)

// ── 4. Inserir descontos ─────────────────────────────────────────────────────
console.log('🏷️  Inserindo descontos…')
const linhasDesc = []
for (const [codigo_jiva] of DADOS) {
  const produto_id = idMap[String(codigo_jiva)]
  if (!produto_id) continue
  for (const [perfil_cliente, percentual_desconto] of DESCONTOS) {
    linhasDesc.push({ produto_id, perfil_cliente, percentual_desconto })
  }
}

// Insere em lotes de 500 para evitar timeout
for (let i = 0; i < linhasDesc.length; i += 500) {
  const lote = linhasDesc.slice(i, i + 500)
  const { error } = await supabase.from('descontos').insert(lote)
  if (error) { console.error('❌ Erro ao inserir descontos:', error.message); process.exit(1) }
}
console.log(`✅ ${linhasDesc.length} linhas de desconto inseridas`)

console.log('\n🎉 Seed concluído com sucesso!')
console.log(`   Produtos : ${DADOS.length}`)
console.log(`   Preços   : ${linhasPreco.length}`)
console.log(`   Descontos: ${linhasDesc.length}`)

await supabase.auth.signOut()
