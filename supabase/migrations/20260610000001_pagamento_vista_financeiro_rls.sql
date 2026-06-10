-- ═══════════════════════════════════════════════════════════════════
-- Pagamento à vista + role financeiro — PARTE 2 (RLS)
--
-- Rode DEPOIS da PARTE 1 (o valor de enum 'financeiro' precisa já estar
-- commitado). clientes (SELECT true), notificacoes (insert true / select
-- por role+id) e profiles já cobrem o financeiro — não precisam de ajuste.
-- ═══════════════════════════════════════════════════════════════════

-- ── pedidos: financeiro vê e atualiza apenas pedidos à vista ──────────
DROP POLICY IF EXISTS "Financeiro ve pedidos a vista" ON public.pedidos;
CREATE POLICY "Financeiro ve pedidos a vista" ON public.pedidos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'financeiro') AND pagamento_vista = true);

DROP POLICY IF EXISTS "Financeiro atualiza pedidos a vista" ON public.pedidos;
CREATE POLICY "Financeiro atualiza pedidos a vista" ON public.pedidos
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'financeiro') AND pagamento_vista = true)
  WITH CHECK (public.has_role(auth.uid(), 'financeiro') AND pagamento_vista = true);

-- ── itens_pedido: financeiro precisa ler itens para somar o total ─────
DROP POLICY IF EXISTS "Ve itens conforme pedido" ON public.itens_pedido;
CREATE POLICY "Ve itens conforme pedido" ON public.itens_pedido
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido_id
      AND (
        p.vendedor_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'faturamento')
        OR public.has_role(auth.uid(), 'logistica')
        OR public.has_role(auth.uid(), 'gestora')
        OR (public.has_role(auth.uid(), 'financeiro') AND p.pagamento_vista = true)
      )
  ));
