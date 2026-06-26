-- Adiciona campo de complemento de endereço (ex: galpão, loja, sala) para auxiliar na entrega
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS complemento text;
ALTER TABLE public.cadastros_pendentes ADD COLUMN IF NOT EXISTS complemento text;

COMMENT ON COLUMN public.clientes.complemento IS 'Complemento do endereço (galpão, loja, sala, etc.) para auxiliar na entrega';
COMMENT ON COLUMN public.cadastros_pendentes.complemento IS 'Complemento do endereço (galpão, loja, sala, etc.) para auxiliar na entrega';
