I have the following verification comments after thorough review and exploration of the codebase. Implement the comments by following the instructions in the comments verbatim.

---
The context section for each comment explains the problem and its significance. The fix section defines the scope of changes to make — implement only what the fix describes.

## Comment 1: Item 1 não implementado: ausência total de auditoria (historico_status, usuario_nome, Aberto por / Última ação).

### Context
O plano definia uma nova tabela `historico_status` com `usuario_nome`/`usuario_email`, função `log_pedido_event` SECURITY DEFINER, trigger `pedidos_audit` em INSERT/UPDATE de `pedidos`, RPC client-side em `src/lib/audit.ts`, exibição de "Aberto por: {nome}" e "Última ação: {nome} às {hora}" em cada linha/card de `Faturamento.tsx`, e linha do tempo em modal de detalhes. Nada disso existe: não há migration nova, `src/lib/audit.ts` não foi criado, `Faturamento.tsx` (último commit 2026-04-29) continua sem qualquer leitura de histórico, e `useAuth.tsx` não expõe `fullName`. Sem isso, não é possível distinguir qual colaboradora (Bruna/Letícia) processou cada pedido — que é exatamente o requisito de negócio do prompt do usuário.

### Fix

Criar migration em `supabase/migrations/` com a tabela `historico_status` (id, pedido_id, status_anterior, status_novo, acao, motivo, usuario_id, usuario_nome, usuario_email, created_at), função `log_pedido_event` SECURITY DEFINER que lê `auth.uid()` e busca `profiles.full_name`/`email`, e trigger `pedidos_audit` AFTER INSERT/UPDATE em `pedidos` que dispara o log quando `status` ou `responsavel_id` mudam. Adicionar coluna `pedidos.status_atualizado_em` atualizada via trigger. Regenerar `src/integrations/supabase/types.ts`. Criar `src/lib/audit.ts` com helper `logEvento(pedidoId, acao, opts)` chamando a RPC para ações que não alteram status (ex.: edição). Em `src/pages/Faturamento.tsx`, agregar `aberto_por` e `ultima_acao` por pedido (subquery em `historico_status`) e renderizar abaixo do número do pedido. Em `src/hooks/useAuth.tsx`, expor `fullName` lendo `profiles.full_name`.

### Referred Files
- c:\Users\pedro\bravir-connect\src\pages\Faturamento.tsx
- c:\Users\pedro\bravir-connect\src\hooks\useAuth.tsx
- c:\Users\pedro\bravir-connect\supabase\migrations\20260429210000_itens_pedido_colunas_desconto.sql
---
## Comment 2: Item 2 não implementado: SecaoProdutos continua com desconto único — quebra a regra 'nunca somar descontos'.

### Context
O tipo `ItemPedido` em `src/components/pedido/SecaoProdutos.tsx` ainda contém apenas `desconto_pct`, `preco_liquido` e `total`. As colunas `desconto_comercial`, `desconto_trade`, `preco_apos_perfil`, `preco_apos_comercial`, `preco_final` exigidas pelo prompt e já presentes no banco (migration `20260429210000_itens_pedido_colunas_desconto.sql`) não existem no front. A tabela de itens não tem inputs digitáveis para `Desc. Comercial %` e `Desc. Trade %`, e o cálculo é uma única multiplicação `bruto*(1-desc/100)`, sem cascata. Como o `NovoPedido.tsx` grava no Supabase usando esses campos, o banco é populado com valores incorretos (descontos comercial/trade ficarão sempre = ao desconto de perfil ou 0), o que invalida o Excel do Item 3, o PDF, relatórios futuros e quebra a regra de negócio explícita do PRD/§4.

### Fix

Em `src/components/pedido/SecaoProdutos.tsx`, expandir o tipo `ItemPedido` para incluir `desconto_perfil`, `desconto_comercial` (default 0), `desconto_trade` (default 0), `preco_apos_perfil`, `preco_apos_comercial`, `preco_final` e `total`. Implementar helper `calcularPrecos(bruto, dPerfil, dCom, dTrade, qtd)` aplicando cascata sequencial (nunca soma). Adicionar colunas na tabela: P. Bruto, Desc. Perfil % (read-only), P. após perfil, input Desc. Comercial %, P. após comercial, input Desc. Trade %, P. Final, Total. Recalcular on-change. Em `src/pages/NovoPedido.tsx`, ao salvar, gravar todos os 6 campos em `itens_pedido` corretamente; e `preco_unitario_liquido` deve receber `preco_final` para compatibilidade. Hidratar os 3 descontos do banco ao continuar rascunho. Atualizar `src/lib/pdf.ts` para exibir as 3 colunas de desconto.

