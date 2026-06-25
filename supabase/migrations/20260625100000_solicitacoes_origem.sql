-- Adiciona coluna origem para distinguir a fonte da solicitação
-- null = criado por humano no CRM
-- 'monitor' = detectado automaticamente pelo monitor de código
-- 'pesquisa' = sugerido pelo pesquisador web semanal
ALTER TABLE solicitacoes_gestor
ADD COLUMN IF NOT EXISTS origem text;
