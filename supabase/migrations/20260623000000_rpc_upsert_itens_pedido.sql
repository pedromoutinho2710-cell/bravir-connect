-- Função RPC para substituir itens de um pedido de forma atômica (DELETE + INSERT em transação)
CREATE OR REPLACE FUNCTION upsert_itens_pedido(
  p_pedido_id UUID,
  p_itens JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item JSONB;
BEGIN
  -- Deletar itens existentes do pedido
  DELETE FROM itens_pedido WHERE pedido_id = p_pedido_id;

  -- Inserir novos itens
  FOR item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    INSERT INTO itens_pedido (
      pedido_id,
      produto_id,
      sku,
      nome_produto,
      quantidade,
      preco_unitario,
      preco_unitario_original,
      desconto_percentual,
      desconto_percentual_original,
      subtotal
    ) VALUES (
      p_pedido_id,
      (item->>'produto_id')::UUID,
      item->>'sku',
      item->>'nome_produto',
      (item->>'quantidade')::INTEGER,
      (item->>'preco_unitario')::NUMERIC,
      CASE WHEN item->>'preco_unitario_original' IS NOT NULL
           THEN (item->>'preco_unitario_original')::NUMERIC
           ELSE NULL END,
      CASE WHEN item->>'desconto_percentual' IS NOT NULL
           THEN (item->>'desconto_percentual')::NUMERIC
           ELSE NULL END,
      CASE WHEN item->>'desconto_percentual_original' IS NOT NULL
           THEN (item->>'desconto_percentual_original')::NUMERIC
           ELSE NULL END,
      (item->>'subtotal')::NUMERIC
    );
  END LOOP;
END;
$$;

-- Garantir que apenas usuários autenticados possam chamar esta função
REVOKE ALL ON FUNCTION upsert_itens_pedido(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_itens_pedido(UUID, JSONB) TO authenticated;
