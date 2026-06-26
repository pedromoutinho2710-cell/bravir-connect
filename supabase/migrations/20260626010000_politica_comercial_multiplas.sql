-- Permite múltiplas políticas comerciais com título e ordem de exibição.
ALTER TABLE public.politica_comercial
  ADD COLUMN IF NOT EXISTS titulo text NOT NULL DEFAULT 'Política Comercial',
  ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0;

-- Atualiza o registro existente com um título padrão
UPDATE public.politica_comercial SET titulo = 'Política Comercial' WHERE titulo = 'Política Comercial';

-- Política de INSERT para admin criar novas políticas
CREATE POLICY "apenas admin pode inserir politica_comercial"
  ON public.politica_comercial FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Política de DELETE para admin remover políticas
CREATE POLICY "apenas admin pode excluir politica_comercial"
  ON public.politica_comercial FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
