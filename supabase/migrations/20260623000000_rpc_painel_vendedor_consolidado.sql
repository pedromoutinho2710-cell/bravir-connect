-- RPC que retorna dados consolidados do painel do vendedor em uma única query
-- Evita N+1: busca todos os pedidos + itens do intervalo de uma vez

CREATE OR REPLACE FUNCTION painel_vendedor_consolidado(
  p_vendedor_id UUID,
  p_inicio DATE,
  p_fim DATE
)
RETURNS TABLE (
  pedido_id UUID,
  pedido_data DATE,
  pedido_status TEXT,
  cliente_id UUID,
  cliente_nome TEXT,
  item_sku TEXT,
  item_marca TEXT,
  item_descricao TEXT,
  item_total NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id            AS pedido_id,
    p.data::DATE    AS pedido_data,
    p.status        AS pedido_status,
    c.id            AS cliente_id,
    c.nome          AS cliente_nome,
    ip.sku          AS item_sku,
    ip.marca        AS item_marca,
    ip.descricao    AS item_descricao,
    ip.total_item   AS item_total
  FROM pedidos p
  JOIN clientes c ON c.id = p.cliente_id
  JOIN itens_pedido ip ON ip.pedido_id = p.id
  WHERE p.vendedor_id = p_vendedor_id
    AND p.data::DATE >= p_inicio
    AND p.data::DATE <= p_fim
    AND p.status NOT IN ('cancelado', 'rascunho')
  ORDER BY p.data DESC;
$$;

GRANT EXECUTE ON FUNCTION painel_vendedor_consolidado(UUID, DATE, DATE) TO authenticated;
