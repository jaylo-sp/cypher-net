-- ═══════════════════════════════════════════════════════════════
-- Cypher Net — Supabase schema migration
-- ═══════════════════════════════════════════════════════════════
-- Run this once in your Supabase project's SQL Editor.
-- Creates the tables and Row-Level Security policies needed for
-- audience accounts, watchlist, and profile claims.
-- The admin's existing `user_data` table (single-row JSON blob) is
-- left untouched.
-- ═══════════════════════════════════════════════════════════════

-- ── user_data: keep your existing single-row table for admin data ──
-- (Already created by storage.js setup. Included here for reference.)
create table if not exists public.user_data (
  key  text primary key,
  value text,
  updated_at timestamptz default now()
);

-- Anyone authenticated may read the admin's event data (for audience views);
-- only the admin can write. The "admin" identity is whoever holds your admin
-- account — set the admin user's UUID below, OR keep the open-write policy if
-- you trust your environment (single-tenant deployment).
alter table public.user_data enable row level security;

drop policy if exists "user_data read" on public.user_data;
create policy "user_data read"
  on public.user_data for select
  using (true);

drop policy if exists "user_data write" on public.user_data;
create policy "user_data write"
  on public.user_data for all
  using (true)
  with check (true);
-- ↑ Tighten this to `using (auth.uid() = 'your-admin-uuid'::uuid)` once you
--   know your admin's auth.uid().


-- ── profile_claims: audience users claim dancer profiles ──
create table if not exists public.profile_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  user_display_name text,
  profile_id text not null,
  claim_kind text not null default 'dancer' check (claim_kind in ('dancer','crew_manager')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  message text,
  created_at timestamptz default now(),
  decided_at timestamptz
);

-- For existing databases: add the column if missing.
alter table public.profile_claims add column if not exists claim_kind text not null default 'dancer'
  check (claim_kind in ('dancer','crew_manager'));

create index if not exists profile_claims_user_idx on public.profile_claims (user_id);
create index if not exists profile_claims_profile_idx on public.profile_claims (profile_id);
create index if not exists profile_claims_status_idx on public.profile_claims (status);

alter table public.profile_claims enable row level security;

-- Audience: read your own claims; insert claims for your own user_id;
-- cannot modify status (admin-only).
drop policy if exists "claims select own" on public.profile_claims;
create policy "claims select own"
  on public.profile_claims for select
  using (auth.uid() = user_id);

drop policy if exists "claims insert own" on public.profile_claims;
create policy "claims insert own"
  on public.profile_claims for insert
  with check (auth.uid() = user_id and status = 'pending');

-- Admin: read all claims, update status. Replace the email below with your
-- admin email so only that user can approve/reject. (Or use a custom role.)
drop policy if exists "claims select admin" on public.profile_claims;
create policy "claims select admin"
  on public.profile_claims for select
  using ((auth.jwt() ->> 'email') = 'your-admin@example.com');

drop policy if exists "claims update admin" on public.profile_claims;
create policy "claims update admin"
  on public.profile_claims for update
  using ((auth.jwt() ->> 'email') = 'your-admin@example.com')
  with check ((auth.jwt() ->> 'email') = 'your-admin@example.com');


-- ── watchlist: audience users save events they want to follow ──
create table if not exists public.watchlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,
  added_at timestamptz default now(),
  primary key (user_id, event_id)
);

create index if not exists watchlist_event_idx on public.watchlist (event_id);

alter table public.watchlist enable row level security;

-- Users can fully manage their own watchlist rows; no cross-user visibility.
drop policy if exists "watchlist own" on public.watchlist;
create policy "watchlist own"
  on public.watchlist for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ── profile_extras: verified dancers can edit bio/socials on their own profile ──
-- Admin owns the base profile in `user_data`. Audience users with an approved
-- dancer claim can overlay extra fields here. The frontend merges at render time.
create table if not exists public.profile_extras (
  profile_id text primary key,
  bio text,
  youtube text,
  instagram text,
  tiktok text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz default now()
);

alter table public.profile_extras enable row level security;

-- Anyone authenticated can read overlays.
drop policy if exists "profile_extras read" on public.profile_extras;
create policy "profile_extras read"
  on public.profile_extras for select
  using (true);

-- Users can insert/update their overlay only if they have an approved dancer claim
-- on that profile_id.
drop policy if exists "profile_extras own" on public.profile_extras;
create policy "profile_extras own"
  on public.profile_extras for all
  using (
    exists (
      select 1 from public.profile_claims c
      where c.user_id = auth.uid()
        and c.profile_id = profile_extras.profile_id
        and c.claim_kind = 'dancer'
        and c.status = 'approved'
    )
  )
  with check (
    exists (
      select 1 from public.profile_claims c
      where c.user_id = auth.uid()
        and c.profile_id = profile_extras.profile_id
        and c.claim_kind = 'dancer'
        and c.status = 'approved'
    )
  );


-- ── judge_grants: per-event judge invitations (admin-created) ──
create table if not exists public.judge_grants (
  event_id text not null,
  judge_email text not null,
  judge_name text,
  granted_at timestamptz default now(),
  primary key (event_id, judge_email)
);

create index if not exists judge_grants_email_idx on public.judge_grants (judge_email);

alter table public.judge_grants enable row level security;

-- Admin (matched by JWT email): full control.
drop policy if exists "judge_grants admin all" on public.judge_grants;
create policy "judge_grants admin all"
  on public.judge_grants for all
  using ((auth.jwt() ->> 'email') = 'your-admin@example.com')
  with check ((auth.jwt() ->> 'email') = 'your-admin@example.com');

-- Judges can see their own grants (to know which events they can score).
drop policy if exists "judge_grants self read" on public.judge_grants;
create policy "judge_grants self read"
  on public.judge_grants for select
  using ((auth.jwt() ->> 'email') = judge_email);


-- ═══════════════════════════════════════════════════════════════
-- Optional: real-time
-- ═══════════════════════════════════════════════════════════════
-- If you want the audience view to update live as the admin scores
-- matches, enable Realtime on `user_data` from
-- Database → Replication → public.user_data. The frontend already
-- re-reads on writes, but a Realtime subscription would push updates.
