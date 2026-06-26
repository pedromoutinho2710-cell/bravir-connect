# Contexto do Projeto — Bravir Connect

> Documento de contexto para colar no Claude (Project Knowledge / system prompt) ao gerar prompts de correção do projeto. Atualizado em 2026-06-23.

---

## 1. O que é

**Bravir Connect** — sistema interno de gestão de pedidos comerciais do Grupo Bravir. Vendedores criam pedidos com precificação automática, enviam para faturamento e acompanham o status em tempo real. **Todas as strings de UI são em português do Brasil.**

## 2. Stack

- **Front-end:** React 18 + TypeScript + Vite (dev na porta **8080**)
- **UI:** shadcn/ui (Radix + Tailwind) — componentes em `src/components/ui/` (não reescrever a API deles)
- **Estado/dados:** TanStack Query v5 (mutations devem invalidar query keys, não refazer fetch manual)
- **Rotas:** React Router v6
- **Forms:** React Hook Form + Zod
- **Back-end:** Supabase (Postgres, Auth, Edge Functions)
- **Exports:** jsPDF + jspdf-autotable, ExcelJS/xlsx, docx
- **Gráficos:** recharts

## 3. Comandos

| Comando | Função |
|---|---|
| `npm run dev` | Dev server (Vite) na porta 8080 |
| `npm run build` | Build de produção |
| `npm run build:dev` | Build em modo dev (mantém `componentTagger` do `lovable-tagger`) |
| `npm run lint` | ESLint (flat config em `eslint.config.js`) |
| `npm test` | Vitest (jsdom) |
| `npm run test:watch` | Vitest em watch |
| `npx vitest run src/caminho/arquivo.test.ts` | Roda um único teste |
| `npx supabase db push` | Aplica migrations de `supabase/migrations/` ao projeto Supabase linkado |

## 4. Ambiente

- Vite lê `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (ver `src/integrations/supabase/client.ts`). O README cita `VITE_SUPABASE_ANON_KEY`, mas **o código usa `VITE_SUPABASE_PUBLISHABLE_KEY`**.
- Alias de path: `@` → `src/` (em `vite.config.ts`, `vitest.config.ts`, `tsconfig`).
- Deploy via Vercel com SPA rewrite (`vercel.json` reescreve tudo para `/index.html`).
- **Deploy Supabase: usar o project-ref `qsiobsseyuomqcygjjcp`** (não o `project_id` do `config.toml`).

## 5. Papéis (roles) e roteamento

Roles em `src/lib/roles.ts`:

```
admin | vendedor | faturamento | logistica | trade | gestora | gestora_faturamento | financeiro
```

- Cada role tem rota inicial em `ROLE_HOME` e label em `ROLE_LABEL`.
- `admin` está incluído em quase todos os `allow`.
- Todas as rotas autenticadas ficam aninhadas em `<ProtectedRoute allow={[...roles]}><AppLayout /></ProtectedRoute>` em `src/App.tsx`.
- Ao adicionar página, coloque em `src/pages/<role>/` e adicione ao grupo `<Route>` correspondente — **não criar novos grupos top-level** a menos que o conjunto de roles seja realmente novo.
- Caso especial: `SolicitacoesRoute` libera `/admin/solicitacoes` para admin **ou** o email `pedro.menezes@bravir.com.br`.

### Rotas públicas (sem auth)
`/login`, `/site`, `/site/candidatura`, `/evento`, `/evento/qr`, `/evento-qr`, `/proposta/:token`, `/calc/:token`. Manter superfícies públicas mínimas e **nunca** chamar RPC privilegiada delas.

## 6. Auth

`AuthProvider` (`src/hooks/useAuth.tsx`) envolve o app dentro do `BrowserRouter`. O `role` do usuário vem da tabela `profiles` e é consumido por:
- `ProtectedRoute` (gating de rota)
- `AppSidebar` / `MobileNav` (navegação, dirigida por `src/lib/menu.ts`)

Há também um `ImpersonationProvider` (`src/contexts/ImpersonationContext`) e barra de impersonation (`ImpersonationBar`).

## 7. Camada de dados

- **Cliente Supabase único:** `src/integrations/supabase/client.ts`. Importar sempre como `import { supabase } from "@/integrations/supabase/client"`.
- **Tipos do banco gerados:** `src/integrations/supabase/types.ts` — **não editar à mão**; regenerar do Supabase quando o schema muda.
- **Lógica server-side com service role:** `supabase/functions/` (Edge Functions).
- Fetch via TanStack Query; mutations invalidam as query keys relevantes.

## 8. Modelo de domínio (Postgres)

Tabelas core: `profiles`, `clientes`, `produtos`, `precos` (preço por produto × tabela de preço), `descontos` (% por produto × perfil de cliente), `pedidos`, `itens_pedido`.

Fluxo de status do pedido:
```
rascunho → aguardando_faturamento → em_faturamento → faturado
                                 ↘ devolvido
                                 ↘ cancelado
