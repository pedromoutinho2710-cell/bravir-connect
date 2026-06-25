ALTER TABLE solicitacoes_gestor
  ADD COLUMN IF NOT EXISTS agente_iniciado_em timestamptz,
  ADD COLUMN IF NOT EXISTS agente_concluido_em timestamptz,
  ADD COLUMN IF NOT EXISTS agente_tentativas int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS agente_erro text;
