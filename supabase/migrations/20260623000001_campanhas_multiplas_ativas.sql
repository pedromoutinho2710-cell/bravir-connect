-- Remove qualquer trigger que desativava outras campanhas ao ativar uma nova
DROP TRIGGER IF EXISTS trg_desativar_outras_campanhas ON campanhas;
DROP FUNCTION IF EXISTS fn_desativar_outras_campanhas() CASCADE;

-- Remove unique partial index que impedia mais de uma campanha ativa
DROP INDEX IF EXISTS campanhas_unica_ativa;
DROP INDEX IF EXISTS idx_campanhas_unica_ativa;
DROP INDEX IF EXISTS campanhas_ativo_unique;

-- Garante que a coluna ativo existe e tem default false
ALTER TABLE campanhas ALTER COLUMN ativo SET DEFAULT false;
