-- Disponibilidade de produtos (controle de estoque)
ALTER TABLE public.produtos
ADD COLUMN IF NOT EXISTS disponivel boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_produtos_disponivel
ON public.produtos(disponivel) WHERE disponivel = false;
