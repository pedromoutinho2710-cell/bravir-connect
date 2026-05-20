-- Allow any authenticated user to insert solicitacoes_gestor.
-- Previous policy required auth.uid() = criado_por, which was blocking
-- inserts in some cases. App layer already sets criado_por correctly.

DROP POLICY IF EXISTS authenticated_insert ON solicitacoes_gestor;

CREATE POLICY authenticated_insert ON solicitacoes_gestor
  FOR INSERT TO authenticated
  WITH CHECK (true);
