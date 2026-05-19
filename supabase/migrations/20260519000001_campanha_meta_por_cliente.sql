-- ═══════════════════════════════════════════════════════════════════
-- Migration: tipo_meta na campanha + tabela de metas por cliente
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.campanhas
  ADD COLUMN IF NOT EXISTS tipo_meta text NOT NULL DEFAULT 'vendedor'
  CHECK (tipo_meta IN ('vendedor', 'cliente'));

CREATE TABLE IF NOT EXISTS public.campanha_metas_clientes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id  uuid        NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  cliente_id   uuid        NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  meta_valor   numeric     NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campanha_id, cliente_id)
);

CREATE INDEX IF NOT EXISTS idx_campanha_metas_clientes_campanha
  ON public.campanha_metas_clientes (campanha_id);

ALTER TABLE public.campanha_metas_clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cmc_manage_trade_admin" ON public.campanha_metas_clientes;
CREATE POLICY "cmc_manage_trade_admin" ON public.campanha_metas_clientes
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'trade'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'trade'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "cmc_select_authenticated" ON public.campanha_metas_clientes;
CREATE POLICY "cmc_select_authenticated" ON public.campanha_metas_clientes
  FOR SELECT TO authenticated USING (true);
