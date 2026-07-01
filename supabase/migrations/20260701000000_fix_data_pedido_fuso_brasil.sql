-- ─────────────────────────────────────────────────────────────────────────────
-- Corrige o fuso horário da data do pedido (data_pedido)
--
-- PROBLEMA
-- A coluna pedidos.data_pedido tinha DEFAULT CURRENT_DATE, e o app carimbava a
-- data com `new Date().toISOString()`. Ambos usam UTC. Como o Brasil é UTC-3,
-- um pedido criado/enviado à noite (a partir das 21h de Brasília) já está no dia
-- seguinte em UTC — então recebia a data de "amanhã", contando no dia/mês errado
-- no fechamento.
--
-- CORREÇÃO
-- 1) Muda o DEFAULT da coluna para a data local do Brasil (America/Sao_Paulo),
--    protegendo inserts que não informam data_pedido (ex.: rascunhos).
-- 2) Backfill dos pedidos já gravados com data no futuro. Um data_pedido só é
--    carimbado com "hoje" — nunca com uma data futura. Logo, qualquer pedido
--    com data_pedido MAIOR que a data local de hoje é, comprovadamente, o bug
--    de UTC, e está adiantado em exatamente 1 dia (a virada UTC-3 → UTC empurra
--    no máximo para o dia seguinte). Subtrair 1 dia devolve a data correta sem
--    tocar em nenhum mês já fechado.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.pedidos
  ALTER COLUMN data_pedido SET DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date);

UPDATE public.pedidos
SET data_pedido = data_pedido - 1
WHERE data_pedido > (now() AT TIME ZONE 'America/Sao_Paulo')::date;
