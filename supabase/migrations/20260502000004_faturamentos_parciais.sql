-- ═══════════════════════════════════════════════════════════════════
-- Migration: faturamentos and itens_faturados tables
-- Supports multi-NF / partial billing per pedido.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.faturamentos (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id     uuid        NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  nota_fiscal   text,
  nf_pdf_url    text,
  rastreio      text,
  obs           text,
  faturado_em   timestamptz NOT NULL DEFAULT now(),
  usuario_id    uuid        REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faturamentos_pedido_id ON public.faturamentos (pedido_id);

ALTER TABLE public.faturamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "faturamentos_fat_admin_all" ON public.faturamentos
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'faturamento'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'faturamento'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "faturamentos_vendedor_select" ON public.faturamentos
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.pedidos
      WHERE id = faturamentos.pedido_id AND vendedor_id = auth.uid()
    )
  );

-- ── itens_faturados ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.itens_faturados (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  faturamento_id      uuid    NOT NULL REFERENCES public.faturamentos(id) ON DELETE CASCADE,
  pedido_id           uuid    NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  item_pedido_id      uuid    NOT NULL REFERENCES public.itens_pedido(id) ON DELETE CASCADE,
  quantidade_faturada integer NOT NULL CHECK (quantidade_faturada > 0),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itens_faturados_pedido_id      ON public.itens_faturados (pedido_id);
CREATE INDEX IF NOT EXISTS idx_itens_faturados_item_pedido_id ON public.itens_faturados (item_pedido_id);

ALTER TABLE public.itens_faturados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "itens_faturados_fat_admin_all" ON public.itens_faturados
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'faturamento'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'faturamento'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "itens_faturados_vendedor_select" ON public.itens_faturados
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.pedidos
      WHERE id = itens_faturados.pedido_id AND vendedor_id = auth.uid()
    )
  );
