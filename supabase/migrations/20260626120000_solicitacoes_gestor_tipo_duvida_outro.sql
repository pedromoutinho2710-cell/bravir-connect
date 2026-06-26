-- Amplia o CHECK de `tipo` em solicitacoes_gestor.
--
-- Causa do bug: o formulário manual de Nova Solicitação (NovaSolicitacao.tsx e
-- admin/Solicitacoes.tsx) oferece os tipos "Dúvida" (duvida) e "Outro" (outro),
-- mas o CHECK antigo só aceitava ('nova','altera','bug'). Colaboradores que
-- escolhiam Dúvida ou Outro recebiam erro 400 (violação de check constraint) e
-- o app mostrava o toast genérico "Não consegui enviar agora", sem nunca
-- conseguir registrar a solicitação.
--
-- O fluxo via IA não era afetado porque só gera bug/nova/altera.

ALTER TABLE public.solicitacoes_gestor
  DROP CONSTRAINT IF EXISTS solicitacoes_gestor_tipo_check;

ALTER TABLE public.solicitacoes_gestor
  ADD CONSTRAINT solicitacoes_gestor_tipo_check
  CHECK (tipo = ANY (ARRAY['nova', 'altera', 'bug', 'duvida', 'outro']));
