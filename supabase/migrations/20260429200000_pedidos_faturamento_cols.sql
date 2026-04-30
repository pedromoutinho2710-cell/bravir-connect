-- Adiciona colunas para o fluxo de faturamento
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS responsavel_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS motivo text;

-- Novos status possíveis (documentação):
-- rascunho, aguardando_faturamento, em_faturamento, faturado, devolvido, cancelado
