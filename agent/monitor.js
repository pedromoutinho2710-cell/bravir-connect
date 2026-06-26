import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { logMonitorVarredura } from './logger.js';

const PROJECT_PATH = process.env.PROJECT_PATH;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function log(msg) {
  console.log(`[${new Date().toISOString()}] [MONITOR] ${msg}`);
}

function lerArquivosRecursivo(dir, extensoes, acumulado = []) {
  try {
    const entradas = readdirSync(dir);
    for (const entrada of entradas) {
      const caminho = join(dir, entrada);
      const stat = statSync(caminho);
      if (stat.isDirectory()) {
        lerArquivosRecursivo(caminho, extensoes, acumulado);
      } else if (extensoes.some((ext) => entrada.endsWith(ext))) {
        acumulado.push(caminho);
      }
    }
  } catch {}
  return acumulado;
}

function montarContexto() {
  // Páginas removidas do menu — não faz sentido monitorar
  const IGNORAR = ['AgenteIA.tsx', 'BlingCallback.tsx'];

  const arquivosFixos = [
    join(PROJECT_PATH, 'src', 'App.tsx'),
    join(PROJECT_PATH, 'src', 'hooks', 'useAuth.tsx'),
    join(PROJECT_PATH, 'src', 'integrations', 'supabase', 'client.ts'),
  ];

  const arquivosDinamicos = [
    ...lerArquivosRecursivo(join(PROJECT_PATH, 'src', 'pages'), ['.tsx']),
    ...lerArquivosRecursivo(join(PROJECT_PATH, 'src', 'components'), ['.tsx', '.ts']),
  ].filter((f) => !IGNORAR.some((nome) => f.endsWith(nome)));

  const todos = [...new Set([...arquivosFixos, ...arquivosDinamicos])];

  let contexto = '';
  for (const caminho of todos) {
    try {
      const conteudo = readFileSync(caminho, 'utf8');
      const relativo = caminho.replace(PROJECT_PATH, '').replace(/\\/g, '/');
      contexto += `\n\n=== ${relativo} ===\n${conteudo}`;
      if (contexto.length > 80000) break;
    } catch {}
  }

  return contexto.slice(0, 80000);
}

async function analisarRepositorio(supabase) {
  log('Iniciando varredura do repositório...');

  try {
    const contexto = montarContexto();
    log(`Contexto montado: ${contexto.length} caracteres`);

    const prompt = `Você é um especialista analisando o sistema Bravir Connect, um CRM usado por vendedores e equipe de faturamento de uma empresa de cosméticos e farmacêuticos.

Analise o código abaixo e identifique problemas reais que podem afetar o dia a dia dos usuários: falhas que travam o sistema, erros silenciosos que passam despercebidos, situações onde dados podem ser perdidos ou exibidos errado.

Retorne APENAS um JSON válido, sem markdown, sem crases:
{"problemas":[{"titulo":"string","tipo":"bug","tela":"string","descricao":"string","prioridade":"alta"}]}

Regras para os campos:
- "titulo": frase curta descrevendo o problema em linguagem de negócio (ex: "Vendedor pode perder pedido ao sair da tela sem salvar")
- "descricao": 2-3 frases explicando o que acontece na prática e qual o impacto para o usuário — sem termos técnicos
- "tela": nome da tela ou funcionalidade afetada (ex: "Criar Pedido", "Fila de Faturamento")
- "tipo": exatamente "bug" ou "melhoria"
- "prioridade": exatamente "alta", "media" ou "baixa"

Máximo 5 problemas. Só inclua problemas reais e concretos com impacto visível para quem usa o sistema.

CÓDIGO:
${contexto}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const output = response.content[0].text;
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log('Resposta sem JSON válido da análise.');
      return;
    }

    const { problemas } = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(problemas) || problemas.length === 0) {
      log('Nenhum problema encontrado nesta varredura.');
      return;
    }

    log(`${problemas.length} problema(s) identificado(s). Verificando duplicatas...`);

    let novos = 0;
    let ignorados = 0;

    for (const p of problemas) {
      // Verifica duplicata nos últimos 7 dias (evita o mesmo bug aparecer toda hora)
      const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const palavrasChave = p.titulo.split(' ').filter((w) => w.length > 4).slice(0, 3).join(' ');
      const { data: existente } = await supabase
        .from('solicitacoes_gestor')
        .select('id')
        .ilike('titulo', `%${palavrasChave}%`)
        .is('deleted_at', null)
        .gte('created_at', seteDiasAtras)
        .limit(1);

      if (existente && existente.length > 0) {
        ignorados++;
        continue;
      }

      await supabase.from('solicitacoes_gestor').insert({
        titulo: p.titulo,
        tipo: p.tipo ?? 'bug',
        tela: p.tela ?? null,
        descricao: p.descricao,
        status: 'aberto',
        agente_status: 'analisado',
        agente_resumo: p.descricao,
        criado_por: null,
        origem: 'monitor',
      });

      novos++;
    }

    logMonitorVarredura(problemas, novos);
    log(`Varredura concluída: ${novos} novo(s), ${ignorados} já existia(m).`);
  } catch (err) {
    log(`Erro na varredura: ${err.message}`);
  }
}

export function iniciarMonitor(supabase) {
  log('Monitor iniciado — primeira varredura em andamento.');
  analisarRepositorio(supabase);
  setInterval(() => analisarRepositorio(supabase), 60 * 60 * 1000);
}
