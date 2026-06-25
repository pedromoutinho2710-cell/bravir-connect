import { spawn } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { testarEDeploy } from './testador.js';

const PROJECT_PATH = process.env.PROJECT_PATH;
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function runClaude(prompt, cwd) {
  return new Promise((resolve, reject) => {
    const tmpFile = join(tmpdir(), `bravir-prompt-${Date.now()}.txt`);
    writeFileSync(tmpFile, prompt, 'utf8');

    // cmd.exe redireciona o arquivo para stdin do claude — evita escaping de shell no Windows
    const proc = spawn('cmd.exe', ['/c', `"${CLAUDE_BIN}" --print < "${tmpFile}"`], {
      cwd: cwd || PROJECT_PATH,
      shell: false,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    let errOutput = '';

    proc.stdout.on('data', (d) => {
      output += d.toString();
      process.stdout.write('.');
    });
    proc.stderr.on('data', (d) => { errOutput += d.toString(); });

    proc.on('close', (code) => {
      console.log('');
      try { unlinkSync(tmpFile); } catch {}
      if (code === 0) resolve(output.trim());
      else reject(new Error(`claude saiu com código ${code}: ${errOutput || output}`));
    });

    proc.on('error', (err) => {
      try { unlinkSync(tmpFile); } catch {}
      reject(new Error(`Falha ao iniciar claude: ${err.message}`));
    });
  });
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
    const output = await runClaude(prompt, PROJECT_PATH);

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

    log(`Análise concluída para "${sol.titulo}": ${plano.resumo}`);
  } catch (err) {
    log(`Erro na análise de ${sol.id}: ${err.message}`);
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
  const contextoErro = erroAnterior
    ? `\n\nATENÇÃO: A tentativa anterior falhou com este erro — corrija o problema:\n${erroAnterior.slice(0, 800)}`
    : '';

  const prompt = `Implemente a seguinte melhoria no projeto Bravir Connect.

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
- Siga os padrões do projeto: shadcn/ui, TanStack Query v5, client Supabase de src/integrations/supabase/client.ts
- Não quebre funcionalidades existentes
- NÃO faça commit nem push — apenas modifique os arquivos${contextoErro}`;

  try {
    await runClaude(prompt, PROJECT_PATH);
    log(`Implementação concluída — iniciando testes`);
    const solAtualizada = { ...sol, agente_tentativas: tentativa };
    await testarEDeploy(solAtualizada, supabase);
  } catch (err) {
    log(`Erro na implementação de ${sol.id}: ${err.message}`);
    await supabase
      .from('solicitacoes_gestor')
      .update({ agente_status: 'erro', agente_erro: `Erro na implementação: ${err.message.slice(0, 1000)}` })
      .eq('id', sol.id);
  }
}
