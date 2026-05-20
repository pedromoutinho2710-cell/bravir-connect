-- Garantir coluna status com default 'aberto'
ALTER TABLE solicitacoes_gestor
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'aberto';

UPDATE solicitacoes_gestor SET status = 'aberto' WHERE status IS NULL;

-- Reabrir politica de SELECT para admin/gestora ver tudo
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
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON solicitacoes_gestor', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY select_policy ON solicitacoes_gestor
  FOR SELECT TO authenticated
  USING (
    criado_por = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'gestora')
    )
  );

-- Garantir UPDATE de status para admin/gestora
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'solicitacoes_gestor'
      AND cmd = 'UPDATE'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON solicitacoes_gestor', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY update_policy ON solicitacoes_gestor
  FOR UPDATE TO authenticated
  USING (
    criado_por = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'gestora')
    )
  )
  WITH CHECK (true);
