
-- Clientes
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj TEXT NOT NULL UNIQUE,
  razao_social TEXT NOT NULL,
  cidade TEXT,
  uf TEXT,
  cep TEXT,
  comprador TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados veem clientes" ON public.clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Vendedores e admins inserem clientes" ON public.clientes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'vendedor') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Vendedores e admins atualizam clientes" ON public.clientes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'vendedor') OR public.has_role(auth.uid(), 'admin'));

-- Produtos
CREATE TABLE public.produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_jiva TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  marca TEXT NOT NULL,
  cx_embarque INTEGER NOT NULL DEFAULT 1,
  peso_unitario NUMERIC NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true
);
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados veem produtos" ON public.produtos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins gerenciam produtos" ON public.produtos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Precos
CREATE TABLE public.precos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  tabela TEXT NOT NULL,
  preco_bruto NUMERIC NOT NULL,
  UNIQUE (produto_id, tabela)
);
ALTER TABLE public.precos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados veem precos" ON public.precos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins gerenciam precos" ON public.precos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Descontos
CREATE TABLE public.descontos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  perfil_cliente TEXT NOT NULL,
  percentual_desconto NUMERIC NOT NULL DEFAULT 0,
  UNIQUE (produto_id, perfil_cliente)
);
ALTER TABLE public.descontos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados veem descontos" ON public.descontos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins gerenciam descontos" ON public.descontos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Pedidos
CREATE TABLE public.pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_pedido SERIAL,
  tipo TEXT NOT NULL DEFAULT 'Pedido',
  data_pedido DATE NOT NULL DEFAULT CURRENT_DATE,
  vendedor_id UUID NOT NULL,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id),
  perfil_cliente TEXT NOT NULL,
  tabela_preco TEXT NOT NULL,
  cond_pagamento TEXT,
  agendamento BOOLEAN NOT NULL DEFAULT false,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendedor ve seus pedidos" ON public.pedidos FOR SELECT TO authenticated
  USING (vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faturamento') OR public.has_role(auth.uid(), 'logistica'));
CREATE POLICY "Vendedor cria seus pedidos" ON public.pedidos FOR INSERT TO authenticated
  WITH CHECK (vendedor_id = auth.uid() AND public.has_role(auth.uid(), 'vendedor'));
CREATE POLICY "Vendedor edita seus pedidos" ON public.pedidos FOR UPDATE TO authenticated
  USING (vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faturamento'));
CREATE POLICY "Admin deleta pedidos" ON public.pedidos FOR DELETE TO authenticated
  USING (vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Itens
CREATE TABLE public.itens_pedido (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id),
  quantidade INTEGER NOT NULL,
  preco_unitario_bruto NUMERIC NOT NULL,
  preco_unitario_liquido NUMERIC NOT NULL,
  total_item NUMERIC NOT NULL
);
ALTER TABLE public.itens_pedido ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ve itens conforme pedido" ON public.itens_pedido FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id
    AND (p.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'faturamento') OR public.has_role(auth.uid(), 'logistica'))));
CREATE POLICY "Gerencia itens conforme pedido" ON public.itens_pedido FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id
    AND (p.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id
    AND (p.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- Realtime para faturamento
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos;
