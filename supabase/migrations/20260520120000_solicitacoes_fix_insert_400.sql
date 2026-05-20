-- Fix 400 ao salvar solicitacao: garantir que qualquer usuario autenticado
-- possa inserir em solicitacoes_gestor, mesmo que politicas restritivas
-- antigas ainda existam.

ALTER TABLE solicitacoes_gestor ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'solicitacoes_gestor'
      AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON solicitacoes_gestor', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY authenticated_insert ON solicitacoes_gestor
  FOR INSERT TO authenticated
  WITH CHECK (true);
