-- Função SECURITY DEFINER para vincular pedidos após importação Sankhya
-- Permite que o role trade execute atualizações que normalmente são bloqueadas por RLS
CREATE OR REPLACE FUNCTION public.vincular_pedidos_sankhya(
  p_pedido_ids uuid[],
  p_status text DEFAULT 'faturado',
  p_faturamentos jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atualizados int := 0;
  v_fat_inseridos int := 0;
  v_item jsonb;
BEGIN
  -- Valida que só status permitidos podem ser definidos via esta função
  IF p_status NOT IN ('faturado', 'parcialmente_faturado') THEN
    RAISE EXCEPTION 'Status inválido: %', p_status;
  END IF;

  -- Atualiza pedidos que ainda não estão faturados
  UPDATE pedidos
  SET status = p_status,
      faturado_em = COALESCE(faturado_em, now())
  WHERE id = ANY(p_pedido_ids)
    AND status != 'faturado';

  GET DIAGNOSTICS v_atualizados = ROW_COUNT;

  -- Insere faturamentos evitando duplicatas
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_faturamentos)
  LOOP
    INSERT INTO faturamentos (pedido_id, nota_fiscal, usuario_id)
    VALUES (
      (v_item->>'pedido_id')::uuid,
      v_item->>'nota_fiscal',
      (v_item->>'usuario_id')::uuid
    )
    ON CONFLICT DO NOTHING;

    IF FOUND THEN v_fat_inseridos := v_fat_inseridos + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'pedidos_atualizados', v_atualizados,
    'faturamentos_inseridos', v_fat_inseridos
  );
END;
$$;

-- Permite que usuários autenticados chamem a função
-- (o SECURITY DEFINER garante que ela roda com permissões do owner, não do caller)
GRANT EXECUTE ON FUNCTION public.vincular_pedidos_sankhya(uuid[], text, jsonb) TO authenticated;
