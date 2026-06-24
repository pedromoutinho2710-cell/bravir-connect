-- Adiciona coluna numero_pedido_crm na tabela faturamentos_sankhya (já existe em prod, migration retroativa)
ALTER TABLE public.faturamentos_sankhya
  ADD COLUMN IF NOT EXISTS numero_pedido_crm text;
