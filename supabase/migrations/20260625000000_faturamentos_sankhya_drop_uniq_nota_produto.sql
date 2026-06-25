-- Remove a constraint UNIQUE (numero_nota, codigo_produto) da staging do Sankhya.
--
-- Motivo: o grão estava errado. O Sankhya pode faturar o mesmo produto mais de uma
-- vez na mesma nota (lotes / CFOP / situação de ST distintos). A constraint, somada
-- ao upsert com ignoreDuplicates, descartava linhas legítimas — fazendo o total do
-- banco ficar MENOR que o total da planilha.
--
-- A importação (src/pages/trade/ImportarFaturamento.tsx) passou a usar replace-by-nota:
-- apaga todas as linhas das notas presentes no arquivo e reinsere tudo. Isso mantém o
-- staging como espelho fiel da planilha e idempotente em re-importações, sem depender
-- desta constraint.
ALTER TABLE public.faturamentos_sankhya
  DROP CONSTRAINT IF EXISTS faturamentos_sankhya_nota_produto_uniq;
