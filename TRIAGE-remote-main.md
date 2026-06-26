# Triage: remote `main` is broken (não buildeia) — 2026-06-23

## Resumo

A branch **`origin/main` (#38) não compila**. O problema **não é só o PR #32**: os PRs
**#35–#38** seguem o mesmo padrão destrutivo do PR #32 — cada um **substituiu um arquivo-core
que funcionava por uma versão divergente e enxuta** (de um codebase paralelo), regredindo
código que funcionava.

Ambas as branches partem do ancestral comum **`98756dd`** (que **buildava**):

```
98756dd (merge-base, builda)
├─ LOCAL  : 98756dd → 8b12ad6 (multiplas campanhas) → b79e7ce (fix PR #32) ← builda ✓
└─ REMOTE : 98756dd → #35 → #36 → #37 → #38                                  ← NÃO builda ✗
```

O fix do PR #32 (este trabalho) está **commitado localmente** (`b79e7ce`) e **não foi
enviado** ao remoto, porque dar push exige integrar a `main` remota quebrada.

---

## O que cada PR remoto fez

| PR | Commit | Arquivo | Linhas (merge-base → remoto) | Impacto |
|----|--------|---------|------------------------------|---------|
| #36 | `7e12f57` | `src/components/pedido/SecaoProdutos.tsx` | **695 → 259** (−63%) | **QUEBRA BUILD** + perda do motor de preços |
| #37 | `6a4c8df` | `src/pages/vendedor/MeuPainel.tsx` | **1904 → 155** (−92%) | Compila (default export), mas **perdeu ~1750 linhas de funcionalidade** |
| #38 | `632a8bc` | `src/pages/Faturamento.tsx` | **3288 → 484** (−85%) | Compila, mas **perdeu ~2800 linhas de funcionalidade** |
| #35 | `9aaa987` | `supabase/functions/bling-oauth/index.ts` | 148 → 134 (−9%) | Mudança modesta — **provavelmente fix de segurança legítimo**, revisar à parte |

Além disso, a `main` remota **ainda carrega a quebra original do PR #32**: `useNovoPedido.ts`
e `SecaoCliente.tsx` continuam nas versões incompatíveis do `c169964` (no remoto,
`useNovoPedido` é o `export function useNovoPedido()` sem argumentos — API errada).

---

## Detalhe do build-break (#36 — SecaoProdutos)

1. **Export incompatível:** a versão remota usa `export default function SecaoProdutos`,
   mas as páginas importam nomeado: `import { SecaoProdutos, type ItemPedido }`.
2. **API/props incompatível (o problema de fundo):** a versão remota aceita só
   `{ itens, onChange }`. As páginas passam **13 props**:
   `produtos, descontos, tabelaPreco, perfilCliente, itens, onChange, quantidadeLivre,
   vigenciaId, descontoLivre, bloqueado, codigoParceiro, preservarDescontos, tipoPedido`.
3. **Perda do motor de preços:** a versão de `98756dd` exportava `calcularPrecos`, `Produto`,
   `ItemPedido` e `SecaoProdutos`. A versão remota não faz cálculo de preço/desconto/vigência.

Conclusão: corrigir só o export **não** resolve — a versão remota é funcionalmente
incompatível (mesmo caso do PR #32).

Erros de build observados, em cascata, em `origin/main` + alias `formatCurrency`:
- `"formatCurrency" is not exported by "src/lib/format.ts"` (SecaoProdutos importa
  `formatCurrency`, que não existe — `format.ts` exporta `formatBRL`).
- `"SecaoProdutos" is not exported by "src/components/pedido/SecaoProdutos.tsx"`
  (named import vs default export).

---

## Estado atual do repositório local

- `main` local = `98756dd → 8b12ad6 → b79e7ce (fix PR #32)` — **builda** (`vite build` ✓).
- Divergente de `origin/main`: local **ahead 2**, remote **ahead 4**.
- **Nada foi enviado ao remoto.** Nenhuma branch extra deixada para trás.
- O fix do PR #32 está preservado no commit `b79e7ce`.

---

## Opções de tratamento (decisão do time)

1. **Reverter / refazer #36–#38** no remoto. Eles parecem artefatos de codebase divergente
   (como o PR #32). Reverter restaura os arquivos-core completos; depois reaplicar de forma
   correta apenas a intenção legítima de cada PR:
   - #36: "useRef no onChange p/ evitar loop de render" → reaplicar sobre a SecaoProdutos completa.
   - #37: "filtrar preços por vigência ativa + limit(5000)" → reaplicar sobre a MeuPainel completa.
   - #38: "confirmarFaturamento via Edge Function + RPC atômica" → manter a Edge Function/RPC
     novas (parecem legítimas) e reaplicar sobre a Faturamento completa.
   - #35 (bling-oauth): provavelmente manter — revisar à parte.
2. **Reparo completo aqui** (estilo PR #32: restaurar versão antiga + mover a nova p/ arquivo
   separado) para SecaoProdutos, MeuPainel e Faturamento, com build-verify a cada passo.
3. Investigar **de onde vieram** esses PRs (mesma ferramenta/branch divergente do PR #32?) antes
   de qualquer integração.

> ⚠️ Não dar `git pull`/merge/rebase contra `origin/main` antes de decidir — isso traz as
> versões enxutas de MeuPainel/Faturamento/SecaoProdutos para o seu working tree.
