-- ═══════════════════════════════════════════════════════════════════
-- Migration: tarefas table
-- Referenced by MeuPainel and MeusClientes with embedded
-- clientes(razao_social) joins — requires FK to clientes.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tarefas (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  cliente_id       uuid        REFERENCES public.clientes(id) ON DELETE SET NULL,
  titulo           text        NOT NULL,
  descricao        text,
  data_vencimento  date,
  concluida        boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tarefas_vendedor_id     ON public.tarefas (vendedor_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_cliente_id      ON public.tarefas (cliente_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_data_vencimento ON public.tarefas (data_vencimento);

ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;

-- Vendedores manage their own tasks
CREATE POLICY "tarefas_vendedor_all" ON public.tarefas
  FOR ALL TO authenticated
  USING (vendedor_id = auth.uid())
  WITH CHECK (vendedor_id = auth.uid());

-- Admins can see all tasks
CREATE POLICY "tarefas_admin_select" ON public.tarefas
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
