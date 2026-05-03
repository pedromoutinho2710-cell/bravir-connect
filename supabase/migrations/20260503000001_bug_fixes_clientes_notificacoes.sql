-- ═══════════════════════════════════════════════════════════════════
-- Bug fixes: clientes missing columns + notificacoes INSERT policy
-- ═══════════════════════════════════════════════════════════════════

-- Columns that may be missing from earlier migration order issues
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS status              text          DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS vendedor_id         uuid          REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS aceita_saldo        boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS negativado          boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS perfil_cliente      text,
  ADD COLUMN IF NOT EXISTS tabela_preco        text,
  ADD COLUMN IF NOT EXISTS inscricao_estadual  text,
  ADD COLUMN IF NOT EXISTS email               text,
  ADD COLUMN IF NOT EXISTS telefone            text,
  ADD COLUMN IF NOT EXISTS rua                 text,
  ADD COLUMN IF NOT EXISTS numero              text,
  ADD COLUMN IF NOT EXISTS bairro              text,
  ADD COLUMN IF NOT EXISTS assumido_por        uuid          REFERENCES auth.users(id);

-- Ensure indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_clientes_vendedor_id   ON public.clientes (vendedor_id);
CREATE INDEX IF NOT EXISTS idx_clientes_status        ON public.clientes (status);

-- ── notificacoes: vendedor pode inserir (para CadastrarCliente) ────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notificacoes' AND policyname = 'notificacoes_insert_authenticated'
  ) THEN
    CREATE POLICY "notificacoes_insert_authenticated" ON public.notificacoes
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;
