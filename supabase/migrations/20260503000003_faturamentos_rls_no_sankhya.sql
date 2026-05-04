-- ═══════════════════════════════════════════════════════════════════
-- P1: RLS para faturamentos + suporte ao status no_sankhya
-- ═══════════════════════════════════════════════════════════════════

-- ── faturamentos: habilitar RLS ───────────────────────────────────
ALTER TABLE public.faturamentos ENABLE ROW LEVEL SECURITY;

-- Limpar policies antigas se existirem
DROP POLICY IF EXISTS "faturamentos_faturamento_admin_all" ON public.faturamentos;
DROP POLICY IF EXISTS "faturamentos_vendedor_select"       ON public.faturamentos;

-- faturamento + admin: acesso total (INSERT, UPDATE, SELECT, DELETE)
CREATE POLICY "faturamentos_faturamento_admin_all" ON public.faturamentos
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'faturamento'::public.app_role) OR
    public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'faturamento'::public.app_role) OR
    public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- vendedor: SELECT apenas dos seus próprios pedidos
CREATE POLICY "faturamentos_vendedor_select" ON public.faturamentos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pedidos
      WHERE pedidos.id = faturamentos.pedido_id
        AND pedidos.vendedor_id = auth.uid()
    )
  );

-- ── itens_faturados: mesma lógica ────────────────────────────────
ALTER TABLE public.itens_faturados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "itens_faturados_faturamento_admin_all" ON public.itens_faturados;
DROP POLICY IF EXISTS "itens_faturados_vendedor_select"       ON public.itens_faturados;

CREATE POLICY "itens_faturados_faturamento_admin_all" ON public.itens_faturados
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'faturamento'::public.app_role) OR
    public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'faturamento'::public.app_role) OR
    public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "itens_faturados_vendedor_select" ON public.itens_faturados
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pedidos
      WHERE pedidos.id = itens_faturados.pedido_id
        AND pedidos.vendedor_id = auth.uid()
    )
  );

-- ── pedidos: garantir campo status_atualizado_em ─────────────────
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS status_atualizado_em timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

-- ── Migrar status legado em_faturamento → no_sankhya ─────────────
-- Pedidos que já estavam "em_faturamento" avançam para no_sankhya
UPDATE public.pedidos
  SET status = 'no_sankhya'
  WHERE status = 'em_faturamento';

-- ── Índice para busca por status_atualizado_em ────────────────────
CREATE INDEX IF NOT EXISTS idx_pedidos_status_atualizado_em
  ON public.pedidos (status_atualizado_em);

-- ══════════════════════════════════════════════════════════════════
-- RODAR NO SUPABASE DASHBOARD → SQL Editor
-- ══════════════════════════════════════════════════════════════════
