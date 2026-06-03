-- Colunas extras usadas pelo agente de chat flutuante (AgenteChatFlutuante).
-- O agente classifica a conversa e grava um título curto, o prompt de mockup
-- sugerido e o histórico completo da conversa.

ALTER TABLE solicitacoes_gestor ADD COLUMN IF NOT EXISTS titulo text;
ALTER TABLE solicitacoes_gestor ADD COLUMN IF NOT EXISTS mockup_prompt text;
ALTER TABLE solicitacoes_gestor ADD COLUMN IF NOT EXISTS chat_historico jsonb;
