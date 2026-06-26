-- Atualiza get_faturamentos_b2b_agregado para BATER com a tabela dinâmica do Sankhya:
--  (a) usa o valor BRUTO (valor_total_itens = coluna J), em vez de valor_bruto/líquido;
--  (b) NÃO exclui devoluções/SUFRAMA/bonificações (a pivot inclui tudo; devoluções netam);
--  (c) deriva o canal do Tipo de Negócio quando a coluna canal estiver vazia:
--      MARCAS BRAVIR -> "BRAVIR" (B2B); MARCAS DE TERCEIROS -> "MP" (Marca Própria),
--      com fallback pela marca para devoluções sem Tipo de Negócio preenchido.
create or replace function public.get_faturamentos_b2b_agregado(p_ano integer)
returns table (
  ano    integer,
  mes    integer,
  canal  text,
  grupo  text,
  total  numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    extract(year  from f.data_faturamento)::integer as ano,
    extract(month from f.data_faturamento)::integer as mes,
    case
      when coalesce(f.canal, '') <> ''       then f.canal
      when f.tipo_negocio ilike '%bravir%'   then 'BRAVIR'
      when f.tipo_negocio ilike '%terceiro%' then 'MP'
      when f.marca        ilike '%terceiro%' then 'MP'
      else null
    end as canal,
    f.grupo,
    sum(coalesce(f.valor_total_itens, 0))::numeric as total
  from public.faturamentos_sankhya f
  where f.data_faturamento >= make_date(least(p_ano - 1, 2025), 1, 1)
    and f.data_faturamento <= make_date(greatest(p_ano, 2026), 12, 31)
  group by 1, 2, 3, 4;
$$;

grant execute on function public.get_faturamentos_b2b_agregado(integer) to authenticated;
