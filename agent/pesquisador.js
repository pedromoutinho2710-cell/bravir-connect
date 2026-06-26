import Anthropic from '@anthropic-ai/sdk';
import { logPesquisaWeb } from './logger.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const INTERVALO_SEMANA = 7 * 24 * 60 * 60 * 1000;
const PRIMEIRO_CICLO = 24 * 60 * 60 * 1000;

function log(msg) {
  console.log(`[${new Date().toISOString()}] [PESQUISADOR] ${msg}`);
}

async function pesquisarMelhorias(supabase) {
  log('Iniciando pesquisa web de melhorias...');

  try {
    const response = await anthropic.beta.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      betas: ['web-search-2025-03-05'],
      messages: [
        {
          role: 'user',
          content: `Pesquise na internet as 3 melhores funcionalidades ou melhorias para um CRM B2B de cosméticos e farmacêuticos no Brasil em 2025. Foque em: gestão de pedidos, acompanhamento de metas de vendedores, experiência mobile para força de vendas, relatórios de faturamento e rentabilidade.

Para cada sugestão retorne um JSON válido sem markdown:
{"sugestoes":[{"titulo":"string","descricao":"string em 2-3 frases explicando o valor para o negócio","fonte_url":"url da fonte consultada ou null","relevancia":"alta"}]}

Máximo 3 sugestões. Foque em funcionalidades concretas e implementáveis, não em tendências genéricas.`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock) {
      log('Resposta sem bloco de texto.');
      return;
    }

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log('Resposta sem JSON válido.');
      return;
    }

    const { sugestoes } = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(sugestoes) || sugestoes.length === 0) {
      log('Nenhuma sugestão encontrada.');
      return;
    }

    log(`${sugestoes.length} sugestão(ões) encontrada(s). Verificando duplicatas...`);

    let novas = 0;
    let ignoradas = 0;

    for (const s of sugestoes) {
      const { data: existente } = await supabase
        .from('solicitacoes_gestor')
        .select('id')
        .ilike('titulo', `%${s.titulo.slice(0, 30)}%`)
        .is('deleted_at', null)
        .limit(1);

      if (existente && existente.length > 0) {
        ignoradas++;
        continue;
      }

      await supabase.from('solicitacoes_gestor').insert({
        titulo: s.titulo,
        tipo: 'melhoria',
        descricao: s.descricao,
        status: 'aberto',
        agente_status: 'analisado',
        agente_resumo: s.descricao,
        criado_por: null,
        origem: 'pesquisa',
      });

      novas++;
    }

    logPesquisaWeb(sugestoes, novas);
    log(`Pesquisa concluída: ${novas} nova(s), ${ignoradas} já existia(m).`);
  } catch (err) {
    if (err.message?.includes('web-search')) {
      log('Recurso de busca web não disponível neste plano. Pesquisador desativado.');
    } else {
      log(`Erro na pesquisa: ${err.message}`);
    }
  }
}

export function iniciarPesquisador(supabase) {
  log(`Pesquisador agendado — primeira busca em 24h, depois semanal.`);
  setTimeout(() => {
    pesquisarMelhorias(supabase);
    setInterval(() => pesquisarMelhorias(supabase), INTERVALO_SEMANA);
  }, PRIMEIRO_CICLO);
}
