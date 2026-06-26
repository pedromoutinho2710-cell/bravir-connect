import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { testarEDeploy } from './testador.js';
import { logAnaliseConcluida, logImplementacaoConcluida, logErro, lerHistoricoErros } from './logger.js';

const PROJECT_PATH = process.env.PROJECT_PATH;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

const FILE_TOOLS = [
  {
    name: 'read_file',
    description: 'Lê o conteúdo de um arquivo do projeto',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Caminho relativo a partir da raiz do projeto (ex: src/pages/Exemplo.tsx)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Cria ou substitui um arquivo com o conteúdo fornecido',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Caminho relativo a partir da raiz do projeto' },
        content: { type: 'string', description: 'Conteúdo completo do arquivo' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_files',
    description: 'Lista arquivos em um diretório do projeto',
    input_schema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Caminho relativo do diretório (ex: src/pages)' },
      },
      required: ['directory'],
    },
  },
];

function executarTool(name, input) {
  try {
    const caminho = resolve(PROJECT_PATH, input.path ?? input.directory ?? '');
    if (!caminho.startsWith(PROJECT_PATH)) {
      return 'Erro: acesso fora do diretório do projeto não permitido.';
    }

    if (name === 'read_file') {
      return readFileSync(caminho, 'utf8');
    }

    if (name === 'write_file') {
      writeFileSync(caminho, input.content, 'utf8');
      return `Arquivo escrito: ${input.path}`;
    }

    if (name === 'list_files') {
      const entradas = readdirSync(caminho);
      return entradas
        .map((e) => {
          const full = join(caminho, e);
          const stat = statSync(full);
          return stat.isDirectory() ? `${e}/` : e;
        })
        .join('\n');
    }

    return 'Ferramenta desconhecida.';
  } catch (err) {
    return `Erro: ${err.message}`;
  }
}

async function callClaudeComTools(prompt, model) {
  const messages = [{ role: 'user', content: prompt }];
  let iteracoes = 0;
  const MAX_ITERACOES = 30;

  while (iteracoes < MAX_ITERACOES) {
    iteracoes++;
    const response = await anthropic.messages.create({
      model,
      max_tokens: 8096,
      tools: FILE_TOOLS,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find((b) => b.type === 'text');
      return textBlock?.text ?? '';
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });

      const resultados = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          log(`  → tool: ${block.name}(${JSON.stringify(block.input).slice(0, 80)})`);
          const resultado = executarTool(block.name, block.input);
          resultados.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: typeof resultado === 'string' ? resultado : JSON.stringify(resultado),
          });
        }
      }

      messages.push({ role: 'user', content: resultados });
      continue;
    }

    break;
  }

  return '';
}

async function callClaude(prompt, model = 'claude-sonnet-4-6') {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content[0].text;
}

export async function analisar(sol, supabase) {
  log(`Analisando "${sol.titulo}" (id: ${sol.id})`);

  await supabase
    .from('solicitacoes_gestor')
    .update({ agente_status: 'analisando', agente_iniciado_em: new Date().toISOString() })
    .eq('id', sol.id);

  const prompt = `Você é um engenheiro de software analisando uma melhoria para o sistema Bravir Connect.
Stack: React 18 + TypeScript + Vite + shadcn/ui + Supabase + TanStack Query v5 + React Router v6.

Analise a solicitação abaixo e retorne APENAS um JSON válido, sem markdown, sem explicações.

Solicitação:
- Título: ${sol.titulo}
- Tipo: ${sol.tipo ?? 'não especificado'}
- Tela/arquivo: ${sol.tela ?? 'não especificado'}
- Descrição: ${sol.descricao}

Formato de resposta (JSON puro, sem crases, sem markdown):
{"resumo":"descrição em 1-2 frases do que será feito","plano":["passo 1","passo 2"],"arquivos":[{"path":"src/pages/Exemplo.tsx","acao":"modificar"}]}`;

  try {
    const output = await callClaude(prompt, 'claude-sonnet-4-6');

    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`Resposta sem JSON válido: ${output.slice(0, 200)}`);

    const plano = JSON.parse(jsonMatch[0]);

    await supabase
      .from('solicitacoes_gestor')
      .update({
        agente_status: 'analisado',
        agente_resumo: plano.resumo,
        agente_mudancas: plano,
      })
      .eq('id', sol.id);

    logAnaliseConcluida(sol, plano);
    log(`Análise concluída para "${sol.titulo}": ${plano.resumo}`);
  } catch (err) {
    log(`Erro na análise de ${sol.id}: ${err.message}`);
    logErro(sol, err.message);
    await supabase
      .from('solicitacoes_gestor')
      .update({ agente_status: 'erro', agente_erro: `Erro na análise: ${err.message.slice(0, 1000)}` })
      .eq('id', sol.id);
  }
}

export async function implementar(sol, supabase, erroAnterior = null) {
  const tentativa = (sol.agente_tentativas ?? 0) + 1;
  log(`Implementando "${sol.titulo}" — tentativa ${tentativa}/3 (id: ${sol.id})`);

  await supabase
    .from('solicitacoes_gestor')
    .update({ agente_status: 'implementando', agente_tentativas: tentativa })
    .eq('id', sol.id);

  const plano = sol.agente_mudancas ?? {};
  const passos = plano.plano ? plano.plano.map((p, i) => `${i + 1}. ${p}`).join('\n') : '';
  const arquivos = plano.arquivos ? plano.arquivos.map((a) => `- ${a.path} (${a.acao})`).join('\n') : '';

  const historicoObsidian = lerHistoricoErros(sol);
  const contextoErro = erroAnterior
    ? `\n\nATENÇÃO: A tentativa anterior falhou com este erro — corrija o problema:\n${erroAnterior.slice(0, 800)}`
    : '';

  const prompt = `Você é um engenheiro de software implementando uma melhoria no projeto Bravir Connect.

Título: ${sol.titulo}
Descrição: ${sol.descricao}
Tela/arquivo: ${sol.tela ?? 'não especificado'}

Plano aprovado:
${passos || '(use a descrição como guia)'}

Arquivos previstos:
${arquivos || '(localize os arquivos necessários)'}

Regras:
- Use TypeScript correto, sem erros de tipo
- Não adicione comentários desnecessários
- Siga os padrões do projeto: shadcn/ui, TanStack Query v5, client Supabase de @/integrations/supabase/client
- Não quebre funcionalidades existentes
- Use as ferramentas read_file, write_file e list_files para ler e modificar os arquivos
- NÃO faça commit nem push — apenas modifique os arquivos${contextoErro}${historicoObsidian}

Comece lendo os arquivos previstos, depois implemente as mudanças necessárias.`;

  try {
    await callClaudeComTools(prompt, 'claude-opus-4-8');
    log(`Implementação concluída — iniciando testes`);
    const solAtualizada = { ...sol, agente_tentativas: tentativa };
    await testarEDeploy(solAtualizada, supabase);
    logImplementacaoConcluida(sol);
  } catch (err) {
    log(`Erro na implementação de ${sol.id}: ${err.message}`);
    logErro({ ...sol, agente_tentativas: tentativa }, err.message);
    await supabase
      .from('solicitacoes_gestor')
      .update({ agente_status: 'erro', agente_erro: `Erro na implementação: ${err.message.slice(0, 1000)}` })
      .eq('id', sol.id);
  }
}
