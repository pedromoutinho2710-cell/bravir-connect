-- Adiciona colunas de contato para agendamento de entrega
alter table pedidos
  add column if not exists telefone_contato text,
  add column if not exists email_contato text;

comment on column pedidos.telefone_contato is 'Telefone de contato para agendamento de entrega (obrigatório quando tipo_entrega = agendada)';
comment on column pedidos.email_contato is 'E-mail de contato para agendamento de entrega (obrigatório quando tipo_entrega = agendada)';
