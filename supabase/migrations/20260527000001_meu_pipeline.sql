-- ═══════════════════════════════════════════════════════════════════
-- Meu Pipeline (Kanban pessoal) — schema de suporte
-- ═══════════════════════════════════════════════════════════════════

-- 1) Colunas de pipeline na tabela `clientes`
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS etapa_pipeline        text,
  ADD COLUMN IF NOT EXISTS proximo_passo         text,
  ADD COLUMN IF NOT EXISTS data_proximo_contato  date,
  ADD COLUMN IF NOT EXISTS motivo_perda          text,
  ADD COLUMN IF NOT EXISTS obs_comercial         text,
  ADD COLUMN IF NOT EXISTS pipeline_updated_at   timestamptz,
  ADD COLUMN IF NOT EXISTS marcas_interesse      text[],
  ADD COLUMN IF NOT EXISTS produtos_interesse    text;

CREATE INDEX IF NOT EXISTS clientes_etapa_pipeline_idx
  ON public.clientes (vendedor_id, etapa_pipeline);

-- 2) Tabela de registros de contato (timeline)
CREATE TABLE IF NOT EXISTS public.pipeline_contatos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  vendedor_id uuid NOT NULL,
  tipo        text NOT NULL,
  nota        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pipeline_contatos_cliente_idx
  ON public.pipeline_contatos (cliente_id, created_at DESC);

ALTER TABLE public.pipeline_contatos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pipeline_contatos_select_own ON public.pipeline_contatos;
CREATE POLICY pipeline_contatos_select_own ON public.pipeline_contatos
  FOR SELECT TO authenticated
  USING (vendedor_id = auth.uid());

DROP POLICY IF EXISTS pipeline_contatos_insert_own ON public.pipeline_contatos;
CREATE POLICY pipeline_contatos_insert_own ON public.pipeline_contatos
  FOR INSERT TO authenticated
  WITH CHECK (vendedor_id = auth.uid());

-- 3) View vendedor_ltv_clientes — coexiste com a RPC de mesmo nome
--    (PostgREST expõe view em /vendedor_ltv_clientes e função em /rpc/vendedor_ltv_clientes).
CREATE OR REPLACE VIEW public.vendedor_ltv_clientes
WITH (security_invoker = true) AS
WITH ped AS (
  SELECT
    p.cliente_id,
    p.id          AS pedido_id,
    p.data_pedido,
    (SELECT COALESCE(SUM(ip.total_item), 0)
       FROM public.itens_pedido ip
      WHERE ip.pedido_id = p.id) AS total_pedido,
    ROW_NUMBER() OVER (PARTITION BY p.cliente_id ORDER BY p.data_pedido DESC) AS rn
  FROM public.pedidos p
  WHERE p.status NOT IN ('rascunho', 'cancelado')
),
agg AS (
  SELECT
    cliente_id,
    SUM(total_pedido)       AS ltv,
    MAX(data_pedido::date)  AS data_ultimo_pedido
  FROM ped
  GROUP BY cliente_id
),
ult AS (
  SELECT cliente_id, total_pedido AS valor_ultimo_pedido
  FROM ped
  WHERE rn = 1
)
SELECT
  c.id                                              AS cliente_id,
  c.vendedor_id,
  COALESCE(c.nome_parceiro, c.razao_social)         AS nome,
  COALESCE(agg.ltv, 0)                              AS ltv,
  ult.valor_ultimo_pedido,
  agg.data_ultimo_pedido,
  CASE WHEN agg.data_ultimo_pedido IS NOT NULL
       THEN (CURRENT_DATE - agg.data_ultimo_pedido)::int
       ELSE NULL END                                AS dias_sem_comprar
FROM public.clientes c
LEFT JOIN agg ON agg.cliente_id = c.id
LEFT JOIN ult ON ult.cliente_id = c.id
WHERE c.status = 'ativo';

GRANT SELECT ON public.vendedor_ltv_clientes TO authenticated;
