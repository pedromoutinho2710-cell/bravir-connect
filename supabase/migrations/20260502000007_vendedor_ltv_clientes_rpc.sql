-- ═══════════════════════════════════════════════════════════════════
-- RPC: vendedor_ltv_clientes(vendedor_id)
-- Returns the top 10 clients (by LTV) of a given vendedor that have
-- not placed a non-cancelled order in the last 30 days.
-- Called by MeuPainel to replace a full pedido-history client-side
-- aggregation, so the client receives ~10 aggregated rows instead of
-- an entire order history.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.vendedor_ltv_clientes(_vendedor_id uuid)
RETURNS TABLE (
  cliente_id       uuid,
  razao_social     text,
  ltv              numeric,
  ultima_compra    date,
  dias_sem_compra  integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.cliente_id,
    MAX(c.razao_social)                                        AS razao_social,
    SUM(ip.total_item)                                         AS ltv,
    MAX(p.data_pedido::date)                                   AS ultima_compra,
    (CURRENT_DATE - MAX(p.data_pedido::date))::integer         AS dias_sem_compra
  FROM pedidos p
  JOIN itens_pedido ip ON ip.pedido_id = p.id
  JOIN clientes      c  ON c.id = p.cliente_id
  WHERE p.vendedor_id = _vendedor_id
    AND p.status NOT IN ('rascunho', 'cancelado')
  GROUP BY p.cliente_id
  HAVING MAX(p.data_pedido::date) < CURRENT_DATE - 30
  ORDER BY ltv DESC
  LIMIT 10;
$$;

-- Allow any authenticated user to call this function (the function
-- itself is scoped to the vendedor_id argument the client passes).
GRANT EXECUTE ON FUNCTION public.vendedor_ltv_clientes(uuid) TO authenticated;
