-- Função: clientes_com_metricas()
-- Retorna todos os clientes com métricas pré-agregadas do banco (LTV, pedidos, marcas,
-- ciclo médio, última compra). Substitui as 2 queries pesadas do cliente (clientes +
-- pedidos+itens_pedido+produtos) por uma única chamada RPC.

CREATE OR REPLACE FUNCTION public.clientes_com_metricas()
RETURNS TABLE (
  id                  uuid,
  razao_social        text,
  nome_parceiro       text,
  nome_fantasia       text,
  cnpj                text,
  cidade              text,
  uf                  text,
  cluster             text,
  grupo_cliente       text,
  tabela_preco        text,
  vendedor_id         uuid,
  status              text,
  negativado          boolean,
  aceita_saldo        boolean,
  suframa             boolean,
  codigo_cliente      text,
  codigo_parceiro     text,
  canal               text,
  desconto_adicional  numeric,
  email               text,
  telefone            text,
  comprador           text,
  cep                 text,
  observacoes_trade   text,
  ltv                 numeric,
  num_pedidos         bigint,
  ticket_medio        numeric,
  ciclo_medio         numeric,
  ultima_compra       text,
  ultima_compra_total numeric,
  marcas              text[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH ped AS (
  -- Pedidos válidos (exclui rascunhos e cancelados)
  SELECT p.id, p.cliente_id, p.data_pedido
  FROM pedidos p
  WHERE p.status NOT IN ('rascunho', 'cancelado')
),
itens_agg AS (
  -- Agrega LTV, contagem de pedidos e marcas por cliente
  SELECT
    ped.cliente_id,
    SUM(i.total_item)                                  AS ltv,
    COUNT(DISTINCT ped.id)                             AS num_pedidos,
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT prod.marca), NULL) AS marcas
  FROM ped
  JOIN itens_pedido i  ON i.pedido_id = ped.id
  LEFT JOIN produtos prod ON prod.id  = i.produto_id
  GROUP BY ped.cliente_id
),
ciclo_agg AS (
  -- Calcula ciclo médio de recompra em dias usando LAG()
  -- data_pedido é tipo date: date - date retorna integer (dias), não interval
  SELECT
    cliente_id,
    AVG(diff_days) AS ciclo_medio
  FROM (
    SELECT
      cliente_id,
      (data_pedido - LAG(data_pedido) OVER (PARTITION BY cliente_id ORDER BY data_pedido))::numeric AS diff_days
    FROM ped
  ) sub
  WHERE diff_days IS NOT NULL
  GROUP BY cliente_id
),
last_ped AS (
  -- Último pedido por cliente (para data e total da última compra)
  SELECT DISTINCT ON (cliente_id) id, cliente_id, data_pedido
  FROM ped
  ORDER BY cliente_id, data_pedido DESC, id DESC
),
last_ped_total AS (
  -- Valor total do último pedido por cliente
  SELECT lp.cliente_id, SUM(i.total_item) AS ultima_compra_total
  FROM last_ped lp
  JOIN itens_pedido i ON i.pedido_id = lp.id
  GROUP BY lp.cliente_id
)
SELECT
  c.id,
  c.razao_social,
  c.nome_parceiro,
  c.nome_fantasia,
  c.cnpj,
  c.cidade,
  c.uf,
  c.cluster,
  c.grupo_cliente,
  c.tabela_preco,
  c.vendedor_id,
  c.status,
  c.negativado,
  c.aceita_saldo,
  c.suframa,
  c.codigo_cliente,
  c.codigo_parceiro,
  c.canal,
  c.desconto_adicional,
  c.email,
  c.telefone,
  c.comprador,
  c.cep,
  c.observacoes_trade,
  COALESCE(ia.ltv, 0)::numeric                         AS ltv,
  COALESCE(ia.num_pedidos, 0)                          AS num_pedidos,
  CASE
    WHEN COALESCE(ia.num_pedidos, 0) > 0
    THEN (COALESCE(ia.ltv, 0) / ia.num_pedidos)::numeric
    ELSE 0::numeric
  END                                                   AS ticket_medio,
  ca.ciclo_medio::numeric,
  to_char(lp.data_pedido, 'YYYY-MM-DD')                AS ultima_compra,
  COALESCE(lpt.ultima_compra_total, 0)::numeric         AS ultima_compra_total,
  COALESCE(ia.marcas, ARRAY[]::text[])                  AS marcas
FROM clientes c
LEFT JOIN itens_agg ia  ON ia.cliente_id  = c.id
LEFT JOIN ciclo_agg ca  ON ca.cliente_id  = c.id
LEFT JOIN last_ped  lp  ON lp.cliente_id  = c.id
LEFT JOIN last_ped_total lpt ON lpt.cliente_id = c.id
WHERE c.deleted_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.clientes_com_metricas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.clientes_com_metricas() TO anon;
