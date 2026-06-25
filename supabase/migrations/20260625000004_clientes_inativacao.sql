-- Adiciona suporte a inativação de clientes (separado do soft-delete existente)
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS inativado_em timestamptz,
  ADD COLUMN IF NOT EXISTS inativado_por uuid REFERENCES public.profiles(id);

-- Índice para buscas por ativo
CREATE INDEX IF NOT EXISTS idx_clientes_ativo ON public.clientes(ativo) WHERE deleted_at IS NULL;

-- RLS: vendedor pode inativar apenas seus próprios clientes
CREATE POLICY "vendedor pode inativar seus clientes"
  ON public.clientes
  FOR UPDATE
  TO authenticated
  USING (
    vendedor_id = auth.uid()
    AND deleted_at IS NULL
  )
  WITH CHECK (
    vendedor_id = auth.uid()
    AND deleted_at IS NULL
  );

-- RLS: gestora e admin veem todos inclusive inativos (já coberto pelas políticas existentes)

COMMENT ON COLUMN public.clientes.ativo IS 'false = inativado pelo vendedor (oculto da carteira ativa)';
COMMENT ON COLUMN public.clientes.inativado_em IS 'Timestamp de quando o cliente foi inativado';
COMMENT ON COLUMN public.clientes.inativado_por IS 'ID do usuário que inativou o cliente';