### Referred Files
- c:\Users\pedro\bravir-connect\src\components\pedido\SecaoProdutos.tsx
- c:\Users\pedro\bravir-connect\src\pages\NovoPedido.tsx
- c:\Users\pedro\bravir-connect\src\lib\pdf.ts
---
## Comment 3: Item 3 não implementado: não há `src/lib/excel.ts` nem botão Exportar Excel na fila de faturamento.

### Context
O plano previa `src/lib/excel.ts` usando `exceljs` (já no `package.json`) para gerar a planilha com cabeçalho mesclado fundo verde `#1A6B3A`, tabela de produtos com 15 colunas exatas (Nº, COD. JIVA, CX EMBARQUE, QTD, DESCRIÇÃO, P. Bruto, %Cluster, %Comercial, %Trade, P. Líquido, Desconto Real R$, Total, Peso, Total Peso, Qtd Volume) e rodapé com totais. Nenhum desses arquivos existe e `Faturamento.tsx` não foi alterado — não há botão "Exportar Excel" em lugar nenhum. Itens 2 e 3 estão acoplados: mesmo se o Excel fosse gerado hoje, as colunas %Comercial/%Trade e Desconto Real R$ sairiam zeradas porque o front não captura esses descontos.

### Fix

Criar `src/lib/excel.ts` com `exportarPedidoExcel(pedido, itens)` usando `exceljs`: cabeçalho com células mescladas (fill `FF1A6B3A`, font branco bold), seções DATA PEDIDO/TABELA/CLIENTE/CÓDIGO, PEDIDO/BONIFICAÇÃO com X, CNPJ/COND.PAGTO, CIDADE-UF/CEP, PERFIL/COMPRADOR, AGENDAMENTO/VENDEDOR, OBSERVAÇÕES; tabela com as 15 colunas exigidas; linhas zebradas (`FFF5F5F5`); rodapé com Total geral, Peso total e Qtd volumes (qtd/cx_embarque, ceil). Larguras: descrição ~50, demais 12-18. Download via `workbook.xlsx.writeBuffer()` + `Blob`. Em `src/pages/Faturamento.tsx`, adicionar botão "Exportar Excel" por pedido e ação no bottom-sheet mobile.

### Referred Files
- c:\Users\pedro\bravir-connect\src\pages\Faturamento.tsx
- c:\Users\pedro\bravir-connect\package.json
---
## Comment 4: Item 4 não implementado: SKUs Junho 2026 (10 produtos LABY) não foram inseridos no banco.

### Context
Não há nenhuma migration nova depois de `20260429210000_itens_pedido_colunas_desconto.sql`. Os 10 SKUs LABY listados no prompt (8803, 42, 44, 8348, 7893, 8349, 7894, 8350, 7895, 8351) não existem em `produtos`, nem seus `precos` por tabela (7/12/18/Suframa) nem os `descontos` para os 12 perfis. Sem isso, vendedores não conseguem incluir os novos produtos em pedidos.

### Fix

Criar migration `supabase/migrations/<timestamp>_seed_skus_junho_2026.sql` com INSERT idempotente (`ON CONFLICT (codigo_jiva) DO NOTHING`) em `produtos` para os 10 SKUs com `marca='Laby'`, `ativo=true`, `cx_embarque` e `peso_unitario` do prompt. Em seguida inserir em `precos` os 4 valores por SKU (tabelas 7, 12, 18 e Suframa, na ordem dos números do prompt). Em `descontos`, replicar a matriz default de descontos por perfil já usada em outros SKUs LABY (12 perfis × SKU). Verificar idempotência para permitir re-execução.

### Referred Files
- c:\Users\pedro\bravir-connect\supabase\migrations\20260429210000_itens_pedido_colunas_desconto.sql
---
## Comment 5: Item 5 não implementado: gestão de formulários (/admin/formularios, tabelas formularios e formulario_produtos) inexistente.

