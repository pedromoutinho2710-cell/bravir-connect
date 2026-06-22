-- Função RPC que executa o faturamento de forma atômica dentro de uma transação
CREATE OR REPLACE FUNCTION confirmar_faturamento_atomico(
  p_pedido_id uuid,
  p_numero_nota text,
  p_data_emissao date,
  p_valor_total numeric,
  p_pdf_url text,
  p_itens jsonb,
  p_criar_pedido_filho boolean,
  p_itens_filho jsonb DEFAULT '[]'::jsonb,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_faturamento_id uuid;
  v_pedido_filho_id uuid;
  v_item jsonb;
  v_result jsonb;
BEGIN
  -- 1. Inserir registro de faturamento
  INSERT INTO faturamentos (
    pedido_id,
    numero_nota,
    data_emissao,
    valor_total,
    pdf_url,
    criado_por
  ) VALUES (
    p_pedido_id,
    p_numero_nota,
    p_data_emissao,
    p_valor_total,
    p_pdf_url,
    p_usuario_id
  )
  RETURNING id INTO v_faturamento_id;

  -- 2. Inserir itens faturados
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    INSERT INTO itens_faturados (
      faturamento_id,
      item_pedido_id,
      sku,
      descricao,
      quantidade_faturada,
      preco_unitario
    ) VALUES (
      v_faturamento_id,
      (v_item->>'item_pedido_id')::uuid,
      v_item->>'sku',
      v_item->>'descricao',
      (v_item->>'quantidade_faturada')::numeric,
      (v_item->>'preco_unitario')::numeric
    );

    -- 3. Atualizar quantidade faturada em itens_pedido
    UPDATE itens_pedido
    SET quantidade_faturada = COALESCE(quantidade_faturada, 0) + (v_item->>'quantidade_faturada')::numeric
    WHERE id = (v_item->>'item_pedido_id')::uuid;
  END LOOP;

  -- 4. Criar pedido filho se necessário (itens com saldo restante)
  IF p_criar_pedido_filho AND jsonb_array_length(p_itens_filho) > 0 THEN
    -- Buscar dados do pedido pai para replicar
    INSERT INTO pedidos (
      cliente_id,
      vendedor_id,
      status,
      observacoes,
      pedido_pai_id,
      criado_por
    )
    SELECT
      cliente_id,
      vendedor_id,
      'aguardando_faturamento',
      'Saldo remanescente do pedido #' || p_pedido_id,
      p_pedido_id,
      p_usuario_id
    FROM pedidos
    WHERE id = p_pedido_id
    RETURNING id INTO v_pedido_filho_id;

    -- Inserir itens do pedido filho
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens_filho)
    LOOP
      INSERT INTO itens_pedido (
        pedido_id,
        sku,
        descricao,
        quantidade,
        preco_unitario,
        desconto_percentual
      ) VALUES (
        v_pedido_filho_id,
        v_item->>'sku',
        v_item->>'descricao',
        (v_item->>'quantidade')::numeric,
        (v_item->>'preco_unitario')::numeric,
        (v_item->>'desconto_percentual')::numeric
      );
    END LOOP;
  END IF;

  -- 5. Atualizar status do pedido pai
  UPDATE pedidos
  SET status = CASE
    WHEN p_criar_pedido_filho THEN 'faturado_parcial'
    ELSE 'faturado'
  END,
  faturado_em = NOW()
  WHERE id = p_pedido_id;

  -- Retornar resultado
  v_result := jsonb_build_object(
    'faturamento_id', v_faturamento_id,
    'pedido_filho_id', v_pedido_filho_id,
    'sucesso', true
  );

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    -- Rollback automático pelo PostgreSQL; re-lançar erro com detalhes
    RAISE EXCEPTION 'Erro ao confirmar faturamento: %', SQLERRM;
END;
$$;

-- Garantir que apenas usuários autenticados podem chamar
REVOKE ALL ON FUNCTION confirmar_faturamento_atomico FROM PUBLIC;
GRANT EXECUTE ON FUNCTION confirmar_faturamento_atomico TO authenticated;
