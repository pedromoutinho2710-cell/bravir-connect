-- Tabela para política comercial editável pelo admin
CREATE TABLE IF NOT EXISTS public.politica_comercial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conteudo_html text,
  pdf_url text,
  atualizado_em timestamptz DEFAULT now(),
  atualizado_por uuid REFERENCES public.profiles(id)
);

-- Apenas um registro ativo (INSERT apenas se não existir)
INSERT INTO public.politica_comercial (conteudo_html) VALUES ('') ON CONFLICT DO NOTHING;

-- Storage bucket para documentos (se não existir)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', false)
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE public.politica_comercial ENABLE ROW LEVEL SECURITY;

CREATE POLICY "todos autenticados podem ler politica_comercial"
  ON public.politica_comercial FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "apenas admin pode atualizar politica_comercial"
  ON public.politica_comercial FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Storage: admin pode fazer upload no bucket documentos
CREATE POLICY "admin upload documentos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documentos'
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "todos autenticados podem ler documentos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'documentos');
