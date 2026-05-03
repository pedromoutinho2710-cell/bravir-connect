-- ═══════════════════════════════════════════════════════════════════
-- Bug fix: ensure metas unique constraint and correct admin RLS
-- ═══════════════════════════════════════════════════════════════════

-- Ensure unique constraint exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'metas_vendedor_mes_ano_key'
      AND conrelid = 'public.metas'::regclass
  ) THEN
    ALTER TABLE public.metas
      ADD CONSTRAINT metas_vendedor_mes_ano_key UNIQUE (vendedor_id, mes, ano);
  END IF;
END $$;

-- Re-apply correct admin policy (uses has_role, not profiles.role)
DROP POLICY IF EXISTS "metas_admin_all"     ON public.metas;
DROP POLICY IF EXISTS "metas_insert_admin"  ON public.metas;
DROP POLICY IF EXISTS "metas_update_admin"  ON public.metas;

CREATE POLICY "metas_admin_all" ON public.metas
  FOR ALL TO authenticated
  USING     (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Vendedor: pode ler apenas sua própria meta
DROP POLICY IF EXISTS "metas_vendedor_own_select" ON public.metas;
CREATE POLICY "metas_vendedor_own_select" ON public.metas
  FOR SELECT TO authenticated
  USING (auth.uid() = vendedor_id);
