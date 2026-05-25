# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Bravir Connect** — internal commercial order management system for the Bravir Group. Salespeople create orders with automatic pricing, send them to billing, and track real-time status. UI strings are in Brazilian Portuguese.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server on port 8080 |
| `npm run build` | Production build |
| `npm run build:dev` | Build in development mode (keeps `componentTagger` from `lovable-tagger`) |
| `npm run lint` | ESLint (flat config in `eslint.config.js`) |
| `npm test` | Vitest, jsdom environment |
| `npm run test:watch` | Vitest watch mode |
| `npx vitest run src/path/to/file.test.ts` | Run a single test file |
| `npx supabase db push` | Apply migrations in `supabase/migrations/` to the linked Supabase project |

## Environment

- Vite reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (see `src/integrations/supabase/client.ts`). README mentions `VITE_SUPABASE_ANON_KEY` — the code uses `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Path alias `@` → `src/` (configured in `vite.config.ts`, `vitest.config.ts`, `tsconfig`).
- Deployed via Vercel SPA rewrite (`vercel.json` rewrites everything to `/index.html`).

## Architecture

**Stack:** React 18 + TypeScript + Vite + shadcn/ui (Radix + Tailwind) + TanStack Query v5 + React Router v6 + Supabase (Postgres, Auth, Edge Functions). Forms use React Hook Form + Zod. Exports: jsPDF, ExcelJS/xlsx, docx.

### Role-based routing

All authenticated routes are nested under `<ProtectedRoute allow={[...roles]}><AppLayout /></ProtectedRoute>` in [src/App.tsx](src/App.tsx). Roles are defined in [src/lib/roles.ts](src/lib/roles.ts):

```
admin | vendedor | faturamento | logistica | trade | gestora | gestora_faturamento
```

Each role has a home route in `ROLE_HOME` and a localized label in `ROLE_LABEL`. `admin` is included in nearly every `allow` list. When adding a new page, place it under the appropriate `src/pages/<role>/` folder and add it to the matching `<Route>` group in `App.tsx` — do not create new top-level role groups unless the role set is genuinely new.

### Auth

`AuthProvider` in [src/hooks/useAuth.tsx](src/hooks/useAuth.tsx) wraps the app inside `BrowserRouter`. The user's `role` is read from the `profiles` table in Supabase and consumed by `ProtectedRoute` for gating and by `AppSidebar`/`MobileNav` (driven by [src/lib/menu.ts](src/lib/menu.ts)) for navigation.

### Data layer

- Single Supabase client: [src/integrations/supabase/client.ts](src/integrations/supabase/client.ts). Import everywhere as `import { supabase } from "@/integrations/supabase/client"`.
- Database types are generated into [src/integrations/supabase/types.ts](src/integrations/supabase/types.ts) — do not hand-edit; regenerate from Supabase when the schema changes.
- Server-side logic that needs the service role lives in `supabase/functions/` (Edge Functions: `admin-usuario`, `enviar-pedido-email`).
- Data fetching uses TanStack Query; mutations should invalidate the relevant query keys rather than refetching manually.

### Domain model (Postgres)

Core tables: `profiles`, `clientes`, `produtos`, `precos` (price by product × price table), `descontos` (discount % by product × customer profile), `pedidos`, `itens_pedido`. Order status flow:

```
rascunho → aguardando_faturamento → em_faturamento → faturado
                                 ↘ devolvido
                                 ↘ cancelado
```

Additional domains layered on top via migrations: `campanhas`, `metas`, `faturamentos` (incl. parcial and externos), `solicitacoes`, `tarefas`, `notificacoes`, `formularios`, plus event-lead capture (`/evento`, `/evento-qr`). All RLS is enforced in Supabase — migrations in `supabase/migrations/` are the source of truth for permissions, and several of them are dedicated to fixing RLS for specific role/table combinations (e.g. `pedidos_gestora_rls`, `solicitacoes_admin_select_status`). When adding a new table or changing access patterns, add a migration rather than relying on client-side filtering.

### UI conventions

- shadcn/ui components live in `src/components/ui/` (managed via `components.json`, do not rewrite their APIs).
- Feature-scoped components are grouped by domain: `src/components/pedido/`, `src/components/faturamento/`, `src/components/admin/`.
- Formatting helpers (BRL, CNPJ, CEP, dates) and exports are centralized in `src/lib/` — reuse `format.ts`, `pdf.ts`, `excel.ts`, `docx.ts`, `status.ts` instead of reimplementing.
- Manual chunking for vendor splits is configured in `vite.config.ts`; if you add a heavy dependency that should be code-split, extend `manualChunks`.

### Public (unauthenticated) routes

`/login`, `/site`, `/site/candidatura`, `/evento`, `/evento/qr`, `/evento-qr` render outside `ProtectedRoute`. Keep public surfaces minimal and never call privileged RPCs from them.
