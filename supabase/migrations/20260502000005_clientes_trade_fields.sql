-- ═══════════════════════════════════════════════════════════════════
-- Migration: add trade-specific columns to clientes
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS desconto_adicional numeric,
  ADD COLUMN IF NOT EXISTS campanha_id        uuid REFERENCES public.campanhas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS observacoes_trade  text;
