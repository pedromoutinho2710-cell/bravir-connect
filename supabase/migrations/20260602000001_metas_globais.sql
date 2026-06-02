-- Meta total do mês (objetivo global da empresa), independente de vendedor.
-- Uma linha por (mes, ano). Lida pelo dashboard e gerida pela tela admin de metas.

CREATE TABLE IF NOT EXISTS public.metas_globais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano int NOT NULL,
  valor_meta_reais numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT metas_globais_mes_ano_key UNIQUE (mes, ano)
);

ALTER TABLE public.metas_globais ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário autenticado (dashboard usa o valor global)
DROP POLICY IF EXISTS "metas_globais_select" ON public.metas_globais;
CREATE POLICY "metas_globais_select" ON public.metas_globais
  FOR SELECT TO authenticated USING (true);

-- Escrita (insert/update/delete): admin, gestora, gestora_faturamento
DROP POLICY IF EXISTS "metas_globais_write" ON public.metas_globais;
CREATE POLICY "metas_globais_write" ON public.metas_globais
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'gestora', 'gestora_faturamento')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'gestora', 'gestora_faturamento')
    )
  );
