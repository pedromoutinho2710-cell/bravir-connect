-- ═══════════════════════════════════════════════════════════════════
-- RPC: get_painel_vendedor(p_vendedor_id, p_mes, p_ano)
-- Consolida, no banco, o "Faturamento Real (Sankhya)" do MeuPainel: o
-- faturamento líquido do vendedor no mês de referência (p_mes/p_ano) e no
-- mês anterior, casando por nome_vendedor. Devolve também full_name e
-- nome_sankhya do perfil — usados no ranking e no gráfico mensal — para
-- evitar uma query separada de profiles no cliente.
--
-- Match: nome_sankhya tem prioridade (igualdade case-insensitive); na sua
-- ausência, usa full_name com %...% (mesma regra do cliente anterior).
--
-- Substitui a versão anterior (quebrada — referenciava data_emissao, coluna
-- inexistente em faturamentos_sankhya; a correta é data_faturamento) e a
-- traz para o controle de versão.
-- ═══════════════════════════════════════════════════════════════════

-- Remove qualquer overload existente (a versão quebrada pode ter outra
-- assinatura/return type, o que impediria CREATE OR REPLACE).
do $$
declare r record;
begin
  for r in
    select oid::regprocedure as sig
    from pg_proc
    where proname = 'get_painel_vendedor'
      and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function ' || r.sig::text;
  end loop;
end $$;

create function public.get_painel_vendedor(
  p_vendedor_id uuid,
  p_mes integer,
  p_ano integer
)
returns table (
  full_name                 text,
  nome_sankhya              text,
  faturamento_mes           numeric,
  faturamento_mes_anterior  numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_full   text;
  v_sank   text;
  v_match  text;
  v_ini    date;   -- 1º dia do mês de referência
  v_fim    date;   -- último dia do mês de referência
  v_ini_a  date;   -- 1º dia do mês anterior
  v_fim_a  date;   -- último dia do mês anterior
begin
  select nullif(btrim(p.full_name), ''), nullif(btrim(p.nome_sankhya), '')
    into v_full, v_sank
  from public.profiles p
  where p.id = p_vendedor_id;

  v_match := case
    when v_sank is not null then v_sank
    when v_full is not null then '%' || v_full || '%'
    else null
  end;

  v_ini   := make_date(p_ano, p_mes, 1);
  v_fim   := (v_ini + interval '1 month')::date - 1;
  v_ini_a := (v_ini - interval '1 month')::date;
  v_fim_a := v_ini - 1;

  return query
  select
    v_full,
    v_sank,
    coalesce(sum(f.valor_liquido) filter (
      where f.data_faturamento >= v_ini and f.data_faturamento <= v_fim
    ), 0)::numeric,
    coalesce(sum(f.valor_liquido) filter (
      where f.data_faturamento >= v_ini_a and f.data_faturamento <= v_fim_a
    ), 0)::numeric
  from public.faturamentos_sankhya f
  where v_match is not null
    and f.nome_vendedor ilike v_match
    and f.data_faturamento >= v_ini_a
    and f.data_faturamento <= v_fim
    and coalesce(f.tipo_operacao, '') !~* 'devolu';
end;
$$;

grant execute on function public.get_painel_vendedor(uuid, integer, integer) to authenticated;
