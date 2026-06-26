-- Duas correções menores:
-- 1. Adiciona SELECT policy no storage para createSignedUrl funcionar
-- 2. Corrige backfill de título em politica_comercial (WHERE incorreto na migration anterior)

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Storage SELECT — permite createSignedUrl para usuários autenticados
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "leitura documentos autenticados" ON storage.objects;

CREATE POLICY "leitura documentos autenticados"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'documentos');

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Backfill de título: a migration anterior tinha WHERE titulo = 'Política Comercial'
--    que não bate em linhas com título NULL (adicionado por ADD COLUMN com DEFAULT).
--    O DEFAULT já preenche novas linhas; aqui garantimos que linhas antigas com NULL
--    também recebam o valor padrão.
-- ─────────────────────────────────────────────────────────────────────────
UPDATE public.politica_comercial
  SET titulo = 'Política Comercial'
  WHERE titulo IS NULL OR titulo = '';
