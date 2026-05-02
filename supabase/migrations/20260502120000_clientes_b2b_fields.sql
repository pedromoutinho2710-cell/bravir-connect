ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS codigo_parceiro text,
  ADD COLUMN IF NOT EXISTS nome_parceiro text,
  ADD COLUMN IF NOT EXISTS suframa boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS imposto numeric,
  ADD COLUMN IF NOT EXISTS canal text;

CREATE INDEX IF NOT EXISTS idx_clientes_codigo_parceiro ON public.clientes (codigo_parceiro);
CREATE INDEX IF NOT EXISTS idx_clientes_canal ON public.clientes (canal);
CREATE INDEX IF NOT EXISTS idx_clientes_vendedor_id ON public.clientes (vendedor_id);
