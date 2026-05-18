-- ═══════════════════════════════════════════════════════════════
-- Migration: profile removal requests
-- ═══════════════════════════════════════════════════════════════
-- Lets a verified dancer (approved profile_claims with claim_kind='dancer')
-- submit a request to have their profile removed from public view. Admin
-- reviews. On approval, the frontend marks profile.archived = true in the
-- user_data JSON blob and audience views filter archived profiles out.
--
-- Only the owner (user who claimed the profile) can insert; admin reviews.
--
-- Run this once in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.profile_removal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  user_display_name text,
  profile_id text not null,           -- matches profile.id in user_data JSON
  profile_name text,                  -- denormalized for the moderation queue
  reason text not null,               -- required — why they want it removed
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  admin_notes text                    -- optional admin comment on decision
);

create index if not exists profile_removal_requests_status_idx
  on public.profile_removal_requests (status);
create index if not exists profile_removal_requests_user_idx
  on public.profile_removal_requests (user_id);
create index if not exists profile_removal_requests_profile_idx
  on public.profile_removal_requests (profile_id);

alter table public.profile_removal_requests enable row level security;

-- ── Policies ──

-- Only users with an APPROVED dancer claim on this profile_id may insert,
-- and only for their own user_id with status='pending'.
drop policy if exists "removal insert own" on public.profile_removal_requests;
create policy "removal insert own"
  on public.profile_removal_requests for insert
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and exists (
      select 1 from public.profile_claims c
      where c.user_id = auth.uid()
        and c.profile_id = profile_removal_requests.profile_id
        and c.claim_kind = 'dancer'
        and c.status = 'approved'
    )
  );

-- Users may read their own requests (any status).
drop policy if exists "removal select own" on public.profile_removal_requests;
create policy "removal select own"
  on public.profile_removal_requests for select
  using (auth.uid() = user_id);

-- Users may withdraw their own pending request.
drop policy if exists "removal delete own pending" on public.profile_removal_requests;
create policy "removal delete own pending"
  on public.profile_removal_requests for delete
  using (auth.uid() = user_id and status = 'pending');

-- Admin (matched by JWT email): full read + update status.
drop policy if exists "removal select admin" on public.profile_removal_requests;
create policy "removal select admin"
  on public.profile_removal_requests for select
  using ((auth.jwt() ->> 'email') = 'jaylo.bpc@gmail.com');

drop policy if exists "removal update admin" on public.profile_removal_requests;
create policy "removal update admin"
  on public.profile_removal_requests for update
  using ((auth.jwt() ->> 'email') = 'jaylo.bpc@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'jaylo.bpc@gmail.com');

-- ── Verification queries ──
-- select count(*) from pg_policies where tablename = 'profile_removal_requests';
-- → expect 5
