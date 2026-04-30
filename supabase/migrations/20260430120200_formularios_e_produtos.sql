-- Tabela de formularios (catalogos de produtos)
CREATE TABLE IF NOT EXISTS public.formularios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  padrao BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT formulario_padrao_unique UNIQUE (padrao) WHERE padrao = true
);

CREATE INDEX IF NOT EXISTS idx_formularios_padrao ON public.formularios(padrao) WHERE padrao = true;

ALTER TABLE public.formularios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados veem formularios ativos" ON public.formularios FOR SELECT TO authenticated
  USING (ativo = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins gerenciam formularios" ON public.formularios FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Tabela de produtos por formulario
CREATE TABLE IF NOT EXISTS public.formulario_produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formulario_id UUID NOT NULL REFERENCES public.formularios(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL DEFAULT 0,
  UNIQUE (formulario_id, produto_id)
);

CREATE INDEX IF NOT EXISTS idx_formulario_produtos_formulario_id ON public.formulario_produtos(formulario_id);
CREATE INDEX IF NOT EXISTS idx_formulario_produtos_produto_id ON public.formulario_produtos(produto_id);

ALTER TABLE public.formulario_produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados veem formulario_produtos (join via formularios)" ON public.formulario_produtos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.formularios f WHERE f.id = formulario_id AND (f.ativo = true OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY "Admins gerenciam formulario_produtos" ON public.formulario_produtos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger para garantir apenas 1 formulario como padrao
CREATE OR REPLACE FUNCTION public.trigger_formulario_padrao_unique()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.padrao = true THEN
    UPDATE public.formularios SET padrao = false WHERE id != NEW.id AND padrao = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_formulario_padrao_unique ON public.formularios;
CREATE TRIGGER trigger_formulario_padrao_unique
  BEFORE INSERT OR UPDATE ON public.formularios
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_formulario_padrao_unique();

-- Cria formulario padrao com todos os produtos ativos
INSERT INTO public.formularios (nome, descricao, ativo, padrao, created_by)
SELECT 'Catálogo Padrão', 'Catálogo padrão com todos os produtos ativos', true, true, id
FROM public.profiles WHERE has_role = 'admin' LIMIT 1
ON CONFLICT (padrao) WHERE padrao = true DO NOTHING;

-- Popula o formulario padrao com todos os produtos ativos (ordem por codigo_jiva)
INSERT INTO public.formulario_produtos (formulario_id, produto_id, ordem)
SELECT 
  f.id,
  p.id,
  ROW_NUMBER() OVER (ORDER BY p.codigo_jiva)
FROM public.formularios f
JOIN public.produtos p ON p.ativo = true
WHERE f.padrao = true
ON CONFLICT (formulario_id, produto_id) DO NOTHING;
