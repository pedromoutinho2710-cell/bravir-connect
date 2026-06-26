import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH;
const BASE = VAULT_PATH ? join(VAULT_PATH, 'Bravir Connect') : null;

function garantirPasta(caminho) {
  if (!existsSync(caminho)) mkdirSync(caminho, { recursive: true });
}

function dataHoje() {
  return new Date().toISOString().slice(0, 10);
}

function anoMes() {
  return new Date().toISOString().slice(0, 7);
}

function caminhoNota(sol) {
  if (!BASE) return null;
  const pasta = join(BASE, 'Solicitações', anoMes());
  garantirPasta(pasta);
  const titulo = sol.titulo.replace(/[<>:"/\\|?*]/g, '-').slice(0, 60);
  return join(pasta, `${sol.id.slice(0, 8)}-${titulo}.md`);
}

function lerNota(caminho) {
  try { return readFileSync(caminho, 'utf8'); } catch { return null; }
}

function escreverNota(caminho, conteudo) {
  try { writeFileSync(caminho, conteudo, 'utf8'); } catch {}
}

function appendNota(caminho, secao) {
  const atual = lerNota(caminho) ?? '';
  escreverNota(caminho, atual + '\n' + secao);
}

export function logAnaliseConcluida(sol, plano) {
  if (!BASE) return;
  const caminho = caminhoNota(sol);
  if (!caminho) return;

  const passos = (plano.plano ?? []).map((p) => `- ${p}`).join('\n');
  const arquivos = (plano.arquivos ?? []).map((a) => `- \`${a.path}\` (${a.acao})`).join('\n');
  const origem = sol.origem === 'monitor' ? 'Monitor de código' : sol.origem === 'pesquisa' ? 'Pesquisador web' : 'Humano';

  const conteudo = `---
id: ${sol.id}
data: ${dataHoje()}
tipo: ${sol.tipo ?? 'não especificado'}
tela: ${sol.tela ?? 'não especificado'}
origem: ${origem}
---

# ${sol.titulo}

**Descrição:** ${sol.descricao}

## Análise — ${new Date().toLocaleString('pt-BR')}

**Resumo:** ${plano.resumo ?? ''}

**Plano:**
${passos || '(sem passos definidos)'}

**Arquivos previstos:**
${arquivos || '(não especificado)'}
`;
  escreverNota(caminho, conteudo);
}

export function logImplementacaoConcluida(sol) {
  if (!BASE) return;
  const caminho = caminhoNota(sol);
  if (!caminho) return;
  appendNota(caminho, `\n## Implementado — ${new Date().toLocaleString('pt-BR')}\n\n✅ Implementado com sucesso. Build passou, commit e push realizados.\n`);
}

export function logErro(sol, erro) {
  if (!BASE) return;
  const caminho = caminhoNota(sol);
  if (!caminho) return;
  const tentativa = sol.agente_tentativas ?? 1;
  appendNota(caminho, `\n## Erro (tentativa ${tentativa}) — ${new Date().toLocaleString('pt-BR')}\n\n\`\`\`\n${erro.slice(0, 1500)}\n\`\`\`\n`);
}

export function lerHistoricoErros(sol) {
  if (!BASE) return '';
  const caminho = caminhoNota(sol);
  if (!caminho) return '';
  const conteudo = lerNota(caminho);
  if (!conteudo) return '';

  const secoes = conteudo.split('\n## Erro').slice(1);
  if (secoes.length === 0) return '';

  return '\n\nHistórico de erros anteriores desta solicitação (lido do Obsidian):\n' +
    secoes.map((s) => '## Erro' + s).join('\n');
}

export function logMonitorVarredura(problemas, novos) {
  if (!BASE) return;
  const pasta = join(BASE, 'Monitor');
  garantirPasta(pasta);
  const arquivo = join(pasta, `${dataHoje()}.md`);

  const lista = problemas.map((p) => `- **${p.titulo}** (${p.prioridade ?? 'media'}) — ${p.descricao}`).join('\n');
  const entrada = `\n## Varredura — ${new Date().toLocaleString('pt-BR')}\n\n**${problemas.length} problema(s) encontrado(s), ${novos} novo(s).**\n\n${lista || '(nenhum problema encontrado)'}\n`;

  appendNota(arquivo, entrada);
}

export function logPesquisaWeb(sugestoes, novas) {
  if (!BASE) return;
  const pasta = join(BASE, 'Pesquisa');
  garantirPasta(pasta);
  const arquivo = join(pasta, `${dataHoje()}.md`);

  const lista = sugestoes.map((s) => `- **${s.titulo}** — ${s.descricao}${s.fonte_url ? `\n  Fonte: ${s.fonte_url}` : ''}`).join('\n');
  const entrada = `\n## Pesquisa Web — ${new Date().toLocaleString('pt-BR')}\n\n**${sugestoes.length} sugestão(ões) encontrada(s), ${novas} nova(s).**\n\n${lista || '(nenhuma sugestão encontrada)'}\n`;

  appendNota(arquivo, entrada);
}
