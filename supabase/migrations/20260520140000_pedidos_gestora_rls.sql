-- Permite que a gestora crie, edite, veja e gerencie itens de pedidos
-- em nome dos representantes (vendedor_id != auth.uid()).

CREATE POLICY "Gestora cria pedidos" ON public.pedidos FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gestora'));

CREATE POLICY "Gestora edita pedidos" ON public.pedidos FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gestora'))
  WITH CHECK (public.has_role(auth.uid(), 'gestora'));

CREATE POLICY "Gestora ve pedidos" ON public.pedidos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gestora'));

DROP POLICY IF EXISTS "Gerencia itens conforme pedido" ON public.itens_pedido;
CREATE POLICY "Gerencia itens conforme pedido" ON public.itens_pedido FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id
    AND (p.vendedor_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'gestora'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id
    AND (p.vendedor_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'gestora'))));

DROP POLICY IF EXISTS "Ve itens conforme pedido" ON public.itens_pedido;
CREATE POLICY "Ve itens conforme pedido" ON public.itens_pedido FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id
    AND (p.vendedor_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'faturamento')
      OR public.has_role(auth.uid(), 'logistica')
      OR public.has_role(auth.uid(), 'gestora'))));
