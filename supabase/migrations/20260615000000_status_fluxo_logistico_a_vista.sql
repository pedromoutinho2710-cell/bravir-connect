-- ═══════════════════════════════════════════════════════════════════
-- FASE 1 — Novos status do fluxo logístico (pagamento à vista)
--
-- pedidos.status é text com CHECK constraint (não enum). Para adicionar
-- valores novos é preciso DROP + ADD CONSTRAINT com TODOS os valores.
--
-- Novos status:
--   nao_liberado_envio → faturado à vista, aguardando aprovação do financeiro
--   liberado_envio     → financeiro aprovou, logística pode enviar
--   em_transito        → logística marcou como enviado
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.pedidos
  DROP CONSTRAINT IF EXISTS pedidos_status_check;

ALTER TABLE public.pedidos
  ADD CONSTRAINT pedidos_status_check CHECK (status IN (
    -- valores existentes
    'rascunho',
    'aguardando_faturamento',
    'pendente_sankhya',
    'no_sankhya',
    'parcialmente_faturado',
    'faturado',
    'devolvido',
    'cancelado',
    'com_problema',
    'sem_estoque',
    'aguardando_pagamento',
    'pagamento_confirmado',
    -- novos valores (fluxo logístico à vista)
    'nao_liberado_envio',
    'liberado_envio',
    'em_transito'
  ));
