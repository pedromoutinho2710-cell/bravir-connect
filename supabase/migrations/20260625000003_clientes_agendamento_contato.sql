-- Adiciona campos de contato de agendamento na tabela clientes
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS telefone_agendamento text,
  ADD COLUMN IF NOT EXISTS email_agendamento text;

COMMENT ON COLUMN public.clientes.telefone_agendamento IS 'Telefone específico para contato de entregas agendadas';
COMMENT ON COLUMN public.clientes.email_agendamento IS 'E-mail específico para contato de entregas agendadas';
