-- ═══════════════════════════════════════════════════════════════
-- Migration: clip submissions with admin moderation
-- ═══════════════════════════════════════════════════════════════
-- Adds public.clip_submissions for verified-dancer + admin clip
-- proposals targeting a specific event-player entry. Admin clips
-- auto-approve; verified-dancer clips land as 'pending' for admin
-- review. Approved rows are merged into the live event payload
-- (event.players[i].clip) by the admin UI on approval.
--
-- Run this once in the Supabase SQL Editor (admin email already
-- substituted: jaylo.bpc@gmail.com).
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.clip_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  user_display_name text,
  event_id text not null,          -- matches ev.id in user_data JSON blob
  event_name text,                 -- denormalized for the moderation queue
  player_id text not null,         -- matches ev.players[i].id
  breaker_name text,               -- denormalized for the moderation queue
  url text not null,               -- sanitized YouTube URL
  message text,                    -- optional submitter note
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null
);

create index if not exists clip_submissions_status_idx on public.clip_submissions (status);
create index if not exists clip_submissions_user_idx on public.clip_submissions (user_id);
create index if not exists clip_submissions_event_idx on public.clip_submissions (event_id);

alter table public.clip_submissions enable row level security;

-- ── Policies ──

-- Signed-in users may insert their own submissions, always 'pending' on insert
drop policy if exists "clips insert own" on public.clip_submissions;
create policy "clips insert own"
  on public.clip_submissions for insert
  with check (auth.uid() = user_id and status = 'pending');

-- Users may read their own submissions (any status)
drop policy if exists "clips select own" on public.clip_submissions;
create policy "clips select own"
  on public.clip_submissions for select
  using (auth.uid() = user_id);

-- Users may withdraw their own pending submissions
drop policy if exists "clips delete own pending" on public.clip_submissions;
create policy "clips delete own pending"
  on public.clip_submissions for delete
  using (auth.uid() = user_id and status = 'pending');

-- Admin reads everything, updates status
drop policy if exists "clips select admin" on public.clip_submissions;
create policy "clips select admin"
  on public.clip_submissions for select
  using ((auth.jwt() ->> 'email') = 'jaylo.bpc@gmail.com');

drop policy if exists "clips update admin" on public.clip_submissions;
create policy "clips update admin"
  on public.clip_submissions for update
  using ((auth.jwt() ->> 'email') = 'jaylo.bpc@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'jaylo.bpc@gmail.com');

-- Publicly readable approved submissions, so the audience widget can pull
-- pending-merge clips before the admin commits them to user_data
drop policy if exists "clips select approved" on public.clip_submissions;
create policy "clips select approved"
  on public.clip_submissions for select
  using (status = 'approved');
