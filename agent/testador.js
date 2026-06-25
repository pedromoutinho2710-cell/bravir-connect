import { spawn } from 'child_process';
import { implementar } from './implementador.js';

const PROJECT_PATH = process.env.PROJECT_PATH;
const MAX_TENTATIVAS = 3;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function executarComando(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, shell: true, stdio: 'pipe' });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${cmd} ${args.join(' ')} falhou (código ${code}):\n${stderr || stdout}`));
      }
    });

    proc.on('error', (err) => reject(err));
  });
}

export async function testarEDeploy(sol, supabase) {
  const tentativas = sol.agente_tentativas ?? 1;

  log(`Testando build para "${sol.titulo}" (tentativa ${tentativas}/${MAX_TENTATIVAS})`);

  try {
    await executarComando('npm', ['run', 'build'], PROJECT_PATH);
    log('Build OK');
  } catch (buildErr) {
    log(`Build falhou: ${buildErr.message.slice(0, 500)}`);
    return await tentarNovamente(sol, supabase, buildErr.message);
  }

  try {
    await executarComando('npx', ['tsc', '--noEmit'], PROJECT_PATH);
    log('TypeScript OK');
  } catch (tscErr) {
    log(`TypeScript falhou: ${tscErr.message.slice(0, 500)}`);
    return await tentarNovamente(sol, supabase, tscErr.message);
  }

  await deploy(sol, supabase);
}

async function tentarNovamente(sol, supabase, erroMsg) {
  const tentativas = sol.agente_tentativas ?? 1;

  if (tentativas >= MAX_TENTATIVAS) {
    log(`Máximo de tentativas atingido para "${sol.titulo}". Marcando como erro.`);
    await supabase
      .from('solicitacoes_gestor')
      .update({
        agente_status: 'erro',
        agente_erro: erroMsg.slice(0, 2000),
      })
      .eq('id', sol.id);
    return;
  }

  log(`Tentando novamente "${sol.titulo}" (${tentativas}/${MAX_TENTATIVAS})...`);
  await supabase
    .from('solicitacoes_gestor')
    .update({ agente_erro: erroMsg.slice(0, 2000) })
    .eq('id', sol.id);

  await implementar(sol, supabase, erroMsg);
}

async function deploy(sol, supabase) {
  log(`Testes passaram — fazendo commit e push para "${sol.titulo}"`);

  try {
    const mensagem = `feat: ${sol.titulo} — implementado pelo agente IA`;

    await executarComando('git', ['add', '-A'], PROJECT_PATH);
    await executarComando('git', ['commit', '-m', mensagem], PROJECT_PATH);
    await executarComando('git', ['push', 'origin', 'main'], PROJECT_PATH);

    await supabase
      .from('solicitacoes_gestor')
      .update({
        agente_status: 'implementado',
        agente_resumo: `Implementado com sucesso. ${sol.agente_resumo ?? ''}`.trim(),
        agente_concluido_em: new Date().toISOString(),
      })
      .eq('id', sol.id);

    log(`Deploy concluído para "${sol.titulo}" ✓`);
  } catch (err) {
    log(`Erro no deploy de "${sol.titulo}": ${err.message}`);
    await supabase
      .from('solicitacoes_gestor')
      .update({
        agente_status: 'erro',
        agente_erro: `Erro no deploy: ${err.message.slice(0, 2000)}`,
      })
      .eq('id', sol.id);
  }
}