### Context
Não há tabelas `formularios` nem `formulario_produtos`, não há rota `/admin/formularios` em `src/App.tsx` (que ainda renderiza apenas `PlaceholderPage` para todas as rotas admin), nem páginas/componentes correspondentes. O `NovoPedido.tsx` continua carregando todos os produtos ativos diretamente da tabela `produtos`, sem respeitar o conceito de formulário padrão. Sem essa funcionalidade o admin não consegue controlar qual catálogo o vendedor enxerga e o requisito de "Importar planilha" também fica ausente.

### Fix

Criar migration com `formularios(id, nome, descricao, ativo, padrao, created_at, created_by)` (índice único parcial `where padrao = true`) e `formulario_produtos(id, formulario_id, produto_id, ordem)` com RLS (`SELECT` autenticados, mutações apenas `admin`) e trigger BEFORE INSERT/UPDATE garantindo apenas 1 padrão. Adicionar rota `/admin/formularios` em `src/App.tsx`. Criar `src/pages/admin/Formularios.tsx` (lista, ações Novo/Editar/Duplicar/Definir padrão/Ativar-Desativar/Importar) e componentes em `src/components/admin/formularios/` (`FormularioFormDialog.tsx`, `ImportarPlanilhaDialog.tsx` que lê `.xlsx` via `exceljs` mapeando coluna COD. JIVA). Refatorar `src/pages/NovoPedido.tsx` para carregar produtos via JOIN `formulario_produtos` com formulário onde `padrao=true AND ativo=true`, com fallback para todos os produtos ativos.

### Referred Files
- c:\Users\pedro\bravir-connect\src\App.tsx
- c:\Users\pedro\bravir-connect\src\pages\NovoPedido.tsx
- c:\Users\pedro\bravir-connect\src\components\AppSidebar.tsx
---
## Comment 6: Item 6 parcialmente atendido: MeusPedidos não tem novos status, 'tempo no status', filtros cliente/marca, modal de detalhes nem notificações específicas.

### Context
`src/pages/MeusPedidos.tsx` mantém apenas os 6 status legados (`rascunho`, `aguardando_faturamento`, `em_faturamento`, `faturado`, `devolvido`, `cancelado`). Faltam `em_cadastro`, `pendente`, `em_rota`, `entregue`, `revisao_necessaria` com as cores definidas no prompt (azul/laranja/cinza escuro/verde claro/vermelho). Não há coluna "Há quanto tempo no status atual" (sem `status_atualizado_em`/`formatDistanceToNow`). Filtros por cliente e marca não existem. Não há modal de detalhes ao clicar em um pedido (nem componente `PedidoDetalhesDialog.tsx`) e o realtime apenas exibe um `toast.info` genérico em vez das mensagens específicas ("Seu pedido #X foi faturado!", "…está pendente: {motivo}", etc.).

### Fix

Em `src/pages/MeusPedidos.tsx`: ampliar `STATUS_LABEL`/`STATUS_COLOR` com os 5 novos status e cores corretas; adicionar coluna "Há quanto tempo no status" calculada via `formatDistanceToNow` de `date-fns` sobre `pedidos.status_atualizado_em`; adicionar inputs de filtro por cliente (ilike em `clientes.razao_social`) e marca (Select com `MARCAS`); refatorar o handler realtime para emitir mensagens específicas por status novo, lendo `motivo` quando aplicável. Criar `src/components/pedido/PedidoDetalhesDialog.tsx` reusável (cabeçalho cliente/CNPJ, itens com 3 descontos, linha do tempo de `historico_status`) e disparar ao clicar em uma linha/card. Reusar o mesmo dialog em `Faturamento.tsx`.

### Referred Files
- c:\Users\pedro\bravir-connect\src\pages\MeusPedidos.tsx
- c:\Users\pedro\bravir-connect\src\pages\Faturamento.tsx
---
## Comment 7: Otimização mobile não implementada: AppLayout sem hamburguer/Sheet, sem header mobile, sem cards no lugar de tabelas, sem bottom sheet/FAB/pull-to-refresh.

