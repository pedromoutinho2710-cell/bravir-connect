# Bravir Connect

Sistema interno de gestão de pedidos comerciais do **Bravir Group**. Permite que vendedores criem pedidos com precificação automática, enviem para faturamento e acompanhem o status em tempo real.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind CSS |
| Backend / Auth / Realtime | Supabase (PostgreSQL) |
| Formulários | React Hook Form + Zod |
| PDF | jsPDF + jspdf-autotable |
| Excel | ExcelJS |
| Roteamento | React Router v6 |
| Data fetching | TanStack Query v5 |

## Pré-requisitos

- Node.js 18+
- Conta no Supabase com o projeto configurado
- Variáveis de ambiente (ver `.env.example`)

## Setup local

```bash
npm install
cp .env.example .env   # preencher VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
```

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run build:dev` | Build em modo development |
| `npm run lint` | ESLint |
| `npm test` | Testes (Vitest) |

## Perfis de acesso

| Perfil | Descrição | Rotas |
|---|---|---|
| `admin` | Gestão global | `/dashboard`, `/pedidos`, `/vendedores`, `/produtos`, `/metas` |
| `vendedor` | Criação e acompanhamento de pedidos | `/novo-pedido`, `/meus-pedidos` |
| `faturamento` | Processamento e gestão de pedidos | `/faturamento` |
| `logistica` | Acompanhamento de entregas | `/logistica` |

O perfil é definido na tabela `profiles` no Supabase e validado via `ProtectedRoute`.

## Estrutura do projeto

```
src/
├── components/
│   ├── pedido/          # SecaoCliente, SecaoProdutos, ResumoFinanceiro
│   ├── ui/              # shadcn/ui components
│   ├── AppLayout.tsx    # Layout principal com sidebar/navbar
│   └── ProtectedRoute.tsx
├── hooks/
│   └── useAuth.tsx      # Contexto de autenticação
├── integrations/
│   └── supabase/        # Client e tipos gerados
├── lib/
│   ├── format.ts        # Formatadores (BRL, CNPJ, CEP, data)
│   └── pdf.ts           # Geração de PDF do pedido
└── pages/
    ├── Login.tsx
    ├── NovoPedido.tsx
    ├── MeusPedidos.tsx
    └── Faturamento.tsx
```

## Banco de dados (Supabase)

### Tabelas principais

| Tabela | Descrição |
|---|---|
| `profiles` | Usuários com `role` (admin, vendedor, faturamento, logistica) |
| `clientes` | Cadastro de clientes (CNPJ único) |
| `produtos` | Catálogo de produtos com marca, código Jiva, cx_embarque, peso |
| `precos` | Preço bruto por produto × tabela de preço |
| `descontos` | Desconto percentual por produto × perfil de cliente |
| `pedidos` | Pedidos com status e metadados |
| `itens_pedido` | Itens de cada pedido com preços calculados |

### Fluxo de status do pedido

```
rascunho → aguardando_faturamento → em_faturamento → faturado
                                 ↘ devolvido
                                 ↘ cancelado
```

## Migrações

As migrações ficam em `supabase/migrations/`. Para aplicar:

```bash
npx supabase db push
```

## Marcas suportadas

- Bendita Cânfora
- Bravir
- Laby
