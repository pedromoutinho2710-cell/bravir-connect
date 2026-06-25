import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { analisar, implementar } from './implementador.js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[AGENTE] Erro: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios no .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

let processando = false;
const fila = [];

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function processarFila() {
  if (processando || fila.length === 0) return;
  processando = true;

  const { id, agente_status } = fila.shift();
  log(`Processando solicitação ${id} (agente_status: ${agente_status ?? 'null'})`);

  try {
    const { data: sol } = await supabase
      .from('solicitacoes_gestor')
      .select('*')
      .eq('id', id)
      .single();

    if (!sol) {
      log(`Solicitação ${id} não encontrada.`);
    } else if (!sol.agente_status || sol.agente_status === 'pendente') {
      await analisar(sol, supabase);
    } else if (sol.agente_status === 'aprovado') {
      await implementar(sol, supabase);
    }
  } catch (err) {
    log(`Erro ao processar ${id}: ${err.message}`);
  }

  processando = false;
  if (fila.length > 0) processarFila();
}

function enfileirar(id, agente_status) {
  const jaEstaFila = fila.some((item) => item.id === id);
  if (!jaEstaFila && id !== undefined) {
    fila.push({ id, agente_status });
    processarFila();
  }
}

async function carregarPendentes() {
  log('Carregando solicitações pendentes...');

  const [{ data: aprovadas }, { data: semStatus }] = await Promise.all([
    supabase
      .from('solicitacoes_gestor')
      .select('id, agente_status')
      .eq('status', 'aberto')
      .is('deleted_at', null)
      .eq('agente_status', 'aprovado')
      .order('created_at', { ascending: true }),
    supabase
      .from('solicitacoes_gestor')
      .select('id, agente_status')
      .eq('status', 'aberto')
      .is('deleted_at', null)
      .is('agente_status', null)
      .order('created_at', { ascending: true }),
  ]);

  const todos = [...(aprovadas ?? []), ...(semStatus ?? [])];
  if (todos.length > 0) {
    log(`Encontradas ${todos.length} solicitações para processar na inicialização.`);
    todos.forEach(({ id, agente_status }) => enfileirar(id, agente_status));
  } else {
    log('Nenhuma solicitação pendente na inicialização.');
  }
}

supabase
  .channel('agente-realtime')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'solicitacoes_gestor' },
    (payload) => {
      const row = payload.new;
      if (!row || row.status !== 'aberto' || row.deleted_at) return;

      const { id, agente_status } = row;

      if (!agente_status || agente_status === 'pendente') {
        log(`Nova solicitação detectada: ${id} — enfileirando para análise`);
        enfileirar(id, agente_status);
      } else if (agente_status === 'aprovado') {
        log(`Solicitação aprovada: ${id} — enfileirando para implementação`);
        enfileirar(id, agente_status);
      }
    }
  )
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      log('Agente ativo — ouvindo Supabase Realtime.');
      carregarPendentes();
    } else {
      log(`Status Realtime: ${status}`);
    }
  });
