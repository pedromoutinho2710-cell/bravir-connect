-- Remove a policy de INSERT redundante em solicitacoes_gestor.
--
-- Existiam DUAS policies de INSERT com a mesma regra (criado_por = auth.uid()):
--   - solicitacoes_insert_proprio              (mantida)
--   - "usuarios autenticados podem inserir solicitacoes"  (removida — duplicada)
-- Policies permissivas de INSERT são combinadas por OR, então remover a duplicata
-- não altera o comportamento; apenas elimina a redundância.

DROP POLICY IF EXISTS "usuarios autenticados podem inserir solicitacoes" ON public.solicitacoes_gestor;
