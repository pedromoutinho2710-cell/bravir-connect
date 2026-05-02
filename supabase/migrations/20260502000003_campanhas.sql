-- ═══════════════════════════════════════════════════════════════════
-- Migration: campanhas table
-- Used by Trade, TradeCampanhas, and MeuPainel
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.campanhas (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text        NOT NULL,
  descricao   text,
  tipo        text        CHECK (tipo IN ('desconto', 'bonificacao', 'outro')),
  valor       numeric,
  data_inicio date,
  data_fim    date,
  ativa       boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;

-- trade and admin can manage rows
CREATE POLICY "campanhas_manage_trade_admin" ON public.campanhas
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'trade'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'trade'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- all authenticated users can read active campaigns
CREATE POLICY "campanhas_select_authenticated" ON public.campanhas
  FOR SELECT TO authenticated USING (true);
