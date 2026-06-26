-- Módulo de Bonificações — controle gerencial isolado
-- NÃO compõe faturamento, metas, rankings ou comissões

CREATE TABLE IF NOT EXISTS public.bonificacoes (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id      uuid          NOT NULL REFERENCES public.profiles(id),
  cliente_id       uuid          REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nome     text,
  pedido_id        uuid          REFERENCES public.pedidos(id) ON DELETE SET NULL,
  numero_pedido    text,
  valor            numeric(12,2) NOT NULL CHECK (valor > 0),
  data_bonificacao date          NOT NULL,
  motivo           text,
  status           text          NOT NULL DEFAULT 'pendente'
                                 CHECK (status IN ('pendente','aprovada','paga')),
  registrado_por   uuid          REFERENCES public.profiles(id),
  observacoes      text,
  created_at       timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bonificacoes_vendedor_data
  ON public.bonificacoes (vendedor_id, data_bonificacao DESC);

CREATE INDEX IF NOT EXISTS idx_bonificacoes_data
  ON public.bonificacoes (data_bonificacao DESC);

CREATE INDEX IF NOT EXISTS idx_bonificacoes_status
  ON public.bonificacoes (status);

-- RLS
ALTER TABLE public.bonificacoes ENABLE ROW LEVEL SECURITY;

-- SELECT: admin e gestora veem todos
CREATE POLICY "bonificacoes_select_admin_gestora"
  ON public.bonificacoes FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'gestora')
  );

-- SELECT: vendedor vê apenas os seus próprios
CREATE POLICY "bonificacoes_select_vendedor"
  ON public.bonificacoes FOR SELECT
  USING (
    public.has_role(auth.uid(), 'vendedor')
    AND vendedor_id = auth.uid()
  );

-- INSERT: admin, gestora, gestora_faturamento
CREATE POLICY "bonificacoes_insert"
  ON public.bonificacoes FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'gestora')
    OR public.has_role(auth.uid(), 'gestora_faturamento')
  );

-- UPDATE: admin, gestora, gestora_faturamento
CREATE POLICY "bonificacoes_update"
  ON public.bonificacoes FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'gestora')
    OR public.has_role(auth.uid(), 'gestora_faturamento')
  );

-- DELETE: apenas admin
CREATE POLICY "bonificacoes_delete"
  ON public.bonificacoes FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin')
  );
