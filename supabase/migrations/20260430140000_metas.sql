-- ═══════════════════════════════════════════════════════════════════
-- Migration: metas table (standalone, idempotent)
-- Ensures metas table exists with correct RLS policies
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.metas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id      uuid REFERENCES auth.users(id),
  mes              smallint CHECK (mes BETWEEN 1 AND 12),
  ano              smallint NOT NULL,
  valor_meta_reais numeric(14,2) DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (vendedor_id, mes, ano)
);

ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;

-- Admin: acesso total
DROP POLICY IF EXISTS "metas_admin_all" ON public.metas;
CREATE POLICY "metas_admin_all" ON public.metas
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Vendedor: pode ler apenas sua própria meta
DROP POLICY IF EXISTS "metas_vendedor_own_select" ON public.metas;
CREATE POLICY "metas_vendedor_own_select" ON public.metas
  FOR SELECT TO authenticated
  USING (auth.uid() = vendedor_id);
