-- ══════════════════════════════════════════════════════════════════
-- Auditoria de exclusão/restauração de pedidos + histórico de estoque
-- ══════════════════════════════════════════════════════════════════
-- Nota: a trigger `trigger_pedidos_audit` da migration 20260430120000 nunca
-- foi de fato aplicada em produção — hoje todo o log de historico_status é
-- feito por chamadas explícitas no app (insertHistorico em Faturamento.tsx).
-- Por isso criamos uma trigger nova e específica, só para deleted_at, em vez
-- de reativar a trigger antiga (evitaria duplicar log de mudança de status).

-- 1. Loga exclusão (soft-delete) e restauração de pedidos em historico_status
CREATE OR REPLACE FUNCTION public.trigger_pedidos_exclusao_log()
RETURNS TRIGGER AS $$
DECLARE
  v_usuario_nome TEXT;
  v_usuario_email TEXT;
BEGIN
  SELECT full_name, email INTO v_usuario_nome, v_usuario_email
  FROM public.profiles
  WHERE id = auth.uid();

  INSERT INTO public.historico_status (
    pedido_id, status_anterior, status_novo, acao,
    usuario_id, usuario_nome, usuario_email
  ) VALUES (
    NEW.id, OLD.status, NEW.status,
    CASE WHEN NEW.deleted_at IS NOT NULL THEN 'exclusão' ELSE 'restaurou' END,
    auth.uid(), v_usuario_nome, v_usuario_email
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER FUNCTION public.trigger_pedidos_exclusao_log() SET search_path = public;

DROP TRIGGER IF EXISTS trigger_pedidos_exclusao_log ON public.pedidos;
CREATE TRIGGER trigger_pedidos_exclusao_log
  AFTER UPDATE ON public.pedidos
  FOR EACH ROW
  WHEN (NEW.deleted_at IS DISTINCT FROM OLD.deleted_at)
  EXECUTE FUNCTION public.trigger_pedidos_exclusao_log();

-- 2. Histórico de alterações em produtos (ex.: disponível/indisponível)
CREATE TABLE IF NOT EXISTS public.historico_estoque (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  campo TEXT NOT NULL,
  valor_anterior TEXT,
  valor_novo TEXT,
  usuario_id UUID,
  usuario_nome TEXT,
  usuario_email TEXT,
  usuario_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historico_estoque_produto_id ON public.historico_estoque(produto_id);
CREATE INDEX IF NOT EXISTS idx_historico_estoque_created_at ON public.historico_estoque(created_at);

ALTER TABLE public.historico_estoque ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "historico_estoque_authenticated" ON public.historico_estoque;
CREATE POLICY "historico_estoque_authenticated" ON public.historico_estoque
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
