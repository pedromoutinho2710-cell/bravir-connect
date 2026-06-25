-- Adiciona campo EAN (código de barras) na tabela produtos
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS ean varchar(14);

-- Índice único onde não nulo
CREATE UNIQUE INDEX IF NOT EXISTS idx_produtos_ean_unique ON public.produtos(ean) WHERE ean IS NOT NULL;

COMMENT ON COLUMN public.produtos.ean IS 'Código de barras EAN-13 ou EAN-14 do produto';
