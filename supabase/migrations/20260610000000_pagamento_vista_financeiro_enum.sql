-- ═══════════════════════════════════════════════════════════════════
-- Pagamento à vista + role financeiro — PARTE 1 (enum + coluna)
--
-- IMPORTANTE: rode ESTE arquivo PRIMEIRO e sozinho. Um novo valor de
-- enum não pode ser usado na mesma transação em que é criado, por isso
-- as policies que referenciam 'financeiro' ficam na PARTE 2.
-- ═══════════════════════════════════════════════════════════════════

-- Novo role para o time financeiro (confirmação de recebimento à vista)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'financeiro';

-- Flag de pagamento à vista no pedido (sinal de máquina do novo fluxo)
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS pagamento_vista boolean NOT NULL DEFAULT false;

-- Índice para a fila do financeiro e a aba "À Vista" do faturamento
CREATE INDEX IF NOT EXISTS idx_pedidos_pagamento_vista
  ON public.pedidos (pagamento_vista)
  WHERE pagamento_vista = true;
