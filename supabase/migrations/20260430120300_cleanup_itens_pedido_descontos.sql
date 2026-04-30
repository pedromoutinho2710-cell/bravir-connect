-- Script de limpeza: normaliza campos de desconto em itens_pedido gravados com valores incorretos
-- Aplica apenas em registros onde os descontos sao inconsistentes

UPDATE public.itens_pedido
SET
  desconto_perfil = COALESCE(desconto_perfil, 0),
  desconto_comercial = 0,
  desconto_trade = 0,
  preco_apos_perfil = preco_unitario_liquido,
  preco_apos_comercial = preco_unitario_liquido,
  preco_final = preco_unitario_liquido
WHERE
  (desconto_comercial IS NULL OR desconto_comercial != 0)
  OR (desconto_trade IS NULL OR desconto_trade != 0)
  OR (preco_apos_perfil IS NULL OR preco_apos_perfil != preco_unitario_liquido)
  OR (preco_apos_comercial IS NULL OR preco_apos_comercial != preco_unitario_liquido)
  OR (preco_final IS NULL OR preco_final != preco_unitario_liquido);
