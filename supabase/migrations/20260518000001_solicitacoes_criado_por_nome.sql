-- Add criado_por_nome column so author name is stored at insert time
ALTER TABLE solicitacoes_gestor ADD COLUMN IF NOT EXISTS criado_por_nome text;

-- Ensure all authenticated users can insert their own solicitacoes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'solicitacoes_gestor' AND policyname = 'authenticated_insert'
  ) THEN
    EXECUTE 'CREATE POLICY authenticated_insert ON solicitacoes_gestor
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = criado_por)';
  END IF;
END $$;

-- Ensure all authenticated users can read all solicitacoes
-- (app layer handles pedro.menezes vs own-only visibility)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'solicitacoes_gestor' AND policyname = 'authenticated_select'
  ) THEN
    EXECUTE 'CREATE POLICY authenticated_select ON solicitacoes_gestor
      FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;

-- Enable RLS if not already enabled
ALTER TABLE solicitacoes_gestor ENABLE ROW LEVEL SECURITY;
