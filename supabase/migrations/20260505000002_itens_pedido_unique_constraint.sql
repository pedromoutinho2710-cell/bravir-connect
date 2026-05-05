-- Ensure (pedido_id, produto_id) unique constraint on itens_pedido.
-- This is required for upsert-based conflict resolution.
-- Safe to run even if the constraint already exists.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'itens_pedido_unique_produto'
      AND conrelid = 'public.itens_pedido'::regclass
  ) THEN
    ALTER TABLE public.itens_pedido
      ADD CONSTRAINT itens_pedido_unique_produto UNIQUE (pedido_id, produto_id);
  END IF;
END $$;
