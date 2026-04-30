# PRD — Bravir Connect

**Produto:** Bravir Connect  
**Versão:** 1.0  
**Data:** 2026-04-30  
**Status:** Em desenvolvimento

---

## 1. Visão geral

O Bravir Connect é um sistema web interno que centraliza o processo de vendas do Bravir Group — desde a criação de pedidos pelo vendedor em campo até o processamento pelo time de faturamento. Substitui processos manuais (planilhas, e-mail, WhatsApp) por um fluxo digital rastreável com visibilidade em tempo real.

**Objetivo principal:** reduzir o tempo entre pedido criado e pedido faturado, eliminando erros de precificação e retrabalho de comunicação entre vendedores e faturamento.

---

## 2. Usuários

| Perfil | Quem é | Necessidade central |
|---|---|---|
| **Vendedor** | Representante comercial externo | Criar pedidos corretamente, acompanhar o status |
| **Faturamento** | Analista interno | Processar pedidos recebidos, gerenciar o fluxo de status |
| **Admin** | Gestor comercial | Visão consolidada, gestão de catálogo e metas |
| **Logística** | Operacional de entregas | Visualizar pedidos faturados para planejar entregas |

---

## 3. Funcionalidades

### 3.1 Autenticação

- Login por e-mail e senha via Supabase Auth
- Redirecionamento automático para a rota padrão do perfil após login
- Proteção de rotas por perfil (`ProtectedRoute`)
- Logout disponível no layout principal

### 3.2 Novo Pedido (Vendedor)

**Dados do cliente**
- Busca de cliente por CNPJ com preenchimento automático de razão social, cidade, UF, CEP, comprador
- Cadastro automático de novos clientes (upsert por CNPJ)
- Campos: perfil do cliente, tabela de preço, tipo (Pedido / Bonificação / Troca), condição de pagamento, agendamento, observações

**Catálogo de produtos**
- Busca por nome, código ou marca
- Preço bruto carregado automaticamente conforme tabela de preço selecionada
- Desconto percentual aplicado automaticamente conforme perfil do cliente
- Preço líquido e total calculados em tempo real
- Agrupamento por marca no resumo

**Auto-save**
- Salvamento local (localStorage) a cada 500ms
- Salvamento automático no banco como `rascunho` a cada 5 segundos (debounce)
- Na abertura da página, detecta rascunho existente no banco e oferece continuar ou descartar

**PDF**
- Geração de PDF do pedido (layout A4 com marca d'água Bravir Group)
- Itens agrupados por marca com subtotal por marca e total geral
- Download direto pelo navegador

**Envio para faturamento**
- Validação: CNPJ preenchido, razão social, perfil, tabela e ao menos 1 item
- Status muda para `aguardando_faturamento`
- Rascunho local removido após envio
- Redirecionamento para Meus Pedidos

### 3.3 Meus Pedidos (Vendedor)

- Lista todos os pedidos do vendedor logado
- Filtros: status, período (data início / data fim)
- Status exibido com badge colorido
- Motivo de devolução/cancelamento visível na linha
- Notificação em tempo real via Supabase Realtime quando o status muda
- Botão de atalho para criar novo pedido

### 3.4 Faturamento

- Lista todos os pedidos (exceto rascunhos) de todos os vendedores
- Filtros: vendedor, status, período, marca
- Notificação em tempo real ao receber novo pedido (`aguardando_faturamento`)

**Fluxo de ações**

| Status atual | Ações disponíveis |
|---|---|
| `aguardando_faturamento` | Assumir, Editar, Cancelar |
| `em_faturamento` | Faturar, Devolver, Editar, Cancelar |
| `faturado` | — |
| `devolvido` / `cancelado` | — |

- **Assumir:** marca o pedido como `em_faturamento` e registra o responsável
- **Faturar:** finaliza o pedido como `faturado`
- **Devolver:** retorna ao vendedor com motivo obrigatório (status `devolvido`)
- **Cancelar:** cancela o pedido com motivo obrigatório
- **Editar:** permite alterar condição de pagamento e observações; exibe itens detalhados do pedido

### 3.5 Admin (planejado)

- Dashboard com KPIs: pedidos do dia, semana, mês; total faturado; top vendedores; top produtos
- Gestão de pedidos (visão global com ações)
- Gestão de vendedores (cadastro, ativação/desativação)
- Gestão de produtos (catálogo, preços por tabela, descontos por perfil)
- Metas por vendedor com acompanhamento de atingimento

### 3.6 Logística (planejado)

- Painel de entregas com pedidos no status `faturado`
- Marcação de entrega realizada
- Filtros por região / data / vendedor

---

## 4. Modelo de dados

### Fluxo de precificação

```
preco_bruto (tabela) × (1 - desconto_perfil%) = preco_liquido
preco_liquido × (1 - desconto_comercial%) = preco_apos_comercial
preco_apos_comercial × (1 - desconto_trade%) = preco_final
total_item = preco_final × quantidade
```

> Na versão atual, `desconto_comercial` e `desconto_trade` são 0. A estrutura está preparada para negociação pontual futura.

### Status do pedido

```
rascunho
  └─→ aguardando_faturamento
        └─→ em_faturamento
              ├─→ faturado        (terminal)
              └─→ devolvido       (vendedor precisa revisar)
        └─→ cancelado             (terminal)
```

---

## 5. Regras de negócio

1. Um vendedor só visualiza seus próprios pedidos em "Meus Pedidos"
2. O faturamento vê pedidos de todos os vendedores
3. Um pedido só pode ser enviado se tiver CNPJ válido (14 dígitos), razão social, perfil de cliente, tabela de preço e ao menos 1 item
4. Devolver e cancelar exigem motivo obrigatório, que fica visível para o vendedor
5. O rascunho no banco tem prioridade sobre o localStorage ao abrir "Novo Pedido"
6. O número do pedido (`numero_pedido`) é gerado automaticamente pelo banco (sequência)
7. CNPJ é chave única em `clientes` — upsert automático ao criar pedido

---

## 6. Requisitos não-funcionais

| Requisito | Descrição |
|---|---|
| Autenticação | Supabase Auth com JWT |
| Autorização | Row Level Security (RLS) no Supabase por `vendedor_id` |
| Tempo real | Supabase Realtime (postgres_changes) para notificações de status |
| Persistência offline-like | Auto-save localStorage garante dados não perdidos em queda de conexão |
| PDF | Gerado client-side, sem dependência de servidor |
| Responsividade | Layout adaptado para tablet (vendedor em campo) e desktop |

---

## 7. Fora do escopo (v1)

- Integração com ERP / sistema de estoque
- Emissão de NF-e
- Aprovação de descontos excepcionais (fluxo de aprovação)
- App mobile nativo
- Relatórios exportáveis (Excel/CSV) — estrutura ExcelJS instalada, não implementada
- Portal do cliente

---

## 8. Roadmap

| Fase | Funcionalidades | Status |
|---|---|---|
| **MVP** | Login, Novo Pedido, Meus Pedidos, Faturamento | ✅ Completo |
| **v1.1** | Dashboard admin, gestão de produtos e preços | 🔲 Planejado |
| **v1.2** | Metas por vendedor, relatórios, exportação Excel | 🔲 Planejado |
| **v1.3** | Painel de logística, rastreamento de entregas | 🔲 Planejado |
| **v2.0** | Integração ERP, aprovação de descontos | 🔲 Futuro |
