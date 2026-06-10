-- Visão Macro: integração Bling (OAuth) e metas por canal.
-- bling_tokens: guarda o par access/refresh token da conta Bling (uma linha).
--   Escrita feita exclusivamente pela edge function bling-oauth via service role
--   (bypassa RLS). O frontend só precisa saber SE existe conexão.
-- metas_visao_macro: meta mensal por canal (B2B, Marca Própria, Online).

CREATE TABLE IF NOT EXISTS public.bling_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.bling_tokens ENABLE ROW LEVEL SECURITY;

-- Leitura: admin (para checar status "conectado"). Tokens nunca são usados no
-- frontend — apenas a existência da linha importa.
DROP POLICY IF EXISTS "bling_tokens_select_admin" ON public.bling_tokens;
CREATE POLICY "bling_tokens_select_admin" ON public.bling_tokens
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

CREATE TABLE IF NOT EXISTS public.metas_visao_macro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano int NOT NULL,
  meta_b2b numeric NOT NULL DEFAULT 0,
  meta_marca_propria numeric NOT NULL DEFAULT 0,
  meta_online numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT metas_visao_macro_mes_ano_key UNIQUE (mes, ano)
);

ALTER TABLE public.metas_visao_macro ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário autenticado.
DROP POLICY IF EXISTS "metas_visao_macro_select" ON public.metas_visao_macro;
CREATE POLICY "metas_visao_macro_select" ON public.metas_visao_macro
  FOR SELECT TO authenticated USING (true);

-- Escrita: admin, gestora, gestora_faturamento.
DROP POLICY IF EXISTS "metas_visao_macro_write" ON public.metas_visao_macro;
CREATE POLICY "metas_visao_macro_write" ON public.metas_visao_macro
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
