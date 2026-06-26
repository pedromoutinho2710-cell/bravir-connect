-- Índices para acelerar a função clientes_com_metricas().
-- Sem estes índices o PostgreSQL faz full table scan em pedidos e
-- itens_pedido a cada chamada, que pode custar 2-4 s com volume alto.

-- pedidos.cliente_id: usado em todos os JOINs do CTE "ped"
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_id
  ON public.pedidos (cliente_id);

-- pedidos.status: usado no WHERE status NOT IN ('rascunho','cancelado')
CREATE INDEX IF NOT EXISTS idx_pedidos_status
  ON public.pedidos (status);

-- pedidos.data_pedido: usado no ORDER BY do DISTINCT ON e no LAG()
CREATE INDEX IF NOT EXISTS idx_pedidos_data_pedido
  ON public.pedidos (data_pedido);

-- índice composto para cobrir o CTE "ped" inteiro em uma única leitura de índice
CREATE INDEX IF NOT EXISTS idx_pedidos_status_cliente_data
  ON public.pedidos (status, cliente_id, data_pedido);

-- itens_pedido.pedido_id: usado no JOIN com o CTE "ped"
CREATE INDEX IF NOT EXISTS idx_itens_pedido_pedido_id
  ON public.itens_pedido (pedido_id);