### Context
`src/components/AppLayout.tsx` continua um layout fixo `flex w-full` com `<AppSidebar />` sempre visível e apenas um `SidebarTrigger` no header — não foi convertido em drawer (`Sheet`) para `< md`, não há logo "Bravir CRM" no header, nem nome do usuário, nem header sticky. Nenhuma das páginas (`NovoPedido`, `MeusPedidos`, `Faturamento`) ganhou variantes em cards para mobile, nem `Accordion` para os 3 descontos, nem barra de ações fixa no rodapé com `pb-24 md:pb-0`, nem bottom sheet de ações de pedido, nem FAB verde, nem hook de pull-to-refresh. Não há regra global em `src/index.css` forçando `font-size: 16px` em inputs no mobile (o que causa zoom no iOS). O `useIsMobile` existente não é usado em nenhuma das páginas/layout.

### Fix

Refatorar `src/components/AppLayout.tsx`: ocultar `<AppSidebar>` em `< md` (`hidden md:flex`) e renderizar `Sheet` lateral acionado por botão `Menu` (lucide); header sticky com logo "Bravir CRM", botão hamburguer e nome do usuário (lendo `fullName` do `useAuth`). Em `src/index.css` adicionar `@media (max-width: 767px) { input, textarea, select { font-size: 16px; } }`. Refatorar `NovoPedido` (`SecaoCliente` em coluna única `< md`; `SecaoProdutos` com pills de marca `overflow-x-auto snap-x`, lista de cards no lugar da tabela em `< md` com botões +/- size-12 e descontos em `Accordion`; barra de ações `fixed bottom-0` no mobile). Refatorar `MeusPedidos` e `Faturamento` para listar cards em `md:hidden` e tabela em `hidden md:block`; filtros em `Sheet` lateral; modal de detalhes fullscreen no mobile (`w-screen h-screen md:rounded-lg rounded-none`). Implementar bottom sheet de ações usando `drawer.tsx` em `Faturamento`; adicionar FAB `fixed bottom-20 right-4 size-14 rounded-full md:hidden`. Criar `src/hooks/usePullToRefresh.ts` e usar em `MeusPedidos`/`Faturamento`. Configurar `sonner` com `position` dinâmica (`top-center` no mobile).

### Referred Files
- c:\Users\pedro\bravir-connect\src\components\AppLayout.tsx
- c:\Users\pedro\bravir-connect\src\components\AppSidebar.tsx
- c:\Users\pedro\bravir-connect\src\index.css
- c:\Users\pedro\bravir-connect\src\pages\NovoPedido.tsx
- c:\Users\pedro\bravir-connect\src\pages\MeusPedidos.tsx
- c:\Users\pedro\bravir-connect\src\pages\Faturamento.tsx
- c:\Users\pedro\bravir-connect\src\hooks\use-mobile.tsx
---
## Comment 8: Estado atual deixa colunas desconto_comercial/desconto_trade do banco preenchidas incorretamente, contaminando dados em produção.

### Context
A migration `20260429210000_itens_pedido_colunas_desconto.sql` adicionou colunas em `itens_pedido` aguardando que o front diferencie os 3 descontos. Como o front (Item 2) não foi atualizado, qualquer pedido enviado a partir de agora grava esses campos com valores errados (provavelmente `desconto_perfil` duplicado em `desconto_comercial` ou todos zerados), gerando dados que não refletem a realidade comercial e que precisarão ser limpos depois. Isso compromete também o Excel (Item 3), relatórios e qualquer migração futura.

### Fix

Antes de liberar para produção, congelar a inserção em `itens_pedido` até que o Item 2 seja implementado. Em `src/pages/NovoPedido.tsx`, garantir que ao gravar pedidos os campos `desconto_perfil`, `desconto_comercial`, `desconto_trade`, `preco_apos_perfil`, `preco_apos_comercial` e `preco_final` venham do componente `SecaoProdutos` já refatorado (Item 2). Criar script de manutenção (SQL ou seed) para corrigir registros gravados nesse intervalo, normalizando `desconto_comercial=0`, `desconto_trade=0`, `preco_apos_perfil=preco_unitario_liquido`, `preco_apos_comercial=preco_unitario_liquido`, `preco_final=preco_unitario_liquido` quando os campos estiverem inconsistentes.

### Referred Files
- c:\Users\pedro\bravir-connect\supabase\migrations\20260429210000_itens_pedido_colunas_desconto.sql
- c:\Users\pedro\bravir-connect\src\pages\NovoPedido.tsx
---