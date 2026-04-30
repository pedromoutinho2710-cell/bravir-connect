-- Insere 10 SKUs Laby com dados reais (idempotente)
INSERT INTO public.produtos (codigo_jiva, nome, marca, cx_embarque, peso_unitario, ativo)
VALUES
  ('8803', 'ICEKISS Menta/Cereja Push Pull 3,5g C/2', 'Laby', 12, 0.017, true),
  ('42',   'Prot Sol Labial FPS30 Stick 4,5g C/1',   'Laby', 144, 0.020, true),
  ('44',   'Prot Sol Labial FPS50 Stick 4,5g C/1',   'Laby', 144, 0.020, true),
  ('8348', 'Stick Multifuncional Cor 1 12g',          'Laby', 12, 0.030, true),
  ('7893', 'Stick Multifuncional Cor 2 12g',          'Laby', 12, 0.030, true),
  ('8349', 'Stick Multifuncional Cor 3 12g',          'Laby', 12, 0.030, true),
  ('7894', 'Stick Multifuncional Cor 4 12g',          'Laby', 12, 0.030, true),
  ('8350', 'Stick Multifuncional Cor 5 12g',          'Laby', 12, 0.030, true),
  ('7895', 'Stick Multifuncional Cor 6 12g',          'Laby', 12, 0.030, true),
  ('8351', 'Stick Multifuncional Cor 7 12g',          'Laby', 12, 0.030, true)
ON CONFLICT (codigo_jiva) DO NOTHING;

-- Precos reais por tabela (P1='7', P2='12', P3='18', P4='suframa')
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '7', 10.86 FROM public.produtos WHERE codigo_jiva = '8803' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '12', 11.58 FROM public.produtos WHERE codigo_jiva = '8803' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '18', 12.58 FROM public.produtos WHERE codigo_jiva = '8803' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, 'suframa', 9.56 FROM public.produtos WHERE codigo_jiva = '8803' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;

INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '7', 8.997 FROM public.produtos WHERE codigo_jiva = '42' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '12', 9.593 FROM public.produtos WHERE codigo_jiva = '42' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '18', 10.421 FROM public.produtos WHERE codigo_jiva = '42' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, 'suframa', 7.917 FROM public.produtos WHERE codigo_jiva = '42' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;

INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '7', 10.685 FROM public.produtos WHERE codigo_jiva = '44' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '12', 11.393 FROM public.produtos WHERE codigo_jiva = '44' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '18', 12.376 FROM public.produtos WHERE codigo_jiva = '44' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, 'suframa', 9.403 FROM public.produtos WHERE codigo_jiva = '44' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;

INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '7', 42.459 FROM public.produtos WHERE codigo_jiva = '8348' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '12', 45.271 FROM public.produtos WHERE codigo_jiva = '8348' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '18', 49.179 FROM public.produtos WHERE codigo_jiva = '8348' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, 'suframa', 37.364 FROM public.produtos WHERE codigo_jiva = '8348' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;

INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '7', 42.459 FROM public.produtos WHERE codigo_jiva = '7893' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '12', 45.271 FROM public.produtos WHERE codigo_jiva = '7893' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '18', 49.179 FROM public.produtos WHERE codigo_jiva = '7893' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, 'suframa', 37.364 FROM public.produtos WHERE codigo_jiva = '7893' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;

INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '7', 42.459 FROM public.produtos WHERE codigo_jiva = '8349' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '12', 45.271 FROM public.produtos WHERE codigo_jiva = '8349' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '18', 49.179 FROM public.produtos WHERE codigo_jiva = '8349' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, 'suframa', 37.364 FROM public.produtos WHERE codigo_jiva = '8349' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;

INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '7', 42.459 FROM public.produtos WHERE codigo_jiva = '7894' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '12', 45.271 FROM public.produtos WHERE codigo_jiva = '7894' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '18', 49.179 FROM public.produtos WHERE codigo_jiva = '7894' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, 'suframa', 37.364 FROM public.produtos WHERE codigo_jiva = '7894' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;

INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '7', 42.459 FROM public.produtos WHERE codigo_jiva = '8350' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '12', 45.271 FROM public.produtos WHERE codigo_jiva = '8350' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '18', 49.179 FROM public.produtos WHERE codigo_jiva = '8350' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, 'suframa', 37.364 FROM public.produtos WHERE codigo_jiva = '8350' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;

INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '7', 42.459 FROM public.produtos WHERE codigo_jiva = '7895' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '12', 45.271 FROM public.produtos WHERE codigo_jiva = '7895' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '18', 49.179 FROM public.produtos WHERE codigo_jiva = '7895' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, 'suframa', 37.364 FROM public.produtos WHERE codigo_jiva = '7895' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;

INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '7', 42.459 FROM public.produtos WHERE codigo_jiva = '8351' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '12', 45.271 FROM public.produtos WHERE codigo_jiva = '8351' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, '18', 49.179 FROM public.produtos WHERE codigo_jiva = '8351' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;
INSERT INTO public.precos (produto_id, tabela, preco_bruto)
SELECT id, 'suframa', 37.364 FROM public.produtos WHERE codigo_jiva = '8351' AND marca = 'Laby'
ON CONFLICT (produto_id, tabela) DO NOTHING;

-- Descontos: 12 perfis reais x 10 SKUs = 120 linhas (percentual_desconto=0, ajustavel pelo admin)
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