```

Domínios adicionais (via migrations): `campanhas`, `metas`, `faturamentos` (incl. parcial e externos), `solicitacoes`, `tarefas`, `notificacoes`, `formularios`, captura de leads de evento (`/evento`, `/evento-qr`), pagamento à vista / fila financeiro, integração Bling / Visão Macro, fluxo logístico.

**RLS é a fonte da verdade de permissões** — todas em `supabase/migrations/`. Várias migrations existem só para corrigir RLS de combinações role/tabela (ex.: `pedidos_gestora_rls`, `solicitacoes_admin_select_status`, `rls_por_papel`). Ao adicionar tabela ou mudar acesso, **criar migration** em vez de filtrar no cliente.

## 9. Convenções de UI

- shadcn/ui em `src/components/ui/` (gerenciado por `components.json` — não reescrever APIs).
- Componentes por domínio: `src/components/pedido/`, `src/components/faturamento/`, `src/components/admin/`, `src/components/cliente/`, `src/components/proposta/`.
- Helpers centralizados em `src/lib/` — **reusar** em vez de reimplementar:
  - `format.ts` (BRL, CNPJ, CEP, datas) — **exporta `formatBRL`, NÃO `formatCurrency`**
  - `pdf.ts`, `excel.ts`, `docx.ts`, `exportDashboardExcel.ts`
  - `status.ts` (labels/cores de status), `preco.ts` (motor de preço), `roles.ts`, `menu.ts`, `constants.ts`, `audit.ts`, `utils.ts`
- Code-splitting de vendor em `vite.config.ts` (`manualChunks`); páginas pesadas usam `lazy()` em `App.tsx` (Faturamento, MeuPainel, VisaoMacro, Dashboard, ClienteDetalhe, etc.).

## 10. Mapa de pastas (resumo)

```
src/
  pages/
    vendedor/   → NovoPedido, MeusPedidos, MeusClientes, MinhasTarefas,
                  CadastrarCliente, MeuPipeline, MeuPainel (pesada)
    faturamento/→ FilaCadastros, DashboardFaturamento, GestaoEstoque,
                  NovoPedidoFaturamento, EditarPedidoFaturamento,
                  CadastrarClienteFaturamento
    gestora/    → DashboardGestora, GestaoTime, ClientesGestora,
                  NovoPedidoGestora, PedidosGestora, LeadsEvento,
                  HistoricoFaturamento, CadastrarClienteGestora
    logistica/  → DashboardLogistica, FilaLogistica
    financeiro/ → FilaFinanceiro
    trade/      → ImportarFaturamento, ImportarMetas
    admin/      → Equipe, Metas, GestaoMetas, Formularios, PedidosAdmin,
                  Clientes(+Lista), ImportarClientes, TabelasPreco,
                  GestaoPrecos, Configuracoes, Campanhas, AgenteIA,
                  GestaoEstoque, VisaoMacro, BlingCallback
    site/       → SiteLanding, SiteCandidatura (públicas)
    (raiz)      → Dashboard, Faturamento (pesada), ClienteDetalhe,
                  BolsaoPage, Lixeira, Trade, TradeCampanhas, DadosIQVIA,
                  Nova/MinhasSolicitacoes, Minhas/PropostaPublica,
                  Calculadora(Margem/Publica), Evento(Formulario/QR)
  components/ pedido/ faturamento/ admin/ cliente/ proposta/ + ui/ + layout
  hooks/      useAuth, useNovoPedido, useContatoCliente, useEntregaAgendada,
              usePullToRefresh, use-mobile, use-toast
  lib/        (ver seção 9)
  integrations/supabase/  client.ts, types.ts
supabase/
  functions/  admin-usuario, enviar-pedido-email, bling-oauth,
              confirmar-faturamento, extrair-pedido, agente-chat,
              agente-implementador, agente-monitor
  migrations/ ~55 arquivos .sql (fonte da verdade de schema + RLS)
