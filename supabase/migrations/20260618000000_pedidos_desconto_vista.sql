-- ═══════════════════════════════════════════════════════════════════
-- Desconto à vista no pedido
--
-- Percentual de desconto à vista informado no Resumo Financeiro do
-- Novo Pedido (e na edição pelo Faturamento). Limitado a 5% na UI.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS desconto_vista numeric NOT NULL DEFAULT 0;
