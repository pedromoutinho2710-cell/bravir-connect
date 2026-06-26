-- Adiciona o status 'aguardando_aprovacao_desconto' ao constraint de pedidos.
-- Esse status é atribuído quando o vendedor aplica desconto comercial > 0%,
-- exigindo aprovação da gestora antes de ir para faturamento.

ALTER TABLE public.pedidos
  DROP CONSTRAINT IF EXISTS pedidos_status_check;

ALTER TABLE public.pedidos
  ADD CONSTRAINT pedidos_status_check CHECK (status IN (
    'rascunho',
    'aguardando_faturamento',
    'aguardando_aprovacao_desconto',
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
    'nao_liberado_envio',
    'liberado_envio',
    'em_transito'
  ));
