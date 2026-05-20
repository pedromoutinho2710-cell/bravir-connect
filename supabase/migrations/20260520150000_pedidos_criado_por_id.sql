-- Coluna de auditoria para identificar quem criou o pedido
-- (a gestora cria pedidos em nome de representantes, então vendedor_id != auth.uid()).

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS criado_por_id uuid REFERENCES auth.users(id);

-- Backfill: para pedidos antigos, assume que o criador é o próprio vendedor.
-- Garante que rascunhos pré-existentes não sejam perdidos em filtros futuros.
UPDATE public.pedidos
SET criado_por_id = vendedor_id
WHERE criado_por_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_criado_por_id
  ON public.pedidos (criado_por_id);
