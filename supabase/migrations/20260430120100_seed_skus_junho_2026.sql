-- Insere 10 SKUs LABY com dados reais de producao
INSERT INTO public.produtos (codigo_jiva, nome, marca, cx_embarque, peso_unitario, ativo)
VALUES
  ('8803', 'ICEKISS Menta/Cereja Push Pull 3,5g C/2', 'Laby', 12, 0.017, true),
  ('42',   'Prot Sol Labial FPS30 Stick 4,5g C/1',    'Laby', 144, 0.020, true),
  ('44',   'Prot Sol Labial FPS50 Stick 4,5g C/1',    'Laby', 144, 0.020, true),
  ('8348', 'Stick Multifuncional Cor 1 12g',           'Laby', 12, 0.030, true),
  ('7893', 'Stick Multifuncional Cor 2 12g',           'Laby', 12, 0.030, true),
  ('8349', 'Stick Multifuncional Cor 3 12g',           'Laby', 12, 0.030, true),
  ('7894', 'Stick Multifuncional Cor 4 12g',           'Laby', 12, 0.030, true),
  ('8350', 'Stick Multifuncional Cor 5 12g',           'Laby', 12, 0.030, true),
  ('7895', 'Stick Multifuncional Cor 6 12g',           'Laby', 12, 0.030, true),
  ('8351', 'Stick Multifuncional Cor 7 12g',           'Laby', 12, 0.030, true)
ON CONFLICT (codigo_jiva) DO NOTHING;

DO $$
DECLARE
  v_skus TEXT[] := ARRAY['8803','42','44','8348','7893','8349','7894','8350','7895','8351'];
  v_p7   NUMERIC[] := ARRAY[10.86, 8.997, 10.685, 42.459, 42.459, 42.459, 42.459, 42.459, 42.459, 42.459];
  v_p12  NUMERIC[] := ARRAY[11.58, 9.593, 11.393, 45.271, 45.271, 45.271, 45.271, 45.271, 45.271, 45.271];
  v_p18  NUMERIC[] := ARRAY[12.58, 10.421, 12.376, 49.179, 49.179, 49.179, 49.179, 49.179, 49.179, 49.179];
  v_suf  NUMERIC[] := ARRAY[9.56,  7.917,  9.403, 37.364, 37.364, 37.364, 37.364, 37.364, 37.364, 37.364];
  i INT;
  v_prod_id UUID;
BEGIN
  FOR i IN 1..array_length(v_skus, 1) LOOP
    SELECT id INTO v_prod_id FROM public.produtos WHERE codigo_jiva = v_skus[i] AND marca = 'Laby';
    IF v_prod_id IS NOT NULL THEN
      INSERT INTO public.precos (produto_id, tabela, preco_bruto) VALUES
        (v_prod_id, '7',       v_p7[i]),
        (v_prod_id, '12',      v_p12[i]),
        (v_prod_id, '18',      v_p18[i]),
        (v_prod_id, 'suframa', v_suf[i])
      ON CONFLICT (produto_id, tabela) DO NOTHING;
    END IF;
  END LOOP;
END $$;

INSERT INTO public.descontos (produto_id, perfil_cliente, percentual_desconto)
SELECT p.id, perfil, 0
FROM public.produtos p,
(VALUES
  ('Varejo Alimentício'),
  ('Atacado Alimentício'),
  ('Cash & Carry'),
  ('Distribuidor Alimentício'),
  ('Varejo Ind. + Pequeno'),
  ('Varejo Rede Média e Grande'),
  ('Varejo Perfumaria'),
  ('Varejo Abrafarma'),
  ('Atacado Generalista'),
  ('Atacado Distribuidor Base'),
  ('Atacado Distribuidor Foco'),
  ('Atacado Distribuidor Parceiro')
) AS perfs(perfil)
WHERE p.marca = 'Laby'
  AND p.codigo_jiva IN ('8803','42','44','8348','7893','8349','7894','8350','7895','8351')
ON CONFLICT (produto_id, perfil_cliente) DO NOTHING;