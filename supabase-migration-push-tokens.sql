-- ═══════════════════════════════════════════════════════════════
-- Migration: push tokens for mobile app
-- ═══════════════════════════════════════════════════════════════
-- Stores APNs (iOS) / FCM (Android, web) device tokens per user so
-- Supabase Edge Functions can target push notifications when:
--   - a profile claim is approved
--   - a clip submission is decided
--   - a watchlisted event goes live / has a champion declared
--
-- One user can have multiple tokens (e.g. iPhone + iPad). Tokens are
-- replaced on re-registration via the unique (user_id, token) pair.
--
-- Run this once in the Supabase SQL Editor (admin email already
-- substituted: jaylo.bpc@gmail.com).
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios','android','web')),
  device_name text,                       -- optional human label, e.g. "Jaylo's iPhone 15"
  app_version text,                       -- e.g. "1.0.3"
  notification_prefs jsonb default '{
    "event_starting": true,
    "claim_decided": true,
    "clip_decided": true,
    "champion_declared": true
  }'::jsonb,
  created_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  unique (user_id, token)
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
create index if not exists push_tokens_platform_idx on public.push_tokens (platform);

alter table public.push_tokens enable row level security;

-- ── Policies ──

-- Users can register / update / delete their own tokens.
drop policy if exists "push_tokens insert own" on public.push_tokens;
create policy "push_tokens insert own"
  on public.push_tokens for insert
  with check (auth.uid() = user_id);

drop policy if exists "push_tokens select own" on public.push_tokens;
create policy "push_tokens select own"
  on public.push_tokens for select
  using (auth.uid() = user_id);

drop policy if exists "push_tokens update own" on public.push_tokens;
create policy "push_tokens update own"
  on public.push_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "push_tokens delete own" on public.push_tokens;
create policy "push_tokens delete own"
  on public.push_tokens for delete
  using (auth.uid() = user_id);

-- Admin (matched by JWT email) reads all — Edge Functions targeting
-- recipients run as admin and need to fan out tokens.
drop policy if exists "push_tokens select admin" on public.push_tokens;
create policy "push_tokens select admin"
  on public.push_tokens for select
  using ((auth.jwt() ->> 'email') = 'jaylo.bpc@gmail.com');

-- ── Verification queries (run after) ──
-- select count(*) as policy_count from pg_policies where tablename = 'push_tokens';
-- → expect 5
--
-- select column_name, data_type from information_schema.columns
-- where table_name = 'push_tokens' order by ordinal_position;
-- → expect 9 columns
