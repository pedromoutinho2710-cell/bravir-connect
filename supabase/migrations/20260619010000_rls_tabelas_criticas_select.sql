-- RLS por papel — Etapa 2b: fecha as quatro exposições críticas `USING (true)`.
--
-- Follow-up de 20260619000000_rls_por_papel.sql. Aquele arquivo deixou
-- DELIBERADAMENTE de fora `clientes`, `precos`, `descontos` e
-- `faturamentos_sankhya` — exatamente as tabelas que a auditoria (seção 6.2)
-- aponta como a exposição principal: hoje QUALQUER sessão autenticada (inclusive
-- um principal sem papel atribuído) consegue ler toda a base de clientes, as
-- tabelas de preço, os descontos e o faturamento Sankhya da empresa.
--
-- Esta migration substitui as políticas de SELECT `USING (true)` dessas tabelas
-- por políticas escopadas por papel (consultando public.user_roles), preservando
-- TODOS os fluxos de leitura existentes mapeados no app:
--
--   • clientes  → lido por todos os papéis de retaguarda e de venda (busca por
--                 CNPJ em useNovoPedido/SecaoCliente, joins de Faturamento,
--                 Lixeira por `financeiro`, etc.). Mantemos a leitura para
--                 qualquer papel reconhecido — o que JÁ remove o acesso de
--                 sessões sem papel. O escopo por linha (vendedor só vê seus
--                 clientes) continua adiado: depende do redesenho da busca por
--                 CNPJ via RPC SECURITY DEFINER, pois hoje o vendedor precisa
--                 localizar/cadastrar clientes que ainda não são dele.
--
--   • precos / descontos → lidos por admin, vendedor, faturamento, trade,
--                 gestora, logistica e gestora_faturamento (formulário de
--                 pedido, AbaPrecos/TabelaPrecos em ClienteDetalhe, calculadora
--                 de margem). NÃO são lidos por `financeiro` — portanto esse
--                 papel deixa de ter acesso. logistica/trade permanecem porque
--                 acessam a aba de Preços de ClienteDetalhe hoje; removê-los
--                 quebraria essa tela (ver nota no roadmap original).
--
--   • faturamentos_sankhya → lido por admin, vendedor, faturamento, trade,
--                 gestora, logistica e gestora_faturamento (MeuPainel do
--                 vendedor, ClienteDetalhe/AbaHistoricoFaturamento, dashboards).
--                 `financeiro` perde o acesso. O escopo por vendedor
--                 (profiles.nome_sankhya) continua adiado: a coluna ainda não
--                 existe em migration e MeuPainel lê a tabela diretamente —
--                 restringir por linha exige a RPC SECURITY DEFINER da Etapa 6.
--
-- Em todos os casos a leitura passa a exigir um papel reconhecido em
-- public.user_roles, eliminando o acesso amplo de qualquer autenticado.

-- ─────────────────────────────────────────────────────────────────────────
-- clientes — SELECT (antes: USING (true))
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Autenticados veem clientes" ON public.clientes;

CREATE POLICY "clientes_select_papel" ON public.clientes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- precos — SELECT (antes: USING (true))
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Autenticados veem precos" ON public.precos;

CREATE POLICY "precos_select_papel" ON public.precos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN (
          'admin', 'vendedor', 'faturamento',
          'trade', 'gestora', 'logistica', 'gestora_faturamento'
        )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- descontos — SELECT (antes: USING (true))
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Autenticados veem descontos" ON public.descontos;

CREATE POLICY "descontos_select_papel" ON public.descontos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN (
          'admin', 'vendedor', 'faturamento',
          'trade', 'gestora', 'logistica', 'gestora_faturamento'
        )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- faturamentos_sankhya — SELECT (antes: USING (true))
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "autenticados podem ler faturamentos_sankhya" ON public.faturamentos_sankhya;

CREATE POLICY "faturamentos_sankhya_select_papel" ON public.faturamentos_sankhya
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN (
          'admin', 'vendedor', 'faturamento',
          'trade', 'gestora', 'logistica', 'gestora_faturamento'
        )
    )
  );
