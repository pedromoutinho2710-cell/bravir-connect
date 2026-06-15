-- ═══════════════════════════════════════════════════════════════════
-- FASE 1 — Comprovante de pagamento à vista (financeiro)
--
-- 1) Coluna para guardar o caminho do comprovante no pedido
-- 2) Bucket de Storage 'comprovantes' + policies (financeiro/admin
--    enviam; financeiro/admin/logística leem)
-- ═══════════════════════════════════════════════════════════════════

-- ── 1) Coluna comprovante_url em pedidos ──────────────────────────────
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS comprovante_url text;

-- ── 2) Bucket privado 'comprovantes' (PDF e imagens, até 50 MB) ───────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comprovantes',
  'comprovantes',
  false,
  52428800,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Financeiro e admin podem enviar comprovantes
DROP POLICY IF EXISTS "comprovantes_insert_fin_admin" ON storage.objects;
CREATE POLICY "comprovantes_insert_fin_admin" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'comprovantes'
    AND (
      public.has_role(auth.uid(), 'financeiro')
      OR public.has_role(auth.uid(), 'admin')
    )
  );

-- Financeiro, admin e logística podem visualizar comprovantes
DROP POLICY IF EXISTS "comprovantes_select_fin_admin_log" ON storage.objects;
CREATE POLICY "comprovantes_select_fin_admin_log" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'comprovantes'
    AND (
      public.has_role(auth.uid(), 'financeiro')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'logistica')
    )
  );
