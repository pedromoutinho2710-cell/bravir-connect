#!/usr/bin/env node
/**
 * Migra pedidos antigos (no_sankhya) que tenham itens mistos
 * (com qtd_faturada > 0 e outros com qtd_faturada = 0), aplicando
 * o mesmo fracionamento de salvarProdFat: move os itens sem
 * faturamento para um novo pedido filho com status sem_estoque.
 *
 * Uso:
 *   node scripts/migrar_fracionamento.mjs           # dry-run (apenas loga)
 *   node scripts/migrar_fracionamento.mjs --apply   # executa de fato
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '..', '.env');

function loadEnv(path) {
  try {
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch (err) {
    console.warn(`Não consegui ler ${path}: ${err.message}`);
  }
}

loadEnv(ENV_PATH);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERRO: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const nowIso = () => new Date().toISOString();

async function main() {
  console.log(`Modo: ${APPLY ? 'APPLY (executa alterações)' : 'DRY-RUN (apenas loga)'}`);

  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select('id, numero_pedido, cliente_id, vendedor_id, cond_pagamento, tabela_preco, perfil_cliente, agendamento, observacoes, ordem_compra, tipo, vigencia_id, status, pedido_origem_id')
    .eq('status', 'no_sankhya')
    .is('pedido_origem_id', null);

  if (error) {
    console.error('Erro ao buscar pedidos:', error.message);
    process.exit(1);
  }

  console.log(`Pedidos no_sankhya sem pedido_origem_id encontrados: ${pedidos.length}`);

  let fracionados = 0;
  let semItensZerados = 0;
  let semItensFaturados = 0;
  let semItens = 0;
  let erros = 0;

  for (const p of pedidos) {
    const { data: itens, error: errIt } = await supabase
      .from('itens_pedido')
      .select('id, produto_id, quantidade, qtd_faturada, preco_unitario_bruto, preco_unitario_liquido, preco_apos_perfil, preco_apos_comercial, preco_final, desconto_comercial, desconto_trade, total_item, bolsao')
      .eq('pedido_id', p.id);

    if (errIt) {
      console.error(`  Pedido #${p.numero_pedido} (${p.id}): erro ao buscar itens — ${errIt.message}`);
      erros++;
      continue;
    }
    if (!itens || itens.length === 0) {
      semItens++;
      continue;
    }

    const itensSemFat = itens.filter((i) => Number(i.qtd_faturada ?? 0) === 0);
    const itensComFat = itens.filter((i) => Number(i.qtd_faturada ?? 0) > 0);

    if (itensSemFat.length === 0) {
      semItensZerados++;
      continue;
    }
    if (itensComFat.length === 0) {
      // Status no_sankhya mas todos itens com qtd_faturada = 0.
      // Por segurança não altera (não está no escopo da migração).
      semItensFaturados++;
      console.log(`  Pedido #${p.numero_pedido} (${p.id}): TODOS itens com qtd_faturada=0 — ignorado (fora do escopo da migração)`);
      continue;
    }

    console.log(`  Pedido #${p.numero_pedido} (${p.id}): MISTO — ${itensComFat.length} com faturamento, ${itensSemFat.length} a fracionar`);

    if (!APPLY) {
      fracionados++;
      continue;
    }

    // 1. Cria pedido filho
    const { data: novoPedido, error: errNovo } = await supabase
      .from('pedidos')
      .insert({
        cliente_id: p.cliente_id,
        vendedor_id: p.vendedor_id,
        cond_pagamento: p.cond_pagamento,
        tabela_preco: p.tabela_preco,
        perfil_cliente: p.perfil_cliente,
        agendamento: p.agendamento,
        observacoes: p.observacoes,
        ordem_compra: p.ordem_compra,
        tipo: p.tipo,
        vigencia_id: p.vigencia_id,
        status: 'sem_estoque',
        pedido_origem_id: p.id,
        status_atualizado_em: nowIso(),
      })
      .select('id, numero_pedido')
      .single();

    if (errNovo || !novoPedido) {
      console.error(`    Erro ao criar pedido filho: ${errNovo?.message ?? 'sem dados'}`);
      erros++;
      continue;
    }

    // 2. Insere itens no novo pedido (quantidade original, qtd_faturada = 0)
    const novosItensPayload = itensSemFat.map((i) => ({
      pedido_id: novoPedido.id,
      produto_id: i.produto_id,
      quantidade: i.quantidade,
      qtd_faturada: 0,
      preco_unitario_bruto: i.preco_unitario_bruto,
      preco_unitario_liquido: i.preco_unitario_liquido,
      preco_apos_perfil: i.preco_apos_perfil,
      preco_apos_comercial: i.preco_apos_comercial,
      preco_final: i.preco_final,
      desconto_comercial: i.desconto_comercial,
      desconto_trade: i.desconto_trade,
      total_item: i.total_item,
      bolsao: i.bolsao,
    }));

    const { error: errInsItens } = await supabase
      .from('itens_pedido')
      .insert(novosItensPayload);

    if (errInsItens) {
      console.error(`    Erro ao inserir itens no filho ${novoPedido.id}: ${errInsItens.message}`);
      // tenta limpar pedido filho órfão
      await supabase.from('pedidos').delete().eq('id', novoPedido.id);
      erros++;
      continue;
    }

    // 3. Remove itens migrados do pedido original
    const idsRemover = itensSemFat.map((i) => i.id);
    const { error: errDel } = await supabase
      .from('itens_pedido')
      .delete()
      .in('id', idsRemover);

    if (errDel) {
      console.error(`    Erro ao remover itens do pedido original: ${errDel.message}`);
      erros++;
      continue;
    }

    console.log(`    → Filho #${novoPedido.numero_pedido} (${novoPedido.id}) criado com ${novosItensPayload.length} itens`);
    fracionados++;
  }

  console.log('\n=== Resumo ===');
  console.log(`Total analisados:                       ${pedidos.length}`);
  console.log(`Fracionados ${APPLY ? '(aplicado)' : '(simulado)'}:               ${fracionados}`);
  console.log(`Sem itens zerados (nada a fazer):       ${semItensZerados}`);
  console.log(`Todos itens zerados (ignorado):         ${semItensFaturados}`);
  console.log(`Sem itens cadastrados:                  ${semItens}`);
  console.log(`Erros:                                  ${erros}`);

  if (!APPLY) {
    console.log('\nDRY-RUN — nenhuma alteração foi feita. Rode novamente com --apply para executar.');
  }
}

main().catch((err) => {
  console.error('Falha inesperada:', err);
  process.exit(1);
});
