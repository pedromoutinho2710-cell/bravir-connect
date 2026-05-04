-- ══════════════════════════════════════════════════════════════════
-- RODAR NO SUPABASE DASHBOARD → SQL Editor
-- ══════════════════════════════════════════════════════════════════

-- 1. Adicionar coluna titulo em notificacoes (opcional, para uso futuro)
ALTER TABLE public.notificacoes ADD COLUMN IF NOT EXISTS titulo text;

-- 2. RLS para historico_status (tabela existe no banco mas sem RLS)
ALTER TABLE public.historico_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "historico_authenticated" ON public.historico_status;
CREATE POLICY "historico_authenticated" ON public.historico_status
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. RLS para itens_faturados (política granular: faturamento/admin grava, vendedor lê só os seus)
ALTER TABLE public.itens_faturados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "itens_faturados_all" ON public.itens_faturados;
CREATE POLICY "itens_faturados_all" ON public.itens_faturados
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('faturamento', 'admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.pedidos
      WHERE id = itens_faturados.pedido_id
        AND vendedor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('faturamento', 'admin')
    )
  );

-- ══════════════════════════════════════════════════════════════════
