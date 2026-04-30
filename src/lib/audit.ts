import { supabase } from "@/integrations/supabase/client";

export type AuditAction = "edição" | "mudança de status" | "criação" | "exclusão";

interface LogEventOptions {
  motivo?: string;
}

/**
 * Registra um evento de auditoria no historico_status para acoes que nao alteram status
 * (ex: edicoes, anotacoes, etc.)
 */
export async function logEvento(
  pedidoId: string,
  acao: AuditAction,
  options?: LogEventOptions
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.rpc("log_pedido_event", {
      p_pedido_id: pedidoId,
      p_acao: acao,
      p_motivo: options?.motivo || null,
    });

    if (error) {
      console.error("Erro ao registrar evento de auditoria:", error);
      return { error };
    }

    return { error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("Erro ao registrar evento de auditoria:", error);
    return { error };
  }
}

/**
 * Busca o historico de status de um pedido
 */
export async function buscarHistoricoStatus(pedidoId: string) {
  const { data, error } = await supabase
    .from("historico_status")
    .select("*")
    .eq("pedido_id", pedidoId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Erro ao buscar historico de status:", error);
    return [];
  }

  return data || [];
}

/**
 * Busca informacoes sobre quem abriu o pedido e ultima acao
 */
export async function buscarAbertoEUltimaAcao(pedidoId: string) {
  const { data, error } = await supabase
    .from("historico_status")
    .select("usuario_nome, usuario_email, created_at")
    .eq("pedido_id", pedidoId)
    .order("created_at", { ascending: true })
    .limit(2);

  if (error) {
    console.error("Erro ao buscar auditoria:", error);
    return { abertoPor: null, ultimaAcao: null };
  }

  const list = data || [];
  return {
    abertoPor: list.length > 0 ? list[0].usuario_nome : null,
    ultimaAcao:
      list.length > 0
        ? { nome: list[list.length - 1].usuario_nome, data: list[list.length - 1].created_at }
        : null,
  };
}
