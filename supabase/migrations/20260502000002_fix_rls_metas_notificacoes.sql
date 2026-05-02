-- ═══════════════════════════════════════════════════════════════════
-- Fix: drop every policy that references profiles.role (column does not
-- exist on that table) and recreate them using has_role() / user_roles.
-- ═══════════════════════════════════════════════════════════════════

-- ── metas (from apresentacao.sql) ────────────────────────────────────
DROP POLICY IF EXISTS "metas_insert_admin"  ON public.metas;
DROP POLICY IF EXISTS "metas_update_admin"  ON public.metas;
-- from metas.sql
DROP POLICY IF EXISTS "metas_admin_all"     ON public.metas;

CREATE POLICY "metas_admin_all" ON public.metas
  FOR ALL TO authenticated
  USING     (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ── notificacoes ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notificacoes_select"      ON public.notificacoes;
DROP POLICY IF EXISTS "notificacoes_update_own"  ON public.notificacoes;

CREATE POLICY "notificacoes_select" ON public.notificacoes
  FOR SELECT TO authenticated USING (
    destinatario_role = (
      SELECT role::text FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1
    )
    OR destinatario_id = auth.uid()
  );

CREATE POLICY "notificacoes_update_own" ON public.notificacoes
  FOR UPDATE TO authenticated
  USING (
    destinatario_role = (
      SELECT role::text FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1
    )
    OR destinatario_id = auth.uid()
  )
  WITH CHECK (true);

-- ── storage: notas_fiscais ────────────────────────────────────────────
DROP POLICY IF EXISTS "notas_fiscais_insert_fat_admin"  ON storage.objects;
DROP POLICY IF EXISTS "notas_fiscais_select_fat_admin"  ON storage.objects;
DROP POLICY IF EXISTS "notas_fiscais_select_vendedor"   ON storage.objects;

CREATE POLICY "notas_fiscais_insert_fat_admin" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'notas_fiscais'
    AND (
      public.has_role(auth.uid(), 'faturamento'::public.app_role)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

CREATE POLICY "notas_fiscais_select_fat_admin" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'notas_fiscais'
    AND (
      public.has_role(auth.uid(), 'faturamento'::public.app_role)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

CREATE POLICY "notas_fiscais_select_vendedor" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'notas_fiscais'
    AND public.has_role(auth.uid(), 'vendedor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.pedidos
      WHERE id::text = split_part(name, '/', 1)
        AND vendedor_id = auth.uid()
    )
  );