```

## 11. Subsistema de Agente IA

Existe um conjunto de páginas/edge functions de "agente": `AgenteIA` (página admin), `AgenteChatFlutuante` (chat flutuante global), e Edge Functions `agente-chat`, `agente-implementador`, `agente-monitor`, `extrair-pedido` (extração de pedido a partir de texto). Também `MeuPainelAgente`, `FaturamentoAgente`, `SecaoProdutosAgente` (variantes "agente" de telas existentes).

## 12. ⚠️ Estado atual / problema crítico em aberto (TRIAGE 2026-06-23)

**A `origin/main` (PR #38) NÃO compila.** Não é só o PR #32: os PRs **#35–#38** seguem o mesmo padrão destrutivo — cada um **substituiu um arquivo-core que funcionava por uma versão divergente e enxuta** (de um codebase paralelo), regredindo funcionalidade.

Ancestral comum: `98756dd` (buildava).
```
98756dd (merge-base, builda)
├─ LOCAL  : 98756dd → 8b12ad6 → b79e7ce (fix PR #32)   ← builda ✓
└─ REMOTE : 98756dd → #35 → #36 → #37 → #38            ← NÃO builda ✗
```

| PR | Arquivo | Linhas (base→remoto) | Impacto |
|----|---------|----------------------|---------|
| #36 | `src/components/pedido/SecaoProdutos.tsx` | 695 → 259 (−63%) | **QUEBRA BUILD** + perda do motor de preços |
| #37 | `src/pages/vendedor/MeuPainel.tsx` | 1904 → 155 (−92%) | Compila, mas perde ~1750 linhas |
| #38 | `src/pages/Faturamento.tsx` | 3288 → 484 (−85%) | Compila, mas perde ~2800 linhas |
| #35 | `supabase/functions/bling-oauth/index.ts` | 148 → 134 (−9%) | Provável fix de segurança legítimo — revisar à parte |

**Causa raiz do build-break (#36):** export incompatível (`export default` vs `import { SecaoProdutos }` nomeado); props incompatíveis (versão remota aceita `{itens,onChange}`, telas passam 13 props); perda de `calcularPrecos`/`Produto`/`ItemPedido`; e import de `formatCurrency` que **não existe** (`format.ts` exporta `formatBRL`). Corrigir só o export **não** resolve — a versão remota é funcionalmente incompatível.

A `main` remota ainda carrega a quebra do PR #32: `useNovoPedido.ts` e `SecaoCliente.tsx` nas versões incompatíveis de `c169964` (no remoto, `useNovoPedido` é `export function useNovoPedido()` sem argumentos — API errada).

**Estado do repo local:** `main` local = `98756dd → 8b12ad6 → b79e7ce` **builda**. Divergente de `origin/main` (local ahead 2, remote ahead 4). Nada foi enviado ao remoto. O fix do PR #32 está preservado em `b79e7ce`.

### ⚠️ Regras de segurança ao trabalhar nisto
- **NÃO** dar `git pull`/merge/rebase contra `origin/main` antes de decidir — isso traz as versões enxutas de SecaoProdutos/MeuPainel/Faturamento para o working tree.
- Padrão de reparo seguro (estilo PR #32): **restaurar a versão antiga completa + mover a versão nova para arquivo separado**, com **build-verify a cada passo**.
- Reaplicar apenas a *intenção legítima* de cada PR sobre o arquivo completo:
  - #36: "useRef no onChange p/ evitar loop de render" → reaplicar sobre SecaoProdutos completa.
  - #37: "filtrar preços por vigência ativa + limit(5000)" → reaplicar sobre MeuPainel completa.
  - #38: "confirmarFaturamento via Edge Function + RPC atômica" → manter Edge Function/RPC novas + reaplicar sobre Faturamento completa.
  - #35: provavelmente manter — revisar à parte.

> Arquivos de apoio no repo: `TRIAGE-remote-main.md` (detalhe completo), `_good_fat.tsx` / `_gutted_fat.tsx` (comparação das versões de Faturamento).

## 13. Como pedir correções (dicas para os prompts)

Ao gerar prompts de correção, sempre instrua o agente a:
1. **Rodar `npm run build` antes e depois** de cada mudança (build-verify).
2. Não assumir que existe `formatCurrency` — usar `formatBRL` de `src/lib/format.ts`.
3. Respeitar exports nomeados vs default conforme os imports existentes nas páginas.
4. Para qualquer mudança de acesso a dados/permissão, **criar migration** em `supabase/migrations/` (RLS), não filtrar no cliente.
5. Reusar helpers de `src/lib/` e componentes shadcn existentes.
6. Não dar `git pull` contra `origin/main` sem antes resolver a triage da seção 12.
7. UI sempre em português do Brasil.
```
