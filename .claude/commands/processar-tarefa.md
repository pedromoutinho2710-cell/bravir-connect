Processe a próxima tarefa pendente da tabela `solicitacoes_gestor` do Supabase.

## Passo 1 — Buscar próxima tarefa aprovada

Use o Supabase MCP para executar:

```sql
SELECT id, titulo, descricao, tipo, tela, prioridade, agente_status, origem
FROM solicitacoes_gestor
WHERE status = 'aberto'
  AND deleted_at IS NULL
  AND agente_status = 'aprovado'
ORDER BY
  CASE prioridade WHEN 'alta' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
  created_at ASC
LIMIT 1;
```

Se não houver resultado: informe que a fila está vazia e pare.

## Passo 2 — Marcar como em andamento

Execute via Supabase MCP:

```sql
UPDATE solicitacoes_gestor
SET agente_status = 'em_andamento',
    agente_iniciado_em = NOW()
WHERE id = '<id da tarefa>';
```

## Passo 3 — Verificar se a funcionalidade já existe

Antes de implementar qualquer coisa, pesquise no código se o que foi solicitado já existe:

- Use Grep para buscar palavras-chave do título e da descrição nos arquivos `.tsx`, `.ts`
- Verifique se há componente, função, coluna ou comportamento similar já implementado
- Se já existir: atualize o Supabase e pare:
  ```sql
  UPDATE solicitacoes_gestor
  SET agente_status = 'concluido',
      agente_concluido_em = NOW(),
      agente_resumo = 'Funcionalidade já existe em <arquivo>. Nenhuma alteração necessária.'
  WHERE id = '<id>';
  ```
- Se não existir: continue para o Passo 4

## Passo 4 — Entender o contexto

- Leia a descrição e o campo `tela` para saber qual arquivo está envolvido
- Use o Supabase MCP (`list_tables`, `execute_sql`) se precisar entender a estrutura do banco
- Explore os arquivos relevantes do projeto
- **Não pergunte nada** — tome decisões pelo contexto

## Passo 5 — Implementar

Siga as convenções do projeto Bravir Connect:
- UI em português do Brasil
- Reutilizar helpers de `src/lib/` (`formatBRL`, `formatDate`, etc.)
- Para mudanças de schema: criar migration em `supabase/migrations/`
- Componentes shadcn em `src/components/ui/` (não reescrever APIs)
- TanStack Query para data fetching (invalidar query keys após mutations)
- RLS: se criar tabela nova, adicionar policies na migration

## Passo 6 — Verificar build (obrigatório antes de commitar)

```
npm run build
```

**Se falhou:** corrija os erros e rode novamente. Repita até passar. Se após 3 tentativas ainda falhar, vá para o Passo 8 (erro).

## Passo 7 — Commitar e concluir

Após build passar:

1. Faça o commit com o título da tarefa:
   ```
   git add <arquivos alterados>
   git commit -m "feat/fix: <titulo da tarefa> [sol-<primeiros 8 chars do id>]"
   ```

2. Registre a conclusão no Supabase MCP:
   ```sql
   UPDATE solicitacoes_gestor
   SET agente_status = 'concluido',
       agente_concluido_em = NOW(),
       agente_resumo = '<resumo em 2 frases do que foi feito>'
   WHERE id = '<id>';
   ```

3. Informe ao usuário:
   - O que foi implementado
   - Arquivos alterados
   - Se há migration nova (rodar `npx supabase db push`)
   - Quantas tarefas ainda estão pendentes na fila

## Passo 8 — Registrar erro (se build não passou após 3 tentativas)

```sql
UPDATE solicitacoes_gestor
SET agente_status = 'erro',
    agente_erro = '<mensagem de erro do build>',
    agente_tentativas = COALESCE(agente_tentativas, 0) + 1
WHERE id = '<id>';
```

Informe ao usuário o que falhou e o que seria necessário para resolver.

---

**Regras:**
- Só processa tarefas com `agente_status = 'aprovado'` — o Pedro já revisou e aprovou
- Prioridade `alta` antes de `normal`; mais antigas primeiro entre mesma prioridade
- Sempre verificar se a funcionalidade já existe antes de implementar
