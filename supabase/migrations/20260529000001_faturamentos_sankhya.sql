create table if not exists public.faturamentos_sankhya (
  id uuid primary key default gen_random_uuid(),
  numero_nota text not null,
  tipo_operacao text,
  data_faturamento date,
  codigo_parceiro text,
  nome_parceiro text,
  grupo_cliente text,
  segmento text,
  cidade text,
  uf text,
  codigo_produto text,
  descricao_produto text,
  quantidade numeric,
  valor_total_itens numeric,
  valor_liquido numeric,
  valor_st numeric,
  base_st numeric,
  aliq_ipi numeric,
  ipi numeric,
  valor_fem numeric,
  valor_destaque numeric,
  controle text,
  cod_grupo text,
  grupo text,
  nome_vendedor text,
  razao_social_empresa text,
  tipo_negociacao text,
  recebimento_pedido date,
  importado_em timestamptz default now(),
  importado_por uuid references auth.users(id)
);

create unique index if not exists faturamentos_sankhya_nota_produto_idx
  on public.faturamentos_sankhya (numero_nota, codigo_produto);

create index if not exists faturamentos_sankhya_codigo_parceiro_idx
  on public.faturamentos_sankhya (codigo_parceiro);

create index if not exists faturamentos_sankhya_data_idx
  on public.faturamentos_sankhya (data_faturamento);

create index if not exists faturamentos_sankhya_vendedor_idx
  on public.faturamentos_sankhya (nome_vendedor);

alter table public.faturamentos_sankhya enable row level security;

drop policy if exists "autenticados podem ler faturamentos_sankhya" on public.faturamentos_sankhya;
create policy "autenticados podem ler faturamentos_sankhya"
  on public.faturamentos_sankhya for select
  to authenticated using (true);

drop policy if exists "admin e faturamento podem inserir faturamentos_sankhya" on public.faturamentos_sankhya;
create policy "admin e faturamento podem inserir faturamentos_sankhya"
  on public.faturamentos_sankhya for insert
  to authenticated
  with check (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
      and role in ('admin', 'faturamento', 'trade')
    )
  );
