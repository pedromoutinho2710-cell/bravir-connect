-- Colunas usadas pelo Agente de IA (edge function `agente-implementador`) para
-- registrar o resultado da análise/implementação automática de uma solicitação.
--
-- agente_status: pendente | analisado | pr_criado | erro (texto livre, sem CHECK).
-- agente_resumo: resumo gerado pela IA do problema e da solução proposta.
-- agente_pr_url: link do Pull Request criado no GitHub.
-- agente_mudancas: payload estruturado da análise (plano + arquivos propostos),
--                  reutilizado na etapa de implementação para garantir que o que
--                  foi revisado é exatamente o que será aberto no PR.
--
-- A edge function escreve nessas colunas com a service role (ignora RLS). As
-- policies existentes de SELECT/UPDATE (admin/gestora ou dono) já cobrem a tela.

ALTER TABLE solicitacoes_gestor ADD COLUMN IF NOT EXISTS agente_status text;
ALTER TABLE solicitacoes_gestor ADD COLUMN IF NOT EXISTS agente_resumo text;
ALTER TABLE solicitacoes_gestor ADD COLUMN IF NOT EXISTS agente_pr_url text;
ALTER TABLE solicitacoes_gestor ADD COLUMN IF NOT EXISTS agente_mudancas jsonb;
