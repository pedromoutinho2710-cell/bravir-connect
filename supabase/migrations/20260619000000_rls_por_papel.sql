-- RLS por papel — Etapa 2 (subconjunto verificado e seguro).
--
-- ATENÇÃO: este arquivo NÃO foi aplicado (`supabase db push` não foi executado).
-- Contém apenas as mudanças cujo impacto foi verificado contra o schema real e
-- contra os caminhos de leitura/escrita do app. As demais mudanças propostas no
-- roadmap (clientes, precos, descontos, faturamentos_sankhya, pedidos UPDATE)
-- foram DELIBERADAMENTE OMITIDAS porque quebrariam funcionalidades hoje ou
-- dependem de pré-requisitos ainda não implementados — ver notas no fim.
--
-- Padrão de verificação de papel reutilizado: public.has_role(uuid, app_role).

-- ─────────────────────────────────────────────────────────────────────────
-- 1) solicitacoes_gestor — INSERT
--    Antes: WITH CHECK (true)  → qualquer usuário podia inserir registros
--    falsificando `criado_por`. Todos os 5 pontos de inserção no cliente já
--    enviam `criado_por: user.id` (NovaSolicitacao, MinhasSolicitacoes x2,
--    AgenteChatFlutuante, NovaSolicitacao manual), portanto a trava abaixo
--    não quebra nenhum fluxo existente.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_insert" ON public.solicitacoes_gestor;

CREATE POLICY "solicitacoes_insert_proprio" ON public.solicitacoes_gestor
  FOR INSERT TO authenticated
  WITH CHECK (criado_por = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- 2) faturamentos_externos — SELECT
--    Antes: USING (true). Nenhum componente do cliente lê esta tabela
--    diretamente (grep confirmou 0 leituras em src/), logo restringir a
--    leitura aos papéis de retaguarda não remove nenhuma funcionalidade.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "fext_select_authenticated" ON public.faturamentos_externos;

CREATE POLICY "fext_select_retaguarda" ON public.faturamentos_externos
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'faturamento'::public.app_role)
    OR public.has_role(auth.uid(), 'trade'::public.app_role)
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 3) metas_visao_macro — SELECT
--    Antes: USING (true). Lida apenas por /admin/visao-macro (rota exclusiva
--    de admin). Restrição inclui também trade/gestora/gestora_faturamento por
--    coerência com a política de escrita existente.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "metas_visao_macro_select" ON public.metas_visao_macro;

CREATE POLICY "metas_visao_macro_select" ON public.metas_visao_macro
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'trade'::public.app_role)
    OR public.has_role(auth.uid(), 'gestora'::public.app_role)
    OR public.has_role(auth.uid(), 'gestora_faturamento'::public.app_role)
  );

-- ─────────────────────────────────────────────────────────────────────────
-- OMITIDO INTENCIONALMENTE (NÃO aplicar sem resolver os bloqueios):
--
--  • clientes (SELECT USING(true) → escopo por vendedor_id):
--      quebra a busca por CNPJ em useNovoPedido (vendedor precisa achar
--      cliente que ainda não é dele) e o join de Faturamento.tsx. Requer
--      redesenho do fluxo de busca antes de restringir.
--
--  • precos / descontos (SELECT USING(true) → papéis específicos):
--      a aba de Preços em ClienteDetalhe (AbaPrecos/TabelaPrecos) é acessível
--      por `logistica` e `trade`, que o roadmap EXCLUI. Restringir como
--      proposto quebraria a visualização de preços para esses papéis.
--
--  • faturamentos_sankhya (SELECT USING(true) → escopo por vendedor):
--      a política proposta referencia `profiles.nome_sankhya`, coluna que NÃO
--      aparece em nenhuma migration (o app a usa via admin-usuario, mas sua
--      origem/existência não foi confirmada). Além disso MeuPainel.tsx ainda
--      lê faturamentos_sankhya diretamente — restringir agora quebra o painel
--      do vendedor ANTES da RPC SECURITY DEFINER da Etapa 6.
--
--  • pedidos (UPDATE WITH CHECK contra reatribuição de vendedor_id):
--      as políticas de UPDATE existentes (faturamento/gestora/financeiro) não
--      têm WITH CHECK; um WITH CHECK ingênuo (vendedor_id = auth.uid())
--      bloquearia atualizações legítimas da retaguarda. Precisa de desenho
--      por-política.
-- ─────────────────────────────────────────────────────────────────────────
