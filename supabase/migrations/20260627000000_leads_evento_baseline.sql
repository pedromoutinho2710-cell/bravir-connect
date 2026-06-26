-- ─────────────────────────────────────────────────────────────────────────
-- Baseline idempotente de leads_evento
-- ─────────────────────────────────────────────────────────────────────────
-- A tabela `leads_evento` já existe em produção, porém nunca teve migração
-- versionada. Sem este baseline, qualquer ambiente novo (db reset, branch
-- Supabase, CI) ficaria SEM a tabela e a captura de leads/inbound quebraria.
--
-- Este arquivo é 100% idempotente:
--   • CREATE TABLE IF NOT EXISTS  → no-op contra o banco atual.
--   • criação de policies guardada → no-op se já existirem.
-- Nenhum dado é alterado. Reflete o estado verificado do schema em 27/06/2026.
--
-- Obs.: FKs (vendedor_atribuido_id → profiles, cliente_id → clientes) foram
-- deixadas como colunas uuid simples para refletir fielmente o schema atual.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.leads_evento (
  id                    uuid primary key default gen_random_uuid(),
  razao_social          text,
  contato_nome          text,
  telefone              text,
  email                 text,
  cidade                text,
  uf                    text,
  nome_fantasia         text,
  areas_atuacao         text[],
  marcas_interesse      text[],
  produtos_interesse    text[],
  observacoes           text,
  origem                text not null default 'formulario',
  status                text not null default 'novo',
  vendedor_atribuido_id uuid,
  cliente_id            uuid,
  created_at            timestamptz default now()
);

alter table public.leads_evento enable row level security;

do $$
begin
  -- Captura pública pelo formulário do evento (/evento) — anon + autenticado.
  if not exists (
    select 1 from pg_policy
    where polname = 'leads_evento_insert_public'
      and polrelid = 'public.leads_evento'::regclass
  ) then
    create policy leads_evento_insert_public on public.leads_evento
      for insert to anon, authenticated with check (true);
  end if;

  -- Leitura por usuários autenticados (tela da gestora dirige os leads).
  if not exists (
    select 1 from pg_policy
    where polname = 'leads_evento_select_authenticated'
      and polrelid = 'public.leads_evento'::regclass
  ) then
    create policy leads_evento_select_authenticated on public.leads_evento
      for select to authenticated using (true);
  end if;

  -- Atualização por autenticados (direcionar lead → vendedor/cliente).
  if not exists (
    select 1 from pg_policy
    where polname = 'leads_evento_update_authenticated'
      and polrelid = 'public.leads_evento'::regclass
  ) then
    create policy leads_evento_update_authenticated on public.leads_evento
      for update to authenticated using (true);
  end if;
end $$;

-- NOTA (Fase 2 / rollout do time): as policies acima são permissivas
-- (using/with check = true). Antes de liberar para os 20 representantes,
-- restringir SELECT/UPDATE para `has_role(gestora/admin) OR
-- vendedor_atribuido_id = auth.uid()`. Ver Track E do plano de vendas.
