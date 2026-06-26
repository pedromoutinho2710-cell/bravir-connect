-- ═══════════════════════════════════════════════════════════════════
-- Módulo: Controle de Pedidos Cancelados
-- Tabela: public.pedidos_cancelados
-- RPC: get_resultado_vendedor_mes(p_vendedor_id, p_ano, p_mes)
--
-- IMPORTANTE: esta tabela é ADITIVA. Não altera pedidos, itens_pedido
-- nem faturamentos. O valor_cancelado é sempre positivo; o sistema o
-- subtrai ao calcular resultado líquido. A data_cancelamento define
-- qual mês absorve o impacto negativo, independentemente do mês da venda.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Tabela
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE public.pedidos_cancelados (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_pedido     text          NOT NULL,
  cliente_id        uuid          REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nome      text,
  vendedor_id       uuid          NOT NULL REFERENCES public.profiles(id),
  valor_cancelado   numeric(12,2) NOT NULL CHECK (valor_cancelado > 0),
  data_cancelamento date          NOT NULL,
  motivo            text          NOT NULL CHECK (motivo IN ('desistencia','inadimplencia','erro_comercial','logistica','outro')),
  observacoes       text,
  registrado_por    uuid          REFERENCES public.profiles(id),
  created_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX pedidos_cancelados_vendedor_data
  ON public.pedidos_cancelados (vendedor_id, data_cancelamento DESC);
CREATE INDEX pedidos_cancelados_data
  ON public.pedidos_cancelados (data_cancelamento DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. RLS — padrão has_role() conforme o restante do sistema
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.pedidos_cancelados ENABLE ROW LEVEL SECURITY;

-- SELECT: admin, faturamento e gestora_faturamento veem tudo
CREATE POLICY "pc_select_retaguarda" ON public.pedidos_cancelados
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faturamento')
    OR public.has_role(auth.uid(), 'gestora_faturamento')
    OR public.has_role(auth.uid(), 'gestora')
  );

-- SELECT: vendedor vê apenas os próprios cancelamentos
CREATE POLICY "pc_select_vendedor" ON public.pedidos_cancelados
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'vendedor')
    AND vendedor_id = auth.uid()
  );

-- INSERT: faturamento e retaguarda
CREATE POLICY "pc_insert_retaguarda" ON public.pedidos_cancelados
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faturamento')
    OR public.has_role(auth.uid(), 'gestora_faturamento')
  );

-- UPDATE: faturamento e retaguarda
CREATE POLICY "pc_update_retaguarda" ON public.pedidos_cancelados
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faturamento')
    OR public.has_role(auth.uid(), 'gestora_faturamento')
  );

-- DELETE: apenas admin
CREATE POLICY "pc_delete_admin" ON public.pedidos_cancelados
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RPC: get_resultado_vendedor_mes
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_resultado_vendedor_mes(
  p_vendedor_id uuid,
  p_ano         integer,
  p_mes         integer
)
RETURNS TABLE (
  vendas_brutas     numeric,
  total_cancelado   numeric,
  resultado_liquido numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full   text;
  v_sank   text;
  v_match  text;
  v_ini    date;
  v_fim    date;
BEGIN
  SELECT nullif(btrim(p.full_name), ''), nullif(btrim(p.nome_sankhya), '')
    INTO v_full, v_sank
  FROM public.profiles p
  WHERE p.id = p_vendedor_id;

  v_match := CASE
    WHEN v_sank IS NOT NULL THEN v_sank
    WHEN v_full IS NOT NULL THEN '%' || v_full || '%'
    ELSE NULL
  END;

  v_ini := make_date(p_ano, p_mes, 1);
  v_fim := (v_ini + interval '1 month')::date - 1;

  RETURN QUERY
  SELECT
    COALESCE((
      SELECT sum(f.valor_liquido)
      FROM public.faturamentos_sankhya f
      WHERE v_match IS NOT NULL
        AND f.nome_vendedor ILIKE v_match
        AND f.data_faturamento >= v_ini
        AND f.data_faturamento <= v_fim
        AND COALESCE(f.tipo_operacao, '') !~* 'devolu'
    ), 0)::numeric,
    COALESCE((
      SELECT sum(pc.valor_cancelado)
      FROM public.pedidos_cancelados pc
      WHERE pc.vendedor_id = p_vendedor_id
        AND pc.data_cancelamento >= v_ini
        AND pc.data_cancelamento <= v_fim
    ), 0)::numeric,
    (
      COALESCE((
        SELECT sum(f.valor_liquido)
        FROM public.faturamentos_sankhya f
        WHERE v_match IS NOT NULL
          AND f.nome_vendedor ILIKE v_match
          AND f.data_faturamento >= v_ini
          AND f.data_faturamento <= v_fim
          AND COALESCE(f.tipo_operacao, '') !~* 'devolu'
      ), 0) -
      COALESCE((
        SELECT sum(pc.valor_cancelado)
        FROM public.pedidos_cancelados pc
        WHERE pc.vendedor_id = p_vendedor_id
          AND pc.data_cancelamento >= v_ini
          AND pc.data_cancelamento <= v_fim
      ), 0)
    )::numeric;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_resultado_vendedor_mes(uuid, integer, integer) TO authenticated;
