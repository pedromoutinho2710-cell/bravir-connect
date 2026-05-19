-- ═══════════════════════════════════════════════════════════════════
-- Migration: faturamentos externos importados pelo trade via planilha
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.faturamentos_externos (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      uuid        NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  vendedor_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  valor           numeric     NOT NULL,
  faturado_em     date        NOT NULL DEFAULT CURRENT_DATE,
  importado_por   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faturamentos_externos_cliente
  ON public.faturamentos_externos (cliente_id);

CREATE INDEX IF NOT EXISTS idx_faturamentos_externos_vendedor
  ON public.faturamentos_externos (vendedor_id);

CREATE INDEX IF NOT EXISTS idx_faturamentos_externos_faturado_em
  ON public.faturamentos_externos (faturado_em);

ALTER TABLE public.faturamentos_externos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fext_manage_trade_admin" ON public.faturamentos_externos;
CREATE POLICY "fext_manage_trade_admin" ON public.faturamentos_externos
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'trade'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'trade'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "fext_select_authenticated" ON public.faturamentos_externos;
CREATE POLICY "fext_select_authenticated" ON public.faturamentos_externos
  FOR SELECT TO authenticated USING (true);
