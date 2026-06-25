-- Fluxo de aprovação/reprovação das solicitações pelo gestor e devolução pelo colaborador.
-- link_teste: link da melhoria aprovada para o colaborador testar.
-- motivo_reprovacao: justificativa quando o gestor reprova (ou motivo da devolução).
-- Novos status usados pela aplicação: aprovado, reprovado, devolvido (texto livre, sem CHECK).

ALTER TABLE solicitacoes_gestor ADD COLUMN IF NOT EXISTS link_teste text;
ALTER TABLE solicitacoes_gestor ADD COLUMN IF NOT EXISTS motivo_reprovacao text;
