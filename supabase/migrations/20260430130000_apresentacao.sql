-- ═══════════════════════════════════════════════════════════════════
-- Migration: apresentacao features
-- Adds: clientes.codigo_cliente, clientes.aceita_saldo,
--        pedidos NF columns, itens_pedido.bolsao,
--        metas table, notificacoes table,
--        notas_fiscais storage bucket + policies,
--        trigger faturado_em
-- ═══════════════════════════════════════════════════════════════════

-- ── clientes ────────────────────────────────────────────────────────
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS codigo_cliente text,
  ADD COLUMN IF NOT EXISTS aceita_saldo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_clientes_codigo_cliente ON clientes (codigo_cliente);

-- ── pedidos ─────────────────────────────────────────────────────────
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS nota_fiscal   text,
  ADD COLUMN IF NOT EXISTS nf_pdf_url    text,
  ADD COLUMN IF NOT EXISTS rastreio      text,
  ADD COLUMN IF NOT EXISTS obs_faturamento text,
  ADD COLUMN IF NOT EXISTS faturado_em   timestamptz;

-- ── itens_pedido ─────────────────────────────────────────────────────
ALTER TABLE itens_pedido
  ADD COLUMN IF NOT EXISTS bolsao numeric(14,2) NOT NULL DEFAULT 0;

-- ── metas ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS metas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  mes             smallint NOT NULL,
  ano             smallint NOT NULL,
  valor_meta_reais numeric(14,2) NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (vendedor_id, mes, ano)
);

ALTER TABLE metas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "metas_select_authenticated" ON metas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "metas_insert_admin" ON metas
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "metas_update_admin" ON metas
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (true);

-- ── notificacoes ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notificacoes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario_role   text NOT NULL,
  destinatario_id     uuid NULL,
  tipo                text,
  pedido_id           uuid REFERENCES pedidos(id) ON DELETE SET NULL,
  mensagem            text,
  lida                boolean NOT NULL DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notificacoes_select" ON notificacoes
  FOR SELECT TO authenticated USING (
    destinatario_role = (SELECT role FROM profiles WHERE id = auth.uid())
    OR destinatario_id = auth.uid()
  );

CREATE POLICY "notificacoes_update_own" ON notificacoes
  FOR UPDATE TO authenticated USING (
    destinatario_role = (SELECT role FROM profiles WHERE id = auth.uid())
    OR destinatario_id = auth.uid()
  ) WITH CHECK (true);

CREATE POLICY "notificacoes_insert_authenticated" ON notificacoes
  FOR INSERT TO authenticated WITH CHECK (true);

-- ── Storage bucket: notas_fiscais ────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'notas_fiscais',
  'notas_fiscais',
  false,
  52428800,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "notas_fiscais_insert_fat_admin" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'notas_fiscais'
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('faturamento', 'admin')
    )
  );

CREATE POLICY "notas_fiscais_select_fat_admin" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'notas_fiscais'
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('faturamento', 'admin')
    )
  );

CREATE POLICY "notas_fiscais_select_vendedor" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'notas_fiscais'
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'vendedor'
    )
    AND EXISTS (
      SELECT 1 FROM pedidos
      WHERE id::text = split_part(name, '/', 1)
        AND vendedor_id = auth.uid()
    )
  );

-- ── Trigger: set faturado_em automaticamente ─────────────────────────
CREATE OR REPLACE FUNCTION set_faturado_em()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'faturado'
     AND (OLD.status IS DISTINCT FROM 'faturado')
     AND NEW.faturado_em IS NULL
  THEN
    NEW.faturado_em = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_faturado_em ON pedidos;
CREATE TRIGGER trg_set_faturado_em
  BEFORE UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION set_faturado_em();
