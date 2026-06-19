-- ═══════════════════════════════════════════════════════════════════
-- RPC: get_faturamentos_b2b_agregado(p_ano)
-- Aggregates faturamentos_sankhya server-side so VisaoMacro no longer
-- downloads thousands of raw rows to the browser. Returns one row per
-- (ano, mes, canal, grupo) with the summed faturamento value, applying
-- the same exclusion filters the client used (devoluções, SUFRAMA e
-- bonificações) and the same value rule (valor_bruto, senão valor_liquido).
--
-- The window always covers 2025 e 2026 (a tabela comparativa de VisaoMacro
-- compara YoY 2025 × 2026 independentemente do ano selecionado); p_ano
-- expande a janela caso um ano fora desse intervalo seja escolhido.
--
-- Substitui a versão anterior (quebrada — referenciava data_emissao, coluna
-- inexistente em faturamentos_sankhya; a coluna correta é data_faturamento).
-- ═══════════════════════════════════════════════════════════════════

-- Remove qualquer overload existente (a versão quebrada pode ter outra
-- assinatura/return type, o que impediria CREATE OR REPLACE).
do $$
declare r record;
begin
  for r in
    select oid::regprocedure as sig
    from pg_proc
    where proname = 'get_faturamentos_b2b_agregado'
      and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function ' || r.sig::text;
  end loop;
end $$;

create function public.get_faturamentos_b2b_agregado(p_ano integer)
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
    extract(year  from f.data_faturamento)::integer        as ano,
    extract(month from f.data_faturamento)::integer        as mes,
    f.canal,
    f.grupo,
    sum(coalesce(f.valor_bruto, f.valor_liquido, 0))::numeric as total
  from public.faturamentos_sankhya f
  where f.data_faturamento >= make_date(least(p_ano - 1, 2025), 1, 1)
    and f.data_faturamento <= make_date(greatest(p_ano, 2026), 12, 31)
    and coalesce(f.tipo_operacao, '') !~* 'devolu'
    and coalesce(f.tipo_operacao, '') !~* 'suframa'
    and coalesce(f.tipo_operacao, '') !~* 'bonifica'
  group by 1, 2, f.canal, f.grupo;
$$;

grant execute on function public.get_faturamentos_b2b_agregado(integer) to authenticated;
