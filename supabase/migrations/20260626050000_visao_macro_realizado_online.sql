-- Visão Macro: realizado do canal Online informado manualmente.
-- A integração com o Bling não está trazendo os dados corretamente, então,
-- temporariamente, o realizado do canal Online passa a ser digitado pela gestão
-- (admin, gestora, gestora_faturamento) junto com a meta, na mesma tabela
-- metas_visao_macro. A política de escrita já existente cobre essa coluna.
ALTER TABLE public.metas_visao_macro
  ADD COLUMN IF NOT EXISTS realizado_online numeric NOT NULL DEFAULT 0;
