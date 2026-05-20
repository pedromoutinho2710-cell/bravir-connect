-- Gerado por scripts/gen_update_nome_parceiro.mjs
-- Total de pares: 2
-- Regra: sobrescreve quando nome_parceiro IS NULL, vazio ou diferente do novo valor.

BEGIN;

WITH mapa(codigo_parceiro, nome_parceiro) AS (
  VALUES
  ('6638', 'LIMERPACK'),
  ('5899', 'BR GOODS')
)
UPDATE public.clientes c
SET nome_parceiro = m.nome_parceiro
FROM mapa m
WHERE c.codigo_parceiro = m.codigo_parceiro
  AND (
    c.nome_parceiro IS NULL
    OR btrim(c.nome_parceiro) = ''
    OR c.nome_parceiro <> m.nome_parceiro
  )
RETURNING c.id, c.codigo_parceiro, c.nome_parceiro;

-- Confira a quantidade retornada. Se estiver OK, comite:
COMMIT;
-- Caso contrario:
-- ROLLBACK;
