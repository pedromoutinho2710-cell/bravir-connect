-- Adiciona campo ativo na tabela clientes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

-- Índice para facilitar filtros por status
CREATE INDEX IF NOT EXISTS clientes_ativo_idx ON clientes (ativo);
