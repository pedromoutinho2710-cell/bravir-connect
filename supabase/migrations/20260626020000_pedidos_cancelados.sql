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
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_pedido     text        NOT NULL,
  cliente_id        uuid        REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nome      text,
  vendedor_id       uuid        NOT NULL REFERENCES public.profiles(id),
  valor_cancelado   numeric(12,2) NOT NULL CHECK (valor_cancelado > 0),
  data_cancelamento date        NOT NULL,
  motivo            text        NOT NULL CHECK (motivo IN ('desistencia','inadimplencia','erro_comercial','logistica','outro')),
  observacoes       text,
  registrado_por    uuid        REFERENCES public.profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Índices para as queries mais comuns
CREATE INDEX pedidos_cancelados_vendedor_mes
  ON public.pedidos_cancelados (vendedor_id, date_trunc('month', data_cancelamento));
CREATE INDEX pedidos_cancelados_data
  ON public.pedidos_cancelados (data_cancelamento DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. RLS
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.pedidos_cancelados ENABLE ROW LEVEL SECURITY;

-- SELECT
CREATE POLICY "pc_select_retaguarda" ON public.pedidos_cancelados
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'faturamento'::public.app_role)
    OR public.has_role(auth.uid(), 'gestora_faturamento'::public.app_role)
  );

-- Vendedor vê apenas os próprios cancelamentos
CREATE POLICY "pc_select_vendedor" ON public.pedidos_cancelados
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'vendedor'::public.app_role)
    AND vendedor_id = auth.uid()
  );

-- INSERT
CREATE POLICY "pc_insert_retaguarda" ON public.pedidos_cancelados
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'faturamento'::public.app_role)
    OR public.has_role(auth.uid(), 'gestora_faturamento'::public.app_role)
  );

-- UPDATE
CREATE POLICY "pc_update_retaguarda" ON public.pedidos_cancelados
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'faturamento'::public.app_role)
    OR public.has_role(auth.uid(), 'gestora_faturamento'::public.app_role)
  );

-- DELETE: apenas admin
CREATE POLICY "pc_delete_admin" ON public.pedidos_cancelados
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RPC: get_resultado_vendedor_mes
-- Retorna vendas_brutas (faturamentos_sankhya), total_cancelado e
-- resultado_liquido para um vendedor num mês/ano específico.
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
    ), 0)::numeric AS vendas_brutas,
    COALESCE((
      SELECT sum(pc.valor_cancelado)
      FROM public.pedidos_cancelados pc
      WHERE pc.vendedor_id = p_vendedor_id
        AND date_trunc('month', pc.data_cancelamento) = v_ini
    ), 0)::numeric AS total_cancelado,
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
          AND date_trunc('month', pc.data_cancelamento) = v_ini
      ), 0)
    )::numeric AS resultado_liquido;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_resultado_vendedor_mes(uuid, integer, integer) TO authenticated;
