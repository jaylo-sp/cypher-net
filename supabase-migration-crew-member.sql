-- ═══════════════════════════════════════════════════════════════
-- Migration: add 'crew_member' to allowed claim_kind values
-- ═══════════════════════════════════════════════════════════════
-- Run this once in the Supabase SQL Editor (in addition to the
-- earlier supabase-schema.sql migration).
-- ═══════════════════════════════════════════════════════════════

alter table public.profile_claims
  drop constraint if exists profile_claims_claim_kind_check;

alter table public.profile_claims
  add constraint profile_claims_claim_kind_check
  check (claim_kind in ('dancer','crew_manager','crew_member'));
