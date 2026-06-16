-- Coluna de desconto percentual por cliente (0–100) na tabela de preços
-- especiais do cliente (precos_cliente_produto). Usada pela aba "Preços"
-- (AbaPrecos) para aplicar um desconto adicional sobre o preço do cliente:
-- preço final = preço × (1 - desconto_perfil / 100).
ALTER TABLE precos_cliente_produto ADD COLUMN IF NOT EXISTS desconto_perfil numeric;
