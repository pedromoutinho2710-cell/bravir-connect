-- Adiciona coluna para rastreamento de ultima atualizacao de status
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS status_atualizado_em TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS responsavel_id UUID;

-- Tabela de historico de status dos pedidos
CREATE TABLE IF NOT EXISTS public.historico_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  status_anterior TEXT,
  status_novo TEXT NOT NULL,
  acao TEXT NOT NULL,
  motivo TEXT,
  usuario_id UUID NOT NULL,
  usuario_nome TEXT,
  usuario_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historico_status_pedido_id ON public.historico_status(pedido_id);
CREATE INDEX IF NOT EXISTS idx_historico_status_usuario_id ON public.historico_status(usuario_id);

ALTER TABLE public.historico_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados veem historico" ON public.historico_status FOR SELECT TO authenticated USING (true);
CREATE POLICY "Faturamento e admin registram historico" ON public.historico_status FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'faturamento') OR public.has_role(auth.uid(), 'admin'));

-- Funcao SECURITY DEFINER para registrar eventos (chamada via RPC)
CREATE OR REPLACE FUNCTION public.log_pedido_event(
  p_pedido_id UUID,
  p_acao TEXT,
  p_motivo TEXT DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_usuario_id UUID;
  v_usuario_nome TEXT;
  v_usuario_email TEXT;
  v_status_atual TEXT;
BEGIN
  v_usuario_id := auth.uid();
  
  -- Busca dados do usuario
  SELECT full_name, email INTO v_usuario_nome, v_usuario_email
  FROM public.profiles
  WHERE id = v_usuario_id;
  
  -- Busca status atual do pedido
  SELECT status INTO v_status_atual
  FROM public.pedidos
  WHERE id = p_pedido_id;
  
  -- Registra no historico
  INSERT INTO public.historico_status (
    pedido_id, status_anterior, status_novo, acao, motivo,
    usuario_id, usuario_nome, usuario_email
  ) VALUES (
    p_pedido_id, v_status_atual, v_status_atual, p_acao, p_motivo,
    v_usuario_id, v_usuario_nome, v_usuario_email
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger para auditar mudancas de status e responsavel
CREATE OR REPLACE FUNCTION public.trigger_pedidos_audit()
RETURNS TRIGGER AS $$
DECLARE
  v_usuario_nome TEXT;
  v_usuario_email TEXT;
BEGIN
  -- Busca dados do usuario autenticado
  SELECT full_name, email INTO v_usuario_nome, v_usuario_email
  FROM public.profiles
  WHERE id = auth.uid();
  
  -- Se status mudou, registra no historico
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_atualizado_em := now();
    NEW.responsavel_id := auth.uid();
    
    INSERT INTO public.historico_status (
      pedido_id, status_anterior, status_novo, acao, motivo,
      usuario_id, usuario_nome, usuario_email
    ) VALUES (
      NEW.id, OLD.status, NEW.status, 'Mudança de status',
      NEW.motivo, auth.uid(), v_usuario_nome, v_usuario_email
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop e recria trigger para garantir atualizacao
DROP TRIGGER IF EXISTS trigger_pedidos_audit ON public.pedidos;
CREATE TRIGGER trigger_pedidos_audit
  BEFORE INSERT OR UPDATE ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_pedidos_audit();
