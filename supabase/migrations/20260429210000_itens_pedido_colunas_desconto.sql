ALTER TABLE public.itens_pedido
  ADD COLUMN IF NOT EXISTS preco_unitario_liquido numeric,
  ADD COLUMN IF NOT EXISTS desconto_comercial numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desconto_trade numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preco_apos_perfil numeric,
  ADD COLUMN IF NOT EXISTS preco_apos_comercial numeric,
  ADD COLUMN IF NOT EXISTS preco_final numeric;
