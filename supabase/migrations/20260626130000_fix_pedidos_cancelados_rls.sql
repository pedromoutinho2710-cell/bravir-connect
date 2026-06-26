-- Corrige RLS da tabela pedidos_cancelados.
-- A migration original usou public.user_roles (tabela inexistente).
-- Substituído por public.has_role() conforme padrão do sistema.

DROP POLICY IF EXISTS "pc_select_retaguarda"   ON public.pedidos_cancelados;
DROP POLICY IF EXISTS "pc_select_vendedor"     ON public.pedidos_cancelados;
DROP POLICY IF EXISTS "pc_insert_retaguarda"   ON public.pedidos_cancelados;
DROP POLICY IF EXISTS "pc_update_retaguarda"   ON public.pedidos_cancelados;
DROP POLICY IF EXISTS "pc_delete_admin"        ON public.pedidos_cancelados;

-- SELECT: admin, faturamento e gestora_faturamento veem tudo
CREATE POLICY "pc_select_retaguarda" ON public.pedidos_cancelados
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faturamento')
    OR public.has_role(auth.uid(), 'gestora_faturamento')
    OR public.has_role(auth.uid(), 'gestora')
  );

-- SELECT: vendedor vê apenas os próprios cancelamentos
CREATE POLICY "pc_select_vendedor" ON public.pedidos_cancelados
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'vendedor')
    AND vendedor_id = auth.uid()
  );

-- INSERT: faturamento e retaguarda
CREATE POLICY "pc_insert_retaguarda" ON public.pedidos_cancelados
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faturamento')
    OR public.has_role(auth.uid(), 'gestora_faturamento')
  );

-- UPDATE: faturamento e retaguarda
CREATE POLICY "pc_update_retaguarda" ON public.pedidos_cancelados
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faturamento')
    OR public.has_role(auth.uid(), 'gestora_faturamento')
  );

-- DELETE: apenas admin
CREATE POLICY "pc_delete_admin" ON public.pedidos_cancelados
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
  );
