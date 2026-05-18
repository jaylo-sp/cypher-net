# HANDOFF.md — Rolling session notes

> **Claude Code: read this BEFORE doing anything in this repo.** Update it at the end of every session before the user switches machines. Keep "Last updated", "Recently shipped", "Next up", and "Gotchas" sections current — delete stale lines instead of letting them pile up.

## Last updated

2026-05-18 — End of session on MacBook. Pushing to GitHub so the work is reachable from the Windows PC. CLAUDE.md + HANDOFF.md introduced; this is commit #1 with them.

## Recently shipped

- New embeds: **Event Archive** (`?embed=archive`) with index + drill-down, **Live Ticker** (`?embed=ticker`), **Crew Highlights** section in `CrewEmbed`
- Removed: ROTN Feed widget (data surfaces in Event Recap + Archive drill-down)
- **Compact SVG bracket tree** with auto-scroll to FINAL on mount, gold winner path, gray-strikethrough losers, italic BYE label
- **Placement-mix stacked bar** in `DancerProfileEmbed` History tab
- **Top Contributors bars** in `CrewEmbed`
- **Relative-magnitude mini-bars** on every Top-N card in `LeaderboardDashboard`
- **Multi-clip Media tab** in `DancerProfileEmbed`
- **Iframe-breakout sign-in** via `?signin=1` URL param (auto-opens `SignInModal`)
- **Google OAuth scaffold** — `auth.signInWithGoogle()` + button. Provider must be enabled in Supabase dashboard before it works.
- **Friendly fallback** for unknown `?embed=X` URLs (used to drop to RoleGate)
- **RLS performance cleanup** — multi-permissive policies consolidated; `(select auth.<fn>())` wrap on all
- **UX copy pass** — sign-in modal subtitles, inbox headers, toast side-effects, mode-specific busy states
- **Two real bug fixes** — embed-mode Supabase write spam silenced (RLS denial expected, no longer warned); `CompactBracket` hooks-rules violation fixed (hooks were after early return)

## Next up — pick when you resume

1. **Enable Supabase Google OAuth provider** so the "Continue with Google" button works (otherwise the click currently errors). Auth → Providers → Google.
2. **Enable leaked-password protection** in Supabase Auth → Policies (last security WARN).
3. **LeaderboardEmbed list view rows** could use the same mini-bars the dashboard cards got.
4. **LiveEventEmbed bracket state** could swap its custom layout for the new `CompactBracket` (consolidation — fewer renderers to maintain).
5. **HighlightsEmbed cards** could each get a sparkline (would need trend data per card).

## Gotchas

- `npx vercel --prod --yes` from project root deploys the current disk state and auto-aliases to `cyphernet.vercel.app`. Every Vercel deploy meta shows `gitDirty: 1` — that's expected since we deploy locally rather than via GitHub integration.
- `.env.local` is NOT in the repo. On Windows: copy `.env.example` to `.env.local`, paste the real Supabase URL + anon key + `VITE_ADMIN_EMAIL=jaylo.bpc@gmail.com`. Same Supabase project, no separate prod/dev split.
- Production data lives in Supabase project `cfxqavezbewiypfjqfwl` — both machines share it. No data migration needed.
- `CONTEXT.md` line numbers are stale (`App.jsx` was ~5.5k lines when CONTEXT.md was written; it's ~14k now). The patterns + constraints in CONTEXT.md are still correct — just don't trust the line ranges.
- `README.md` mentions an old `battle-bracket.vercel.app` domain in places. The real one is `cyphernet.vercel.app`. Cosmetic — fix when convenient.
- The `supabase-schema-ready.sql` is gitignored because it has the admin email substituted. Regenerate it from `supabase-schema.sql` on a fresh machine if you need to re-bootstrap.

## Don't re-litigate

- Don't propose `app_meta` blob in `user_data` for admin emails / user registry. That duplicates Supabase Auth + leaks emails publicly. Use `VITE_ADMIN_EMAIL` + RLS hardcoding.
- Don't propose `safe_update_cyphernet` RPC as written — the SQL references columns that don't exist on `user_data`, and the FOR-UPDATE pattern doesn't solve full-payload-replace races.
- Don't propose `useCypherNetAuth` / `CypherNetHeaderControl` / `LiveMobileBracketView` / `var t = { ... }` token factory — duplicates of existing systems with wrong palette / wrong data shape.
- Don't restore the ROTN Feed widget. ROTN data is post-event context only and is already surfaced where it belongs.
