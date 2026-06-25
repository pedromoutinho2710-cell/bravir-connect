-- ═══════════════════════════════════════════════════════════════════
-- RPC: get_faturamento_por_marca(p_ano)
-- Agrega faturamentos_sankhya por (ano, mês, marca, tipo de negócio) usando o
-- valor da coluna J da planilha (valor_total_itens). Inclui TODAS as operações
-- (devoluções entram com valor negativo e subtraem) — assim a soma bate exatamente
-- com o total da planilha do Sankhya.
--
-- Espelha get_faturamentos_b2b_agregado, mas: (a) agrupa por marca/tipo_negocio
-- (colunas novas da planilha) em vez de canal/grupo; (b) usa valor_total_itens em
-- vez de valor_bruto; (c) NÃO exclui devoluções/SUFRAMA. A janela cobre 2025 e 2026
-- para alimentar comparativos YoY, expandindo se p_ano sair desse intervalo.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.get_faturamento_por_marca(p_ano integer)
returns table (
  ano          integer,
  mes          integer,
  marca        text,
  tipo_negocio text,
  total        numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    extract(year  from f.data_faturamento)::integer        as ano,
    extract(month from f.data_faturamento)::integer        as mes,
    f.marca,
    f.tipo_negocio,
    sum(coalesce(f.valor_total_itens, 0))::numeric          as total
  from public.faturamentos_sankhya f
  where f.data_faturamento >= make_date(least(p_ano - 1, 2025), 1, 1)
    and f.data_faturamento <= make_date(greatest(p_ano, 2026), 12, 31)
  group by 1, 2, f.marca, f.tipo_negocio;
$$;

grant execute on function public.get_faturamento_por_marca(integer) to authenticated;
