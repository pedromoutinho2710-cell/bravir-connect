-- Adiciona as colunas Marca e Tipo de Negócio à staging do Sankhya.
--
-- A planilha do Sankhya tem a marca (Laby, Bravir Tradicional, Bendita Cânfora, etc.)
-- na coluna "Marca" e a separação própria × terceiros na coluna "Tipo de Negócio".
-- Até agora a importação não capturava nenhuma das duas, então a Visão Macro
-- classificava a marca pela coluna "Grupo" (aproximação) — que não bate com a planilha.
--
-- Estas colunas passam a ser preenchidas pela importação (ImportarFaturamento.tsx) e
-- usadas pela Visão Macro para a quebra por marca.
ALTER TABLE public.faturamentos_sankhya
  ADD COLUMN IF NOT EXISTS marca text,
  ADD COLUMN IF NOT EXISTS tipo_negocio text;
