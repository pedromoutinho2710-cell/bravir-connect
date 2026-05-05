-- ══════════════════════════════════════════════════════════════════
-- Fix: cadastro flow RLS
-- - faturamento can INSERT/UPDATE clientes (they create the client after Sankhya registration)
-- - admin/faturamento can DELETE clientes
-- - cadastros_pendentes RLS (table was created outside migrations)
-- ══════════════════════════════════════════════════════════════════

-- 1. clientes INSERT: add faturamento and gestora
DROP POLICY IF EXISTS "Vendedores e admins inserem clientes" ON public.clientes;
CREATE POLICY "Vendedores e admins inserem clientes" ON public.clientes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'vendedor')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faturamento')
    OR public.has_role(auth.uid(), 'gestora')
  );

-- 2. clientes UPDATE: add faturamento and gestora
DROP POLICY IF EXISTS "Vendedores e admins atualizam clientes" ON public.clientes;
CREATE POLICY "Vendedores e admins atualizam clientes" ON public.clientes
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'vendedor')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faturamento')
    OR public.has_role(auth.uid(), 'gestora')
  );

-- 3. clientes DELETE: admin and faturamento
DROP POLICY IF EXISTS "Admin deleta clientes" ON public.clientes;
CREATE POLICY "Admin deleta clientes" ON public.clientes
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faturamento')
  );

-- 4. cadastros_pendentes RLS (safe to run even if already enabled)
ALTER TABLE public.cadastros_pendentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cadastros_select" ON public.cadastros_pendentes;
CREATE POLICY "cadastros_select" ON public.cadastros_pendentes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cadastros_insert" ON public.cadastros_pendentes;
CREATE POLICY "cadastros_insert" ON public.cadastros_pendentes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'vendedor')
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "cadastros_update" ON public.cadastros_pendentes;
CREATE POLICY "cadastros_update" ON public.cadastros_pendentes
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'gestora')
    OR public.has_role(auth.uid(), 'faturamento')
  );

DROP POLICY IF EXISTS "cadastros_delete" ON public.cadastros_pendentes;
CREATE POLICY "cadastros_delete" ON public.cadastros_pendentes
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faturamento')
  );
