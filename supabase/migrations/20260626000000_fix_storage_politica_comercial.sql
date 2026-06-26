-- Corrige RLS do storage para politica_comercial.
-- A migration anterior usava public.user_roles que não existe.
-- O sistema usa public.has_role() via profiles.

DROP POLICY IF EXISTS "admin upload documentos" ON storage.objects;

CREATE POLICY "admin upload documentos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documentos'
    AND public.has_role(auth.uid(), 'admin')
  );

-- DELETE: permite remover PDF antigo ao substituir
CREATE POLICY "admin delete documentos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documentos'
    AND public.has_role(auth.uid(), 'admin')
  );

-- UPDATE: necessário para upsert
DROP POLICY IF EXISTS "admin update documentos" ON storage.objects;
CREATE POLICY "admin update documentos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documentos'
    AND public.has_role(auth.uid(), 'admin')
  );
